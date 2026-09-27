import type {
  AssignmentItem,
  AssignmentLifecycleState,
  ExecutorItem,
  ExecutorListMeta,
} from "@/gateway/boardTypes";
import { ACTIVE_ASSIGNMENT_STATES } from "./assignmentStatus";
import { presenceFromLastSeen } from "./presence";

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
