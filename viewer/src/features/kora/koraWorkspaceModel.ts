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

/* ── transcript-ux wave: the Диалог / Сырой ход grammar ──────────────────
 * The owner directive (2026-10-10, journey 1.73.1): the transcript without
 * grouping is a dump — separate the WORKING dialogue (user↔assistant) from
 * the RAW WALK (how the agent thought and acted: reasoning, tool calls,
 * service rows), keep the raw walk folded around the answer that spawned
 * it, and wire the anchors both ways (click a raw row → the answer, and
 * back). The data stays the frozen linear seq stream — grouping is a PURE
 * render-side derivation, zero contract impact. */

/** Roles that ARE the working dialogue (the «Диалог» surface). */
export const KORA_DIALOG_ROLES: ReadonlySet<string> = new Set(["user", "assistant"]);

/**
 * One grouped transcript block: a dialog row (user|assistant) ANCHOR plus
 * the raw-walk rows (tool|system) that follow it in the seq stream — the
 * raw walk is chronologically bound to the answer above it, so the fold
 * renders inside that anchor's block. `anchor === null` happens only when a
 * loaded page STARTS with raw rows (the spawning answer sits on a previous
 * page) — the rows render as a standalone fold, still honest, nothing
 * re-attributed.
 */
export interface KoraTranscriptGroup<T> {
  readonly anchor: T | null;
  readonly raw: readonly T[];
}

/**
 * Group a linear transcript page into anchor+raw blocks. Stable, order
 * preserving: dialog rows open groups, raw rows append to the current
 * group; leading raw rows form a null-anchor group. O(n), no data mutated.
 */
export function groupKoraTranscript<T extends { readonly role: string }>(
  items: readonly T[],
): readonly KoraTranscriptGroup<T>[] {
  const groups: { anchor: T | null; raw: T[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (KORA_DIALOG_ROLES.has(item.role)) {
      groups.push({ anchor: item, raw: [] });
    } else if (last !== undefined) {
      last.raw.push(item);
    } else {
      groups.push({ anchor: null, raw: [item] });
    }
  }
  return groups;
}

/** DOM anchor id of a dialog row (the click-to-answer wire of the wave). */
export function koraTranscriptAnchorId(seq: number): string {
  return `kora-anchor-${seq}`;
}

/** DOM id of a group's raw-walk fold (the answer-to-raw-walk wire). */
export function koraTranscriptFoldId(seq: number): string {
  return `kora-fold-${seq}`;
}

/* ── KW4 «Поле хоста»: the session groups of ONE agent (blueprint-kw4 §1/§3)
 * The owner directive (2026-10-23): sessions are NOT a disorderly pile —
 * they group by project directory. The registry already carries `project`
 * and `cwd` for every harness (server readers verified in blueprint-kw4 §1),
 * so grouping is a PURE frontend derivation over the loaded registry — zero
 * new requests, zero contract lines. The key is the FULL cwd (two
 * directories with the same basename never merge); hermes rows have no cwd
 * BY CONTRACT (hermes_client.py reports it honestly empty) — they group by
 * source, the `hermes:<source>` project tag. Titles are NOT built here:
 * the model returns structured data, the component maps it through i18n
 * (ru/en stay in sync). */

/** The sentinel group key for sessions with no cwd (the honest
 * «Без каталога» group — the registry reports the absence, we name it). */
export const KORA_GROUP_NO_CWD = "__nocwd__";

/** The `hermes:` project-tag prefix (server: hermes_client.py, KORA_HERMES
 * rows carry project `hermes:<source>`). */
const HERMES_SOURCE_PREFIX = "hermes:";

/** One session group of the host field. */
export interface KoraProjectGroup {
  /** Stable key: the full cwd path, the hermes project tag, or the no-cwd
   * sentinel — the persistence identity (vesmaro.koraGroups). */
  readonly key: string;
  /** cwd path for a directory group, hermes source name for a source
   * group; null for the no-cwd group. Titles ride i18n in the component. */
  readonly kind: "cwd" | "source" | "none";
  readonly cwd: string | null;
  readonly source: string | null;
  /** The group holds a live session — live groups open by default
   * (states-kw4 K-GRP-DEFAULT). */
  readonly hasLive: boolean;
  /** The group's sessions, live-on-top sorted (sortKoraSessions). */
  readonly sessions: readonly KoraSession[];
}

/**
 * The digest-suffixed disclosure id CORE, shared by every disclosure
 * family (the project groups via koraGroupListId, the tree host branches
 * via KoraTree). The sanitized key alone COLLIDES: two different raw keys
 * can flatten to the same slug (`/a/proj+one` and `/a/proj-one`, or the
 * hosts `a.b` and `a_b` — every non-word char becomes `_`), and a
 * duplicated id breaks the disclosure link (an idref must resolve to
 * exactly one element; getElementById returns the first). A full 32-bit
 * FNV-1a digest of the RAW key suffixes the slug — deterministic, stable
 * across sessions, distinct for the colliding pair (hygiene batch review
 * tail kora-tree-listid-collision; the tree host leg closed in the
 * cascade W6 fix slice).
 */
export function koraDisclosureListId(prefix: string, key: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const digest = (hash >>> 0).toString(16).padStart(8, "0");
  return `${prefix}-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}-${digest}`;
}

/**
 * The DOM id of one project group's disclosure list (the
 * aria-controls ↔ id pair) — the group family of the shared
 * koraDisclosureListId core; see its doc for the collision rationale.
 */
export function koraGroupListId(key: string): string {
  return koraDisclosureListId("kora-group", key);
}

/** The basename of a posix path — a pure string cut (no Node path module in
 * the browser); trailing slashes strip, "/" keeps its name, a bare segment
 * is itself. */
export function pathBasename(p: string): string {
  const trimmed = p.replace(/\/+$/, "");
  if (trimmed === "") return p;
  const cut = trimmed.lastIndexOf("/");
  return cut === -1 ? trimmed : trimmed.slice(cut + 1);
}

/** Freshest activity stamp of a session as a comparable number (a missing
 * stamp is the oldest — the same floor the workspace's hermes anchor uses). */
function freshestTs(session: KoraSession): number {
  return Date.parse(session.last_activity_at ?? session.started_at ?? "") || 0;
}

/**
 * Group ONE agent's sessions for the host field: by cwd (the full path is
 * the key — basename collisions stay apart), hermes rows by source, empty
 * cwd into the honest no-directory group. Deterministic order: live groups
 * first, then freshest activity, then key — a stable journal, no invented
 * facts. O(n) over the already-loaded registry slice.
 */
export function buildProjectGroups(
  sessions: readonly KoraSession[],
): readonly KoraProjectGroup[] {
  interface Mutable {
    kind: KoraProjectGroup["kind"];
    cwd: string | null;
    source: string | null;
    sessions: KoraSession[];
  }
  const groups = new Map<string, Mutable>();

  for (const session of sessions) {
    let key: string;
    let kind: KoraProjectGroup["kind"];
    let cwd: string | null = null;
    let source: string | null = null;
    if (session.harness === "hermes") {
      // hermes groups by SOURCE (blueprint-kw4 §1: cwd is honestly empty on
      // the bridge; the project tag carries `hermes:<source>`).
      const tag =
        typeof session.project === "string" && session.project.length > 0
          ? session.project
          : null;
      if (tag === null) {
        key = KORA_GROUP_NO_CWD;
        kind = "none";
      } else {
        key = tag;
        kind = "source";
        source = tag.startsWith(HERMES_SOURCE_PREFIX)
          ? tag.slice(HERMES_SOURCE_PREFIX.length)
          : tag;
      }
    } else if (typeof session.cwd === "string" && session.cwd.length > 0) {
      key = session.cwd;
      kind = "cwd";
      cwd = session.cwd;
    } else {
      key = KORA_GROUP_NO_CWD;
      kind = "none";
    }
    let group = groups.get(key);
    if (group === undefined) {
      group = { kind, cwd, source, sessions: [] };
      groups.set(key, group);
    }
    group.sessions.push(session);
  }

  const nodes = [...groups.entries()].map(([key, group]) => ({
    key,
    kind: group.kind,
    cwd: group.cwd,
    source: group.source,
    hasLive: group.sessions.some((session) => session.state === "live"),
    sessions: sortKoraSessions(group.sessions),
    freshest: Math.max(...group.sessions.map(freshestTs)),
  }));
  nodes.sort(
    (a, b) =>
      Number(b.hasLive) - Number(a.hasLive) ||
      b.freshest - a.freshest ||
      a.key.localeCompare(b.key),
  );
  return nodes.map(({ freshest: _freshest, ...node }) => node);
}
