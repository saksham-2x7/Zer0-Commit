const { ApiError } = require("./errors");
const {
  createFamilyHandler,
  addMemberHandler,
  addContactHandler,
  addAlertHandler,
  confirmAlertHandler,
  getFamilyHandler,
} = require("./familyHandler");

describe("familyHandler", () => {
  test("createFamilyHandler creates a family with an admin member", async () => {
    const { familyId, family } = await createFamilyHandler({ name: "Sharma Family", adminName: "Arjun" });

    expect(familyId).toMatch(/^fam_/);
    expect(family.name).toBe("Sharma Family");
    expect(family.members[0]).toMatchObject({ name: "Arjun", role: "admin" });
  });

  test("createFamilyHandler rejects empty names", async () => {
    await expect(createFamilyHandler({ name: "  ", adminName: "Arjun" })).rejects.toThrow(ApiError);
    await expect(createFamilyHandler({ name: "F", adminName: "" })).rejects.toThrow(ApiError);
  });

  test("addMemberHandler adds a member with deduplicated allergies", async () => {
    const { familyId } = await createFamilyHandler({ name: "F", adminName: "Admin" });
    const { member } = await addMemberHandler({
      familyId,
      name: "Meera",
      role: "elder",
      allergies: ["peanut", "peanut", "shellfish"],
    });

    expect(member).toMatchObject({ name: "Meera", role: "elder" });
    expect(member.allergies).toEqual(["peanut", "shellfish"]);
  });

  test("addMemberHandler rejects unknown roles and oversized allergy lists", async () => {
    const { familyId } = await createFamilyHandler({ name: "F", adminName: "Admin" });

    await expect(addMemberHandler({ familyId, name: "X", role: "boss", allergies: [] })).rejects.toThrow(ApiError);

    const tooMany = Array.from({ length: 16 }, (_, i) => `tag${i}`);
    await expect(addMemberHandler({ familyId, name: "X", role: "member", allergies: tooMany })).rejects.toThrow(ApiError);
  });

  test("addMemberHandler rejects unknown families with NOT_FOUND", async () => {
    await expect(
      addMemberHandler({ familyId: "fam_missing", name: "X", role: "member", allergies: [] })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("addContactHandler flags a suspicious contact", async () => {
    const { familyId, family } = await createFamilyHandler({ name: "F", adminName: "Admin" });
    const { contact } = await addContactHandler({
      familyId,
      name: "Unknown Caller",
      phone: "+91 98765 43210",
      note: "Asked for OTP",
      flaggedBy: family.members[0].memberId,
    });

    expect(contact).toMatchObject({ name: "Unknown Caller", status: "flagged" });
  });

  test("addContactHandler rejects missing phone", async () => {
    const { familyId } = await createFamilyHandler({ name: "F", adminName: "Admin" });
    await expect(addContactHandler({ familyId, name: "X", flaggedBy: "mem_1" })).rejects.toThrow(ApiError);
  });

  test("addAlertHandler creates a shared alert", async () => {
    const { familyId } = await createFamilyHandler({ name: "F", adminName: "Admin" });
    const { alert } = await addAlertHandler({
      familyId,
      title: "KYC scam wave",
      detail: "Calls claiming bank KYC expiry",
      riskLevel: "high",
    });

    expect(alert).toMatchObject({ title: "KYC scam wave", riskLevel: "high", confirmedBy: [] });
  });

  test("addAlertHandler rejects invalid risk levels", async () => {
    const { familyId } = await createFamilyHandler({ name: "F", adminName: "Admin" });
    await expect(addAlertHandler({ familyId, title: "T", riskLevel: "critical" })).rejects.toThrow(ApiError);
  });

  test("confirmAlertHandler records a confirmation", async () => {
    const { familyId, family } = await createFamilyHandler({ name: "F", adminName: "Admin" });
    const { alert } = await addAlertHandler({ familyId, title: "T", detail: "D", riskLevel: "medium" });
    const memberId = family.members[0].memberId;

    const { alert: confirmed } = await confirmAlertHandler({ familyId, alertId: alert.alertId, memberId });
    expect(confirmed.confirmedBy).toEqual([memberId]);
  });

  test("confirmAlertHandler rejects unknown alerts with NOT_FOUND", async () => {
    const { familyId } = await createFamilyHandler({ name: "F", adminName: "Admin" });
    await expect(confirmAlertHandler({ familyId, alertId: "alt_missing", memberId: "mem_1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("getFamilyHandler returns the full family state", async () => {
    const { familyId } = await createFamilyHandler({ name: "F", adminName: "Admin" });
    const { family } = await getFamilyHandler({ familyId });

    expect(family.familyId).toBe(familyId);
    expect(family.members).toHaveLength(1);
    expect(family.contacts).toEqual([]);
    expect(family.alerts).toEqual([]);
  });

  test("getFamilyHandler rejects unknown families with NOT_FOUND", async () => {
    await expect(getFamilyHandler({ familyId: "fam_missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});