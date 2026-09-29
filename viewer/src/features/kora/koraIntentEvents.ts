/**
 * Kora intent telemetry call points (ME-035 events-taxonomy v0, events
 * `kora.intent_started` / `kora.intent_abandoned`; `kora.intent_completed`
 * is И4 — the relay send path — and has NO point here yet).
 *
 * The telemetry client lands on a parallel branch; И1 ships the composer
 * with these CLEAN call points and a no-op client (no emission, no fake
 * events). At the merge the client is injected through this interface and
 * nothing inside the composer changes.
 */

export type KoraIntentEntryPoint = "focus" | "input";

export interface KoraIntentAbandonedPayload {
  /** Whether the draft had text at the moment of abandonment. */
  readonly hadText: boolean;
}

export interface KoraIntentEventPoints {
  /** First character in the composer (taxonomy: kora.intent_started). */
  intentStarted(entryPoint: KoraIntentEntryPoint): void;
  /** Left the composer without a send after a started intent (taxonomy: kora.intent_abandoned). */
  intentAbandoned(payload: KoraIntentAbandonedPayload): void;
}

/** И1 default: the seam without a client — every point is a no-op. */
export const NOOP_KORA_INTENT_EVENTS: KoraIntentEventPoints = {
  intentStarted: () => undefined,
  intentAbandoned: () => undefined,
};
