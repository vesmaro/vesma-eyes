import type {
  ActivityBucket,
  ActivityItem,
  ActivityType,
} from "@/gateway/boardTypes";
import { activityTypeOfKind, isActivityKind, isActivityType } from "@/gateway/boardTypes";

/**
 * URL-param contract for `/tasks/activity` (UI-28 spec §5.3: ALL list state
 * lives in the URL — `?type=&agent=&host=&task_id=&from=&to=` — a bookmark
 * or a direct open reproduces the exact view, including after F5).
 *
 * - `type` is a csv of families and/or exact kinds; unknown tokens are
 *   DROPPED (same honesty as taskFilters.ts — the list never renders a
 *   filter it cannot speak), never 422 here (that is the wire's job);
 * - `from`/`to` are ISO datetimes bounding the window (the histogram's
 *   click-through filter). They apply CLIENT-side to the merged feed — the
 *   server contract (§3.2) has no window params, and the cursor keeps
 *   paging back honestly until the window's floor passes out of the data
 *   (`windowExhausted`).
 *
 * Pure parse/serialize/merge helpers, shared by the page, the filter
 * controls and the tests.
 */

/** Client-visible filter state (all optional = unfiltered). */
export interface ActivityUrlState {
  /** csv of families and/or exact kinds (`task,report`). */
  type?: string;
  agent?: string;
  host?: string;
  task_id?: string;
  /** Window start (ISO); set by the histogram click-through. */
  from?: string;
  /** Window end, exclusive (ISO). */
  to?: string;
}

/** Families in display order (the three filter chips, spec §2.1). */
export const ACTIVITY_FAMILIES = ["task", "assignment", "report"] as const satisfies readonly ActivityType[];

export function parseActivityUrlState(params: URLSearchParams): ActivityUrlState {
  const from = parseIso(params.get("from"));
  const to = parseIso(params.get("to"));
  return {
    type: sanitizeTypeCsv(params.get("type") ?? undefined),
    agent: nonEmpty(params.get("agent")),
    host: nonEmpty(params.get("host")),
    task_id: nonEmpty(params.get("task_id")),
    from,
    to,
  };
}

export function serializeActivityUrlState(state: ActivityUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.type) params.set("type", state.type);
  if (state.agent) params.set("agent", state.agent);
  if (state.host) params.set("host", state.host);
  if (state.task_id) params.set("task_id", state.task_id);
  if (state.from) params.set("from", state.from);
  if (state.to) params.set("to", state.to);
  return params;
}

/** True when any filter narrows the feed (drives the honest empty copy). */
export function hasActiveActivityFilters(state: ActivityUrlState): boolean {
  return Boolean(state.type || state.agent || state.host || state.task_id || state.from || state.to);
}

/** Split the csv into valid tokens (families + exact kinds), deduped. */
export function activityTypeTokens(state: ActivityUrlState): string[] {
  const tokens = (state.type ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter((token) => isActivityType(token) || isActivityKind(token));
  return [...new Set(tokens)];
}

/**
 * Client-side filter for the MERGED feed (cursor pages + live prepend).
 * Everything the URL can express applies here; `agent` matches the actor
 * grammar and the executor id, `host` the row's resolved host (absent host
 * = no match while the host filter is on — an honest gap, not a guess).
 */
export function filterActivityItem(row: ActivityItem, state: ActivityUrlState): boolean {
  const tokens = activityTypeTokens(state);
  if (tokens.length > 0) {
    const family = activityTypeOfKind(row.kind);
    const hit = tokens.some(
      (token) => token === row.kind || (isActivityType(token) && token === family),
    );
    if (!hit) return false;
  }
  if (state.task_id && row.task_id !== state.task_id) return false;
  if (state.agent) {
    const actor = row.actor ?? "";
    const machineId = actor.startsWith("machine:") ? actor.slice("machine:".length) : "";
    if (row.executor_id !== state.agent && machineId !== state.agent) return false;
  }
  if (state.host && row.host !== state.host) return false;
  const ts = Date.parse(row.ts);
  if (!Number.isNaN(ts)) {
    if (state.from && ts < Date.parse(state.from)) return false;
    if (state.to && ts >= Date.parse(state.to)) return false;
  }
  return true;
}

/**
 * The one merge rule of the feed (spec §5.2 / §8.8): pages and live rows
 * interleave newest-first with NO duplicates and NO row shifts on prepend.
 * Dedupe is by id first (server ids are unique) and by FACT KEY second
 * (`kind|task|second-ts`) — a refetched page re-covering a live row drops
 * the live copy, the server id wins.
 */
export function mergeActivityRows(
  pages: readonly ActivityItem[],
  live: readonly ActivityItem[],
  cap = 500,
): ActivityItem[] {
  const seenIds = new Set<string>();
  const seenFacts = new Set<string>();
  const out: ActivityItem[] = [];
  for (const row of [...pages, ...live]) {
    if (seenIds.has(row.id)) continue;
    const fact = activityFactKey(row);
    if (seenFacts.has(fact)) continue;
    seenIds.add(row.id);
    seenFacts.add(fact);
    out.push(row);
  }
  out.sort(
    (a, b) => Date.parse(b.ts) - Date.parse(a.ts) || compareNumericIds(b.id, a.id),
  );
  return out.length > cap ? out.slice(0, cap) : out;
}

/**
 * Fact identity of one row: same kind on the same task within the same
 * second is the SAME event whether it arrived via GET (server id) or SSE
 * (client receipt id). The live-side ts is the receipt time — a couple of
 * seconds late at worst; the second-bucket keeps the honest caveat that a
 * boundary-straddling duplicate can survive. Accepted in v1: it needs the
 * same event re-delivered ≈1 s after its GET, twice.
 */
export function activityFactKey(row: ActivityItem): string {
  const second = Math.floor(Date.parse(row.ts) / 1000);
  return `${row.kind}|${row.task_id}|${Number.isNaN(second) ? row.ts : second}`;
}

/** Numeric-aware id compare ("9" sorts below "10"). */
function compareNumericIds(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b);
}

function parseIso(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const ts = Date.parse(raw);
  return Number.isNaN(ts) ? undefined : new Date(ts).toISOString();
}

function sanitizeTypeCsv(csv: string | undefined): string | undefined {
  if (!csv) return undefined;
  const tokens = activityTypeTokens({ type: csv });
  return tokens.length > 0 ? tokens.join(",") : undefined;
}

function nonEmpty(value: string | null): string | undefined {
  return value !== null && value.length > 0 ? value : undefined;
}

// --- histogram axis helpers (Ф2, spec §4 variant A) ----------------------------

/** One axis slot of the pulse chart: the bucket data joined over a full axis. */
export interface ActivityPulseSlot {
  /** Slot start (ISO). */
  readonly ts: string;
  readonly total: number;
  readonly by_type: { readonly task: number; readonly assignment: number; readonly report: number };
}

/**
 * Build the FULL hour axis (one slot per hour, oldest → newest, ending at
 * the current hour) and join the sparse server buckets onto it. Slots the
 * server has no data for are honest zero slots — the axis never depends on
 * the wire's density.
 */
export function buildPulseAxis(
  buckets: readonly ActivityBucket[],
  nowMs: number,
  slotCount = 24,
): ActivityPulseSlot[] {
  const HOUR = 60 * 60 * 1000;
  const currentHour = Math.floor(nowMs / HOUR) * HOUR;
  const byTs = new Map<string, ActivityBucket>();
  for (const bucket of buckets) byTs.set(bucket.ts, bucket);
  const slots: ActivityPulseSlot[] = [];
  for (let index = slotCount - 1; index >= 0; index -= 1) {
    const ts = new Date(currentHour - index * HOUR).toISOString();
    const hit = byTs.get(ts);
    slots.push({
      ts,
      total: hit?.total ?? 0,
      by_type: {
        task: hit?.by_type.task ?? 0,
        assignment: hit?.by_type.assignment ?? 0,
        report: hit?.by_type.report ?? 0,
      },
    });
  }
  return slots;
}

/**
 * Coalesce the axis for narrow screens: pairs of hour slots → `count` two-hour
 * slots (24 → 12, spec §7 mobile minimum).
 */
export function coalescePulseSlots(
  slots: readonly ActivityPulseSlot[],
  groupSize: number,
): ActivityPulseSlot[] {
  if (groupSize <= 1) return [...slots];
  const out: ActivityPulseSlot[] = [];
  for (let index = 0; index < slots.length; index += groupSize) {
    const group = slots.slice(index, index + groupSize);
    out.push({
      ts: group[0].ts,
      total: group.reduce((sum, slot) => sum + slot.total, 0),
      by_type: group.reduce(
        (acc, slot) => ({
          task: acc.task + slot.by_type.task,
          assignment: acc.assignment + slot.by_type.assignment,
          report: acc.report + slot.by_type.report,
        }),
        { task: 0, assignment: 0, report: 0 },
      ),
    });
  }
  return out;
}
