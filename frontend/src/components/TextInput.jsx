import { t } from "../i18n/translations";

// Keep in sync with backend/api/validation.js DEFAULT_MAX_TEXT_CHARS (see CONTRACT.md).
const MAX_TEXT_CHARS = 8000;

export default function TextInput({ language, value, onChange }) {
  const remaining = MAX_TEXT_CHARS - value.length;
  const nearLimit = remaining <= 200;

  return (
    <div>
      <textarea
        className="w-full min-h-[160px] rounded-lg border border-slate-300 p-4 text-lg focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
        placeholder={t(language, "textPlaceholder")}
        value={value}
        maxLength={MAX_TEXT_CHARS}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t(language, "textPlaceholder")}
      />
      {nearLimit && (
        <p className={`mt-1 text-right text-sm ${remaining <= 0 ? "text-red-600" : "text-slate-500"}`}>
          {remaining} / {MAX_TEXT_CHARS}
        </p>
      )}
    </div>
  );
}
