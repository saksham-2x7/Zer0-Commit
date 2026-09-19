import { useRef, useState } from "react";
import { t, errorCodeMessage } from "../i18n/translations";
import { ocrImage, extractHealthTags } from "../services/api";
import {
  loadHealthProfile,
  saveHealthProfile,
  clearHealthProfile,
  loadPersonalDetails,
  savePersonalDetails,
} from "../utils/healthProfile";
import Icon from "./icons";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg"]);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_FIELD_LENGTH = { fullName: 100, phone: 24, age: 20, household: 60 };

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || "";
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function splitTitle(title) {
  const words = String(title).trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { prefix: "", last: title };
  return { prefix: words.slice(0, -1).join(" "), last: words[words.length - 1] };
}

export default function HealthProfile({ language, onBack }) {
  const [savedTags, setSavedTags] = useState(loadHealthProfile);
  const [pendingTags, setPendingTags] = useState(null); // [{ tag, checked }] | null
  const [manualInput, setManualInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const [details, setDetails] = useState(() => {
    const stored = loadPersonalDetails();
    return {
      fullName: stored?.fullName || t(language, "page.health.fullNameValue"),
      phone: stored?.phone || t(language, "page.health.phoneValue"),
      age: stored?.age || t(language, "page.health.ageValue"),
      household: stored?.household || t(language, "page.health.householdValue"),
    };
  });
  const [contacts, setContacts] = useState(() => {
    const stored = loadPersonalDetails();
    return Array.isArray(stored?.contacts) ? stored.contacts : [];
  });
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [detailsError, setDetailsError] = useState(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", phone: "" });
  const [unblocked, setUnblocked] = useState({});

  async function handleFile(file) {
    if (!file) return;
    setError(null);

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setError(t(language, "errorCode_INVALID_IMAGE"));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`${t(language, "errorCode_INPUT_TOO_LARGE")} ${t(language, "imageUploadSizeHint")}`);
      return;
    }

    setUploading(true);
    try {
      const imageBase64 = await fileToBase64(file);
      const { text } = await ocrImage({ imageBase64, imageMimeType: file.type });
      if (!text || text.trim().length === 0) {
        setError(t(language, "healthProfileErrorGeneric"));
        return;
      }
      const { suggestedTags } = await extractHealthTags({ text, language });
      setPendingTags(suggestedTags.map((tag) => ({ tag, checked: true })));
    } catch (err) {
      // Surface the backend's error code (UNSUPPORTED_LANGUAGE 400,
      // INPUT_TOO_LARGE 413, INVALID_IMAGE 400, OCR_FAILED 422) when the API
      // supplies one; otherwise tell the user whether the network is at fault.
      const codeMessage = errorCodeMessage(language, err?.code);
      if (codeMessage) {
        setError(codeMessage);
      } else if (err && err.name === "TypeError") {
        setError(t(language, "healthProfileErrorNetwork"));
      } else {
        setError(t(language, "healthProfileErrorGeneric"));
      }
    } finally {
      setUploading(false);
    }
  }

  function togglePendingTag(index) {
    setPendingTags((current) =>
      current.map((item, i) => (i === index ? { ...item, checked: !item.checked } : item))
    );
  }

  function handleConfirmPending() {
    const confirmed = pendingTags.filter((item) => item.checked).map((item) => item.tag);
    const next = saveHealthProfile([...savedTags, ...confirmed]);
    setSavedTags(next);
    setPendingTags(null);
  }

  function handleAddManual() {
    if (!manualInput.trim()) return;
    if (manualInput.trim().length > 120) {
      setError(t(language, "page.health.tagTooLong"));
      return;
    }
    const next = saveHealthProfile([...savedTags, manualInput.trim()]);
    setSavedTags(next);
    setManualInput("");
  }

  function handleRemoveTag(tag) {
    const next = saveHealthProfile(savedTags.filter((item) => item !== tag));
    setSavedTags(next);
  }

  function handleClear() {
    clearHealthProfile();
    setSavedTags([]);
    setPendingTags(null);
  }

  function updateDetail(field, value) {
    setDetails((prev) => ({ ...prev, [field]: value }));
    setDetailsSaved(false);
    setDetailsError(null);
  }

  function handleSaveDetails() {
    setDetailsError(null);
    const tooLong = Object.entries(details).some(
      ([field, value]) => value.length > (MAX_FIELD_LENGTH[field] ?? 100)
    );
    if (tooLong) {
      setDetailsError(t(language, "page.health.detailsError"));
      return;
    }
    savePersonalDetails({ ...details, contacts });
    setDetailsSaved(true);
  }

  function handleAddContact(e) {
    e.preventDefault();
    setDetailsError(null);
    const name = newContact.name.trim();
    const phone = newContact.phone.trim();
    if (!name || !phone) return;
    if (name.length > 100 || phone.length > 24) {
      setDetailsError(t(language, "page.health.detailsError"));
      return;
    }
    const updated = [...contacts, { name, phone }];
    setContacts(updated);
    savePersonalDetails({ ...details, contacts: updated });
    setNewContact({ name: "", phone: "" });
    setShowContactForm(false);
  }

  const title = splitTitle(t(language, "page.health.title"));
  const familyContacts = [
    { name: t(language, "page.health.family1"), phone: t(language, "page.health.family1phone"), tel: "+919999988888" },
    { name: t(language, "page.health.family2"), phone: t(language, "page.health.family2phone"), tel: "+919999977777" },
    ...contacts.map((c) => ({ name: c.name, phone: c.phone, tel: `tel:${c.phone}` })),
  ];
  const blockedItems = [
    { id: "blocked1", number: t(language, "page.health.blocked1"), label: t(language, "page.health.blocked1label") },
    { id: "blocked2", number: t(language, "page.health.blocked2"), label: t(language, "page.health.blocked2label") },
  ];
  const merchants = [
    { icon: "building", name: t(language, "page.health.merchant.sbi") },
    { icon: "shoppingBag", name: t(language, "page.health.merchant.bigbasket") },
    { icon: "zap", name: t(language, "page.health.merchant.tatapower") },
  ];
  const sectionHeading =
    "text-[40px] font-black tracking-tighter uppercase mb-12 border-b-4 border-black dark:border-white pb-4";

  return (
    <div className="w-full space-y-16 py-10 md:space-y-24">
      <button
        type="button"
        className="btn-secondary mb-4 w-auto"
        onClick={onBack}
      >
        {t(language, "healthProfileBackButton")}
      </button>

      <div className="mb-20 flex flex-col items-start justify-between gap-8 border-b-8 border-black pb-16 md:flex-row md:items-end dark:border-white">
        <div className="max-w-2xl">
          <h1 className="mb-8 text-5xl font-black uppercase leading-[0.9] tracking-tighter md:text-7xl">
            {title.prefix && (
              <>
                {title.prefix}
                <br />
              </>
            )}
            {title.last}
          </h1>
          <p className="text-xl font-bold leading-relaxed">{t(language, "page.health.sub")}</p>
          <a
            href="#settings"
            className="touch-target mt-8 inline-flex w-full bg-black px-12 text-sm font-bold uppercase tracking-widest text-white transition-all md:w-auto dark:bg-white dark:text-black"
          >
            {t(language, "page.health.editProfile")}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-16 lg:grid-cols-12 md:gap-24">
        <div className="space-y-16 lg:col-span-7 md:space-y-24">
          <section aria-labelledby="heading-personal">
            <h2 id="heading-personal" className={sectionHeading}>
              {t(language, "page.health.personal")}
            </h2>
            <div className="grid gap-8 md:grid-cols-2">
              {[
                { field: "fullName", label: t(language, "page.health.fullName") },
                { field: "phone", label: t(language, "page.health.phone") },
                { field: "age", label: t(language, "page.health.age") },
                { field: "household", label: t(language, "page.health.household") },
              ].map(({ field, label }) => (
                <div key={field} className="space-y-2 border-2 border-black p-6 dark:border-white">
                  <label htmlFor={`detail-${field}`} className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em]">
                    {label}
                  </label>
                  <input
                    id={`detail-${field}`}
                    type="text"
                    value={details[field]}
                    onChange={(e) => updateDetail(field, e.target.value)}
                    className="text-xl w-full bg-transparent outline-none border-b-2 border-black pb-1 dark:border-white"
                  />
                </div>
              ))}
            </div>

            {detailsError && (
              <p role="alert" className="mt-4 text-sm font-black uppercase tracking-widest text-red-600">
                {detailsError}
              </p>
            )}
            {detailsSaved && (
              <p role="status" className="mt-4 text-sm font-black uppercase tracking-widest text-green-600">
                {t(language, "page.health.detailsSaved")}
              </p>
            )}

            <button
              type="button"
              onClick={handleSaveDetails}
              className="touch-target mt-8 w-full border-2 border-black px-12 text-sm font-black uppercase tracking-widest transition-all hover:bg-black hover:text-white md:w-auto dark:border-white dark:hover:bg-white dark:hover:text-black"
            >
              {t(language, "page.health.saveDetails")}
            </button>
          </section>

          <section aria-labelledby="heading-emergency">
            <h2 id="heading-emergency" className={sectionHeading}>
              {t(language, "page.health.family")}
            </h2>
            <ul className="space-y-8">
              {familyContacts.map((contact) => (
                <li
                  key={contact.phone}
                  className="flex flex-col items-center justify-between gap-6 border-2 border-black p-8 md:flex-row dark:border-white"
                >
                  <div className="flex w-full items-center gap-6">
                    <span className="flex h-16 w-16 items-center justify-center bg-black text-2xl font-black text-white dark:bg-white dark:text-black">
                      {initials(contact.name)}
                    </span>
                    <div>
                      <p className="text-xl font-black">{contact.name}</p>
                      <p className="text-lg font-bold">{contact.phone}</p>
                    </div>
                  </div>
                  <a
                    href={contact.tel}
                    className="touch-target w-full border-2 border-black px-8 text-sm font-black uppercase tracking-widest transition-all hover:bg-black hover:text-white md:w-auto dark:border-white dark:hover:bg-white dark:hover:text-black"
                  >
                    {t(language, "common.callNow")}
                  </a>
                </li>
              ))}
            </ul>

            {showContactForm && (
              <form
                onSubmit={handleAddContact}
                className="mt-8 space-y-6 border-2 border-dashed border-black p-6 dark:border-white"
              >
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest">
                    {t(language, "page.health.newContactName")}
                  </span>
                  <input
                    type="text"
                    value={newContact.name}
                    onChange={(e) => setNewContact((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full border-2 border-black px-4 py-3 text-lg font-bold outline-none dark:border-white dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest">
                    {t(language, "page.health.newContactPhone")}
                  </span>
                  <input
                    type="tel"
                    value={newContact.phone}
                    onChange={(e) => setNewContact((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full border-2 border-black px-4 py-3 text-lg font-bold outline-none dark:border-white dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <button
                  type="submit"
                  className="touch-target w-full bg-black px-8 text-sm font-black uppercase tracking-widest text-white dark:bg-white dark:text-black"
                >
                  {t(language, "page.health.newContactConfirm")}
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => setShowContactForm((open) => !open)}
              className="touch-target mt-8 w-full border-2 border-dashed border-black text-sm font-black uppercase tracking-widest dark:border-white"
            >
              {t(language, "page.health.addContact")}
            </button>
          </section>

          <section aria-labelledby="heading-tags">
            <h2 id="heading-tags" className={sectionHeading}>
              {t(language, "healthProfileHeading")}
            </h2>
            <p className="text-base font-bold leading-relaxed text-slate-600 dark:text-slate-300">
              {t(language, "healthProfileIntro")}
            </p>
            <p className="mt-2 text-sm italic text-slate-500 dark:text-slate-400">
              {t(language, "healthProfileNotMedicalAdvice")}
            </p>

            {savedTags.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
                  {t(language, "healthProfileSavedTagsHeading")}
                </h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {savedTags.map((tag) => (
                    <li
                      key={tag}
                      className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-700 dark:text-slate-100"
                    >
                      {tag}
                      <button
                        type="button"
                        aria-label={`${t(language, "healthProfileRemoveTagAria")} ${tag}`}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-slate-600 hover:text-red-600 dark:text-slate-300"
                        onClick={() => handleRemoveTag(tag)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {savedTags.length === 0 && !pendingTags && (
              <p className="mt-6 text-slate-500 dark:text-slate-400">{t(language, "healthProfileEmpty")}</p>
            )}

            {pendingTags && (
              <div className="mt-6 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="font-semibold text-slate-700 dark:text-slate-200">
                  {t(language, "healthProfileSuggestedTagsHeading")}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {t(language, "healthProfileSuggestedTagsHint")}
                </p>
                {pendingTags.length === 0 ? (
                  <p className="mt-2 text-slate-600 dark:text-slate-300">{t(language, "healthProfileEmpty")}</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {pendingTags.map((item, index) => (
                      <li key={index}>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={() => togglePendingTag(index)}
                          />
                          {item.tag}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="btn-primary mt-3 w-full" onClick={handleConfirmPending}>
                  {t(language, "healthProfileSaveButton")}
                </button>
              </div>
            )}

            <div className="mt-6 space-y-2">
              <label
                htmlFor="health-profile-manual-input"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                {t(language, "healthProfileAddManualLabel")}
              </label>
              <div className="flex gap-2">
                <input
                  id="health-profile-manual-input"
                  type="text"
                  className="flex-1 rounded-lg border border-slate-300 p-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  placeholder={t(language, "healthProfileAddManualPlaceholder")}
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                />
                <button type="button" className="btn-secondary" onClick={handleAddManual}>
                  {t(language, "healthProfileAddButton")}
                </button>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading
                  ? t(language, "healthProfileReadingDocument")
                  : t(language, "healthProfileUploadButton")}
              </button>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t(language, "healthProfileUploadHint")}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg border-2 border-red-300 bg-red-50 p-3 font-semibold text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
              >
                {error}
              </p>
            )}

            {savedTags.length > 0 && (
              <button type="button" className="btn-secondary mt-6 w-full" onClick={handleClear}>
                {t(language, "healthProfileClearButton")}
              </button>
            )}
          </section>

          <section aria-labelledby="heading-blocked">
            <h2 id="heading-blocked" className={sectionHeading}>
              {t(language, "page.health.blocked")}
            </h2>
            <div className="border-2 border-black divide-y-2 divide-black dark:border-white dark:divide-white">
              {blockedItems.map((item) => {
                const isUnblocked = Boolean(unblocked[item.id]);
                return (
                  <div key={item.id} className="flex items-center justify-between gap-4 p-6">
                    <div>
                      <p className="text-lg font-black">{item.number}</p>
                      <p className="text-sm font-bold uppercase tracking-widest text-red-600">{item.label}</p>
                    </div>
                    <button
                      type="button"
                      disabled={isUnblocked}
                      onClick={() => setUnblocked((prev) => ({ ...prev, [item.id]: true }))}
                      className={`touch-target px-6 text-sm font-black underline uppercase disabled:cursor-not-allowed ${
                        isUnblocked ? "opacity-30" : ""
                      }`}
                    >
                      {isUnblocked ? t(language, "common.unblocked") : t(language, "common.unblock")}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="heading-merchants">
            <h2 id="heading-merchants" className={sectionHeading}>
              {t(language, "page.health.merchants")}
            </h2>
            <p className="mb-8 text-sm font-bold uppercase tracking-widest">
              {t(language, "page.health.merchantsIntro")}
            </p>
            <ul className="space-y-4">
              {merchants.map((merchant) => (
                <li
                  key={merchant.name}
                  className="flex items-center gap-4 border-2 border-black p-6 dark:border-white"
                >
                  <Icon icon={merchant.icon} className="text-2xl" />
                  <span className="text-xl font-black">{merchant.name}</span>
                </li>
              ))}
            </ul>
            <a
              href="#settings"
              className="touch-target mt-8 flex w-full items-center justify-center border-2 border-black text-sm font-black uppercase tracking-widest dark:border-white"
            >
              {t(language, "page.health.manageMerchants")}
            </a>
          </section>

          <section aria-labelledby="heading-transactions">
            <h2 id="heading-transactions" className={sectionHeading}>
              {t(language, "page.health.payments")}
            </h2>
            <div className="space-y-4">
              <div className="border-2 border-black p-6 dark:border-white">
                <div className="mb-4 flex items-start justify-between">
                  <span className="bg-green-600 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                    {t(language, "page.health.payStatus.success")}
                  </span>
                  <span className="text-sm font-bold">{t(language, "page.health.pay.1.time")}</span>
                </div>
                <p className="text-xl font-black">{t(language, "page.health.pay.1.amount")}</p>
                <p className="text-sm font-bold uppercase tracking-widest opacity-60">
                  {t(language, "page.health.pay.1.to")}
                </p>
              </div>
              <div className="border-2 border-black p-6 dark:border-white">
                <div className="mb-4 flex items-start justify-between">
                  <span className="bg-red-600 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                    {t(language, "page.health.payStatus.blocked")}
                  </span>
                  <span className="text-sm font-bold">{t(language, "page.health.pay.2.time")}</span>
                </div>
                <p className="text-xl font-black">{t(language, "page.health.pay.2.amount")}</p>
                <p className="text-sm font-bold uppercase tracking-widest text-red-600">
                  {t(language, "page.health.pay.2.note")}
                </p>
              </div>
            </div>
            <a
              href="#history"
              className="touch-target mt-8 flex w-full items-center justify-center border-2 border-black text-sm font-black uppercase tracking-widest dark:border-white"
            >
              {t(language, "page.health.viewHistory")}
            </a>
          </section>
        </div>

        <div className="space-y-16 lg:col-span-5 md:space-y-24">
          <section className="bg-black p-8 text-white dark:bg-white dark:text-black">
            <h3 className="mb-6 text-xl font-black uppercase tracking-tighter">{t(language, "page.health.privacyMode")}</h3>
            <p className="mb-8 text-sm font-bold uppercase leading-relaxed">{t(language, "page.health.privacyBody")}</p>
            <div className="flex items-center gap-4">
              <div className="relative h-6 w-10 rounded-full bg-green-500" aria-hidden="true">
                <div className="absolute right-1 top-1 h-4 w-4 rounded-full bg-white"></div>
              </div>
              <span className="text-sm font-black uppercase">{t(language, "page.health.alwaysProtected")}</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}