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
 * The existential form is the REGISTRY-level signal; the composer needs
 * the PER-SESSION one (`deriveSessionRelayAlive`): the board parks the
 * turn by the SESSION'S OWN executor (the transport seam resolves
 * `_transport` via the item's `executor_id`), so a divergent registry —
 * executor A relay-capable, executor B not, the session lives on B —
 * must NOT light the button: the POST would settle as failed retryable
 * «исполнитель без реле» and «повторите» would lie about what is a
 * PERMANENT refusal for that session. Only the session's executor
 * qualifying makes the send honest.
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
  /** The registry row id — the session handle's prefix names it. */
  readonly id: string;
  /** Owner-declared capability strings (server-capped ≤64). */
  readonly capabilities: readonly string[];
  /** Registry ladder state: only `approved` executors can serve. */
  readonly state: string;
  /** The routing kill-switch — a disabled executor never resolves. */
  readonly enabled: boolean;
}

/** The per-executor relay gate (the shared core of both derivations):
 * enabled, approved, and owner-PATCHed with the session-relay capability. */
function isRelayCapable(executor: KoraRelayExecutorFacts): boolean {
  return (
    executor.enabled &&
    executor.state === "approved" &&
    executor.capabilities.includes(KORA_SESSION_RELAY_CAPABILITY)
  );
}

/** True when at least one approved, enabled executor declares the
 * session-relay capability (the REGISTRY-level «реле жив» signal). An
 * empty or failed registry read is the honest relay-OFF: no invented
 * signal. The composer must use the per-session form below — this one
 * cannot see which executor owns the session. */
export function deriveRelayAlive(
  executors: readonly KoraRelayExecutorFacts[],
): boolean {
  return executors.some(isRelayCapable);
}

/** The session handle's own executor row. The board composes the handle
 * as `{executor_id}:{native_id}` and splits it by the FIRST colon (the
 * server reads it back with `session_id.partition(":")`) — the native id
 * may carry colons itself, so the executor prefix is everything before
 * the first one. A handle without an executor prefix (or an unknown
 * prefix) answers no row — the caller renders the honest relay-OFF. */
function sessionExecutorRow(
  executors: readonly KoraRelayExecutorFacts[],
  sessionId: string,
): KoraRelayExecutorFacts | undefined {
  const cut = sessionId.indexOf(":");
  if (cut <= 0) return undefined;
  return executors.find((executor) => executor.id === sessionId.slice(0, cut));
}

/** True when the SESSION'S OWN executor is approved, enabled and declares
 * the session-relay capability — the honest «кнопка жива» signal for THIS
 * session (the board parks the turn by this very executor, so nothing
 * short of it keeps the retry promise honest). A registry miss on the
 * session's prefix is the relay-OFF, same as a missing capability. */
export function deriveSessionRelayAlive(
  executors: readonly KoraRelayExecutorFacts[],
  sessionId: string,
): boolean {
  const executor = sessionExecutorRow(executors, sessionId);
  return executor !== undefined && deriveRelayAlive([executor]);
}
