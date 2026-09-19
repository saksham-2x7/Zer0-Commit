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
    "text-3xl font-black tracking-tighter uppercase mb-8 border-b border-strong pb-4";

  return (
    <div className="w-full space-y-10 py-8 md:space-y-16">
      <button
        type="button"
        className="btn-secondary mb-4 w-auto"
        onClick={onBack}
      >
        {t(language, "healthProfileBackButton")}
      </button>

      <div className="mb-10 flex flex-col items-start justify-between gap-6 border-b border-strong pb-8 md:flex-row md:items-end">
        <div className="max-w-2xl">
          <h1 className="mb-6 text-4xl font-black uppercase leading-[0.95] tracking-tighter md:text-5xl">
            {title.prefix && (
              <>
                {title.prefix}
                <br />
              </>
            )}
            {title.last}
          </h1>
          <p className="text-lg font-bold leading-relaxed md:text-xl">{t(language, "page.health.sub")}</p>
          <a
            href="#settings"
            className="btn-primary touch-target mt-6 inline-flex w-full md:w-auto"
          >
            {t(language, "page.health.editProfile")}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="space-y-10 lg:col-span-7 lg:space-y-16">
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
                <div key={field} className="space-y-2 border border-ink bg-soft p-6">
                  <label htmlFor={`detail-${field}`} className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em]">
                    {label}
                  </label>
                  <input
                    id={`detail-${field}`}
                    type="text"
                    value={details[field]}
                    onChange={(e) => updateDetail(field, e.target.value)}
                    className="w-full bg-transparent text-xl outline-none border-b border-ink pb-1"
                  />
                </div>
              ))}
            </div>

            {detailsError && (
              <p role="alert" className="mt-4 text-sm font-black uppercase tracking-widest text-signal">
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
              className="btn-secondary touch-target mt-8 w-full md:w-auto"
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
                  className="flex flex-col items-center justify-between gap-6 border border-ink bg-soft p-6 md:flex-row"
                >
                  <div className="flex w-full items-center gap-6">
                    <span className="bg-ink text-on-ink flex h-14 w-14 items-center justify-center text-xl font-black">
                      {initials(contact.name)}
                    </span>
                    <div>
                      <p className="text-xl font-black">{contact.name}</p>
                      <p className="text-lg font-bold">{contact.phone}</p>
                    </div>
                  </div>
                  <a
                    href={contact.tel}
                    className="btn-secondary touch-target w-full md:w-auto"
                  >
                    {t(language, "common.callNow")}
                  </a>
                </li>
              ))}
            </ul>

            {showContactForm && (
              <form
                onSubmit={handleAddContact}
                className="mt-8 space-y-6 border border-dashed border-ink bg-soft p-6"
              >
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest">
                    {t(language, "page.health.newContactName")}
                  </span>
                  <input
                    type="text"
                    value={newContact.name}
                    onChange={(e) => setNewContact((prev) => ({ ...prev, name: e.target.value }))}
                    className="field"
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
                    className="field"
                  />
                </label>
                <button
                  type="submit"
                  className="btn-primary touch-target w-full"
                >
                  {t(language, "page.health.newContactConfirm")}
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => setShowContactForm((open) => !open)}
              className="btn-secondary touch-target mt-8 w-full border-dashed"
            >
              {t(language, "page.health.addContact")}
            </button>
          </section>

          <section aria-labelledby="heading-tags">
            <h2 id="heading-tags" className={sectionHeading}>
              {t(language, "healthProfileHeading")}
            </h2>
            <p className="text-base font-bold leading-relaxed">
              {t(language, "healthProfileIntro")}
            </p>
            <p className="mt-2 text-sm italic text-muted">
              {t(language, "healthProfileNotMedicalAdvice")}
            </p>

            {savedTags.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-black uppercase tracking-widest">
                  {t(language, "healthProfileSavedTagsHeading")}
                </h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {savedTags.map((tag) => (
                    <li
                      key={tag}
                      className="chip"
                    >
                      {tag}
                      <button
                        type="button"
                        aria-label={`${t(language, "healthProfileRemoveTagAria")} ${tag}`}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center text-muted hover:text-signal"
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
              <p className="mt-6 text-muted">{t(language, "healthProfileEmpty")}</p>
            )}

            {pendingTags && (
              <div className="mt-6 border border-ink bg-soft p-4">
                <h3 className="font-semibold">
                  {t(language, "healthProfileSuggestedTagsHeading")}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {t(language, "healthProfileSuggestedTagsHint")}
                </p>
                {pendingTags.length === 0 ? (
                  <p className="mt-2 text-muted">{t(language, "healthProfileEmpty")}</p>
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
                className="block text-sm font-medium"
              >
                {t(language, "healthProfileAddManualLabel")}
              </label>
              <div className="flex gap-2">
                <input
                  id="health-profile-manual-input"
                  type="text"
                  className="field flex-1"
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
              <p className="mt-1 text-sm text-muted">
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
                className="mt-4 alert-red p-3 font-semibold"
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
            <div className="border border-ink divide-y divide-ink">
              {blockedItems.map((item) => {
                const isUnblocked = Boolean(unblocked[item.id]);
                return (
                  <div key={item.id} className="flex items-center justify-between gap-4 p-6">
                    <div>
                      <p className="text-lg font-black">{item.number}</p>
                      <p className="text-sm font-bold uppercase tracking-widest text-signal">{item.label}</p>
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
                  className="flex items-center gap-4 border border-ink bg-soft p-6"
                >
                  <Icon icon={merchant.icon} className="text-2xl" />
                  <span className="text-xl font-black">{merchant.name}</span>
                </li>
              ))}
            </ul>
            <a
              href="#settings"
              className="btn-secondary touch-target mt-8 flex w-full items-center justify-center"
            >
              {t(language, "page.health.manageMerchants")}
            </a>
          </section>

          <section aria-labelledby="heading-transactions">
            <h2 id="heading-transactions" className={sectionHeading}>
              {t(language, "page.health.payments")}
            </h2>
            <div className="space-y-4">
              <div className="border border-ink bg-soft p-6">
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
              <div className="border border-ink bg-soft p-6">
                <div className="mb-4 flex items-start justify-between">
                  <span className="bg-signal px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                    {t(language, "page.health.payStatus.blocked")}
                  </span>
                  <span className="text-sm font-bold">{t(language, "page.health.pay.2.time")}</span>
                </div>
                <p className="text-xl font-black">{t(language, "page.health.pay.2.amount")}</p>
                <p className="text-sm font-bold uppercase tracking-widest text-signal">
                  {t(language, "page.health.pay.2.note")}
                </p>
              </div>
            </div>
            <a
              href="#history"
              className="btn-secondary touch-target mt-8 flex w-full items-center justify-center"
            >
              {t(language, "page.health.viewHistory")}
            </a>
          </section>
        </div>

        <div className="space-y-10 lg:col-span-5 lg:space-y-16">
          <section className="panel-inverse p-8">
            <h3 className="mb-6 text-xl font-black uppercase tracking-tighter">{t(language, "page.health.privacyMode")}</h3>
            <p className="mb-8 text-sm font-bold uppercase leading-relaxed">{t(language, "page.health.privacyBody")}</p>
            <div className="flex items-center gap-4">
              <div className="relative h-6 w-10 border border-ink bg-green-500" aria-hidden="true">
                <div className="absolute right-1 top-1 h-4 w-4 bg-white"></div>
              </div>
              <span className="text-sm font-black uppercase">{t(language, "page.health.alwaysProtected")}</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}