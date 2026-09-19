import { useCallback, useEffect, useState } from "react";
import { t, errorCodeMessage } from "../i18n/translations";
import {
  createFamily,
  getFamily,
  addFamilyMember,
  addFamilyContact,
  addFamilyAlert,
  confirmFamilyAlert,
  addFamilyBlocklist,
} from "../services/api";

const FAMILY_ID_KEY = "scamsahayak-family-id";
const MEMBER_ID_KEY = "scamsahayak-member-id";
const MEMBER_NAME_KEY = "scamsahayak-member-name";

const ROLES = ["admin", "member", "elder"];
const RISK_LEVELS = ["low", "medium", "high"];

function readStored(key) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable — session-only family is fine
  }
}

export default function FamilyView({ language, onNavigate }) {
  const [familyId, setFamilyId] = useState(() => readStored(FAMILY_ID_KEY));
  const [memberId, setMemberId] = useState(() => readStored(MEMBER_ID_KEY));
  const [family, setFamily] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // create-family form
  const [familyName, setFamilyName] = useState("");
  const [adminName, setAdminName] = useState("");
  // add-member form
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("member");
  const [memberAllergies, setMemberAllergies] = useState("");
  // add-contact form
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactNote, setContactNote] = useState("");
  // add-alert form
  const [alertTitle, setAlertTitle] = useState("");
  const [alertDetail, setAlertDetail] = useState("");
  const [alertRisk, setAlertRisk] = useState("medium");
  // blocklist form
  const [blockPhone, setBlockPhone] = useState("");

  const loadFamily = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    setError(null);
    try {
      const { family: data } = await getFamily(familyId);
      setFamily(data);
    } catch (err) {
      setError(errorCodeMessage(language, err?.code) || t(language, "errorGeneric"));
    } finally {
      setLoading(false);
    }
  }, [familyId, language]);

  useEffect(() => {
    if (familyId) loadFamily();
  }, [familyId, loadFamily]);

  async function handleCreateFamily(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { familyId: id, family: data } = await createFamily({ name: familyName, adminName });
      writeStored(FAMILY_ID_KEY, id);
      writeStored(MEMBER_ID_KEY, data.members[0].memberId);
      writeStored(MEMBER_NAME_KEY, data.members[0].name);
      setFamilyId(id);
      setMemberId(data.members[0].memberId);
      setFamily(data);
    } catch (err) {
      setError(errorCodeMessage(language, err?.code) || t(language, "errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  async function runAction(action, successMessage) {
    setLoading(true);
    setError(null);
    try {
      await action();
      await loadFamily();
    } catch (err) {
      setError(errorCodeMessage(language, err?.code) || t(language, "errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  function handleAddMember(e) {
    e.preventDefault();
    const allergies = memberAllergies
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return runAction(() =>
      addFamilyMember({ familyId, name: memberName, role: memberRole, allergies })
    ).then(() => {
      setMemberName("");
      setMemberAllergies("");
    });
  }

  function handleAddContact(e) {
    e.preventDefault();
    return runAction(() =>
      addFamilyContact({
        familyId,
        name: contactName,
        phone: contactPhone,
        note: contactNote,
        flaggedBy: memberId,
      })
    ).then(() => {
      setContactName("");
      setContactPhone("");
      setContactNote("");
    });
  }

  function handleAddAlert(e) {
    e.preventDefault();
    return runAction(() =>
      addFamilyAlert({ familyId, title: alertTitle, detail: alertDetail, riskLevel: alertRisk })
    ).then(() => {
      setAlertTitle("");
      setAlertDetail("");
    });
  }

  function handleAddBlocklist(e) {
    e.preventDefault();
    return runAction(() =>
      addFamilyBlocklist({ familyId, phone: blockPhone, addedBy: memberId })
    ).then(() => setBlockPhone(""));
  }

  function handleConfirmAlert(alertId) {
    return runAction(() => confirmFamilyAlert({ familyId, alertId, memberId }));
  }

  if (!familyId) {
    return (
      <section aria-labelledby="family-create-title">
        <button
          type="button"
          className="mb-8 inline-flex min-h-[56px] items-center justify-center gap-2 border-4 border-black px-6 text-sm font-black uppercase tracking-[0.2em] transition-colors hover:bg-black hover:text-white dark:border-white dark:hover:bg-white dark:hover:text-black"
          onClick={() => onNavigate("home")}
        >
          {t(language, "common.back")}
        </button>
        <h2 id="family-create-title" className="text-5xl font-black uppercase leading-[0.9] tracking-tighter md:text-6xl">
          {t(language, "family.createTitle")}
        </h2>
        <p className="mt-6 max-w-2xl text-xl font-semibold leading-relaxed">{t(language, "family.createSubtitle")}</p>
        <form onSubmit={handleCreateFamily} className="mt-10 max-w-xl space-y-6">
          <div>
            <label htmlFor="family-name" className="block text-sm font-black uppercase tracking-widest">
              {t(language, "family.familyName")}
            </label>
            <input
              id="family-name"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              required
              maxLength={60}
              className="mt-2 w-full border-4 border-black bg-white p-4 text-lg font-bold dark:border-white dark:bg-black dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="family-admin" className="block text-sm font-black uppercase tracking-widest">
              {t(language, "family.adminName")}
            </label>
            <input
              id="family-admin"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              required
              maxLength={60}
              className="mt-2 w-full border-4 border-black bg-white p-4 text-lg font-bold dark:border-white dark:bg-black dark:text-white"
            />
          </div>
          {error && (
            <p role="alert" className="border-2 border-red-600 bg-red-50 p-3 font-semibold text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-200">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="h-16 w-full bg-black px-8 text-sm font-black uppercase tracking-widest text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-green-600 dark:hover:text-white"
          >
            {loading ? t(language, "family.creating") : t(language, "family.createButton")}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section aria-labelledby="family-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="family-title" className="text-5xl font-black uppercase leading-[0.9] tracking-tighter md:text-6xl">
            {family ? family.name : t(language, "family.title")}
          </h2>
          <p className="mt-4 text-lg font-bold opacity-70">{t(language, "family.familyIdLabel")} {familyId}</p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-[56px] items-center justify-center gap-2 border-4 border-black px-6 text-sm font-black uppercase tracking-[0.2em] transition-colors hover:bg-black hover:text-white dark:border-white dark:hover:bg-white dark:hover:text-black"
          onClick={() => onNavigate("food")}
        >
          {t(language, "family.goFood")}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-6 border-2 border-red-600 bg-red-50 p-3 font-semibold text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      {loading && <p className="mt-6 font-bold">{t(language, "family.loading")}</p>}

      {family && (
        <div className="mt-12 space-y-16">
          {/* Members */}
          <section aria-labelledby="family-members-title">
            <h3 id="family-members-title" className="border-b-4 border-black pb-2 text-sm font-black uppercase tracking-[0.2em] dark:border-white">
              {t(language, "family.membersTitle")}
            </h3>
            <ul className="mt-6 space-y-4">
              {family.members.map((m) => (
                <li key={m.memberId} className="border-2 border-black p-4 dark:border-white">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xl font-black">{m.name}</span>
                    <span className="text-xs font-black uppercase tracking-widest opacity-60">{m.role}</span>
                  </div>
                  {m.allergies.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {m.allergies.map((a) => (
                        <li key={a} className="border-2 border-black px-2 py-1 text-xs font-bold uppercase tracking-wider dark:border-white">
                          {a}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <form onSubmit={handleAddMember} className="mt-6 grid grid-cols-1 gap-4 border-4 border-black p-6 dark:border-white md:grid-cols-3">
              <div>
                <label htmlFor="member-name" className="block text-xs font-black uppercase tracking-widest">
                  {t(language, "family.memberName")}
                </label>
                <input
                  id="member-name"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  required
                  maxLength={60}
                  className="mt-2 w-full border-2 border-black bg-white p-3 font-bold dark:border-white dark:bg-black dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="member-role" className="block text-xs font-black uppercase tracking-widest">
                  {t(language, "family.memberRole")}
                </label>
                <select
                  id="member-role"
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                  className="mt-2 w-full border-2 border-black bg-white p-3 font-bold dark:border-white dark:bg-black dark:text-white"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="member-allergies" className="block text-xs font-black uppercase tracking-widest">
                  {t(language, "family.memberAllergies")}
                </label>
                <input
                  id="member-allergies"
                  value={memberAllergies}
                  onChange={(e) => setMemberAllergies(e.target.value)}
                  placeholder={t(language, "family.allergiesPlaceholder")}
                  maxLength={900}
                  className="mt-2 w-full border-2 border-black bg-white p-3 font-bold dark:border-white dark:bg-black dark:text-white"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="h-14 bg-black px-6 text-sm font-black uppercase tracking-widest text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-green-600 dark:hover:text-white md:col-span-3"
              >
                {t(language, "family.addMemberButton")}
              </button>
            </form>
          </section>

          {/* Contacts */}
          <section aria-labelledby="family-contacts-title">
            <h3 id="family-contacts-title" className="border-b-4 border-black pb-2 text-sm font-black uppercase tracking-[0.2em] dark:border-white">
              {t(language, "family.contactsTitle")}
            </h3>
            <ul className="mt-6 space-y-4">
              {family.contacts.map((c) => (
                <li key={c.contactId} className="border-2 border-black p-4 dark:border-white">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xl font-black">{c.name}</span>
                    <span className="font-mono text-sm font-bold">{c.phone}</span>
                  </div>
                  {c.note && <p className="mt-2 font-semibold opacity-70">{c.note}</p>}
                  <p className="mt-1 text-xs font-bold uppercase tracking-widest opacity-50">
                    {t(language, "family.flaggedBy")} {c.flaggedBy} · {c.status}
                  </p>
                </li>
              ))}
            </ul>
            <form onSubmit={handleAddContact} className="mt-6 grid grid-cols-1 gap-4 border-4 border-black p-6 dark:border-white md:grid-cols-3">
              <div>
                <label htmlFor="contact-name" className="block text-xs font-black uppercase tracking-widest">
                  {t(language, "family.contactName")}
                </label>
                <input
                  id="contact-name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  required
                  maxLength={60}
                  className="mt-2 w-full border-2 border-black bg-white p-3 font-bold dark:border-white dark:bg-black dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="contact-phone" className="block text-xs font-black uppercase tracking-widest">
                  {t(language, "family.contactPhone")}
                </label>
                <input
                  id="contact-phone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  required
                  maxLength={20}
                  className="mt-2 w-full border-2 border-black bg-white p-3 font-bold dark:border-white dark:bg-black dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="contact-note" className="block text-xs font-black uppercase tracking-widest">
                  {t(language, "family.contactNote")}
                </label>
                <input
                  id="contact-note"
                  value={contactNote}
                  onChange={(e) => setContactNote(e.target.value)}
                  maxLength={200}
                  className="mt-2 w-full border-2 border-black bg-white p-3 font-bold dark:border-white dark:bg-black dark:text-white"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="h-14 bg-black px-6 text-sm font-black uppercase tracking-widest text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-green-600 dark:hover:text-white md:col-span-3"
              >
                {t(language, "family.addContactButton")}
              </button>
            </form>
          </section>

          {/* Alerts */}
          <section aria-labelledby="family-alerts-title">
            <h3 id="family-alerts-title" className="border-b-4 border-black pb-2 text-sm font-black uppercase tracking-[0.2em] dark:border-white">
              {t(language, "family.alertsTitle")}
            </h3>
            <ul className="mt-6 space-y-4">
              {family.alerts.map((a) => (
                <li key={a.alertId} className="border-2 border-black p-4 dark:border-white">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xl font-black">{a.title}</span>
                    <span className="text-xs font-black uppercase tracking-widest opacity-60">{a.riskLevel}</span>
                  </div>
                  {a.detail && <p className="mt-2 font-semibold opacity-70">{a.detail}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-widest opacity-50">
                      {t(language, "family.confirmedBy")} {a.confirmedBy.length}
                    </span>
                    {!a.confirmedBy.includes(memberId) && (
                      <button
                        type="button"
                        onClick={() => handleConfirmAlert(a.alertId)}
                        disabled={loading}
                        className="h-10 border-2 border-black px-4 text-xs font-black uppercase tracking-widest transition-colors hover:bg-black hover:text-white disabled:cursor-not-allowed dark:border-white dark:hover:bg-white dark:hover:text-black"
                      >
                        {t(language, "family.confirmAlert")}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <form onSubmit={handleAddAlert} className="mt-6 grid grid-cols-1 gap-4 border-4 border-black p-6 dark:border-white md:grid-cols-3">
              <div>
                <label htmlFor="alert-title" className="block text-xs font-black uppercase tracking-widest">
                  {t(language, "family.alertTitle")}
                </label>
                <input
                  id="alert-title"
                  value={alertTitle}
                  onChange={(e) => setAlertTitle(e.target.value)}
                  required
                  maxLength={80}
                  className="mt-2 w-full border-2 border-black bg-white p-3 font-bold dark:border-white dark:bg-black dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="alert-detail" className="block text-xs font-black uppercase tracking-widest">
                  {t(language, "family.alertDetail")}
                </label>
                <input
                  id="alert-detail"
                  value={alertDetail}
                  onChange={(e) => setAlertDetail(e.target.value)}
                  maxLength={300}
                  className="mt-2 w-full border-2 border-black bg-white p-3 font-bold dark:border-white dark:bg-black dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="alert-risk" className="block text-xs font-black uppercase tracking-widest">
                  {t(language, "family.alertRisk")}
                </label>
                <select
                  id="alert-risk"
                  value={alertRisk}
                  onChange={(e) => setAlertRisk(e.target.value)}
                  className="mt-2 w-full border-2 border-black bg-white p-3 font-bold dark:border-white dark:bg-black dark:text-white"
                >
                  {RISK_LEVELS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="h-14 bg-black px-6 text-sm font-black uppercase tracking-widest text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-green-600 dark:hover:text-white md:col-span-3"
              >
                {t(language, "family.addAlertButton")}
              </button>
            </form>
          </section>

          {/* Blocklist */}
          <section aria-labelledby="family-blocklist-title">
            <h3 id="family-blocklist-title" className="border-b-4 border-black pb-2 text-sm font-black uppercase tracking-[0.2em] dark:border-white">
              {t(language, "family.blocklistTitle")}
            </h3>
            <ul className="mt-6 space-y-4">
              {family.blocklist.map((b, i) => (
                <li key={`${b.phone}-${i}`} className="flex flex-wrap items-center justify-between gap-2 border-2 border-black p-4 dark:border-white">
                  <span className="font-mono text-lg font-black">{b.phone}</span>
                  <span className="text-xs font-bold uppercase tracking-widest opacity-50">
                    {t(language, "family.addedBy")} {b.addedBy}
                  </span>
                </li>
              ))}
            </ul>
            <form onSubmit={handleAddBlocklist} className="mt-6 flex flex-col gap-4 border-4 border-black p-6 dark:border-white md:flex-row">
              <div className="flex-1">
                <label htmlFor="block-phone" className="block text-xs font-black uppercase tracking-widest">
                  {t(language, "family.blockPhone")}
                </label>
                <input
                  id="block-phone"
                  value={blockPhone}
                  onChange={(e) => setBlockPhone(e.target.value)}
                  required
                  maxLength={20}
                  className="mt-2 w-full border-2 border-black bg-white p-3 font-bold dark:border-white dark:bg-black dark:text-white"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="h-14 bg-black px-6 text-sm font-black uppercase tracking-widest text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-green-600 dark:hover:text-white"
              >
                {t(language, "family.addBlocklistButton")}
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}