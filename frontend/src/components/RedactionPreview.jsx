import { t } from "../i18n/translations";
import { redactText } from "../utils/redact";

export default function RedactionPreview({ language, text }) {
  if (!text) return null;

  const redacted = redactText(text);

  return (
    <div className="card mt-4 bg-slate-50">
      <h3 className="text-base font-semibold text-slate-700">{t(language, "redactionHeading")}</h3>
      <p className="mt-1 text-sm text-slate-500">{t(language, "redactionHint")}</p>
      <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-white p-3 font-mono text-sm text-slate-800">
        {redacted}
      </p>
    </div>
  );
}
