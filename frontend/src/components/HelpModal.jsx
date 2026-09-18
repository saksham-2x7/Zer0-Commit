import { useEffect, useRef } from "react";
import { t } from "../i18n/translations";

export default function HelpModal({ language, onClose }) {
  const steps = t(language, "helpSteps");
  const dialogRef = useRef(null);
  const restoreRef = useRef(null);

  useEffect(() => {
    restoreRef.current = document.activeElement;
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const scope = dialogRef.current;
      if (!scope) return;
      const focusables = scope.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === scope)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === scope)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Return focus to whatever opened the dialog (Help trigger, or body on
      // the first-visit popup).
      restoreRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-heading"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="card max-h-[85vh] w-full max-w-lg overflow-y-auto outline-none"
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