import { useSyncExternalStore } from "react";
import { isLivingMuted } from "@/lib/livingFeed";

/**
 * Присутствие-свет домена агентов (U6; SPEC-2026-10-07 «Агенты: из v12 —
 * стиль хост-карточек, присутствие-свет»; движение — только как реакция на
 * реальное событие, не фон).
 *
 * WHAT: one-shot flash records, keyed by executor id, fed EXCLUSIVELY by the
 * agents SSE bridge (agentsEvents.ts) on a REAL `executor.online` /
 * `executor.offline` wire frame — the same frames the server's presence
 * sweeper emits on transition (§11: per-heartbeat events are forbidden, so
 * every record here IS a transition). A silent bus records nothing and the
 * domain stands (the honesty gate's scenario «agents-silent»).
 *
 * VERDICT (пульс-бейдж, U6): the infinite badge pulse is GONE from the
 * domain (AssignmentStateBadge's running dot and ProvisionCard's stage dot
 * are static now). The living dose of Агенты = this flash: an impulse
 * 240ms + decay 400ms (`--duration-impulse` + `--duration-slow`), amplitude
 * ceiling `--neura-breath-alpha` (≤0.18), played once per transition and
 * NEVER as background. The static online-dot glow (`--glow-live`) is DATA
 * (presence), not motion. Coalescing: the store keeps the LAST transition
 * per executor — a same-tone repeat inside a flash's life re-tones the dot
 * but does not re-play the animation (the ≤6-impulse coalesce discipline).
 *
 * Anti-fake gate: `?quiet=1` (`isLivingMuted`) drops records like every
 * living feed input — the mute never adds motion. Reduced motion mirrors
 * through the tokens themselves (durations → 0ms: the tint is instant and
 * still). Registry facts (registered/updated/deleted) are NOT presence
 * transitions — they ride the ordinary cache invalidation, no flash.
 */

export type PresenceFlashTone = "online" | "offline";

export interface PresenceFlash {
  /** Monotonic per-store version — the re-render key (0 = no flash yet). */
  readonly seq: number;
  readonly tone: PresenceFlashTone;
}

const flashes = new Map<string, PresenceFlash>();
const listeners = new Set<() => void>();
let seq = 0;

/** Feed one REAL presence transition (agents SSE bridge only). */
export function recordPresenceFlash(
  executorId: string,
  tone: PresenceFlashTone,
): void {
  if (!executorId || isLivingMuted()) return;
  seq += 1;
  flashes.set(executorId, { seq, tone });
  for (const listener of [...listeners]) listener();
}

export function subscribePresenceLight(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Snapshot for useSyncExternalStore: a stable primitive per executor. */
function seqSnapshot(executorId: string): number {
  return flashes.get(executorId)?.seq ?? 0;
}

/** The latest flash for one executor (null = none recorded this session). */
export function usePresenceFlash(executorId: string): PresenceFlash | null {
  // The seq primitive is the store snapshot (stable across renders); the
  // record object itself is stable until the NEXT transition replaces it.
  useSyncExternalStore(
    subscribePresenceLight,
    () => seqSnapshot(executorId),
    () => 0,
  );
  return flashes.get(executorId) ?? null;
}
