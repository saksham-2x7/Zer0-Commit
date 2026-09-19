const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const {
  createFamily,
  getFamily,
  addMember,
  addContact,
  addAlert,
  confirmAlert,
  isDeployedMode,
} = require("./familyStore");

const ddbMock = mockClient(DynamoDBDocumentClient);

describe("familyStore", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    ddbMock.reset();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("local mode: createFamily seeds an admin member and empty collections", async () => {
    delete process.env.FAMILY_TABLE_NAME;

    expect(isDeployedMode()).toBe(false);

    const family = await createFamily({ name: "Sharma Family", adminName: "Arjun" });

    expect(family.familyId).toMatch(/^fam_/);
    expect(family.name).toBe("Sharma Family");
    expect(family.members).toHaveLength(1);
    expect(family.members[0]).toMatchObject({ name: "Arjun", role: "admin", allergies: [] });
    expect(family.contacts).toEqual([]);
    expect(family.alerts).toEqual([]);
    expect(ddbMock.calls()).toHaveLength(0);
  });

  test("local mode: getFamily returns null for an unknown family", async () => {
    delete process.env.FAMILY_TABLE_NAME;
    expect(await getFamily("fam_missing")).toBeNull();
  });

  test("local mode: addMember appends a member with allergies", async () => {
    delete process.env.FAMILY_TABLE_NAME;

    const family = await createFamily({ name: "F", adminName: "Admin" });
    const member = await addMember(family.familyId, {
      name: "Meera",
      role: "elder",
      allergies: ["peanut", "shellfish"],
    });

    expect(member.memberId).toMatch(/^mem_/);
    expect(member).toMatchObject({ name: "Meera", role: "elder", allergies: ["peanut", "shellfish"] });

    const reloaded = await getFamily(family.familyId);
    expect(reloaded.members).toHaveLength(2);
    expect(reloaded.members[1]).toMatchObject(member);
  });

  test("local mode: addMember returns null for an unknown family", async () => {
    delete process.env.FAMILY_TABLE_NAME;
    expect(await addMember("fam_missing", { name: "X", role: "member", allergies: [] })).toBeNull();
  });

  test("local mode: addContact flags a suspicious contact", async () => {
    delete process.env.FAMILY_TABLE_NAME;

    const family = await createFamily({ name: "F", adminName: "Admin" });
    const contact = await addContact(family.familyId, {
      name: "Unknown Caller",
      phone: "+91 98765 43210",
      note: "Asked for OTP",
      flaggedBy: family.members[0].memberId,
    });

    expect(contact.contactId).toMatch(/^con_/);
    expect(contact).toMatchObject({ name: "Unknown Caller", status: "flagged" });

    const reloaded = await getFamily(family.familyId);
    expect(reloaded.contacts).toHaveLength(1);
    expect(reloaded.contacts[0].phone).toBe("+91 98765 43210");
  });

  test("local mode: addAlert creates a shared alert with empty confirmations", async () => {
    delete process.env.FAMILY_TABLE_NAME;

    const family = await createFamily({ name: "F", adminName: "Admin" });
    const alert = await addAlert(family.familyId, {
      title: "KYC scam wave",
      detail: "Calls claiming bank KYC expiry",
      riskLevel: "high",
    });

    expect(alert.alertId).toMatch(/^alt_/);
    expect(alert).toMatchObject({ title: "KYC scam wave", riskLevel: "high", confirmedBy: [] });
  });

  test("local mode: confirmAlert records a member confirmation once", async () => {
    delete process.env.FAMILY_TABLE_NAME;

    const family = await createFamily({ name: "F", adminName: "Admin" });
    const alert = await addAlert(family.familyId, { title: "T", detail: "D", riskLevel: "medium" });
    const memberId = family.members[0].memberId;

    await confirmAlert(family.familyId, alert.alertId, memberId);
    await confirmAlert(family.familyId, alert.alertId, memberId);

    const reloaded = await getFamily(family.familyId);
    expect(reloaded.alerts[0].confirmedBy).toEqual([memberId]);
  });

  test("local mode: confirmAlert returns null for unknown alert", async () => {
    delete process.env.FAMILY_TABLE_NAME;

    const family = await createFamily({ name: "F", adminName: "Admin" });
    expect(await confirmAlert(family.familyId, "alt_missing", "mem_x")).toBeNull();
  });

  test("deployed mode: writes the family document to DynamoDB", async () => {
    process.env.FAMILY_TABLE_NAME = "scamsahayak-families";
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(GetCommand).resolves({ Item: null });

    expect(isDeployedMode()).toBe(true);

    const family = await createFamily({ name: "F", adminName: "Admin" });

    expect(ddbMock.calls()).toHaveLength(1);
    const call = ddbMock.call(0);
    expect(call.args[0].input.TableName).toBe("scamsahayak-families");
    expect(call.args[0].input.Item.familyId).toBe(family.familyId);
  });

  test("deployed mode: getFamily reads from DynamoDB", async () => {
    process.env.FAMILY_TABLE_NAME = "scamsahayak-families";
    const stored = { familyId: "fam_1", name: "F", members: [], contacts: [], alerts: [] };
    ddbMock.on(GetCommand).resolves({ Item: stored });

    const family = await getFamily("fam_1");
    expect(family).toMatchObject(stored);

    const call = ddbMock.call(0);
    expect(call.args[0].input.Key).toEqual({ familyId: "fam_1" });
  });
});