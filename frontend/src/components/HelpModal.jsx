import { t } from "../i18n/translations";

export default function HelpModal({ language, onClose }) {
  const steps = t(language, "helpSteps");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-heading"
      onClick={onClose}
    >
      <div
        className="card max-h-[85vh] w-full max-w-lg overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="help-modal-heading" className="text-xl font-bold">
          {t(language, "helpHeading")}
        </h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-slate-700 dark:text-slate-300">
          {Array.isArray(steps) && steps.map((step, index) => <li key={index}>{step}</li>)}
        </ol>
        <button type="button" className="btn-primary mt-6 w-full" onClick={onClose}>
          {t(language, "helpCloseButton")}
        </button>
      </div>
    </div>
  );
}
