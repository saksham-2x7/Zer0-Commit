import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/translations";
import Icon from "./icons";

export default function HelpModal({ language, onClose, asView = false }) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const dialogRef = useRef(null);
  const restoreRef = useRef(null);

  useEffect(() => {
    if (asView) return;
    restoreRef.current = document.activeElement;
    dialogRef.current?.focus();

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
  }, [onClose, asView]);

  const faqs = [
    {
      q: t(language, "page.help.faq1.q"),
      search: t(language, "page.help.faq1.a"),
      body: (
        <>
          <p className="text-base font-bold leading-relaxed">{t(language, "page.help.faq1.a")}</p>
          <div className="mt-6 flex aspect-video items-center justify-center border-2 border-black bg-black text-white dark:border-white dark:bg-white dark:text-black">
            <Icon icon="playCircle" className="text-6xl" />
            <span className="ml-4 font-black uppercase">{t(language, "page.help.watchVideo")}</span>
          </div>
        </>
      ),
    },
    {
      q: t(language, "page.help.faq2.q"),
      search: `${t(language, "page.help.faq2.badgeHigh")} ${t(language, "page.help.faq2.high")} ${t(
        language,
        "page.help.faq2.badgeSafe"
      )} ${t(language, "page.help.faq2.safe")}`,
      body: (
        <div className="space-y-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <span className="border-2 border-red-600 px-4 py-2 font-black uppercase text-red-600">
              {t(language, "page.help.faq2.badgeHigh")}
            </span>
            <p className="text-base font-bold leading-relaxed">{t(language, "page.help.faq2.high")}</p>
          </div>
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <span className="border-2 border-green-600 px-4 py-2 font-black uppercase text-green-600">
              {t(language, "page.help.faq2.badgeSafe")}
            </span>
            <p className="text-base font-bold leading-relaxed">{t(language, "page.help.faq2.safe")}</p>
          </div>
        </div>
      ),
    },
    {
      q: t(language, "page.help.faq3.q"),
      search: t(language, "page.help.faq3.a"),
      body: <p className="text-base font-bold leading-relaxed">{t(language, "page.help.faq3.a")}</p>,
    },
    {
      q: t(language, "page.help.faq4.q"),
      search: t(language, "page.help.faq4.a"),
      body: <p className="text-base font-bold leading-relaxed">{t(language, "page.help.faq4.a")}</p>,
    },
    {
      q: t(language, "page.help.faq5.q"),
      search: [t(language, "page.help.faq5.a1"), t(language, "page.help.faq5.a2"), t(language, "page.help.faq5.a3"), t(language, "page.help.faq5.a4")].join(" "),
      body: (
        <ul className="list-disc space-y-2 pl-6 text-base font-bold leading-relaxed">
          <li>{t(language, "page.help.faq5.a1")}</li>
          <li>{t(language, "page.help.faq5.a2")}</li>
          <li>{t(language, "page.help.faq5.a3")}</li>
          <li>{t(language, "page.help.faq5.a4")}</li>
        </ul>
      ),
    },
  ];

  const normalized = query.trim().toLowerCase();
  const visibleFaqs = faqs.filter(
    (faq) => !normalized || `${faq.q} ${faq.search}`.toLowerCase().includes(normalized)
  );

  const topics = [
    { icon: "playCircle", label: t(language, "page.help.topic.gettingStarted"), target: faqs[0].q },
    { icon: "check", label: t(language, "page.help.topic.safety"), target: faqs[1].q },
    { icon: "alertTriangle", label: t(language, "page.help.topic.reporting"), target: faqs[3].q },
    { icon: "settings", label: t(language, "page.help.topic.settings"), target: faqs[2].q },
  ];

  function handleSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
  }

  const content = (
    <div className={asView ? "w-full space-y-12" : "card w-full max-w-2xl space-y-12 py-10"}>
      <div className="border-b-8 border-black pb-10 dark:border-white">
        <h2 id="help-modal-heading" className="mb-8 text-5xl font-black uppercase leading-[0.9] tracking-tighter md:text-[56px]">
          {t(language, "page.help.title")}
        </h2>
        <div className="flex w-full flex-col gap-0 border-4 border-black md:flex-row dark:border-white">
          <label htmlFor="help-search-input" className="sr-only">
            {t(language, "page.help.searchPlaceholder")}
          </label>
          <input
            id="help-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(language, "page.help.searchPlaceholder")}
            className="w-full flex-1 border-b-4 border-black bg-transparent px-8 py-5 text-xl font-bold outline-none md:border-r-4 md:border-b-0 dark:border-white dark:text-slate-100"
          />
          <button
            type="button"
            className="touch-target w-full bg-black px-12 text-sm font-black uppercase tracking-widest text-white transition-all hover:invert md:w-auto dark:bg-white dark:text-black"
            onClick={() => setQuery(query)}
          >
            {t(language, "page.help.search")}
          </button>
        </div>
      </div>

      <section aria-labelledby="help-browse-heading">
        <h3 id="help-browse-heading" className="mb-12 text-[40px] font-black uppercase tracking-tighter">
          {t(language, "page.help.browse")}
        </h3>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {topics.map((topic) => (
            <button
              key={topic.label}
              type="button"
              onClick={() => setQuery(topic.target)}
              className="touch-target flex flex-col items-center gap-6 border-2 border-black p-10 transition-all hover:bg-black hover:text-white dark:border-white dark:hover:bg-white dark:hover:text-black"
            >
              <Icon icon={topic.icon} className="text-4xl" />
              <span className="text-center text-xl font-black uppercase">{topic.label}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-24 lg:grid-cols-12">
        <section aria-labelledby="help-faq-heading" className="lg:col-span-8">
          <h3 id="help-faq-heading" className="mb-12 border-b-4 border-black pb-4 text-[40px] font-black uppercase tracking-tighter dark:border-white">
            {t(language, "page.help.faq")}
          </h3>
          {visibleFaqs.length === 0 ? (
            <p className="text-base font-bold">{t(language, "page.help.noResults")}</p>
          ) : (
            <div className="divide-y-4 divide-black border-y-4 border-black dark:divide-white dark:border-white">
              {visibleFaqs.map((faq) => (
                <details key={faq.q} className="group">
                  <summary className="flex cursor-pointer touch-target list-none items-center justify-between gap-4 p-8 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                    <h4 className="text-2xl font-black uppercase">{faq.q}</h4>
                    <Icon icon="chevronDown" className="shrink-0 text-3xl transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t-2 border-black p-8 dark:border-white">{faq.body}</div>
                </details>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="help-contact-heading" className="lg:col-span-4">
          <div className="border-4 border-black p-10 lg:sticky lg:top-32 dark:border-white">
            <h3 id="help-contact-heading" className="mb-6 text-2xl font-black uppercase tracking-tighter">
              {t(language, "page.help.contact")}
            </h3>
            <div className="mb-12 space-y-8">
              <div className="flex items-center gap-6">
                <span className="flex h-14 w-14 items-center justify-center border-2 border-black bg-black text-2xl text-white dark:border-white dark:bg-white dark:text-black">
                  <Icon icon="phone" />
                </span>
                <div>
                  <p className="text-sm font-black uppercase">{t(language, "page.help.fraudHelpline")}</p>
                  <a href="tel:1930" className="text-xl font-black">
                    {t(language, "page.help.fraudHelplineValue")}
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <span className="flex h-14 w-14 items-center justify-center border-2 border-black text-2xl dark:border-white">
                  <Icon icon="mail" />
                </span>
                <div>
                  <p className="text-sm font-black uppercase">{t(language, "page.help.email")}</p>
                  <p className="text-xl font-black break-all">{t(language, "page.help.emailValue")}</p>
                </div>
              </div>
            </div>

            {submitted ? (
              <p role="status" className="text-sm font-black uppercase tracking-widest text-green-600">
                {t(language, "page.help.formSubmitted")}
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6 border-t-4 border-black pt-12 dark:border-white">
                <p className="text-sm font-black uppercase">{t(language, "page.help.sendMessage")}</p>
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest">
                    {t(language, "page.help.yourName")}
                  </span>
                  <input
                    type="text"
                    name="name"
                    className="w-full border-2 border-black px-4 py-3 text-lg font-bold outline-none dark:border-white dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-widest">
                    {t(language, "page.help.whatHappened")}
                  </span>
                  <textarea
                    name="message"
                    rows={4}
                    className="h-32 w-full resize-none border-2 border-black px-4 py-4 text-lg font-bold outline-none dark:border-white dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <button
                  type="submit"
                  className="touch-target w-full bg-black px-8 py-5 text-sm font-black uppercase tracking-widest text-white transition-all hover:invert dark:bg-white dark:text-black"
                >
                  {t(language, "page.help.submit")}
                </button>
              </form>
            )}
          </div>
        </section>
      </div>

      <button type="button" className="btn-primary w-full" onClick={onClose}>
        {t(language, "helpCloseButton")}
      </button>
    </div>
  );

  if (asView) {
    return <div className="w-full py-10">{content}</div>;
  }

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
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}