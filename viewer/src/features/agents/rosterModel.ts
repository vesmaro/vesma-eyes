import type {
  AssignmentItem,
  AssignmentLifecycleState,
  ExecutorItem,
  ExecutorLifecycleState,
  ExecutorListMeta,
  ExecutorPresence,
} from "@/gateway/boardTypes";
import { ACTIVE_ASSIGNMENT_STATES } from "./assignmentStatus";
import { lastSeenAgeS, presenceFromLastSeen } from "./presence";

/**
 * ME-014 roster model — the HOST projection of the executor registry (the
 * product-verdict 2026-09-27): grouping is a CLIENT-SIDE projection of the
 * SAME `GET /api/executors` page the registry and the strip read — no new
 * endpoint, no server-side grouping (anti-scope). Presence counts come from
 * the server-owned meta TTLs (presence.ts) at the caller's `now` — never a
 * hardcoded threshold, and never the registry `enabled` flag (the two-clock
 * rule §2.1: presence and dispatch eligibility are independent facts).
 *
 * The assignment chip join reads the SHARED unfiltered
 * `GET /api/assignments` projection (the one cache entry the strip, the
 * execution list and the task tabs already observe). An assignment is THIS
 * executor's active work when the executor claimed it
 * (`claimed_by_executor`) or was explicitly pinned to it before the claim
 * (`executor_id`, still unclaimed). Auto-routed queue rows belong to NO
 * executor yet — an unclaimed, unpinned executor is honestly idle.
 */

export interface HostGroup {
  /** The wire host string ('' = the executor never reported one). */
  readonly host: string;
  /** Display name: the wire host verbatim, or null when not reported. */
  readonly label: string | null;
  /** The host's agents, name-ordered (stable, testable). */
  readonly members: readonly ExecutorItem[];
  /** Members whose meta-TTL presence is `online` at `now`. */
  readonly online: number;
}

/**
 * Group executors by the host they reported. Groups sort by host name;
 * the «never reported» bucket sinks last (least specific). Members sort by
 * name — a deterministic order the tests (and the eye) can rely on.
 */
export function groupExecutorsByHost(
  items: readonly ExecutorItem[],
  meta: ExecutorListMeta | undefined,
  now: number,
): HostGroup[] {
  const buckets = new Map<string, ExecutorItem[]>();
  for (const item of items) {
    const bucket = buckets.get(item.host);
    if (bucket) bucket.push(item);
    else buckets.set(item.host, [item]);
  }
  const byName = (a: ExecutorItem, b: ExecutorItem): number =>
    a.name.localeCompare(b.name);
  return [...buckets.entries()]
    .map(([host, members]) => ({
      host,
      label: host === "" ? null : host,
      members: [...members].sort(byName),
      online: members.filter(
        (member) => presenceFromLastSeen(member.last_seen, meta, now) === "online",
      ).length,
    }))
    .sort((a, b) => {
      if (a.label === null) return 1;
      if (b.label === null) return -1;
      return a.label.localeCompare(b.label);
    });
}

/** Chip order: the work in hand leads (running → claimed → queued), then
 * the newest attempt. One chip per row — the roster answers «чем занят
 * сейчас», the full history stays on the task surfaces. */
const CHIP_PRECEDENCE: Record<AssignmentLifecycleState, number> = {
  running: 0,
  claimed: 1,
  queued: 2,
  // Terminal states never enter the chip filter (ACTIVE_ASSIGNMENT_STATES
  // gates the join) — the full map only satisfies the type.
  done: 3,
  failed: 3,
  cancelled: 3,
  expired: 3,
};

/**
 * The ACTIVE assignment to show on one executor's roster row (the client
 * join with the queue). undefined = the honest «простаивает», never a
 * guessed or recycled row.
 */
export function activeAssignmentForExecutor(
  items: readonly AssignmentItem[],
  executorId: string,
): AssignmentItem | undefined {
  const mine = items.filter(
    (row) =>
      ACTIVE_ASSIGNMENT_STATES.includes(row.state) &&
      (row.claimed_by_executor === executorId ||
        // Pinned before the claim: the routing already named THIS executor.
        (row.claimed_by_executor === "" && row.executor_id === executorId)),
  );
  return [...mine].sort(
    (a, b) =>
      CHIP_PRECEDENCE[a.state] - CHIP_PRECEDENCE[b.state] ||
      b.created_at.localeCompare(a.created_at),
  )[0];
}

// --- the HOST projection (agents-redesign A1, blueprint 2026-10-09) -----------
// A «host» on /agents/hosts is a CLIENT-SIDE projection of the executor
// registry (no host API exists in the engine — anti-scope, anti-invention):
// every host fact below is an aggregate over the group's REAL member rows.
// Fabricated host telemetry (OS / uptime / IP) is forbidden and impossible
// from this module — there is no such field to aggregate.

/**
 * The URL id of a host group. The «never reported a host» bucket ('' on the
 * wire) travels under the __unreported__ sentinel so the route parameter is
 * never empty (`/agents/hosts/` would collide with the section root).
 */
export const UNREPORTED_HOST_ID = "__unreported__";

export function hostRouteId(group: HostGroup): string {
  return group.host === "" ? UNREPORTED_HOST_ID : group.host;
}

/**
 * Host presence — the aggregate of the members' meta-TTL verdicts at `now`:
 * online when ANY member is online; stale when none is online but one skips
 * the pulse; offline when every member is beyond the offline bound; unknown
 * when the server contract (meta) is absent. Pure aggregation — the same
 * two-clock rule as the member rows (presence ≠ dispatch eligibility).
 */
export function hostPresence(
  group: HostGroup,
  meta: ExecutorListMeta | undefined,
  now: number,
): ExecutorPresence | null {
  if (group.members.length === 0) return null;
  const verdicts = group.members.map((member) =>
    presenceFromLastSeen(member.last_seen, meta, now),
  );
  if (verdicts.includes("online")) return "online";
  if (verdicts.includes("stale")) return "stale";
  // meta absent → every verdict is null: the honest non-verdict.
  if (verdicts.some((verdict) => verdict === null)) return null;
  return "offline";
}

/**
 * The ATTENTION ladder over the members' server-computed lifecycle states
 * (`ExecutorItem.status`, UXE-2). A mixed host shows ONE pill: the highest-
 * precedence member state, ordered by what needs the owner's eye first —
 * the pending DECISION, the transient install, the unverified newcomer, the
 * gone-quiet, the long-gone, then the living, the owner-disabled and the
 * revoked tail. The N/M online stat next to it carries the presence
 * breakdown — the pill never hides a partially-alive host's numbers.
 * null = no member carries a lifecycle object (pre-UXE-2 board) — the UI
 * falls back to the presence reading, never guesses a state.
 */
const HOST_LIFECYCLE_PRECEDENCE: readonly ExecutorLifecycleState[] = [
  "awaiting-approval",
  "provisioning",
  "awaiting-first-report",
  "silent",
  "offline",
  "online",
  "disabled",
  "revoked",
];

export function hostLifecycle(group: HostGroup): ExecutorLifecycleState | null {
  const states = group.members
    .map((member) => member.status?.state)
    .filter((state): state is ExecutorLifecycleState => typeof state === "string");
  if (states.length === 0) return null;
  return HOST_LIFECYCLE_PRECEDENCE.find((state) => states.includes(state)) ?? null;
}

/** The A1 «Требуют внимания» filter: silent + offline + awaiting-* (the
 * blueprint's own set; provisioning/disabled/revoked are NOT attention). */
const ATTENTION_STATES: readonly ExecutorLifecycleState[] = [
  "awaiting-approval",
  "awaiting-first-report",
  "silent",
  "offline",
];

export function hostNeedsAttention(group: HostGroup): boolean {
  const state = hostLifecycle(group);
  return state !== null && ATTENTION_STATES.includes(state);
}

/**
 * The host is pending a REGISTRATION DECISION: any member sits in
 * awaiting-approval (or, on pre-UXE-2 boards, carries the pending registry
 * state). Such a row wears the «ждёт решения» pill instead of the presence
 * word — the owner's action, not the wire state, is the verdict.
 */
export function hostAwaitingDecision(group: HostGroup): boolean {
  return group.members.some(
    (member) =>
      member.status?.state === "awaiting-approval" ||
      (member.status === undefined && member.state === "pending"),
  );
}

/** «Приглушённая строка»: every member is revoked — the host is dead access. */
export function hostRevoked(group: HostGroup): boolean {
  return (
    group.members.length > 0 &&
    group.members.every((member) => member.state === "revoked")
  );
}

/**
 * The host's freshest report age (seconds): the MINIMUM member age — the
 * host «reported» when its most recent agent did. null = no parsable
 * last_seen in the group (honest absence, never a fake 0).
 */
export function hostLastReportAgeS(group: HostGroup, now: number): number | null {
  const ages = group.members
    .map((member) => lastSeenAgeS(member.last_seen, now))
    .filter((age): age is number => age !== null);
  return ages.length > 0 ? Math.min(...ages) : null;
}

/**
 * The host's active work — the chip join across ALL members (the per-
 * executor join, deduplicated and precedence-ordered: running → claimed →
 * queued, newest first). Empty = the host is honestly idle.
 */
export function activeAssignmentsForHost(
  items: readonly AssignmentItem[],
  group: HostGroup,
): AssignmentItem[] {
  const seen = new Set<number>();
  const chips: AssignmentItem[] = [];
  for (const member of group.members) {
    const active = activeAssignmentForExecutor(items, member.id);
    if (active && !seen.has(active.id)) {
      seen.add(active.id);
      chips.push(active);
    }
  }
  return chips.sort(
    (a, b) =>
      CHIP_PRECEDENCE[a.state] - CHIP_PRECEDENCE[b.state] ||
      b.created_at.localeCompare(a.created_at),
  );
}
