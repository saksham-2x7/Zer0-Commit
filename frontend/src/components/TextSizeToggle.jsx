import { t } from "../i18n/translations";

export default function TextSizeToggle({ language, textSize, onCycle }) {
  return (
    <button
      type="button"
      className="btn-secondary whitespace-nowrap px-1.5 text-xs md:px-3 md:text-sm"
      onClick={onCycle}
      aria-label={t(language, `textSizeButton_${textSize}`)}
    >
      <span className="md:hidden" aria-hidden="true">
        🔤
      </span>
      <span className="hidden md:inline">{t(language, `textSizeButton_${textSize}`)}</span>
    </button>
  );
}
