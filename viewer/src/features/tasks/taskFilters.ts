import type { BoardTask } from "@/gateway/boardTypes";
import { isTaskPriority, isTaskStatus } from "./taskStatus";

/**
 * URL-param contract for `/tasks` (QA verdict §3: list state lives in the
 * URL — deep links + F5 reproduce the exact view). `?status=&priority=
 * &project=&agent=&q=`; unknown dictionary values are dropped (the same
 * honesty as listParams.ts for /memory). Pure parse/serialize/filter helpers
 * shared by the filter controls and the list page.
 *
 * ME-075 adds the date dialect: `?created_from=&created_to=&completed_from=
 * &completed_to=` — YYYY-MM-DD bounds (inclusive; the same semantics as the
 * server's /api/board listing params, evaluated client-side over the ONE
 * cached board fetch per the ARCHCOM-3 verdict).
 */

/** YYYY-MM-DD shape guard (the value is never range-checked — an inverted
 * range simply matches nothing, the honest empty state). */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface TaskListUrlState {
  status?: TaskListStatus;
  priority?: string;
  project?: string;
  agent?: string;
  q?: string;
  /** ME-075: arrival bounds (поступила), YYYY-MM-DD inclusive. */
  created_from?: string;
  created_to?: string;
  /** ME-075: completion bounds (завершена), YYYY-MM-DD inclusive. */
  completed_from?: string;
  completed_to?: string;
  /**
   * ME-071 W3 (15-WOW §3.4): the «Ждут владельца» facade — `?waiting=1`
   * narrows every view of the dialect to the owner's decision lane
   * (`col === "validating"` — the SAME lane useWaitingSummary counts as
   * reviewCount). A shared-dialect param on purpose: the list honouring
   * it too keeps a deep link honest on both views.
   */
  waiting?: boolean;
}

type TaskListStatus = string;

export function parseTaskListParams(params: URLSearchParams): TaskListUrlState {
  const status = params.get("status") ?? undefined;
  const priority = params.get("priority") ?? undefined;
  return {
    status: status && isTaskStatus(status) ? status : undefined,
    priority: priority && isTaskPriority(priority) ? priority : undefined,
    project: nonEmpty(params.get("project") ?? undefined),
    agent: nonEmpty(params.get("agent") ?? undefined),
    q: nonEmpty(params.get("q") ?? undefined),
    created_from: dayParam(params.get("created_from")),
    created_to: dayParam(params.get("created_to")),
    completed_from: dayParam(params.get("completed_from")),
    completed_to: dayParam(params.get("completed_to")),
    waiting: params.get("waiting") === "1" || undefined,
  };
}

/** Serialize back into params, omitting empty values (clean URLs). */
export function serializeTaskListParams(state: TaskListUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.status) params.set("status", state.status);
  if (state.priority) params.set("priority", state.priority);
  if (state.project) params.set("project", state.project);
  if (state.agent) params.set("agent", state.agent);
  if (state.q) params.set("q", state.q);
  if (state.created_from) params.set("created_from", state.created_from);
  if (state.created_to) params.set("created_to", state.created_to);
  if (state.completed_from) params.set("completed_from", state.completed_from);
  if (state.completed_to) params.set("completed_to", state.completed_to);
  if (state.waiting) params.set("waiting", "1");
  return params;
}

/** True when any filter narrows the list (drives the empty-state copy). */
export function hasActiveTaskFilters(state: TaskListUrlState): boolean {
  return Boolean(
    state.status || state.priority || state.project || state.agent || state.q ||
      state.created_from || state.created_to ||
      state.completed_from || state.completed_to || state.waiting,
  );
}

/**
 * Client-side filter over the board projection. The board wire is small (a
 * few dozen rows), so ONE cached `tasks.board` fetch is filtered locally —
 * no per-filter refetch, no cache fragmentation (ARCHCOM-3 verdict §3).
 *
 * Date bounds compare the UTC calendar day of the wire stamps (the server
 * bounds behave the same way); tasks with no completion stamp never match
 * a completion bound.
 */
export function filterTasks(
  tasks: readonly BoardTask[],
  state: TaskListUrlState,
): BoardTask[] {
  const q = state.q?.toLowerCase();
  return tasks.filter((task) => {
    if (state.status && task.status !== state.status) return false;
    if (state.priority && task.priority !== state.priority) return false;
    if (state.project && task.project !== state.project) return false;
    if (state.agent && !(task.agents ?? []).includes(state.agent)) return false;
    // ME-071 W3: the waiting facade — only the owner's decision lane.
    if (state.waiting && task.col !== "validating") return false;
    if (q) {
      const haystack = `${task.id} ${task.title} ${task.summary}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    const createdDay = dayOfIso(task.created_at);
    if (state.created_from && (!createdDay || createdDay < state.created_from)) {
      return false;
    }
    if (state.created_to && (!createdDay || createdDay > state.created_to)) {
      return false;
    }
    if (state.completed_from || state.completed_to) {
      const stamp = task.resolved_at || task.done_at || "";
      const day = dayOfIso(stamp);
      if (!day) return false;
      if (state.completed_from && day < state.completed_from) return false;
      if (state.completed_to && day > state.completed_to) return false;
    }
    return true;
  });
}

/** Distinct project names across tasks (filter dropdown options). */
export function projectOptions(tasks: readonly BoardTask[]): string[] {
  return [...new Set(tasks.map((task) => task.project).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Distinct agent slugs across tasks (filter dropdown options). */
export function agentOptions(tasks: readonly BoardTask[]): string[] {
  const agents = new Set<string>();
  for (const task of tasks) for (const agent of task.agents ?? []) agents.add(agent);
  return [...agents].sort((a, b) => a.localeCompare(b));
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

/** URL day param: kept only in the exact YYYY-MM-DD shape (garbage in the
 * URL is dropped, not half-interpreted). */
function dayParam(value: string | null): string | undefined {
  return value && DAY_RE.test(value) ? value : undefined;
}

/** UTC calendar day of a wire stamp ('' when missing/unparsable). */
function dayOfIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}
