import { t } from "../i18n/translations";

export default function ReportingBlock({ language, reportingLinks }) {
  return (
    <div className="card mt-4 border-blue-200 bg-blue-50">
      <h3 className="text-lg font-semibold text-blue-900">{t(language, "reportingHeading")}</h3>
      <p className="mt-1 text-blue-800">{t(language, "reportingIntro")}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <a
          href={`tel:${reportingLinks.helpline}`}
          className="btn-primary flex-1"
        >
          {t(language, "helplineLabel")} · {reportingLinks.helpline}
        </a>
        <a
          href={reportingLinks.portal}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary flex-1"
        >
          {t(language, "portalLabel")}
        </a>
      </div>
    </div>
  );
}
