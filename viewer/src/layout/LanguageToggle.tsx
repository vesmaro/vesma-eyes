import { useI18n, LANGUAGES } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Compact "RU | EN" pill for the TopBar (owner feedback 1.4.0: language
 * switching must be visible, not buried). Union И1 dresses it in the stand's
 * langtoggle look (03 §4): full-rounded caps segments, the active one on the
 * strata wash with iris-bright text. Toggle-group semantics: `aria-pressed`
 * marks the active segment; both segments stay in the tab order (WCAG
 * 2.1.1) with a token-bound focus ring.
 */
export function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("topbar.langLabel")}
      className="hidden h-6 items-center overflow-hidden rounded-full border border-border-subtle sm:inline-flex"
    >
      {LANGUAGES.map((code) => {
        const active = lang === code;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            onClick={() => setLang(code)}
            aria-pressed={active}
            className={cn(
              "min-h-6 px-2 font-mono text-caps tracking-caps uppercase transition-colors duration-instant",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              active
                ? "bg-strata-memory text-iris-bright" // AA on the wash (03 §4)
                : "text-foreground-muted hover:text-foreground",
            )}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
