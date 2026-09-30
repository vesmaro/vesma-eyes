import { useCallback } from "react";
import { isAgentsSource, isTaskSource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import { useTaskInbox, useBoardTasks } from "@/features/tasks/useTasks";
import { useAssignments } from "@/features/agents/useAgents";

/**
 * The waiting summary (blueprint §6.6 hero chip + the cockpit's «Что ждёт
 * меня» block share ONE read): how much is waiting in total — inbox + tasks
 * sitting in «на проверке» + queued runs — and where the single most urgent
 * list lives. Extracted from CockpitWaiting so the hero chip and the block
 * never drift apart (the same query keys → the shared cache, no extra wire).
 *
 * Honesty rules carry over: with fewer capabilities than task+agents the
 * summary is absent (the real adapter matrix always has both or neither),
 * a source error surfaces as `isError` — the owner decides; nobody renders
 * a silent partial sum.
 */
export interface WaitingSummary {
  /** Task + agents capabilities both present (the chip's precondition). */
  capable: boolean;
  /** Any of the three sources is still loading (no chip until settled). */
  isPending: boolean;
  /** Any source failed (the block shows the retry, the chip stays off). */
  isError: boolean;
  inboxCount: number;
  reviewCount: number;
  queuedCount: number;
  /** inbox + review + queued — the one number the owner's eyes land on. */
  total: number;
  /** The MOST URGENT list: inbox → review → queue. */
  urgentTo: string;
  /** Retry the failed sources (a no-op for the healthy ones). */
  retry: () => void;
}

export function useWaitingSummary(): WaitingSummary {
  const gateway = useGateway();
  const capable = isTaskSource(gateway) && isAgentsSource(gateway);
  const inbox = useTaskInbox();
  const board = useBoardTasks();
  const assignments = useAssignments();

  const isPending =
    capable && (inbox.isPending || board.isPending || assignments.isPending);
  const isError =
    capable && (inbox.isError || board.isError || assignments.isError);

  const inboxCount = inbox.data?.count ?? 0;
  // The owner's name for the validating column (persona round 1: blocks
  // immersion) — the count reads the board projection's columns.
  const reviewCount = (board.data?.tasks ?? []).filter(
    (task) => task.col === "validating",
  ).length;
  const queuedCount = (assignments.data?.items ?? []).filter(
    (row) => row.state === "queued",
  ).length;
  const total = inboxCount + reviewCount + queuedCount;
  const urgentTo =
    inboxCount > 0 ? "/tasks/inbox" : reviewCount > 0 ? "/tasks" : "/agents/execution";

  const retry = useCallback(() => {
    if (inbox.isError) void inbox.refetch();
    if (board.isError) void board.refetch();
    if (assignments.isError) void assignments.refetch();
  }, [inbox, board, assignments]);

  return {
    capable,
    isPending,
    isError,
    inboxCount,
    reviewCount,
    queuedCount,
    total,
    urgentTo,
    retry,
  };
}
