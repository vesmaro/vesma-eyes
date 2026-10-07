import { useSyncExternalStore } from "react";

/**
 * Shared sidebar collapse state (UI-23, spec 2026-09-23 §2.1/§4.3): the
 * sidebar button and the settings-hub «Сайдбар» control both consume this
 * store — one state, two controls, no storage-event listeners. The key
 * `vesmaro.sidebarCollapsed` and the guarded read/write semantics move here
 * verbatim from Shell.tsx (UI-19): «1» collapsed, anything else open, writes
 * are non-fatal.
 *
 * UI-22 semantics (merged from Shell.tsx): the flag is the DESKTOP intent
 * only — the Sidebar's mobile (<md) overlay state is session-only and its
 * toggle never reaches this store, so a phone can never corrupt the
 * desktop's remembered panel width.
 *
 * U1 (ME-93, unification spec «Глубокая проработка» п.4): the stored value
 * is now the EXPLICIT intent and may be ABSENT. `useSidebarCollapsedEffective`
 * resolves absence by the responsive rule «≥1280 полный, 768–1279 рейл
 * 56px»: narrow desktop viewports default to the rail until the owner makes
 * a choice; an explicit toggle wins everywhere and survives F5 as before.
 */

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "vesmaro.sidebarCollapsed";

/** The viewport where the expanded panel stops being the default (spec п.4). */
export const SIDEBAR_WIDE_QUERY = "(min-width: 1280px)";

/** Guarded localStorage handle — undefined outside a browser/test stub. */
function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined; // private mode / disabled storage
  }
}

/**
 * Read the persisted collapse intent: true/false once the owner chose,
 * null when no explicit choice exists (the responsive default applies).
 */
function loadSidebarIntent(storage: Storage | undefined = safeStorage()): boolean | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    // private mode — fall through to the responsive default
  }
  return null;
}

/** Persist the collapse intent; storage failures are non-fatal. */
export function saveSidebarCollapsed(
  collapsed: boolean,
  storage: Storage | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // Swallow: the in-memory state still switches for this session.
  }
}

let current: boolean | null = null; // lazy: first snapshot reads storage

/**
 * Read-through snapshot: storage stays the persisted truth and every mount
 * re-reads it (tests seed between mounts; within a render pass the value
 * is stable, so useSyncExternalStore stays correct). In-tab changes always
 * go through the setters below, which notify the subscribers.
 */
function snapshot(): boolean | null {
  current = loadSidebarIntent();
  return current;
}

const listeners = new Set<() => void>();

function setCollapsed(collapsed: boolean): void {
  current = collapsed;
  saveSidebarCollapsed(collapsed);
  listeners.forEach((notify) => notify());
}

/** Flip the rail — the single toggle the sidebar button (and tests) call. */
export function toggleSidebarCollapsed(): void {
  setCollapsed(!effectiveCollapsed());
}

/** Set the rail explicitly — the settings-hub segmented control uses this. */
export function setSidebarCollapsed(collapsed: boolean): void {
  setCollapsed(collapsed);
}

export function subscribeSidebarCollapsed(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** Current explicit intent — the non-reactive read (tests, non-React code). */
export function getSidebarIntent(): boolean | null {
  return snapshot();
}

/** The stored intent, resolved: null falls back to expanded (the ≥1280 rule). */
export function getSidebarCollapsed(): boolean {
  return snapshot() ?? false;
}

/** Reactive raw intent — null means «the owner has not chosen yet». */
export function useSidebarIntent(): boolean | null {
  return useSyncExternalStore(subscribeSidebarCollapsed, snapshot, snapshot);
}

/** Reactive collapse flag with the plain expanded fallback (settings hub). */
export function useSidebarCollapsed(): boolean {
  return useSidebarIntent() ?? false;
}

// --- the responsive default (U1, spec «Глубокая проработка» п.4) ---------------

function subscribeWide(onChange: () => void): () => void {
  const mql = window.matchMedia(SIDEBAR_WIDE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function wideSnapshot(): boolean {
  return window.matchMedia(SIDEBAR_WIDE_QUERY).matches;
}

/** Reactive ≥1280 flag (the client-only SPA never sees a wrong first frame;
 * the SSR/test fallback answers wide, the historical desktop default). */
export function useSidebarWide(): boolean {
  return useSyncExternalStore(subscribeWide, wideSnapshot, () => true);
}

/**
 * The value the Shell panel consumes: the explicit intent when present,
 * otherwise the responsive rule — narrow desktop (768–1279) rides the 56px
 * rail, wide viewports open the full 232px panel.
 */
export function useSidebarCollapsedEffective(): boolean {
  const intent = useSidebarIntent();
  const wide = useSidebarWide();
  return intent ?? !wide;
}

/** Non-reactive twin of the hook above (the toggle needs today's truth). */
function effectiveCollapsed(): boolean {
  return getSidebarIntent() ?? !window.matchMedia(SIDEBAR_WIDE_QUERY).matches;
}
