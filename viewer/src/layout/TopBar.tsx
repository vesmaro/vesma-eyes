import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Moon, Rows2, Rows3, Search, Sun } from "lucide-react";
import { IrisLogo } from "@/components/IrisLogo/IrisLogo";
import { useTheme } from "@/components/theme-provider";
import { useDensity } from "@/components/density-provider";
import { Button } from "@/components/ui/button";
import { AuthStatus } from "@/features/auth/AuthStatus";
import { useT } from "@/i18n";
import { openPalette } from "@/lib/paletteState";
import { GLOBAL_SEARCH_INPUT_ID } from "./Hotkeys";
import { LanguageToggle } from "./LanguageToggle";

/**
 * Top bar (union И1, stand 03 §4 — one shell for all screens): the bar now
 * spans the FULL WIDTH above the sidebar; the brand, the global search and
 * the status zone live here.
 *
 * - Brand: the iris mark + «vesma-eyes» link to the root. The label folds
 *   away on the smallest widths (the mark stays — recognition over recall).
 * - Global search: a REAL input (stand composition; the UX-overhaul Ф2
 *   «oval opens the palette» move is superseded by the union rule «движок
 *   main / вид стенда» — the palette keeps ⌘K/Ctrl+K, the sidebar footer
 *   button and the crumbs-row button). Enter carries the query to
 *   /memory/search (the page already owns ?q=); the bare `/` focuses the
 *   field (Hotkeys.tsx); Esc blurs. Mobile keeps the palette icon as the
 *   search affordance — the field would own the whole 48px bar.
 * - Status zone (right): the T6 auth/connection slot, density, RU|EN and
 *   theme — the main engines, dressed in the stand's icon-button look.
 *   The stand's live pill / exec counter / bell stay OUT until their
 *   engines are wired (honest absence over fake pills).
 *
 * The route label is gone: the crumbs row (03 §5) carries the location; the
 * bar stays a landmark, not a heading (WCAG 1.3.1/2.4.6 — pages own the h1).
 */
export interface TopBarProps {
  /**
   * The mobile sidebar opener (a Radix Dialog.Trigger — must render inside
   * the Dialog.Root Shell wraps the app in). Visible below md only.
   */
  sidebarTrigger?: ReactNode;
}

/** Brand wordmark — language-independent, hence not in the dictionaries. */
const BRAND_NAME = "vesma-eyes";

export function TopBar({ sidebarTrigger }: TopBarProps) {
  const { theme, toggleTheme } = useTheme();
  const { density, toggleDensity } = useDensity();
  const navigate = useNavigate();
  const t = useT();
  const nextTheme = theme === "dark" ? "light" : "dark";
  const compact = density === "compact";

  return (
    <header
      data-living-seam="topbar"
      className="sticky top-0 z-40 flex h-topbar shrink-0 items-center gap-2 border-myelin-hairline border-b-hairline bg-well pl-2 pr-3 sm:gap-3 sm:pl-3"
    >
      {sidebarTrigger}
      <Link
        to="/"
        className="flex min-w-0 items-center gap-2 rounded-md py-1 font-semibold text-foreground transition-colors duration-instant hover:text-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        <IrisLogo size={20} decorative />
        <span className="hidden whitespace-nowrap text-sm tracking-wide sm:inline">
          {BRAND_NAME}
        </span>
      </Link>

      <GlobalSearchField />
      {/* Mobile: the palette stays the search affordance — the field would
       * own the whole 48px bar (03 §4 collapses it into an icon too). */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => openPalette("button")}
        aria-label={t("cmdk.openAria")}
        aria-haspopup="dialog"
        className="h-8 w-8 shrink-0 md:hidden"
      >
        <Search className="size-4" aria-hidden="true" />
      </Button>

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <AuthStatus />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleDensity}
          aria-label={t(
            compact ? "topbar.densityToComfortable" : "topbar.densityToCompact",
          )}
          title={t(compact ? "topbar.densityToComfortable" : "topbar.densityToCompact")}
          className="h-8 w-8"
        >
          {/* Compact packs MORE rows; comfortable keeps them roomy. */}
          {compact ? (
            <Rows3 className="size-4" aria-hidden="true" />
          ) : (
            <Rows2 className="size-4" aria-hidden="true" />
          )}
        </Button>
        <LanguageToggle />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={t(
            nextTheme === "light" ? "topbar.themeToLight" : "topbar.themeToDark",
          )}
          title={t(nextTheme === "light" ? "topbar.themeToLight" : "topbar.themeToDark")}
          className="h-8 w-8"
        >
          {theme === "dark" ? (
            <Sun className="size-4" aria-hidden="true" />
          ) : (
            <Moon className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>
    </header>
  );

  /** The stand's topsearch field (03 §4): clamp width, `/` hint, Enter → search. */
  function GlobalSearchField() {
    const submit = (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const raw = new FormData(event.currentTarget).get("global-query");
      const trimmed = typeof raw === "string" ? raw.trim() : "";
      navigate(
        trimmed ? `/memory/search?q=${encodeURIComponent(trimmed)}` : "/memory/search",
      );
    };
    return (
      <form role="search" onSubmit={submit} className="relative hidden md:block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          name="global-query"
          id={GLOBAL_SEARCH_INPUT_ID}
          aria-label={t("topbar.searchLabel")}
          placeholder={t("topbar.searchPlaceholder")}
          autoComplete="off"
          onKeyDown={(event) => {
            // Stand 03 §4: Esc снимает фокус (the native search Esc clears).
            if (event.key === "Escape") event.currentTarget.blur();
          }}
          className="h-8 w-search rounded-md border border-border bg-elevated pr-10 pl-9 text-sm text-foreground transition-[border-color,box-shadow] duration-instant placeholder:text-foreground-muted hover:border-myelin-strong focus-visible:border-iris-bright focus-visible:shadow-iris focus-visible:outline-none"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 gap-0.5"
        >
          <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border-subtle border-b-2 bg-elevated px-1 font-mono text-caps text-foreground-secondary">
            /
          </kbd>
        </span>
      </form>
    );
  }
}
