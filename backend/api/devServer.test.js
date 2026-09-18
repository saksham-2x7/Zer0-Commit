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
});