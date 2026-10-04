import { useSyncExternalStore } from "react";

/**
 * task.done transit store (ME-071 W3 slice 1 — 15-WOW §3.4 «живой пульт»,
 * §8.5 срез 5): the module-level record of TERMINAL task transitions
 * (col → resolved | done) observed live on the /tasks SSE stream.
 *
 * Three honest consumers, ONE source:
 * - the resolved column's tempo chip («решений/час», tabular) — the count
 *   in the trailing 60-minute window;
 * - the card gold flash (beat 1 of the task.done спектакль: flash 240ms
 *   = --duration-impulse, hold 600ms = --duration-flash-hold — the W0
 *   tokens' FIRST consumer) — a transition is "fresh" for 2s after
 *   receipt; the card applies the class while fresh and lets the token
 *   durations play;
 * - the board's task.done toast (WCAG 4.1.3 — the toast viewport is the
 *   shared polite live region).
 *
 * Honesty rules:
 * - fed ONLY by the domain SSE bridge (taskEvents.ts) when the cached
 *   previous column differs from the event's terminal column — a page
 *   reload never replays old flashes (no records → no flash), and the
 *   tempo chip simply does not render until the first event is observed
 *   live (a fake «0/ч» or a seeded number would claim knowledge the
 *   client does not have — the seed candidate (server activity feed)
 *   was rejected: its target column rides the presentation `detail`
 *   string, not a machine field).
 * - window math is pure (injected `now`) — tests drive the clock.
 */

/** The trailing window of the tempo derivation (15-WOW §3.4: 60 minutes). */
export const DONE_WINDOW_MS = 60 * 60 * 1000;

/** How long a transit stays "fresh" for the card flash (≥ flash 240ms +
 * hold 600ms and ≥ the reduced static tint 1500ms, plus DOM margin). */
export const DONE_FRESH_MS = 2_000;

/** Buffer cap (the window prunes; the cap only bounds a pathological bus). */
const CAP = 100;

/** Columns the спектакль recognises as terminal (wire dictionary mirrors). */
export const TERMINAL_COLUMNS: ReadonlySet<string> = new Set([
  "resolved",
  "done",
]);

export interface DoneTransit {
  readonly taskId: string;
  readonly title: string;
  /** The terminal column arrived at ("resolved" | "done"). */
  readonly col: string;
  /** Receipt time, epoch ms (client clock — the tempo is a client-side
   * derivation of the live stream, not a server aggregation). */
  readonly at: number;
}

interface DoneTransitState {
  /** Oldest first. */
  items: DoneTransit[];
  version: number;
}

const state: DoneTransitState = { items: [], version: 0 };
const listeners = new Set<() => void>();

function emit(): void {
  state.version += 1;
  for (const fn of listeners) fn();
}

export function subscribeDoneTransits(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Drop entries older than the window (mutates in place — bounded buffer). */
function prune(now: number): void {
  if (state.items.length === 0) return;
  const cutoff = now - DONE_WINDOW_MS;
  const first = state.items.findIndex((t) => t.at >= cutoff);
  if (first > 0) state.items = state.items.slice(first);
  else if (first === -1) state.items = [];
}

/**
 * Record one live terminal transition. A repeat of the SAME (task, col)
 * within 1s is folded (SSE reconnect replays are at-most-once, but a
 * duplicate frame must not double the tempo).
 */
export function recordDoneTransit(
  transit: { taskId: string; title: string; col: string },
  now: number = Date.now(),
): void {
  if (!TERMINAL_COLUMNS.has(transit.col)) return;
  const last = state.items[state.items.length - 1];
  if (
    last &&
    last.taskId === transit.taskId &&
    last.col === transit.col &&
    now - last.at < 1_000
  ) {
    return;
  }
  prune(now);
  state.items = [
    ...state.items,
    { taskId: transit.taskId, title: transit.title, col: transit.col, at: now },
  ].slice(-CAP);
  emit();
  noteClockRearm();
}

/** The pure window count (no store mutation — safe to call at render). */
function countInWindow(now: number): number {
  let n = 0;
  const cutoff = now - DONE_WINDOW_MS;
  for (const item of state.items) if (item.at >= cutoff) n += 1;
  return n;
}

/** The tempo number: terminal transitions in the trailing 60 minutes. */
export function countDoneTransits(now: number = Date.now()): number {
  prune(now);
  return countInWindow(now);
}

/** The fresh transit of one task (the flash trigger), or null. */
export function peekFreshTransit(
  taskId: string,
  now: number = Date.now(),
): DoneTransit | null {
  for (let i = state.items.length - 1; i >= 0; i -= 1) {
    const item = state.items[i];
    if (item.at < now - DONE_FRESH_MS) return null; // oldest-first: done looking
    if (item.taskId === taskId) return item;
  }
  return null;
}

/** The most recent transit (the toast/announcement trigger), or null. */
export function latestDoneTransit(): DoneTransit | null {
  return state.items[state.items.length - 1] ?? null;
}

/** Test seam: reset the module store (the buffer is module-level). */
export function resetDoneTransits(): void {
  state.items = [];
  state.version = 0;
}

/* ── The shared derived-reads clock (the useValidationClock pattern) ─────
 * Date.now() is an external system: it lives HERE, never at render (the
 * react-hooks/purity gate). One interval serves both derived reads — the
 * 60-min tempo and the 2s freshness — with a duty cycle:
 *   fast (250ms) while some transit is fresh — the flash class must drop
 *   right after the tint; slow (30s) while only the tempo window is live —
 *   an old event must age out of «за последний час» without a new one;
 *   stopped when the store is empty (nothing can change without an event,
 *   and every event re-arms the clock).
 * The snapshot starts at 0 — SSR renders the honest empty state. */
const FAST_TICK_MS = 250;
const SLOW_TICK_MS = 30_000;

let clockSnapshot = 0;
const clockListeners = new Set<() => void>();
let clockInterval: ReturnType<typeof setInterval> | null = null;
let clockFast = false;

function tickClock(): void {
  clockSnapshot = Date.now();
  for (const fn of clockListeners) fn();
  // Re-arm the duty cycle from the current store state.
  const items = state.items;
  const now = clockSnapshot;
  const anyFresh =
    items.length > 0 &&
    items[items.length - 1].at >= now - DONE_FRESH_MS;
  const anyLive = items.length > 0;
  const wantFast = anyFresh;
  if (!anyLive) {
    if (clockInterval !== null) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
    return;
  }
  if (wantFast !== clockFast) {
    clockFast = wantFast;
    if (clockInterval !== null) clearInterval(clockInterval);
    clockInterval = setInterval(tickClock, clockFast ? FAST_TICK_MS : SLOW_TICK_MS);
  }
}

function startClock(): void {
  clockFast = true;
  tickClock();
  if (clockInterval === null) {
    clockInterval = setInterval(tickClock, FAST_TICK_MS);
  }
}

function subscribeClock(fn: () => void): () => void {
  clockListeners.add(fn);
  if (clockInterval === null) startClock();
  return () => {
    clockListeners.delete(fn);
    if (clockListeners.size === 0 && clockInterval !== null) {
      clearInterval(clockInterval);
      clockInterval = null;
      clockSnapshot = 0;
    }
  };
}

function getClockSnapshot(): number {
  return clockSnapshot;
}

function getClockServerSnapshot(): number {
  return 0;
}

function noteClockRearm(): void {
  if (clockListeners.size > 0 && clockInterval === null) startClock();
}

/** Subscribe to version bumps only (the snapshot is a number — stable). */
function getVersion(): number {
  return state.version;
}

/** The server snapshot: the store is client-live-only (the SSE bridge is a
 * browser concern), so SSR renders the honest EMPTY state — no tempo, no
 * flash, no toast. */
function getServerVersion(): number {
  return 0;
}

/** The current tempo, re-evaluated on store events and on the shared duty-
 * cycled clock (fast while a flash is live, 30s for window aging). The
 * render reads only module snapshots — no Date.now() at render, no setState
 * in effects (the react-hooks purity/set-state gates). */
export function useDoneTempo(): number {
  const now = useSyncExternalStore(subscribeClock, getClockSnapshot, getClockServerSnapshot);
  useSyncExternalStore(subscribeDoneTransits, getVersion, getServerVersion);
  return now === 0 ? 0 : countInWindow(now);
}

/** The fresh transit for one card, re-evaluated on store events and on the
 * shared clock (same duty cycle — the class drops right after the tint). */
export function useFreshDoneTransit(taskId: string): DoneTransit | null {
  const now = useSyncExternalStore(subscribeClock, getClockSnapshot, getClockServerSnapshot);
  useSyncExternalStore(subscribeDoneTransits, getVersion, getServerVersion);
  return now === 0 ? null : peekFreshTransit(taskId, now);
}

/** The latest transit for the toast, null before the first event. */
export function useLatestDoneTransit(): DoneTransit | null {
  useSyncExternalStore(subscribeDoneTransits, getVersion, getServerVersion);
  return latestDoneTransit();
}
