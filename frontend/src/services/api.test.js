import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  analyzeMessage,
  ocrImage,
  extractHealthTags,
  getFoodFeedback,
  isDemoMode,
  resetDemoMode,
} from "./api";

function mockResponse({ ok = true, status = 200, body }) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    headers: new Headers(),
    json: async () => body,
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client", () => {
  test("analyzeMessage posts to /api/analyze, forwards the signal, and returns data", async () => {
    global.fetch = mockResponse({ body: { riskLevel: "high" } });
    const signal = new AbortController().signal;

    const data = await analyzeMessage(
      { language: "en", inputType: "text", rawText: "hello", imageBase64: undefined, imageMimeType: undefined },
      signal
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/analyze$/),
      expect.objectContaining({ method: "POST", signal, body: expect.any(String) })
    );
    expect(data).toEqual({ riskLevel: "high" });
  });

  test.each([
    ["ocrImage", ocrImage, "/api/ocr", { imageBase64: "aGVsbG8=", imageMimeType: "image/png" }],
    ["extractHealthTags", extractHealthTags, "/api/health-tags", { text: "diabetes", language: "en" }],
    [
      "getFoodFeedback",
      getFoodFeedback,
      "/api/food-feedback",
      { language: "en", healthTags: ["Diabetes"], product: { name: "Cereal" } },
    ],
  ])("%s posts to %s and returns data", async (_name, fn, path, body) => {
    global.fetch = mockResponse({ body: { ok: true } });
    const data = await fn(body);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`${path}$`)), expect.objectContaining({ method: "POST" }));
    expect(data).toEqual({ ok: true });
  });

  test("falls back to demo health tags when the API returns a non-ok response (and sets demo mode)", async () => {
    resetDemoMode();
    global.fetch = mockResponse({
      ok: false,
      status: 422,
      body: { error: { code: "OCR_FAILED", message: "Could not read text." } },
    });

    const data = await extractHealthTags({ text: "x", language: "en" });
    expect(data.suggestedTags).toEqual(["Type 2 Diabetes", "High blood pressure"]);
    expect(isDemoMode()).toBe(true);
  });

  test("falls back to demo OCR text when the non-ok body has no error object", async () => {
    resetDemoMode();
    global.fetch = mockResponse({ ok: false, status: 500, body: { nope: true } });

    const data = await ocrImage({ imageBase64: "x", imageMimeType: "image/png" });
    expect(typeof data.text).toBe("string");
    expect(data.text.length).toBeGreaterThan(0);
    expect(isDemoMode()).toBe(true);
  });

  test("falls back to a demo verdict when a non-ok body is unparseable", async () => {
    resetDemoMode();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers(),
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });

    const data = await analyzeMessage({ language: "en", inputType: "text" });
    expect(data.riskLevel).toBe("high");
    expect(data.matchedPatterns).toContain("otp_request");
    expect(isDemoMode()).toBe(true);
  });

  test("falls back to demo feedback when a successful response has no JSON body", async () => {
    resetDemoMode();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });

    const data = await getFoodFeedback({ language: "en", healthTags: [], product: {} });
    expect(typeof data.feedback).toBe("string");
    expect(data.feedback.length).toBeGreaterThan(0);
    expect(isDemoMode()).toBe(true);
  });

  test("a network failure falls back to demo data and a later successful call clears demo mode", async () => {
    resetDemoMode();
    expect(isDemoMode()).toBe(false);

    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const demo = await analyzeMessage({ language: "en", inputType: "text", rawText: "hello" });
    expect(demo.riskLevel).toBe("high");
    expect(isDemoMode()).toBe(true);

    global.fetch = mockResponse({ body: { riskLevel: "low" } });
    const real = await analyzeMessage({ language: "en", inputType: "text", rawText: "hello" });
    expect(real).toEqual({ riskLevel: "low" });
    expect(isDemoMode()).toBe(false);
  });

  test("resetDemoMode clears the flag for the next call", async () => {
    resetDemoMode();
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await analyzeMessage({ language: "en", inputType: "text" });
    expect(isDemoMode()).toBe(true);

    resetDemoMode();
    expect(isDemoMode()).toBe(false);
  });
});

describe("api client — family location sharing", () => {
  // Dynamically import so the rest of the api tests keep running even before
  // the location exports land in api.js (Agent 1 owns that file).
  async function loadApi() {
    return await import("./api");
  }

  test("getFamilyLocations GETs /api/location/family/{familyId}", async () => {
    const api = await loadApi();
    global.fetch = mockResponse({ body: { locations: [] } });

    const data = await api.getFamilyLocations("fam_1");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/location\/family\/fam_1$/),
      expect.anything()
    );
    const [, init] = global.fetch.mock.calls[0];
    expect(init?.method ?? "GET").toBe("GET");
    expect(data).toEqual({ locations: [] });
  });

  test("shareLocation POSTs /api/location/share with the member's live position", async () => {
    const api = await loadApi();
    global.fetch = mockResponse({ body: { ok: true } });

    await api.shareLocation({ familyId: "fam_1", memberId: "mem_1", name: "Anjali", lat: 28.61, lng: 77.2, accuracy: 12 });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/location\/share$/),
      expect.objectContaining({ method: "POST", body: expect.any(String) })
    );
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toMatchObject({
      familyId: "fam_1",
      memberId: "mem_1",
      name: "Anjali",
      lat: 28.61,
      lng: 77.2,
      accuracy: 12,
    });
  });

  test("stopLocation POSTs /api/location/stop with family and member ids", async () => {
    const api = await loadApi();
    global.fetch = mockResponse({ body: { ok: true } });

    await api.stopLocation({ familyId: "fam_1", memberId: "mem_1" });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/location\/stop$/),
      expect.objectContaining({ method: "POST" })
    );
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ familyId: "fam_1", memberId: "mem_1" });
  });

  test("confirmFamilyAlert posts to the fixed /api/family/confirm-alert path", async () => {
    const api = await loadApi();
    global.fetch = mockResponse({ body: { alert: {} } });

    await api.confirmFamilyAlert({ familyId: "fam_1", alertId: "alt_1", memberId: "mem_1" });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/family\/confirm-alert$/),
      expect.objectContaining({ method: "POST" })
    );
  });

  test("drops the removed chat and blocklist client functions from api.js", async () => {
    const api = await loadApi();
    for (const removed of [
      "addFamilyBlocklist",
      "registerMessagingKey",
      "getMessagingKey",
      "createMessagingThread",
      "storeWrappedKey",
      "sendMessage",
      "listThreads",
      "listMessages",
    ]) {
      expect(api[removed], `${removed} should no longer be exported`).toBeUndefined();
    }
  });
});

describe("api client — demo fallback shapes", () => {
  async function loadApi() {
    return await import("./api");
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  function offlineFetch() {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  }

  test("createFamily returns a demo family so the app can proceed offline", async () => {
    const api = await loadApi();
    api.resetDemoMode();
    offlineFetch();

    const result = await api.createFamily({ name: "Sharma Family", adminName: "Anjali" });
    expect(result.familyId).toBe("demo-family");
    expect(result.family.name).toBe("Sharma Family");
    expect(result.family.members[0].name).toBe("Anjali");
    expect(result.family.members[0].role).toBe("admin");
    expect(api.isDemoMode()).toBe(true);
  });

  test("getFamily returns a realistic demo family with members, contacts, and alerts", async () => {
    const api = await loadApi();
    api.resetDemoMode();
    offlineFetch();

    const { family } = await api.getFamily("fam_1");
    expect(family.name).toBeTruthy();
    expect(family.members.length).toBeGreaterThan(0);
    expect(family.members[0].memberId).toBeTruthy();
    expect(Array.isArray(family.members[0].allergies)).toBe(true);
    expect(family.contacts[0].contactId).toBeTruthy();
    expect(family.alerts[0].confirmedBy).toEqual([]);
  });

  test.each([
    ["addFamilyMember", "member", (api, args) => api.addFamilyMember(args)],
    ["addFamilyContact", "contact", (api, args) => api.addFamilyContact(args)],
    ["addFamilyAlert", "alert", (api, args) => api.addFamilyAlert(args)],
    ["confirmFamilyAlert", "alert", (api, args) => api.confirmFamilyAlert(args)],
  ])("%s falls back to the success shape", async (_name, key, call) => {
    const api = await loadApi();
    api.resetDemoMode();
    offlineFetch();

    const result = await call(api, {
      familyId: "fam_1",
      name: "Zoya",
      phone: "+91 90000 11111",
      title: "Fake bill",
      alertId: "alt_1",
      memberId: "mem_1",
    });
    expect(result[key]).toBeTruthy();
    expect(api.isDemoMode()).toBe(true);
  });

  test("foodLookup returns a demo product with allergen arrays", async () => {
    const api = await loadApi();
    api.resetDemoMode();
    offlineFetch();

    const { product, memberFlags } = await api.foodLookup({ barcode: "8901234567890", familyId: "fam_1" });
    expect(product.name).toBeTruthy();
    expect(Array.isArray(product.allergens)).toBe(true);
    expect(Array.isArray(memberFlags)).toBe(true);
  });

  test("getFamilyLocations returns 3 demo members with numeric coordinates the map can render", async () => {
    const api = await loadApi();
    api.resetDemoMode();
    offlineFetch();

    const { members } = await api.getFamilyLocations("fam_1");
    expect(members.length).toBe(3);
    for (const m of members) {
      expect(m.memberId).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(typeof m.lat).toBe("number");
      expect(typeof m.lng).toBe("number");
      expect(m.updatedAt).toBeTruthy();
    }
    expect(api.isDemoMode()).toBe(true);
  });

  test("shareLocation and stopLocation fall back to { ok: true }", async () => {
    const api = await loadApi();
    api.resetDemoMode();
    offlineFetch();

    expect(await api.shareLocation({ familyId: "fam_1", memberId: "mem_1", name: "Anjali", lat: 28.61, lng: 77.2 })).toEqual({
      ok: true,
    });
    expect(await api.stopLocation({ familyId: "fam_1", memberId: "mem_1" })).toEqual({ ok: true });
  });

  test("submitReport falls back to a full guided-report shape", async () => {
    const api = await loadApi();
    api.resetDemoMode();
    offlineFetch();

    const report = await api.submitReport({ language: "en", description: "Someone asked for my OTP." });
    expect(report.reportId).toBeTruthy();
    expect(report.riskLevel).toBe("high");
    expect(report.analysis.summaryKey).toBeTruthy();
    expect(report.followUpQuestions.length).toBeGreaterThan(0);
    expect(report.reportingGuide.steps.length).toBeGreaterThan(0);
    expect(report.reportingGuide.evidenceChecklist.length).toBeGreaterThan(0);
  });
});