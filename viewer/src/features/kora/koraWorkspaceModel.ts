import type { ExecutorItem } from "@/gateway/boardTypes";
import type { KoraCoverage, KoraSession } from "./koraTypes";

/**
 * Kora workspace model (union И1, 07j §1–3 + i1-dressing-map §1.2.2) — the
 * PURE derivation layer between the slice 1–2 reads and the v7 composition:
 * the Блок 1 tree (host → agent → sessions), the header summary numbers and
 * the row sort. No data fetching here — the registry reads stay in useKora;
 * this module only derives, so every number on screen is a provable
 * derivative of the registry (07j §2.2: «число в разметке = баг ревью»).
 *
 * Honest gaps against the 07j v5 model are NAMED here, not papered over:
 * - the kora registry carries NO host field — hosts come from the executors
 *   registry (`useExecutors`); a kora session whose executor is not enrolled
 *   groups under its executor id (mono, host honestly unknown);
 * - there is no `shared` field — the «Общие сессии» node NEVER renders
 *   (07c §3: an empty slot does not render);
 * - there is no host lifecycle source in the kora registry — the host row
 *   shows the live/idle/dead AGGREGATE of its sessions, no invented age.
 */

/** One agent node: an executor (harness instance on a host) + its sessions. */
export interface KoraAgentNode {
  /** Registry row; null when only the kora registry knows this executor id. */
  readonly executor: ExecutorItem | null;
  readonly executorId: string;
  readonly harness: string;
  readonly sessions: readonly KoraSession[];
}

/** One host group of the Блок 1 tree. */
export interface KoraHostNode {
  /** Host name from the executors registry; null = unknown-host group. */
  readonly host: string | null;
  readonly agents: readonly KoraAgentNode[];
  /** Aggregate session state (live > idle > dead); null = no sessions — no fake state. */
  readonly state: KoraSession["state"] | null;
  readonly sessionCount: number;
}

export interface KoraWorkspaceModel {
  /** Named hosts (host !== null), live-first then by name. */
  readonly hosts: readonly KoraHostNode[];
  /** Unknown-host groups keyed by executor id (registry miss), by id. */
  readonly unknown: readonly KoraHostNode[];
}

const STATE_RANK: Record<KoraSession["state"], number> = {
  live: 0,
  idle: 1,
  dead: 2,
};

/** Aggregate a state list: live beats idle beats dead; empty → null. */
function aggregateState(
  states: readonly KoraSession["state"][],
): KoraSession["state"] | null {
  let best: KoraSession["state"] | null = null;
  for (const state of states) {
    if (best === null || STATE_RANK[state] < STATE_RANK[best]) best = state;
  }
  return best;
}

/**
 * Sort sessions for Блок 2 and the tree leaves (07j §3.4): live on top, then
 * idle, then dead; within a state — by last activity, freshest first.
 */
export function sortKoraSessions(items: readonly KoraSession[]): KoraSession[] {
  return [...items].sort((a, b) => {
    const rank = STATE_RANK[a.state] - STATE_RANK[b.state];
    if (rank !== 0) return rank;
    const aTime = Date.parse(a.last_activity_at ?? a.started_at ?? "") || 0;
    const bTime = Date.parse(b.last_activity_at ?? b.started_at ?? "") || 0;
    return bTime - aTime;
  });
}

/**
 * The session display name (07j §1.1 honest cut): the shape carries no topic
 * field, so the name is what the registry actually reports — the harness
 * project when present, else the last-line preview, else the native id.
 * Never invented, never «host · harness» as a name (that stays a sub-label).
 */
export function koraSessionName(session: KoraSession): string {
  if (typeof session.project === "string" && session.project.length > 0) {
    return session.project;
  }
  if (
    typeof session.last_line_preview === "string" &&
    session.last_line_preview.length > 0
  ) {
    return session.last_line_preview;
  }
  return session.native_id;
}

/** Mutable builder shape (frozen into the exported readonly nodes). */
interface MutableAgentNode {
  executor: ExecutorItem | null;
  executorId: string;
  harness: string;
  sessions: KoraSession[];
}

/**
 * Build the Блок 1 tree from the two existing reads (07j §1.2): the kora
 * session registry (sessions, by executor_id) + the executors registry
 * (hosts, harness instances). Every session lands in exactly ONE place.
 */
export function buildKoraTree(
  sessions: readonly KoraSession[],
  executors: readonly ExecutorItem[],
): KoraWorkspaceModel {
  // host name → (executor id → agent node)
  const hosts = new Map<string, Map<string, MutableAgentNode>>();
  // executor id → agent node for sessions whose executor is not enrolled
  const unknown = new Map<string, MutableAgentNode>();

  for (const executor of executors) {
    const hostName = executor.host.length > 0 ? executor.host : executor.id;
    let agents = hosts.get(hostName);
    if (agents === undefined) {
      agents = new Map();
      hosts.set(hostName, agents);
    }
    if (!agents.has(executor.id)) {
      agents.set(executor.id, {
        executor,
        executorId: executor.id,
        harness: executor.harness,
        sessions: [],
      });
    }
  }

  for (const session of sessions) {
    const enrolled = executors.find((executor) => executor.id === session.executor_id);
    if (enrolled !== undefined) {
      const hostName = enrolled.host.length > 0 ? enrolled.host : enrolled.id;
      const node = hosts.get(hostName)?.get(session.executor_id);
      if (node !== undefined) {
        node.sessions.push(session);
        continue;
      }
    }
    // Registry miss: group under the executor id (host honestly unknown).
    let node = unknown.get(session.executor_id);
    if (node === undefined) {
      node = {
        executor: enrolled ?? null,
        executorId: session.executor_id,
        harness: session.harness,
        sessions: [],
      };
      unknown.set(session.executor_id, node);
    }
    node.sessions.push(session);
  }

  const toHostNode = (
    host: string | null,
    agents: Map<string, MutableAgentNode>,
  ): KoraHostNode => {
    const list = [...agents.values()].map((agent) => ({
      executor: agent.executor,
      executorId: agent.executorId,
      harness: agent.harness,
      sessions: sortKoraSessions(agent.sessions),
    }));
    list.sort(
      (a, b) =>
        a.harness.localeCompare(b.harness) || a.executorId.localeCompare(b.executorId),
    );
    const states = list.flatMap((agent) =>
      agent.sessions.map((session) => session.state),
    );
    return {
      host,
      agents: list,
      state: aggregateState(states),
      sessionCount: states.length,
    };
  };

  const hostNodes = [...hosts.entries()].map(([name, agents]) =>
    toHostNode(name, agents),
  );
  // Live hosts first (the tree's default-open set), then by name.
  hostNodes.sort((a, b) => {
    const rank =
      (a.state === null ? 3 : STATE_RANK[a.state]) -
      (b.state === null ? 3 : STATE_RANK[b.state]);
    if (rank !== 0) return rank;
    return (a.host ?? "").localeCompare(b.host ?? "");
  });

  const unknownNodes = [...unknown.entries()].map(([id, agents]) => {
    // The unknown group is keyed by executor id — the agent level collapses
    // into the host level (the registry never named a host).
    const node = toHostNode(null, new Map([[id, agents]]));
    return node;
  });

  return { hosts: hostNodes, unknown: unknownNodes };
}

/** Header summary numbers (07j §3.2) — every value is a registry derivative. */
export interface KoraSummary {
  /** Named hosts (unknown-host groups are not hosts — counting them would lie). */
  readonly hosts: number;
  readonly running: number;
  /** Sessions STARTED within the last 24 h (age_seconds is started-derived). */
  readonly day: number;
}

export function koraSummary(
  model: KoraWorkspaceModel,
  sessions: readonly KoraSession[],
): KoraSummary {
  return {
    hosts: model.hosts.length,
    running: sessions.filter((session) => session.state === "live").length,
    day: sessions.filter((session) => session.age_seconds < 86_400).length,
  };
}

/**
 * The harness support level for ONE session (07j §3.5 «Покрытие этой
 * сессии»): the registry coverage is per-harness, so the session's coverage
 * is its harness's row; null when the harness has no coverage row.
 */
export function sessionCoverageSupport(
  coverage: KoraCoverage | null | undefined,
  harness: string,
): KoraCoverage["harnesses"][number]["support"] | null {
  const row = coverage?.harnesses.find((candidate) => candidate.harness === harness);
  return row?.support ?? null;
}

/** Deterministic UTC HH:MM for transcript lines (the formatTimestamp
 * discipline: UTC methods only — no locale/TZ drift in snapshots). */
export function formatTranscriptTime(ts: string | null): string {
  if (ts === null) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** Age in whole minutes/hours/days for the state pill («идёт · 41 мин»). */
export type KoraAgeUnit = "min" | "hour" | "day";

export function koraAgeUnit(ageSeconds: number): { unit: KoraAgeUnit; n: number } {
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) return { unit: "min", n: Math.max(minutes, 0) };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: "hour", n: hours };
  return { unit: "day", n: Math.floor(hours / 24) };
}

/** The quick filters of Блок 2 (07j §3.2 — the summary numbers click into these). */
export type KoraQuickFilter = "running" | "day";

export function quickFilterMatches(
  session: KoraSession,
  filter: KoraQuickFilter | null,
): boolean {
  if (filter === null) return true;
  if (filter === "running") return session.state === "live";
  return session.age_seconds < 86_400; // "day"
}
