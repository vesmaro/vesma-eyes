import type { BoardEvent } from "@/gateway/events";

/**
 * UI-28 live buffer (spec §3.1/§5.2, pattern `executionFeedStore` with a
 * backfill): the module-level NEWEST-FIRST buffer of live activity rows the
 * task-domain SSE bridge feeds — the ONE /api/events stream of /tasks
 * (TasksLayout → useTaskEvents) is the only writer besides the tests. The
 * page reads the store through useSyncExternalStore and MERGES it with the
 * `GET /api/activity` cursor pages (activityUrl.mergeActivityRows) — it
 * never opens an EventSource of its own.
 *
 * Rows folded here are CLIENT-SIDE projections of the event frame: ids are
 * receipt-unique (`live:` prefix), timestamps are receipt times (report
 * keeps its wire created_at) — a refetched page re-covering the same fact
 * dedupes by the fact key, and the server id wins (activityUrl.ts).
 *
 * `streamState`/`lastDataAt` mirror the bridge connection so the live
 * indicator and the amber «данные на HH:MM» marker have one source of truth.
 */

/** Client buffer cap (spec §5.2/§7: ≤500 — oldest evicted, quietly). */
export const ACTIVITY_BUFFER_CAP = 500;

/** One live row of the buffer. */
export interface ActivityLiveItem {
  readonly id: string;
  readonly ts: string;
  readonly kind: string;
  readonly task_id: string;
  readonly actor?: string;
  readonly executor_id?: string;
  readonly detail?: string;
  readonly report_kind?: "intermediate" | "final";
}

type Listener = () => void;

export type ActivityStreamState = "connecting" | "open" | "closed" | "none";

interface ActivityStoreState {
  items: ActivityLiveItem[];
  seq: number;
  streamState: ActivityStreamState;
  lastDataAt: number;
  /** Bumped every time the stream RECOVERS (open after a drop). */
  reconnects: number;
  /** False until the FIRST open — recoveries are counted only after it. */
  everOpened: boolean;
  listeners: Set<Listener>;
}

const state: ActivityStoreState = {
  items: [],
  seq: 0,
  streamState: "none",
  lastDataAt: 0,
  reconnects: 0,
  everOpened: false,
  listeners: new Set(),
};

/**
 * useSyncExternalStore compares snapshots with Object.is — the read hook
 * MUST hand back the SAME object between mutations, so the snapshot is
 * materialised once per change (a fresh literal per read would re-render
 * forever; ME-006 freeze discipline).
 */
export interface ActivityLiveSnapshot {
  readonly items: readonly ActivityLiveItem[];
  readonly streamState: ActivityStreamState;
  readonly lastDataAt: number;
  readonly reconnects: number;
}

function makeSnapshot(): ActivityLiveSnapshot {
  return {
    items: state.items,
    streamState: state.streamState,
    lastDataAt: state.lastDataAt,
    reconnects: state.reconnects,
  };
}

let snapshot: ActivityLiveSnapshot = makeSnapshot();

function emit(): void {
  snapshot = makeSnapshot();
  for (const listener of [...state.listeners]) listener();
}

function readString(payload: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Fold one board event into a live activity row (spec §2.1 v1 dictionary:
 * `task.*`, `assignment.*`, `report`). Actor rides the additive §A.5 field
 * on task.* frames; assignment rows take the declared identity of the
 * embedded assignment (claimed_by → created_by → machine executor), report
 * rows the reporting agent — the exact UI-10 semantics, task-centred.
 * Null for everything else (hello, notification, executor.*, …).
 */
export function activityItemFromEvent(
  event: BoardEvent,
  receivedAt: number,
  seq: number,
): ActivityLiveItem | null {
  const payload = event as Readonly<Record<string, unknown>>;
  const kind = event.kind;
  const ts = new Date(receivedAt).toISOString();

  const wireTaskId = readString(payload, "task_id");

  if (kind === "report") {
    const report = (payload.report ?? {}) as Readonly<Record<string, unknown>>;
    const created = typeof report.created_at === "string" ? report.created_at : ts;
    const reportKind = report.kind === "final" ? "final" : "intermediate";
    if (wireTaskId === undefined) return null;
    return {
      id: `live:report-${wireTaskId}-${seq}`,
      ts: created,
      kind,
      task_id: wireTaskId,
      actor: readString(report, "agent") ?? readString(payload, "actor"),
      detail: readString(report, "body"),
      report_kind: reportKind,
    };
  }

  if (kind.startsWith("assignment.")) {
    const assignment = (payload.assignment ?? {}) as Readonly<Record<string, unknown>>;
    const executorId = readString(assignment, "executor_id");
    if (wireTaskId === undefined) return null;
    return {
      id: `live:${kind}-${String(assignment.id ?? "")}-${seq}`,
      ts,
      kind,
      task_id: wireTaskId,
      actor:
        readString(assignment, "claimed_by") ??
        readString(assignment, "created_by") ??
        (executorId !== undefined ? `machine:${executorId}` : readString(payload, "actor")),
      executor_id: executorId,
    };
  }

  if (kind.startsWith("task.")) {
    // §A.5: the actor rides the frame; full-row kinds also carry the task
    // (updated_at is the wire's best fact time — receipt time is the
    // honest fallback).
    const actor = readString(payload, "actor");
    const task = payload.task as Readonly<Record<string, unknown>> | undefined;
    const wireTs =
      typeof task?.updated_at === "string" && task.updated_at.length > 0
        ? task.updated_at
        : ts;
    const taskId = typeof task?.id === "string" ? task.id : (payload.task_id as string);
    if (typeof taskId !== "string" || taskId.length === 0) return null;
    return {
      id: `live:${kind}-${taskId}-${seq}`,
      ts: wireTs,
      kind,
      task_id: taskId,
      ...(actor !== undefined ? { actor } : {}),
    };
  }

  return null;
}

/** Bridge write port: fold one event into the buffer (non-feed events ignored). */
export function pushActivityEvent(event: BoardEvent, receivedAt = Date.now()): void {
  state.seq += 1;
  const item = activityItemFromEvent(event, receivedAt, state.seq);
  if (!item) return;
  state.items = [item, ...state.items].slice(0, ACTIVITY_BUFFER_CAP);
  state.lastDataAt = receivedAt;
  emit();
}

/** Bridge write port: mirror the SSE connection state; a recovery bumps the
 * reconnect counter (the page's refetch + fact-dedupe trigger). The FIRST
 * open never counts (queries just mounted fresh — agentsEvents precedent). */
export function setActivityStreamState(
  streamState: ActivityStreamState,
  at = Date.now(),
): void {
  state.streamState = streamState;
  if (streamState === "open") {
    state.lastDataAt = at;
    if (state.everOpened) state.reconnects += 1;
    state.everOpened = true;
  }
  emit();
}

/** Read the live snapshot (stable reference between mutations). */
export function readActivityLive(): ActivityLiveSnapshot {
  return snapshot;
}

/** Subscribe to buffer/stream changes; returns the unsubscribe. */
export function subscribeActivityLive(listener: Listener): () => void {
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

/** Test seam: wipe the singleton between tests. */
export function resetActivityStore(): void {
  state.items = [];
  state.seq = 0;
  state.streamState = "none";
  state.lastDataAt = 0;
  state.reconnects = 0;
  state.everOpened = false;
  state.listeners.clear();
  snapshot = makeSnapshot();
}
