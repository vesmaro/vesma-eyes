import { Keyboard, Moon, Rows2, Rows3, Search, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useDensity } from "@/components/density-provider";
import { Button } from "@/components/ui/button";
import { AuthStatus } from "@/features/auth/AuthStatus";
import { useT } from "@/i18n";
import { openPalette } from "@/lib/paletteState";
import { useHotkeys } from "./Hotkeys";
import { LanguageToggle } from "./LanguageToggle";

/**
 * Top bar (redesign concept §2.2): the GLOBAL search entry — UX-overhaul
 * §7.3 (Ф2) the oval is the command palette's TRIGGER (click opens the
 * palette; ⌘K/Ctrl+K and the bare `/` do the same from anywhere) — plus the
 * density toggle (§3.3), the RU|EN switcher, theme, the `?` cheatsheet
 * button and the T6 auth/connection slot. The route label is a `<p>`, not a
 * heading: each page owns the single h1 (WCAG 1.3.1/2.4.6).
 */
export interface TopBarProps {
  /** Current route label (already translated by the caller). */
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  const { theme, toggleTheme } = useTheme();
  const { density, toggleDensity } = useDensity();
  const { openHelp } = useHotkeys();
  const t = useT();
  const nextTheme = theme === "dark" ? "light" : "dark";
  const compact = density === "compact";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-3 sm:px-6">
      {/* Route label, not a heading — pages own the (single) h1. */}
      <p className="hidden min-w-0 truncate text-sm font-semibold text-foreground-secondary lg:block">
        {title}
      </p>
      {/* The palette trigger: a button styled as the search oval — the
       * promise is honest now (one palette covering memory, tasks, agents
       * and navigation — J3), the kbd affordance mirrors ⌘K. */}
      <button
        type="button"
        onClick={openPalette}
        aria-label={t("cmdk.openAria")}
        aria-haspopup="dialog"
        aria-expanded={false}
        className={
          "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border-subtle bg-well px-3 text-left " +
          "transition-colors duration-instant hover:border-iris-bright " +
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright " +
          "sm:max-w-md lg:ml-auto"
        }
      >
        <Search
          className="size-4 shrink-0 text-foreground-secondary"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground-muted">
          {t("topbar.searchPlaceholder")}
        </span>
        {/* The affordance mirroring the ⌘K hotkey (kbd semantics). */}
        <kbd className="hidden shrink-0 rounded border border-border-subtle px-1.5 font-mono text-xs text-foreground-muted sm:inline">
          ⌘K
        </kbd>
      </button>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <AuthStatus />
        <Button
          variant="ghost"
          size="icon"
          onClick={openHelp}
          aria-label={t("hotkeys.openAria")}
          title={t("hotkeys.openAria")}
          className="hidden sm:inline-flex"
        >
          <Keyboard className="size-4" aria-hidden="true" />
        </Button>
        <LanguageToggle />
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleDensity}
          aria-label={t(
            compact ? "topbar.densityToComfortable" : "topbar.densityToCompact",
          )}
          title={t(compact ? "topbar.densityToComfortable" : "topbar.densityToCompact")}
        >
          {/* Compact packs MORE rows; comfortable keeps them roomy. */}
          {compact ? (
            <Rows3 className="size-4" aria-hidden="true" />
          ) : (
            <Rows2 className="size-4" aria-hidden="true" />
          )}
          <span className="sr-only">
            {t(compact ? "topbar.densityComfortable" : "topbar.densityCompact")}
          </span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          aria-label={t(
            nextTheme === "light" ? "topbar.themeToLight" : "topbar.themeToDark",
          )}
        >
          {theme === "dark" ? (
            <Sun className="size-4" aria-hidden="true" />
          ) : (
            <Moon className="size-4" aria-hidden="true" />
          )}
          {/* Label shortens below sm so the bar reflows at 320px (WCAG 1.4.10);
           * the aria-label carries the full wording for AT. */}
          <span className="hidden sm:inline">
            {t(nextTheme === "light" ? "topbar.themeLight" : "topbar.themeDark")}
          </span>
        </Button>
      </div>
    </header>
  );
}
