const { Readable } = require("node:stream");
const { createServer } = require("./devServer");

describe("devServer", () => {
  let server;
  let baseUrl;

  beforeAll((done) => {
    server = createServer();
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    // Never let a test wander into a real Bedrock/Textract call if the
    // ambient environment has BEDROCK_MODEL_ID or AWS credentials set.
    process.env.MOCK_BEDROCK = "true";
    // cors.js is fail-closed: without ALLOWED_ORIGIN the origin header is
    // omitted, so pin it for the OPTIONS/CORS assertions below.
    process.env.ALLOWED_ORIGIN = "http://localhost:5173";
  });

  test("unknown route -> 404 NOT_FOUND", async () => {
    const res = await fetch(`${baseUrl}/api/nope`, { method: "POST", body: "{}" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("non-POST on a valid route -> 404 NOT_FOUND", async () => {
    const res = await fetch(`${baseUrl}/api/analyze`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("oversized body -> 413 INPUT_TOO_LARGE", async () => {
    const res = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(8 * 1024 * 1024),
    });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error.code).toBe("INPUT_TOO_LARGE");
  });

  test("valid analyze request -> 200 with risk result", async () => {
    const res = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: "en", inputType: "text", rawText: "hello there" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.riskLevel).toBe("low");
  });

  test("route handler errors keep the structured ApiError contract", async () => {
    const res = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: "en", inputType: "text" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  test("OPTIONS -> 204 with CORS headers", async () => {
    const res = await fetch(`${baseUrl}/api/analyze`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
  });

  test("malformed JSON -> 400 INVALID_REQUEST", async () => {
    const res = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  test("body that exceeds the cap during streaming (no Content-Length) -> 413", async () => {
    const res = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: Readable.toWeb(Readable.from(["x".repeat(10 * 1024 * 1024)])),
      duplex: "half",
    });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error.code).toBe("INPUT_TOO_LARGE");
  });

  test("health-tags route works offline under MOCK_BEDROCK", async () => {
    const res = await fetch(`${baseUrl}/api/health-tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Patient reports type 2 diabetes", language: "en" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestedTags).toEqual([]);
  });

  test("food-feedback route works offline under MOCK_BEDROCK and keeps the disclaimer", async () => {
    const res = await fetch(`${baseUrl}/api/food-feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: "en",
        healthTags: ["Diabetes"],
        product: { name: "Cereal", brand: "Test", nutriScore: "E" },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.feedback).toBe("string");
    expect(body.feedback).toMatch(/not medical advice/i);
  });

  test("non-ApiError thrown by a route handler -> 500 INTERNAL_ERROR, no internals leaked", async () => {
    // Isolated module load with a route handler that throws a raw Error, so
    // this exercises the dev server's unhandled-error path without touching
    // the shared server used by the other tests above.
    jest.resetModules();
    jest.doMock("./ocrHandler", () => ({
      ocr: async () => {
        throw new Error("leaky internal detail");
      },
    }));
    const { createServer: makeIsolatedServer } = require("./devServer");

    let isolatedServer;
    await new Promise((resolve) => {
      isolatedServer = makeIsolatedServer();
      isolatedServer.listen(0, "127.0.0.1", resolve);
    });
    const isolatedUrl = `http://127.0.0.1:${isolatedServer.address().port}`;

    try {
      const res = await fetch(`${isolatedUrl}/api/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: "aGVsbG8=", imageMimeType: "image/png" }),
      });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).not.toMatch(/leaky/);
    } finally {
      await new Promise((resolve) => isolatedServer.close(resolve));
      jest.dontMock("./ocrHandler");
      jest.resetModules();
    }
  });

  test("family create -> GET family roundtrip", async () => {
    const createRes = await fetch(`${baseUrl}/api/family/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Sharma Family", adminName: "Arjun" }),
    });
    expect(createRes.status).toBe(200);
    const { familyId } = await createRes.json();

    const getRes = await fetch(`${baseUrl}/api/family/${familyId}`);
    expect(getRes.status).toBe(200);
    const { family } = await getRes.json();
    expect(family.name).toBe("Sharma Family");
    expect(family.members[0]).toMatchObject({ name: "Arjun", role: "admin" });
  });

  test("family member with allergies -> food-lookup flags them (unknown barcode path)", async () => {
    const createRes = await fetch(`${baseUrl}/api/family/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "F", adminName: "Admin" }),
    });
    const { familyId } = await createRes.json();

    await fetch(`${baseUrl}/api/family/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ familyId, name: "Meera", role: "elder", allergies: ["peanut"] }),
    });

    // Unknown barcode -> NOT_FOUND (no network call to Open Food Facts).
    const lookupRes = await fetch(`${baseUrl}/api/food-lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barcode: "0000000000000", familyId }),
    });
    expect(lookupRes.status).toBe(404);
    const body = await lookupRes.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("GET unknown family -> 404 NOT_FOUND", async () => {
    const res = await fetch(`${baseUrl}/api/family/fam_missing`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("messaging: register key, create thread, send ciphertext, list messages", async () => {
    const keyRes = await fetch(`${baseUrl}/api/messaging/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: "mem_1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "abc", y: "def" },
      }),
    });
    expect(keyRes.status).toBe(200);
    const { fingerprint } = await keyRes.json();
    expect(fingerprint).toMatch(/^[0-9a-f]{4}-/);

    const threadRes = await fetch(`${baseUrl}/api/messaging/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Family", memberIds: ["mem_1", "mem_2"] }),
    });
    const { threadId } = await threadRes.json();

    const sendRes = await fetch(`${baseUrl}/api/messaging/threads/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId: "mem_1", iv: "base64iv", ciphertext: "base64cipher" }),
    });
    expect(sendRes.status).toBe(200);

    const listRes = await fetch(`${baseUrl}/api/messaging/threads/${threadId}/messages`);
    expect(listRes.status).toBe(200);
    const { messages } = await listRes.json();
    expect(messages).toHaveLength(1);
    expect(messages[0].ciphertext).toBe("base64cipher");
    expect(messages[0].plaintext).toBeUndefined();
  });
});