/**
 * The living-layer feed (ME-071 W1a «Живой фон») — the ONE tiny eager
 * registry between real data sources and the lazy living engine.
 *
 * Direction of flow is fixed by the anti-fake canon (15-WOW §14.6.1 inv.3):
 * data sources PUSH honest signals in, the engine only listens. This module
 * lives in the eager bundle on purpose — it must stay a few hundred bytes —
 * while the canvas engine itself is the lazy `living-extra` chunk.
 *
 * Signals:
 * - `event`  — a real bus event kind (SSE ui-contract §11 dictionary). The
 *              bridge (lib/livingBridge.ts) forwards raw kinds; the lazy
 *              tone engine maps kind → tone class per §14.6.1 §2. The
 *              optional parsed payload rides along (W2: the Весма keeper
 *              reads notification.title for the named phrases) — a TYPE-ONLY
 *              import, the eager bundle pays ~30 B.
 * - `health` — the per-store health states from GET /api/health
 *              (servers[].state). `null` = no data yet (honest neutral).
 * - `update` — the «пришло обновление» flag. NO automatic source is wired
 *              in W1a (the exact version/manifest field is pending ТЛ,
 *              §14.6.1 §1) — the flag exists for tools/stands only, so no
 *              demo tone can leak into prod.
 *
 * Anti-fake gate: `?quiet=1` or the programmatic `CortexWeb.mute()` pins the
 * whole layer to strictly neutral — zero impulses, zero tones. The gate is
 * HERE (the feed drops muted input), so no consumer can bypass it.
 */

import type { BoardEvent } from "@/gateway/events";

export type LivingSignal =
  | { type: "event"; kind: string; data?: BoardEvent }
  | { type: "health"; states: readonly string[] | null }
  | { type: "update"; on: boolean }
  | { type: "mute" }
  /**
   * ME-071 W3 slice 2 (15-WOW §3.4.2): the task.done courier — a real
   * terminal transition observed by the tasks SSE bridge; the engine runs
   * the GOLD bead UP the Ж2 sidebar vein (to the В1 status zone). Pushed
   * by the SAME honest source that records the transit — never synthesized.
   */
  | { type: "courier" };

type LivingListener = (signal: LivingSignal) => void;

const listeners = new Set<LivingListener>();

/** True while the anti-fake gate is engaged (?quiet=1 / CortexWeb.mute()). */
let muted =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).get("quiet") === "1";

export function isLivingMuted(): boolean {
  return muted;
}

/** Anti-fake gate: strictly neutral tone, zero impulses, until reload. */
export function muteLiving(): void {
  muted = true;
  emit({ type: "mute" });
}

/** Forward one real bus event kind (plus its parsed payload) to the layer. */
export function feedLivingEvent(kind: string, data?: BoardEvent): void {
  if (muted || !kind) return;
  emit({ type: "event", kind, data });
}

/**
 * Forward the per-store health states (servers[].state). `null` means «the
 * source has not answered» — the honest neutral, never a fabricated tone.
 */
export function feedLivingHealth(states: readonly string[] | null): void {
  if (muted) states = null;
  emit({ type: "health", states });
}

/** Tools/stands only (see module doc): the update tone flag. */
export function feedLivingUpdate(on: boolean): void {
  if (muted) return;
  emit({ type: "update", on });
}

/** The task.done courier (15-WOW §3.4.2): the gold bead up Ж2. Fed ONLY by
 * the tasks SSE bridge on a real terminal transition (anti-fake: the mute
 * gate drops it like every other signal). */
export function feedLivingCourier(): void {
  if (muted) return;
  emit({ type: "courier" });
}

export function subscribeLiving(listener: LivingListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(signal: LivingSignal): void {
  for (const listener of [...listeners]) listener(signal);
}

/**
 * Programmatic control surface (the stand's `CortexWeb` protocol, v12
 * web-tones): `mute()` engages the anti-fake gate; `setUpdate()` drives the
 * update tone from tools. Absent in tests without `window`.
 */
declare global {
  interface Window {
    CortexWeb?: {
      mute(): void;
      setUpdate(on: boolean): void;
    };
  }
}

if (typeof window !== "undefined") {
  window.CortexWeb ??= {
    mute: muteLiving,
    setUpdate: feedLivingUpdate,
  };
}
