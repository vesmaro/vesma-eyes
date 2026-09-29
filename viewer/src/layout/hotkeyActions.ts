/**
 * Pure hotkey resolution (Ф1, ARCHCOM-3 verdict §2 — the proven ai-brain
 * canon with the `inInput` guard). Kept DOM-free and React-free so the guard
 * rules are exhaustively unit-testable; the provider wiring lives in
 * Hotkeys.tsx.
 *
 * UX-overhaul §7.3 (Ф2): the search entry is the COMMAND PALETTE — the
 * bare `/` opens it (memory is the first section, keeping the old
 * focus-search promise) and ⌘K/Ctrl+K opens it from anywhere, INCLUDING
 * editable surfaces (the palette's own input is the point).
 */
export type HotkeyAction = "open-palette" | "open-help";

/** Minimal event shape resolveHotkey needs (pure, DOM-free — unit-testable). */
export interface HotkeyEvent {
  key: string;
  /** Physical key code — ⌘K matches by it so a Russian layout's Ctrl+Л
   * (key="л", code="KeyK") opens the palette too (review P3-6, RU-first). */
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target?: EventTarget | null;
}

/** True when focus sits in an editable surface — hotkeys must stay quiet. */
export function isEditableTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const element = target as HTMLElement;
  const tag = element.tagName.toUpperCase();
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    element.isContentEditable === true
  );
}

/**
 * Map a BARE keydown to a hotkey action, or null. Guards: no modifier combos
 * (those belong to the browser/OS — see resolveGlobalHotkey), and the
 * inInput rule above.
 */
export function resolveHotkey(event: HotkeyEvent): HotkeyAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (isEditableTarget(event.target)) return null;
  if (event.key === "/") return "open-palette";
  if (event.key === "?") return "open-help";
  return null;
}

/**
 * Modifier combos that stay hot EVERYWHERE (even inside editable surfaces):
 * ⌘K / Ctrl+K is the palette's canonical key, and the palette IS an input —
 * the inInput guard would make it unreachable exactly where it is needed.
 * The match is by PHYSICAL key (event.code "KeyK") with the key fallback —
 * a Russian layout's Ctrl+Л must open the palette (review P3-6, RU-first).
 * Alt/Shift variants stay with the browser/OS. («/» and «?» keep the
 * inherited key-based matching — a known limitation, left as is.)
 */
export function resolveGlobalHotkey(event: HotkeyEvent): HotkeyAction | null {
  if (event.altKey || event.shiftKey) return null;
  if (!(event.metaKey || event.ctrlKey)) return null;
  if (event.code === "KeyK" || event.key.toLowerCase() === "k") {
    return "open-palette";
  }
  return null;
}
