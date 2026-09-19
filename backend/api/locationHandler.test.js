const { ApiError } = require("./errors");
const {
  shareLocationHandler,
  stopLocationHandler,
  getFamilyLocationsHandler,
  share,
  stop,
  family,
} = require("./locationHandler");
const { clearStore } = require("../location/locationStore");

describe("locationHandler", () => {
  beforeEach(() => {
    delete process.env.LOCATIONS_TABLE_NAME;
    clearStore();
  });

  test("shareLocationHandler returns ok for a valid point", async () => {
    const result = await shareLocationHandler({
      familyId: "fam_1",
      memberId: "mem_1",
      name: "Arjun",
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 20,
    });
    expect(result).toEqual({ ok: true });
  });

  test("shareLocationHandler accepts a missing accuracy (defaults to 0)", async () => {
    await shareLocationHandler({
      familyId: "fam_1",
      memberId: "mem_1",
      name: "Arjun",
      lat: 10,
      lng: 10,
    });
    const { members } = await getFamilyLocationsHandler({ familyId: "fam_1" });
    expect(members[0].accuracy).toBe(0);
  });

  test("getFamilyLocationsHandler returns the shared members", async () => {
    await shareLocationHandler({ familyId: "fam_1", memberId: "mem_2", name: "B", lat: 1, lng: 1, accuracy: 0 });
    await shareLocationHandler({ familyId: "fam_1", memberId: "mem_1", name: "A", lat: 2, lng: 2, accuracy: 0 });

    const { members } = await getFamilyLocationsHandler({ familyId: "fam_1" });
    expect(members.map((m) => m.memberId)).toEqual(["mem_1", "mem_2"]);
    expect(members[0]).toHaveProperty("updatedAt");
  });

  test("stopLocationHandler returns ok", async () => {
    const result = await stopLocationHandler({ familyId: "fam_1", memberId: "mem_1" });
    expect(result).toEqual({ ok: true });
  });

  test("shareLocationHandler rejects a missing familyId", async () => {
    await expect(
      shareLocationHandler({ memberId: "mem_1", name: "A", lat: 1, lng: 1 })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  test("shareLocationHandler rejects a missing memberId and name", async () => {
    await expect(
      shareLocationHandler({ familyId: "fam_1", name: "A", lat: 1, lng: 1 })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });

    await expect(
      shareLocationHandler({ familyId: "fam_1", memberId: "mem_1", lat: 1, lng: 1 })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  test("shareLocationHandler rejects out-of-range coordinates", async () => {
    for (const point of [
      { lat: 91, lng: 0, accuracy: 0 },
      { lat: -90.1, lng: 0, accuracy: 0 },
      { lat: 0, lng: 181, accuracy: 0 },
      { lat: 0, lng: -180.1, accuracy: 0 },
      { lat: "12.97", lng: 0, accuracy: 0 },
      { lat: NaN, lng: 0, accuracy: 0 },
    ]) {
      await expect(
        shareLocationHandler({ familyId: "fam_1", memberId: "mem_1", name: "A", ...point })
      ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    }
  });

  test("shareLocationHandler rejects a negative / non-numeric accuracy", async () => {
    for (const accuracy of [-1, "20m", Infinity]) {
      await expect(
        shareLocationHandler({
          familyId: "fam_1",
          memberId: "mem_1",
          name: "A",
          lat: 1,
          lng: 1,
          accuracy,
        })
      ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    }
  });

  test("shareLocationHandler rejects an over-long name with INPUT_TOO_LARGE", async () => {
    await expect(
      shareLocationHandler({
        familyId: "fam_1",
        memberId: "mem_1",
        name: "x".repeat(61),
        lat: 1,
        lng: 1,
      })
    ).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
  });

  test("getFamilyLocationsHandler rejects a missing familyId", async () => {
    await expect(getFamilyLocationsHandler({})).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });

  test("options-preflight and wrapped exports use the ApiError contract", async () => {
    const preflight = await family({ httpMethod: "OPTIONS" });
    expect(preflight.statusCode).toBe(204);

    const ok = await share({ body: JSON.stringify({
      familyId: "fam_1", memberId: "mem_1", name: "A", lat: 1, lng: 1, accuracy: 0,
    }), httpMethod: "POST" });
    expect(ok.statusCode).toBe(200);

    const bad = await stop({
      body: JSON.stringify({ familyId: "fam_1" }),
      httpMethod: "POST",
    });
    expect(bad.statusCode).toBe(400);
    const parsed = JSON.parse(bad.body);
    expect(parsed.error.code).toBe("INVALID_REQUEST");
  });

  test("unexpected store failure is wrapped as INTERNAL_ERROR without leaking internals", async () => {
    jest.resetModules();
    jest.doMock("../location/locationStore", () => ({
      upsertLocation: async () => {
        throw new Error("dynamodb leaked detail");
      },
      deleteLocation: async () => {},
      getFamilyLocations: async () => [],
      isDeployedMode: () => false,
      clearStore: () => {},
    }));
    const { share: wrappedShare } = require("./locationHandler");

    try {
      const res = await wrappedShare({
        httpMethod: "POST",
        body: JSON.stringify({ familyId: "fam_1", memberId: "mem_1", name: "A", lat: 1, lng: 1, accuracy: 0 }),
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).error.code).toBe("INTERNAL_ERROR");
      expect(res.body).not.toMatch(/leaked/);
    } finally {
      jest.dontMock("../location/locationStore");
      jest.resetModules();
    }
  });
});