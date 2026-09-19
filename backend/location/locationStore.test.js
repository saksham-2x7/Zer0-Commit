const { mockClient } = require("aws-sdk-client-mock");
const {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");
const {
  upsertLocation,
  deleteLocation,
  getFamilyLocations,
  isDeployedMode,
  clearStore,
} = require("./locationStore");

const ddbMock = mockClient(DynamoDBDocumentClient);

describe("locationStore", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    ddbMock.reset();
    clearStore();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("local mode: isDeployedMode is false without LOCATIONS_TABLE_NAME", () => {
    delete process.env.LOCATIONS_TABLE_NAME;
    expect(isDeployedMode()).toBe(false);
  });

  test("local mode: upsertLocation stores a member with a 24h TTL", async () => {
    delete process.env.LOCATIONS_TABLE_NAME;

    const before = Math.floor(Date.now() / 1000);
    await upsertLocation("fam_1", "mem_1", {
      name: "Arjun",
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 20,
    });

    const members = await getFamilyLocations("fam_1");
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      familyId: "fam_1",
      memberId: "mem_1",
      name: "Arjun",
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 20,
    });
    expect(members[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:/);
    expect(ddbMock.calls()).toHaveLength(0);
  });

  test("local mode: upscating the same member overwrites the previous point", async () => {
    delete process.env.LOCATIONS_TABLE_NAME;

    await upsertLocation("fam_1", "mem_1", { name: "Arjun", lat: 10, lng: 10, accuracy: 5 });
    await upsertLocation("fam_1", "mem_1", { name: "Arjun", lat: 20, lng: 20, accuracy: 8 });

    const members = await getFamilyLocations("fam_1");
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ lat: 20, lng: 20, accuracy: 8 });
  });

  test("local mode: families are isolated and members are sorted by memberId", async () => {
    delete process.env.LOCATIONS_TABLE_NAME;

    await upsertLocation("fam_1", "mem_b", { name: "B", lat: 1, lng: 1, accuracy: 0 });
    await upsertLocation("fam_1", "mem_a", { name: "A", lat: 2, lng: 2, accuracy: 0 });
    await upsertLocation("fam_2", "mem_z", { name: "Z", lat: 3, lng: 3, accuracy: 0 });

    const fam1 = await getFamilyLocations("fam_1");
    expect(fam1.map((m) => m.memberId)).toEqual(["mem_a", "mem_b"]);

    const fam2 = await getFamilyLocations("fam_2");
    expect(fam2.map((m) => m.memberId)).toEqual(["mem_z"]);
  });

  test("local mode: deleteLocation removes only the target member", async () => {
    delete process.env.LOCATIONS_TABLE_NAME;

    await upsertLocation("fam_1", "mem_1", { name: "A", lat: 1, lng: 1, accuracy: 0 });
    await upsertLocation("fam_1", "mem_2", { name: "B", lat: 2, lng: 2, accuracy: 0 });
    expect(await deleteLocation("fam_1", "mem_1")).toBe(true);
    expect(await deleteLocation("fam_1", "mem_unknown")).toBe(true);

    const members = await getFamilyLocations("fam_1");
    expect(members.map((m) => m.memberId)).toEqual(["mem_2"]);
  });

  test("deployed mode: upsertLocation writes the keyed item to DynamoDB", async () => {
    process.env.LOCATIONS_TABLE_NAME = "scamsahayak-locations";
    ddbMock.on(PutCommand).resolves({});

    expect(isDeployedMode()).toBe(true);

    await upsertLocation("fam_1", "mem_1", {
      name: "Arjun",
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 20,
    });

    expect(ddbMock.calls()).toHaveLength(1);
    const call = ddbMock.call(0);
    expect(call.args[0].input.TableName).toBe("scamsahayak-locations");
    expect(call.args[0].input.Item.pk).toBe("loc#fam_1#mem_1");
    expect(call.args[0].input.Item).toMatchObject({
      familyId: "fam_1",
      memberId: "mem_1",
      name: "Arjun",
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 20,
    });
    expect(typeof call.args[0].input.Item.ttl).toBe("number");
    expect(call.args[0].input.Item.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  test("deployed mode: getFamilyLocations scans with a family prefix filter", async () => {
    process.env.LOCATIONS_TABLE_NAME = "scamsahayak-locations";
    const stored = {
      pk: "loc#fam_1#mem_1",
      familyId: "fam_1",
      memberId: "mem_1",
      name: "Arjun",
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 20,
      updatedAt: "2026-01-01T00:00:00.000Z",
      ttl: 9999999999,
    };
    ddbMock.on(ScanCommand).resolves({ Items: [stored] });

    const members = await getFamilyLocations("fam_1");
    expect(members).toEqual([{
      familyId: "fam_1",
      memberId: "mem_1",
      name: "Arjun",
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 20,
      updatedAt: "2026-01-01T00:00:00.000Z",
    }]);

    const call = ddbMock.call(0);
    expect(call.args[0].input.TableName).toBe("scamsahayak-locations");
    expect(call.args[0].input.FilterExpression).toBe("begins_with(pk, :prefix)");
    expect(call.args[0].input.ExpressionAttributeValues).toEqual({ ":prefix": "loc#fam_1#" });
  });

  test("deployed mode: getFamilyLocations drains pagination", async () => {
    process.env.LOCATIONS_TABLE_NAME = "scamsahayak-locations";
    const itemA = {
      pk: "loc#fam_1#mem_a", familyId: "fam_1", memberId: "mem_a",
      name: "A", lat: 1, lng: 1, accuracy: 0, updatedAt: "t", ttl: 1,
    };
    const itemB = {
      pk: "loc#fam_1#mem_b", familyId: "fam_1", memberId: "mem_b",
      name: "B", lat: 2, lng: 2, accuracy: 0, updatedAt: "t", ttl: 1,
    };
    ddbMock
      .on(ScanCommand)
      .resolvesOnce({ Items: [itemB], LastEvaluatedKey: { pk: "loc#fam_1#mem_b" } })
      .resolvesOnce({ Items: [itemA] });

    const members = await getFamilyLocations("fam_1");
    expect(members.map((m) => m.memberId)).toEqual(["mem_a", "mem_b"]);
    expect(ddbMock.calls()).toHaveLength(2);
    expect(ddbMock.call(1).args[0].input.ExclusiveStartKey).toEqual({ pk: "loc#fam_1#mem_b" });
  });

  test("deployed mode: deleteLocation removes by partition key", async () => {
    process.env.LOCATIONS_TABLE_NAME = "scamsahayak-locations";
    ddbMock.on(DeleteCommand).resolves({});

    expect(await deleteLocation("fam_1", "mem_1")).toBe(true);

    const call = ddbMock.call(0);
    expect(call.args[0].input.TableName).toBe("scamsahayak-locations");
    expect(call.args[0].input.Key).toEqual({ pk: "loc#fam_1#mem_1" });
  });

  test("local mode: clearStore empties every family", async () => {
    delete process.env.LOCATIONS_TABLE_NAME;

    await upsertLocation("fam_1", "mem_1", { name: "A", lat: 1, lng: 1, accuracy: 0 });
    clearStore();
    expect(await getFamilyLocations("fam_1")).toEqual([]);
  });
});