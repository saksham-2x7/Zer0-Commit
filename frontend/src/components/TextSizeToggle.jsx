import { t } from "../i18n/translations";

export default function TextSizeToggle({ language, textSize, onCycle }) {
  return (
    <button type="button" className="btn-secondary" onClick={onCycle}>
      {t(language, `textSizeButton_${textSize}`)}
    </button>
  );
}
