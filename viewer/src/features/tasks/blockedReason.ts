import type { AssignmentItem, BoardTask } from "@/gateway/boardTypes";
import type { TranslationKey } from "@/i18n";

// The terminal-row projection (terminalReasonAssignmentOf) lives beside its
// sibling activeAssignmentOf in features/agents/assignmentStatus.ts — one
// home for the assignments-list projections; this module only words them.

/**
 * U3 blocked-reason dictionary (SPEC-2026-10-07, домен «Задачи», «заново —
 * blocked-кромка с причиной»; 15-WOW §3.4 п.4: «Блокировка честная: кромка-
 * причина — паттерн v11 Обзора, переносим сюда»).
 *
 * The wire's TaskOut carries NO blocked-note field, so the reason is DERIVED
 * from data the client already holds — never invented:
 *
 *   1. a terminal assignment (failed/expired) of this task — the server
 *      itself moves fail/expired → blocked (server/store.py _FINISH_TASK_
 *      TARGET), so its outcome IS the reason; the row's `note` (the fail
 *      report's human line or the reaper's verdict) is the most human text
 *      there is and wins when present;
 *   2. a queued assignment with routing.reason "unmatched" — no eligible
 *      executor route exists (fixture TB-5: the honest «ждёт исполнителя»);
 *   3. the task names no agents — nothing was ever assigned;
 *   4. the fallback — the generic v11 line (tasks.board.blockedReason).
 *
 * Pure and total: the CALLER decides to render (the component gates on the
 * blocked column/status); this module only translates data into words.
 */

/** One derived blocked reason: the visible line plus optional server note. */
export interface BlockedReason {
  /** The human line to render (dictionary wording or the server's note). */
  readonly text: string;
  /** The assignment note when it adds context beyond the visible line —
   * rides as the tooltip (the v12 stand's title=blockedNote pattern). */
  readonly note?: string;
}

type Translate = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string;

/**
 * Resolve the human reason for a blocked task. `queuedUnrouted` = the task's
 * active assignment is queued with routing.reason "unmatched" (the caller
 * reads it off the SAME shared assignments cache — no extra wire call).
 */
export function blockedReasonOf(
  task: Pick<BoardTask, "agents">,
  terminal: Pick<AssignmentItem, "state" | "note"> | undefined,
  queuedUnrouted: boolean,
  t: Translate,
): BlockedReason {
  if (terminal?.state === "failed") {
    const note = terminal.note?.trim();
    if (note) return { text: note };
    return { text: t("tasks.blocked.failed") };
  }
  if (terminal?.state === "expired") {
    const note = terminal.note?.trim();
    // The reaper's note is technician-speak («reaper: 30 мин без пульса»);
    // the dictionary line stays visible, the note rides as the tooltip.
    return note
      ? { text: t("tasks.blocked.expired"), note }
      : { text: t("tasks.blocked.expired") };
  }
  if (queuedUnrouted) return { text: t("tasks.blocked.unrouted") };
  if ((task.agents ?? []).length === 0) {
    return { text: t("tasks.blocked.unassigned") };
  }
  return { text: t("tasks.board.blockedReason") };
}
