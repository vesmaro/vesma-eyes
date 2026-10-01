import { useSyncExternalStore } from "react";

/**
 * `vesmaro.live` — the living-layer store (blueprint §6.6 В1, canon v11 §4;
 * W1a semantics per the owner directive 2026-10-01 and АРХКОМ §1.6).
 * The hero canvas, the settings hub and the living engine read this ONE
 * store. Four levels of disabling exist in the canon — the fourth is the
 * reduced-motion regime (`vesmaro.motion`), which zeroes the durations
 * underneath everything and is deliberately NOT rewritten here (the two
 * stores stay orthogonal).
 *
 * Levels (settings hub labels):
 * - `live`  — «Полный»: everything — breathing, tones AND event impulses.
 * - `calm`  — «Спокойный» (the DEFAULT): breathing + state tones, no event
 *             impulses (no festivals).
 * - `off`   — «Выключен»: the whole living layer settled; the data stays.
 *
 * Light/data honesty is untouched: every impulse must still name a bus event
 * — this store only gates AMBIENT motion, never the data renders.
 */
export type LiveLayer = "live" | "calm" | "off";

export const LIVE_LAYER_STORAGE_KEY = "vesmaro.live";
export const DEFAULT_LIVE_LAYER: LiveLayer = "calm";

/** Cycle order for the В1 indicator: live → calm → off → live. */
export const LIVE_LAYERS = ["live", "calm", "off"] as const satisfies readonly LiveLayer[];

export function isLiveLayer(value: unknown): value is LiveLayer {
  return value === "live" || value === "calm" || value === "off";
}

/** Guarded localStorage handle — undefined outside a browser/test stub. */
function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined; // private mode / disabled storage
  }
}

/** Read the persisted level; null when absent, invalid or unavailable. */
export function readStoredLiveLayer(
  storage: Storage | undefined = safeStorage(),
): LiveLayer | null {
  if (!storage) return null;
  try {
    const stored = storage.getItem(LIVE_LAYER_STORAGE_KEY);
    return isLiveLayer(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Persist the level; storage failures are non-fatal. */
export function persistLiveLayer(
  layer: LiveLayer,
  storage: Storage | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(LIVE_LAYER_STORAGE_KEY, layer);
  } catch {
    // Swallow: persist is best-effort. snapshot() reads storage only ONCE
    // and serves the cache afterwards, so the in-memory level stays
    // authoritative until the next setLiveLayer — a failed write cannot
    // silently revert it.
  }
}

// --- the one store -----------------------------------------------------------------

/** The authoritative in-memory level; null until the first read resolves it. */
let current: LiveLayer | null = null;

function snapshot(): LiveLayer {
  current ??= readStoredLiveLayer() ?? DEFAULT_LIVE_LAYER;
  return current;
}

const listeners = new Set<() => void>();

/** Set the level: one write path — persist + notify every consumer. */
export function setLiveLayer(layer: LiveLayer): void {
  current = layer;
  persistLiveLayer(layer);
  listeners.forEach((notify) => notify());
}

/** Step the В1 cycle forward by one level (live → calm → off → live). */
export function cycleLiveLayer(): void {
  const next = LIVE_LAYERS[(LIVE_LAYERS.indexOf(snapshot()) + 1) % LIVE_LAYERS.length];
  setLiveLayer(next);
}

export function subscribeLiveLayer(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** Current level — the non-reactive read (tests, non-React code). */
export function getLiveLayer(): LiveLayer {
  return snapshot();
}

/** Reactive level — the single hook the hero and the indicator consume. */
export function useLiveLayer(): LiveLayer {
  return useSyncExternalStore(subscribeLiveLayer, snapshot, getServerLiveLayer);
}

function getServerLiveLayer(): LiveLayer {
  return snapshot();
}
