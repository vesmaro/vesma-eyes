/**
 * The Kora relay availability derivation (the A1 FE leg — «кнопка
 * отправки оживает»).
 *
 * The relay signal is a DERIVATION over the executors registry the
 * workspace ALREADY loaded (zero new requests — the same discipline as
 * the composer's harness derivations, kora-ide contract §5.4): the
 * executor-side relay unit polls the pickup/confirm seam under an
 * APPROVED, ENABLED executor's token, and the owner gates the handoff
 * by PATCHing the `session-relay` capability onto that executor row
 * (owner PATCH, free-form strings ≤64 — server store). The board serves
 * the capability list on EVERY GET /api/executors item
 * (`_executor_public` → `capabilities`), so the composer/tree can
 * honestly derive:
 *
 *   relay alive  ⇔  ∃ executor: capability "session-relay"
 *                   AND state approved AND enabled.
 *
 * Presence is deliberately NOT part of the signal: the relay unit is
 * its own process on the host — the scan agent's last_seen says nothing
 * certain about the relay poller (on boards without the presence
 * piggyback a relay poll never touches last_seen at all). A dead relay
 * surfaces HONESTLY in the delivery verdict instead (queue TTL sweeps →
 * failed retryable, «не доставлено — повторите»), not in a presence
 * guess. The frozen 403 `step_up_required` stays the second, orthogonal
 * gate: the derivation says nothing about the PIN ritual.
 */

/** The owner-PATCHed capability string that gates the relay handoff
 * (ADR-0019 rev.2 #3 — the same literal the transport seam parks by). */
export const KORA_SESSION_RELAY_CAPABILITY = "session-relay";

/** The executor facts the derivation reads — the subset of the board
 * `ExecutorOut` projection (gateway ExecutorItem) it needs. A narrow
 * structural type keeps the derivation pure and table-testable. */
export interface KoraRelayExecutorFacts {
  /** Owner-declared capability strings (server-capped ≤64). */
  readonly capabilities: readonly string[];
  /** Registry ladder state: only `approved` executors can serve. */
  readonly state: string;
  /** The routing kill-switch — a disabled executor never resolves. */
  readonly enabled: boolean;
}

/** True when at least one approved, enabled executor declares the
 * session-relay capability (the honest «реле жив» signal). An empty or
 * failed registry read is the honest relay-OFF: no invented signal. */
export function deriveRelayAlive(
  executors: readonly KoraRelayExecutorFacts[],
): boolean {
  return executors.some(
    (executor) =>
      executor.enabled &&
      executor.state === "approved" &&
      executor.capabilities.includes(KORA_SESSION_RELAY_CAPABILITY),
  );
}
