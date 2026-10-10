import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n";
import { openPalette } from "@/lib/paletteState";
import { toggleSidebarCollapsed } from "@/lib/sidebarState";
import { resolveGlobalHotkey, resolveHotkey } from "./hotkeyActions";

/**
 * Global hotkeys (redesign concept §2.2-6, ARCHCOM-3 verdict §2 — the proven
 * ai-brain canon with the `inInput` guard). Union И1 (stand 03 §7): `/`
 * focuses the TopBar global search field (a REAL input now — Enter carries
 * the query to /memory/search); when the field is absent — anonymous visitors
 * on gate deployments — `/` opens the palette instead of dying silently
 * (review round). `[` flips the sidebar rail, `?` opens this
 * cheatsheet (Esc closes — Radix), and ⌘K / Ctrl+K opens the palette from
 * anywhere INCLUDING editable surfaces (resolveGlobalHotkey). The list below
 * never advertises keys that do not exist yet (`g`-prefix, j/k arrive with
 * their waves). Resolution rules live in hotkeyActions.ts (pure,
 * unit-tested).
 *
 * The PALETTE DIALOG itself is mounted by the Shell (inside the data
 * router): this provider sits above the router, so its keydown listener
 * flips the shared lib/paletteState store instead of owning UI.
 */

interface HotkeysContextValue {
  openHelp: () => void;
}

const HotkeysContext = createContext<HotkeysContextValue | null>(null);

/**
 * The TopBar global-search field's stable DOM id — the `/` hotkey focuses it
 * by id (the field remounts across route changes; a ref would go stale from
 * this provider's vantage point above the router).
 */
export const GLOBAL_SEARCH_INPUT_ID = "global-search-input";

export function HotkeysProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [helpOpen, setHelpOpen] = useState(false);
  const openHelp = useCallback(() => setHelpOpen(true), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // ⌘K / Ctrl+K first: the palette is hot even inside form fields.
      if (resolveGlobalHotkey(event) === "open-palette") {
        event.preventDefault();
        openPalette();
        return;
      }
      const action = resolveHotkey(event);
      if (action === null) return;
      event.preventDefault();
      if (action === "open-help") {
        setHelpOpen(true);
        return;
      }
      if (action === "focus-search") {
        // The gate deployments hide the global search from anonymous
        // visitors — a missing field must not turn `/` into a silent no-op:
        // the palette (the same surface ⌘K reaches) is the fallback.
        const field = document.getElementById(GLOBAL_SEARCH_INPUT_ID);
        if (field) {
          field.focus();
        } else {
          openPalette();
        }
        return;
      }
      if (action === "toggle-sidebar") {
        toggleSidebarCollapsed();
        return;
      }
      openPalette();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(() => ({ openHelp }), [openHelp]);

  return (
    <HotkeysContext.Provider value={value}>
      {children}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("hotkeys.title")}</DialogTitle>
            <DialogDescription>{t("hotkeys.subtitle")}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            <HotkeyRow keys="/" label={t("hotkeys.focusSearch")} />
            <HotkeyRow keys="⌘K / Ctrl+K" label={t("hotkeys.openPaletteAnywhere")} />
            <HotkeyRow keys="[" label={t("hotkeys.toggleSidebar")} />
            <HotkeyRow keys="?" label={t("hotkeys.cheatsheet")} />
            <HotkeyRow keys={t("hotkeys.paletteHostKeys")} label={t("hotkeys.paletteHost")} />
            <HotkeyRow
              keys={t("hotkeys.paletteConnectKeys")}
              label={t("hotkeys.paletteConnect")}
            />
            <HotkeyRow keys={t("hotkeys.escKey")} label={t("hotkeys.closeDialog")} />
          </ul>
        </DialogContent>
      </Dialog>
    </HotkeysContext.Provider>
  );
}

function HotkeyRow({ keys, label }: { keys: string; label: string }) {
  return (
    <li className="flex items-center justify-between gap-4 text-sm">
      <span className="text-foreground-secondary">{label}</span>
      <kbd className="rounded-md border border-border bg-elevated px-2 py-1 font-mono text-xs text-foreground">
        {keys}
      </kbd>
    </li>
  );
}

/** Access the help-dialog opener (e.g. the TopBar "?" button). */
export function useHotkeys(): HotkeysContextValue {
  const ctx = useContext(HotkeysContext);
  if (!ctx) {
    throw new Error("useHotkeys: missing <HotkeysProvider> in the component tree.");
  }
  return ctx;
}
