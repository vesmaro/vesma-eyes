import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import type { BoardEvent } from "@/gateway/events";
import type { BoardSummary, BoardTask, TaskReports } from "@/gateway/boardTypes";
import { isTaskEventSource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { pushActivityEvent, setActivityStreamState } from "./activityStore";
import {
  recordDoneTransit,
  TERMINAL_COLUMNS,
} from "./doneTransitStore";
import { feedLivingCourier } from "@/lib/livingFeed";

/**
 * SSE → cache mapping for the task domain (Ф2, ARCHCOM-3 verdict §3:
 * "SSE task.* → ТОЧЕЧНЫЙ патч кеша TanStack, НЕ refreshBoard-рефетч").
 *
 * The event dictionary is additive-only (ui-contract §11) — every handler
 * below touches ONLY the query keys the event actually affects:
 *
 * | event           | tasks.board                     | other keys                    |
 * |-----------------|---------------------------------|-------------------------------|
 * | task.created    | patch: append row + counts      | tasks.detail patched if cached|
 * | task.updated    | patch: replace row (archived=1  | tasks.detail patched if cached|
 * |                 | row → removed, never re-added)  |                               |
 * | task.moved      | patch: replace row + counts     | tasks.detail patched if cached|
 * | task.deleted    | patch: remove row + counts      | —                             |
 * | task.archived   | patch: remove row + counts      | tasks.archive* + detail inval.|
 * | task.unarchived | invalidated (no row in payload) | tasks.archive* + detail inval.|
 * | report          | —                               | reports patch + count bump    |
 *
 * The one honest exception is `task.unarchived`: its payload carries only
 * `task_id` (no task object), so the row cannot be patched — the board key
 * is marked stale and only ACTIVE observers refetch. Everything else is a
 * pure setQueryData patch; unknown/absent caches are left untouched.
 */

/** Recompute the per-column counts from the patched rows. */
function recount(board: BoardSummary, tasks: readonly BoardTask[]): BoardSummary {
  const counts: Record<string, number> = {};
  for (const column of board.columns) counts[column] = 0;
  for (const task of tasks) counts[task.col] = (counts[task.col] ?? 0) + 1;
  return { ...board, tasks, counts };
}

function patchBoardRow(queryClient: QueryClient, task: BoardTask): void {
  // ME5-1: an archived=1 row NEVER re-enters the board (GET /board filters
  // archived=0). The wire has no archived guard on PATCH — store.update_task
  // / move_task answer task.updated for archived rows too — so the mirror
  // routes such a row to REMOVAL: the cache must not contradict the server
  // with a phantom card (the ME-005 read-only contract, every client).
  if (task.archived === 1) {
    removeBoardRow(queryClient, task.id);
    return;
  }
  queryClient.setQueryData<BoardSummary>(keys.tasks.board(), (board) => {
    if (!board) return undefined; // never synthesise a board from an event
    const next = board.tasks.filter((row) => row.id !== task.id);
    next.push(task);
    return recount(board, next);
  });
}

function removeBoardRow(queryClient: QueryClient, taskId: string): void {
  queryClient.setQueryData<BoardSummary>(keys.tasks.board(), (board) => {
    if (!board) return undefined;
    const next = board.tasks.filter((row) => row.id !== taskId);
    if (next.length === board.tasks.length) return board; // not present — no-op
    return recount(board, next);
  });
}

/**
 * Mirror a full-row event into the single-task GET cache (BE-16 fallback,
 * ME-005: archived rows resolve there). The event carries the authoritative
 * TaskOut, so a PATCH — never invalidate — keeps the open detail page fresh
 * with no extra wire call; an entry that was never fetched stays absent
 * (same never-synthesise rule as the board).
 */
function patchDetailRow(queryClient: QueryClient, task: BoardTask): void {
  queryClient.setQueryData<BoardTask>(keys.tasks.detail(task.id), (cached) =>
    cached === undefined ? undefined : task,
  );
}

/**
 * ME-071 W3 (15-WOW §3.4/§8.5): a LIVE transition into a terminal column
 * feeds the done-transit store (tempo chip, card gold flash, board toast,
 * В1-pill ▸N) and drives the courier (slice 2: the gold bead up Ж2).
 * The previous column comes from the CACHE BEFORE the patch — a fresh page
 * whose first observed event already sits in a terminal column records
 * nothing (no replayed history, no phantom flash); a row the cache never
 * had is equally silent.
 *
 * Slice 2 (the перелёт beat): the card's viewport position is measured
 * HERE, before the cache patch re-renders the board — the one moment the
 * old position still exists in the DOM. No card on screen (another page,
 * filtered out) → no `from` → the card plays the static tint, no flight.
 */
function noteDoneTransit(
  queryClient: QueryClient,
  task: BoardTask,
): void {
  if (!TERMINAL_COLUMNS.has(task.col)) return;
  // Hardening (review fix): a malformed frame (the wire dictionary is
  // trusted upstream, but this is the recording boundary) must never reach
  // the store — «Задача «undefined» решена» in the live region is worse
  // than silence.
  if (typeof task.id !== "string" || task.id === "") return;
  if (typeof task.title !== "string" || task.title.trim() === "") return;
  const prev = queryClient
    .getQueryData<BoardSummary>(keys.tasks.board())
    ?.tasks.find((row) => row.id === task.id);
  if (!prev || prev.col === task.col) return;
  // DOM measurement only where a DOM exists (the unit suite drives the
  // mirror in a node env; SSR never runs the bridge) — without a document
  // the transit simply carries no `from`, the card plays the static tint.
  const el =
    typeof document === "undefined"
      ? null
      : document.querySelector<HTMLElement>(
          `[data-task-id="${CSS.escape(task.id)}"]`,
        );
  const from = el ? el.getBoundingClientRect() : null;
  recordDoneTransit({
    taskId: task.id,
    title: task.title,
    col: task.col,
    ...(from ? { from: { x: from.left, y: from.top } } : {}),
  });
  feedLivingCourier();
}

/**
 * Apply one board event to the task-domain caches. Pure with respect to the
 * injected client — unit-tested directly (see taskEvents.test.ts).
 */
export function applyTaskEventToCache(queryClient: QueryClient, event: BoardEvent): void {
  switch (event.kind) {
    case "task.created":
    case "task.updated":
    case "task.moved":
      // ME-071 W3: the transit check reads the PRE-patch cache — keep it
      // ahead of patchBoardRow.
      noteDoneTransit(queryClient, event.task);
      // All three carry the full task row — one surgical replace, board and
      // (when cached) detail alike.
      patchBoardRow(queryClient, event.task);
      patchDetailRow(queryClient, event.task);
      break;
    case "task.deleted":
      removeBoardRow(queryClient, event.task_id);
      break;
    case "task.archived":
      removeBoardRow(queryClient, event.task_id);
      // The archive listing changed server-side; refetch when it is watched.
      void queryClient.invalidateQueries({ queryKey: keys.tasks.archiveAll });
      // The cached detail (if the row was opened via the fallback) still says
      // archived=0 — mark stale instead of trusting the absent payload.
      void queryClient.invalidateQueries({ queryKey: keys.tasks.detail(event.task_id) });
      break;
    case "task.unarchived":
      // Payload has no task object — mark stale, never invent a row.
      void queryClient.invalidateQueries({ queryKey: keys.tasks.board() });
      void queryClient.invalidateQueries({ queryKey: keys.tasks.archiveAll });
      void queryClient.invalidateQueries({ queryKey: keys.tasks.detail(event.task_id) });
      break;
    case "report":
      applyReportEvent(queryClient, event.task_id, event.report);
      break;
    default:
      // hello / notification / server.changed / assignment.* — no task keys.
      break;
  }
}

/**
 * Patch the reports cache for one task. A cached detail page gets the new
 * row appended (chronological) with previous live finals flipped to
 * superseded when a `final` arrives (mirrors the server's supersede rule —
 * the SSE payload does not carry the superseded id list). The list-page
 * badge count lives under its own tiny key and is always bumped.
 */
function applyReportEvent(
  queryClient: QueryClient,
  taskId: string,
  report: Readonly<Record<string, unknown>>,
): void {
  const kind = typeof report.kind === "string" ? report.kind : "intermediate";
  queryClient.setQueryData<TaskReports>(keys.tasks.reports.detail(taskId), (cached) => {
    if (!cached) return undefined; // unvisited task — only the count bumps
    const row = { ...report } as TaskReports["items"][number];
    const items =
      kind === "final"
        ? cached.items.map((item) =>
            item.kind === "final" && !item.superseded ? { ...item, superseded: true } : item,
          )
        : [...cached.items];
    items.push(row);
    return { ...cached, count: items.length, items };
  });
  // The badge count mirrors the patched page when one exists (single source);
  // otherwise a plain increment seeds it for unvisited tasks.
  const patched = queryClient.getQueryData<TaskReports>(keys.tasks.reports.detail(taskId));
  if (patched) {
    queryClient.setQueryData(keys.tasks.reports.count(taskId), patched.count);
  } else {
    queryClient.setQueryData<number>(keys.tasks.reports.count(taskId), (count) =>
      typeof count === "number" ? count + 1 : 1,
    );
  }
}

/**
 * Domain events bridge: mounts ONE SSE stream for the /tasks subtree (see
 * TasksLayout) and routes every parsed event into the cache patcher above.
 * One stream, two sinks (agentsEvents.ts pattern): the cache patcher AND
 * the UI-28 activity live buffer (activityStore.ts — the /tasks/activity
 * page merges it over its GET pages; it never opens a second EventSource).
 * The bridge also mirrors the connection state into the store (live
 * indicator + amber marker) and refetches the activity queries on a
 * RECOVERY open — SSE is at-most-once, so the drop window may have missed
 * feed facts (§5.9 / UI-28 §8.7).
 *
 * Capability-gated — a gateway without `events()` (vesma mode) simply
 * never subscribes, and the pages keep their refetch-on-mount behaviour.
 */
export function useTaskEvents(): void {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  const openedRef = useRef(false);
  useEffect(() => {
    if (!isTaskEventSource(gateway)) return;
    const stream = gateway.events();
    const unsubscribe = stream.onAny((event) => {
      applyTaskEventToCache(queryClient, event);
      pushActivityEvent(event);
    });
    const unsubscribeState = stream.onStateChange((state) => {
      setActivityStreamState(state);
      // Initial connect must NOT refetch (queries just mounted fresh); only
      // a RECOVERY — open → drop → open — does (§5.9, UI-28 §8.7).
      if (state === "open" && openedRef.current) {
        void queryClient.invalidateQueries({ queryKey: keys.tasks.activity.all });
      }
      if (state === "open") openedRef.current = true;
    });
    return () => {
      unsubscribe();
      unsubscribeState();
      setActivityStreamState("closed");
      stream.close();
    };
  }, [gateway, queryClient]);
}
