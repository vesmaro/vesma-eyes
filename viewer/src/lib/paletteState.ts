import { useSyncExternalStore } from "react";
import { trackPaletteOpened } from "@/telemetry/telemetry";
import type { TelemetryPaletteTrigger } from "@/telemetry/events";

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

/**
 * Open/close the palette. Idempotent: no-op on no change. `trigger` rides
 * the open transition into `cmdk.palette_opened` (ME-041, taxonomy §1.2
 * #7 — this module owns the ONE open transition, so it is the one place
 * the trigger is known); default "hotkey" covers the bare hotkey call
 * sites, the TopBar button passes "button", the Radix close path never
 * opens. No-op while the telemetry gate is disarmed (anonymous session).
 */
export function setPaletteOpen(
  open: boolean,
  trigger: TelemetryPaletteTrigger = "hotkey",
): void {
  if (paletteOpen === open) return;
  paletteOpen = open;
  if (open) trackPaletteOpened(trigger);
  listeners.forEach((notify) => notify());
}

/** Imperative opener for the hotkey listener and the TopBar trigger. */
export function openPalette(trigger: TelemetryPaletteTrigger = "hotkey"): void {
  setPaletteOpen(true, trigger);
}

/** Reactive flag — what the Shell-mounted palette dialog subscribes to. */
export function usePaletteOpen(): boolean {
  return useSyncExternalStore(subscribePaletteOpen, getPaletteOpen, () => false);
}
