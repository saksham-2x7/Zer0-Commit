import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { analyzeMessage, ocrImage, extractHealthTags, getFoodFeedback } from "./api";

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

  test("throws an Error carrying the API error code and message for a non-ok response", async () => {
    global.fetch = mockResponse({
      ok: false,
      status: 422,
      body: { error: { code: "OCR_FAILED", message: "Could not read text." } },
    });

    const err = await extractHealthTags({ text: "x", language: "en" }).catch((e) => e);
    expect(err.code).toBe("OCR_FAILED");
    expect(err.message).toBe("Could not read text.");
  });

  test("uses a generic status message when the error body has no error object", async () => {
    global.fetch = mockResponse({ ok: false, status: 500, body: { nope: true } });

    const err = await ocrImage({ imageBase64: "x", imageMimeType: "image/png" }).catch((e) => e);
    expect(err.code).toBeUndefined();
    expect(err.message).toBe("Request failed with status 500");
  });

  test("treats an unparseable non-ok body as a generic failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers(),
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });

    const err = await analyzeMessage({ language: "en", inputType: "text" }).catch((e) => e);
    expect(err.message).toBe("Request failed with status 502");
  });

  test("resolves null when a successful response body is not JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });

    const data = await getFoodFeedback({ language: "en", healthTags: [], product: {} });
    expect(data).toBeNull();
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