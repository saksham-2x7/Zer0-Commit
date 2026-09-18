import { t } from "../i18n/translations";

export default function RedactionPreview({ language, text }) {
  if (!text) return null;

  return (
    <div className="card mt-4 bg-slate-50 dark:bg-slate-900">
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">{t(language, "redactionHeading")}</h3>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t(language, "redactionHint")}</p>
      <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-white p-3 font-mono text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-200">
        {text}
      </p>
    </div>
  );
}
