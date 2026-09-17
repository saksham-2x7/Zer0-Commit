import { t } from "../i18n/translations";

export default function TextInput({ language, value, onChange }) {
  return (
    <textarea
      className="w-full min-h-[160px] rounded-lg border border-slate-300 p-4 text-lg focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
      placeholder={t(language, "textPlaceholder")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t(language, "textPlaceholder")}
    />
  );
}
