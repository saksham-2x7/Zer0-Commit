import { useRef, useState } from "react";
import { t } from "../i18n/translations";
import { ocrImage, extractHealthTags } from "../services/api";
import { loadHealthProfile, saveHealthProfile, clearHealthProfile } from "../utils/healthProfile";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

export default function HealthProfile({ language, onBack }) {
  const [savedTags, setSavedTags] = useState(loadHealthProfile);
  const [pendingTags, setPendingTags] = useState(null); // [{ tag, checked }] | null
  const [manualInput, setManualInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setError(null);

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setError(t(language, "errorCode_INVALID_IMAGE"));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t(language, "errorCode_INPUT_TOO_LARGE"));
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
    } catch {
      setError(t(language, "healthProfileErrorGeneric"));
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
    const next = saveHealthProfile([...savedTags, manualInput.trim()]);
    setSavedTags(next);
    setManualInput("");
  }

  function handleRemoveTag(tag) {
    const next = saveHealthProfile(savedTags.filter((t) => t !== tag));
    setSavedTags(next);
  }

  function handleClear() {
    clearHealthProfile();
    setSavedTags([]);
    setPendingTags(null);
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{t(language, "healthProfileHeading")}</h2>
        <button type="button" className="btn-secondary" onClick={onBack}>
          {t(language, "healthProfileBackButton")}
        </button>
      </div>

      <p className="text-slate-600 dark:text-slate-300">{t(language, "healthProfileIntro")}</p>
      <p className="text-sm italic text-slate-500 dark:text-slate-400">
        {t(language, "healthProfileNotMedicalAdvice")}
      </p>

      {savedTags.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-700 dark:text-slate-200">
            {t(language, "healthProfileSavedTagsHeading")}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {savedTags.map((tag) => (
              <li
                key={tag}
                className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-700"
              >
                {tag}
                <button
                  type="button"
                  aria-label={`${t(language, "healthProfileRemoveTagAria")} ${tag}`}
                  className="text-slate-500 hover:text-red-600 dark:text-slate-400"
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
        <p className="text-slate-500 dark:text-slate-400">{t(language, "healthProfileEmpty")}</p>
      )}

      {pendingTags && (
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
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

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          {t(language, "healthProfileAddManualLabel")}
        </label>
        <div className="flex gap-2">
          <input
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

      <div>
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? t(language, "healthProfileReadingDocument") : t(language, "healthProfileUploadButton")}
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
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {savedTags.length > 0 && (
        <button type="button" className="btn-secondary w-full" onClick={handleClear}>
          {t(language, "healthProfileClearButton")}
        </button>
      )}
    </div>
  );
}
