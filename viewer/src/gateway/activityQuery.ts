import type {
  ActivityBucket,
  ActivityBucketParams,
  ActivityItem,
  ActivityParams,
  ActivityType,
  ActivityBuckets,
  ActivityPage,
} from "./boardTypes";
import { activityTypeOfKind, isActivityKind, isActivityType } from "./boardTypes";

/**
 * Reference semantics of `GET /api/activity` (UI-28 spec §3.2) as ONE pure
 * module. The MockAdapter serves its corpus through these functions and the
 * BoardAdapter parity tests drive a fetch stub through the very same module —
 * both adapters answer identical scenarios identically by construction, and
 * the wire mapping (query string → params) is tested separately on the HTTP
 * side.
 *
 * Contract pins (spec §3.2):
 * - `before_id` is a STRICTLY-LOWER cursor on the monotonic audit id — pages
 *   stay stable while live events prepend new rows;
 * - `limit` default 50, hard cap 200 with a silent clamp + `truncated: true`
 *   (the `GET /api/reports` convention, CV-6); non-positive → the caller's
 *   422 problem, the pure layer treats it as the default (a mock is not an
 *   error-state theatre);
 * - `type=` accepts a csv of families and/or exact kinds; garbage values are
 *   a 422 server-side — here they are dropped (same honesty as the client
 *   URL parser), never a crash;
 * - `task_id=` is an exact filter; an unknown task is an EMPTY PAGE 200,
 *   never a 404 («фильтр, не ресурс»);
 * - `agent=` matches declared identity AND the `machine:<id>` actor leg;
 * - `host=` is best-effort against the row's read-time host;
 * - the bucket view (`?bucket=hour&hours=24`) applies the same filters and
 *   returns SPARSE buckets (hours WITH events only, oldest → newest) — the
 *   chart builds the full axis client-side and fills the gaps with zeros.
 */

/** Default page size and the hard cap (spec §3.2). */
export const ACTIVITY_DEFAULT_LIMIT = 50;
export const ACTIVITY_MAX_LIMIT = 200;

/** Bucket view constants (the only shape v1 ships). */
export const ACTIVITY_BUCKET_SIZE_MS = 60 * 60 * 1000;
export const ACTIVITY_DEFAULT_HOURS = 24;

/**
 * True when the row matches the `type=` csv item: a family matches the row's
 * family, an exact kind matches verbatim. Unknown tokens match nothing
 * (server-side they 422 the whole request).
 */
function matchesTypeToken(row: ActivityItem, token: string): boolean {
  if (isActivityType(token)) return activityTypeOfKind(row.kind) === token;
  if (isActivityKind(token)) return row.kind === token;
  return false;
}

/** Narrow a raw csv into matching tokens; a csv with ANY garbage is dropped
 * client-side (the HTTP caller will have received 422 already). */
export function parseActivityTypeCsv(csv: string | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/** The four server-side filters (pure; order-preserving). */
export function filterActivityRows(
  rows: readonly ActivityItem[],
  params: Pick<ActivityParams, "type" | "task_id" | "agent" | "host">,
): ActivityItem[] {
  const typeTokens = parseActivityTypeCsv(params.type);
  return rows.filter((row) => {
    if (typeTokens.length > 0 && !typeTokens.some((t) => matchesTypeToken(row, t))) {
      return false;
    }
    if (params.task_id !== undefined && params.task_id !== "" && row.task_id !== params.task_id) {
      return false;
    }
    if (params.agent !== undefined && params.agent !== "" && !matchesAgent(row, params.agent)) {
      return false;
    }
    if (params.host !== undefined && params.host !== "" && row.host !== params.host) {
      return false;
    }
    return true;
  });
}

/**
 * `agent=` semantics (spec §3.2): matches the declared identity — the
 * `machine:<id>` actor leg — and rows that carry the executor id directly.
 */
function matchesAgent(row: ActivityItem, agent: string): boolean {
  if (row.executor_id === agent) return true;
  const actor = row.actor;
  if (actor === undefined) return false;
  return actor === `machine:${agent}`;
}

/**
 * Newest-first cursor page over the FILTERED rows: `before_id` keeps ids
 * strictly below the cursor, `limit` slices with the cap convention above.
 */
export function pageActivityRows(
  rows: readonly ActivityItem[],
  params: Pick<ActivityParams, "before_id" | "limit">,
): ActivityPage {
  const sorted = [...rows].sort((a, b) => compareById(a.id, b.id));
  const afterCursor =
    params.before_id !== undefined && params.before_id !== ""
      ? sorted.filter((row) => idBelow(row.id, params.before_id ?? ""))
      : sorted;
  const requested =
    params.limit !== undefined && params.limit > 0
      ? Math.min(Math.floor(params.limit), ACTIVITY_MAX_LIMIT)
      : ACTIVITY_DEFAULT_LIMIT;
  const truncated =
    params.limit !== undefined &&
    params.limit > 0 &&
    Math.floor(params.limit) > ACTIVITY_MAX_LIMIT;
  const items = afterCursor.slice(0, requested);
  return {
    items,
    has_more: afterCursor.length > items.length,
    ...(truncated ? { truncated: true } : {}),
  };
}

/** Numeric-aware compare of the monotonic string ids ("9" < "10"), newest
 * first ("1000" sorts above "999"). */
function compareById(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
  return b.localeCompare(a);
}

/** True when id `a` is STRICTLY below cursor id `b` (numeric when possible). */
function idBelow(a: string, b: string): boolean {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na < nb;
  return a.localeCompare(b) < 0;
}

/**
 * Sparse hourly buckets over the FILTERED rows inside the last `hours`
 * window (default 24). Only hours with events come back, oldest first.
 */
export function bucketActivityRows(
  rows: readonly ActivityItem[],
  params: Pick<ActivityBucketParams, "bucket" | "hours">,
  now: number,
): ActivityBuckets {
  if (params.bucket !== undefined && params.bucket !== "hour") {
    return { buckets: [] };
  }
  const hours =
    params.hours !== undefined && params.hours > 0
      ? Math.min(Math.floor(params.hours), 24 * 30)
      : ACTIVITY_DEFAULT_HOURS;
  const windowStart = now - hours * ACTIVITY_BUCKET_SIZE_MS;
  const acc = new Map<number, { total: number; by_type: Record<ActivityType, number> }>();
  for (const row of rows) {
    const ts = Date.parse(row.ts);
    if (Number.isNaN(ts) || ts < windowStart || ts > now) continue;
    const hourStart = Math.floor(ts / ACTIVITY_BUCKET_SIZE_MS) * ACTIVITY_BUCKET_SIZE_MS;
    let entry = acc.get(hourStart);
    if (!entry) {
      entry = { total: 0, by_type: { task: 0, assignment: 0, report: 0 } };
      acc.set(hourStart, entry);
    }
    entry.total += 1;
    entry.by_type[activityTypeOfKind(row.kind)] += 1;
  }
  const buckets: ActivityBucket[] = [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hourStart, entry]) => ({
      ts: new Date(hourStart).toISOString(),
      total: entry.total,
      by_type: { ...entry.by_type },
    }));
  return { buckets };
}
