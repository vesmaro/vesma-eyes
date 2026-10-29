/**
 * Kora intent telemetry call points (ME-035 events-taxonomy v0, events
 * `kora.intent_started` / `kora.intent_abandoned` / `kora.intent_completed`).
 *
 * The telemetry client lands on a parallel branch; И1 shipped the composer
 * with these CLEAN call points and a no-op client (no emission, no fake
 * events). `kora.intent_completed` — reserved by the taxonomy for И4, the
 * relay send path — arrives with the A1 FE leg as an OPTIONAL point: the
 * composer fires it only when the board accepted a send, with the REAL
 * delivery verdict; pre-relay call sites (the no-op default, the И1 test
 * spies) stay legal untouched.
 */

export type KoraIntentEntryPoint = "focus" | "input";

export interface KoraIntentAbandonedPayload {
  /** Whether the draft had text at the moment of abandonment. */
  readonly hadText: boolean;
}

/** И4 — the relay send accepted the prompt; the verdict is the REAL
 * KoraDeliveryOut.status from the 202 body (never an invented one). */
export interface KoraIntentCompletedPayload {
  readonly deliveryStatus: "queued" | "delivered" | "failed";
}

export interface KoraIntentEventPoints {
  /** First character in the composer (taxonomy: kora.intent_started). */
  intentStarted(entryPoint: KoraIntentEntryPoint): void;
  /** Left the composer without a send after a started intent (taxonomy: kora.intent_abandoned). */
  intentAbandoned(payload: KoraIntentAbandonedPayload): void;
  /**
   * И4 — the relay send path accepted the prompt (taxonomy:
   * kora.intent_completed). OPTIONAL: pre-relay call sites predate the
   * send leg and stay legal — the composer fires it with the REAL
   * delivery verdict only.
   */
  intentCompleted?(payload: KoraIntentCompletedPayload): void;
}

/** И1 default: the seam without a client — every point is a no-op. */
export const NOOP_KORA_INTENT_EVENTS: KoraIntentEventPoints = {
  intentStarted: () => undefined,
  intentAbandoned: () => undefined,
};
