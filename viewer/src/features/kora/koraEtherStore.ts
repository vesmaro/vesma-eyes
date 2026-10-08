import type { BoardEvent } from "@/gateway/events";

/**
 * The Эфир ring (U5; SPEC-2026-10-07 «Кора: вспышки Эфира», 15-WOW §3.2):
 * a tiny module-level store of the REAL bus events of the SESSION class,
 * bounded to the last ETHER_RING_MAX rows (the domain's ≤6 dosage — a new
 * event never paints more than six flashes; the ring drops the OLDEST).
 *
 * Anti-fake discipline (the honesty gate's premise): the store is filled
 * ONLY by the page's SSE bridge (useKoraEtherBridge) from parsed
 * `BoardEvent`s — no timers, no fixtures, no demo emitter. A silent bus
 * leaves the ring EMPTY: the ether renders the honest empty line and the
 * screen stands (npm run honesty, scenarios 8–9).
 *
 * Rows carry an i18n KEY + params (not rendered text) so a language switch
 * re-renders the same facts in the other language; `host` rides along for
 * the page's ONE host filter. Live-only by design: the frozen kora contract
 * has no backlog endpoint, so the ether narrates what arrives while you
 * are here — the empty state says exactly that.
 */
import type { BoardExecutor } from "@/gateway/events";
import type { TranslationKey } from "@/i18n";

export interface KoraEtherRow {
  readonly id: number;
  /** Arrival wall time (Date.now()) — rendered as mono UTC HH:MM. */
  readonly ts: number;
  /** The host the row belongs to (null = unknown/not a host fact). */
  readonly host: string | null;
  /** Resolved i18n key (store picks the host/no-host variant honestly). */
  readonly key: TranslationKey;
  readonly params: Readonly<Record<string, string>>;
}

/** The domain dosage ceiling (SPEC: «≤6 вспышек»). */
export const ETHER_RING_MAX = 6;

/** The session-class slice of the board dictionary: presence transitions
 * of the agents that own the sessions, plus the agents' reports. Deliberate
 * omissions: `executor.updated/deleted` (registry bookkeeping — no owner
 * story), `notification`/`task.*` (their dose lives in Задачи, one dose per
 * domain), `assignment.*` (engine reserve, not yet emitted), service frames. */
export function isEtherKind(kind: string): boolean {
  return (
    kind === "executor.online" ||
    kind === "executor.offline" ||
    kind === "executor.registered" ||
    kind === "report"
  );
}

function executorHost(executor: BoardExecutor): string | null {
  return typeof executor.host === "string" && executor.host.length > 0
    ? executor.host
    : null;
}

function executorName(executor: BoardExecutor): string {
  return executor.name.length > 0 ? executor.name : executor.id;
}

/** Map one parsed bus event to a row; null = not an ether fact. */
export function etherRowFromEvent(event: BoardEvent, id: number): KoraEtherRow | null {
  switch (event.kind) {
    case "executor.online":
    case "executor.offline":
    case "executor.registered": {
      const host = executorHost(event.executor);
      const name = executorName(event.executor);
      if (event.kind === "executor.online") {
        return {
          id,
          ts: Date.now(),
          host,
          key: host === null ? "kora.ether.onlineNoHost" : "kora.ether.online",
          params: host === null ? { name } : { name, host },
        };
      }
      if (event.kind === "executor.offline") {
        return {
          id,
          ts: Date.now(),
          host,
          key: host === null ? "kora.ether.offlineNoHost" : "kora.ether.offline",
          params: host === null ? { name } : { name, host },
        };
      }
      return {
        id,
        ts: Date.now(),
        host,
        key: host === null ? "kora.ether.registeredNoHost" : "kora.ether.registered",
        params: host === null ? { name } : { name, host },
      };
    }
    case "report": {
      const actor = typeof event.actor === "string" && event.actor.length > 0
        ? event.actor
        : null;
      return {
        id,
        ts: Date.now(),
        host: null,
        key: actor === null ? "kora.ether.report" : "kora.ether.reportBy",
        params:
          actor === null
            ? { task: event.task_id }
            : { actor, task: event.task_id },
      };
    }
    default:
      return null;
  }
}

// --- the module ring -----------------------------------------------------------

let rows: KoraEtherRow[] = [];
let nextId = 1;
const listeners = new Set<(rows: readonly KoraEtherRow[]) => void>();

function notify(): void {
  const snapshot = rows;
  for (const fn of [...listeners]) fn(snapshot);
}

/** Current rows (oldest → newest; the newest renders last, like a log). */
export function etherRows(): readonly KoraEtherRow[] {
  return rows;
}

/**
 * Push one parsed event into the ring. Returns true when the event became
 * a row (the bridge uses nothing else; unknown kinds are silently dropped
 * per the additive-only dictionary rules).
 */
export function pushEtherEvent(event: BoardEvent): boolean {
  if (!isEtherKind(event.kind)) return false;
  const row = etherRowFromEvent(event, nextId++);
  if (row === null) return false;
  rows = [...rows, row].slice(-ETHER_RING_MAX);
  notify();
  return true;
}

export function subscribeEther(
  fn: (rows: readonly KoraEtherRow[]) => void,
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Tests only: the ring is module state by design (one ether per app). */
export function resetEtherForTests(): void {
  rows = [];
  nextId = 1;
  listeners.clear();
}
