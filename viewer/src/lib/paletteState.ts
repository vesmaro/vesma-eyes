import { useSyncExternalStore } from "react";

/**
 * Session-only signal «the command palette is open right now» (UX-overhaul
 * §7.3, Ф2). The palette DIALOG lives in the Shell (inside the data router —
 * its rows navigate with `useNavigate` and carry `return=` context), while
 * the two hotkey sources sit OUTSIDE it: the global keydown listener in
 * HotkeysProvider (⌘K / Ctrl+K and the bare `/`) and the TopBar trigger
 * button. One state, three controls — the same external-store shape as
 * sidebarOverlayState.ts.
 *
 * Semantics: boolean flag, idempotent writes (no redundant notifications),
 * the server snapshot is always false (effects never run on the server, so
 * SSR harnesses never see a phantom dialog).
 */

let paletteOpen = false;
const listeners = new Set<() => void>();

/** Current flag — the non-reactive read (tests, non-React code). */
export function getPaletteOpen(): boolean {
  return paletteOpen;
}

export function subscribePaletteOpen(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** Open/close the palette. Idempotent: no-op on no change. */
export function setPaletteOpen(open: boolean): void {
  if (paletteOpen === open) return;
  paletteOpen = open;
  listeners.forEach((notify) => notify());
}

/** Imperative opener for the hotkey listener and the TopBar trigger. */
export function openPalette(): void {
  setPaletteOpen(true);
}

/** Reactive flag — what the Shell-mounted palette dialog subscribes to. */
export function usePaletteOpen(): boolean {
  return useSyncExternalStore(subscribePaletteOpen, getPaletteOpen, () => false);
}
