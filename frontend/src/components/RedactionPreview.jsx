import { t } from "../i18n/translations";

export default function RedactionPreview({ language, text }) {
  if (!text) return null;

  return (
    <div className="card mt-4">
      <h3 className="text-base font-semibold">{t(language, "redactionHeading")}</h3>
      <p className="mt-1 text-sm text-muted">{t(language, "redactionHint")}</p>
      <p className="mt-3 whitespace-pre-wrap break-words border border-ink bg-paper p-3 font-mono text-sm">
        {text}
      </p>
    </div>
  );
}
