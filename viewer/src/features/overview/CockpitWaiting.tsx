import { Link } from "react-router";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { isAgentsSource, isTaskSource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import { useTaskInbox, useBoardTasks } from "@/features/tasks/useTasks";
import { useAssignments } from "@/features/agents/useAgents";
import { useT } from "@/i18n";

/**
 * «Что ждёт меня» — the cockpit's waiting block (UX-overhaul §3 + persona
 * round 1, Ф2): ONE summary number-action — how much is waiting in total
 * (inbox + tasks sitting in «на проверке» + queued runs) — whose click
 * leads to the MOST URGENT list (inbox → review → queue), with the quiet
 * per-source rows as links under it (each figure leads to its list, §9.1).
 * The owner's language: «на проверке», never the internal «validating».
 *
 * Anti-dashboard rules: the block renders only when the total is non-zero;
 * empty sources contribute nothing; a first-load renders a same-height
 * skeleton; an error renders an HonestLine with a retry — never a silent
 * disappearance. The block needs BOTH capabilities (task + agents): with
 * fewer, the honest state is absence (the real adapter matrix always has
 * both or neither).
 */
export function CockpitWaiting() {
  const t = useT();
  const gateway = useGateway();
  const capable = isTaskSource(gateway) && isAgentsSource(gateway);
  const inbox = useTaskInbox();
  const board = useBoardTasks();
  const assignments = useAssignments();

  if (!capable) return null;

  if (inbox.isPending || board.isPending || assignments.isPending) {
    return (
      <section aria-labelledby="overview-waiting-title" className="space-y-3">
        <h2 id="overview-waiting-title" className="text-lg font-semibold text-foreground">
          {t("cockpit.waitingTitle")}
        </h2>
        <div role="status" aria-label={t("cockpit.waitingTitle")}>
          <Skeleton className="h-8 w-full max-w-xs" />
        </div>
      </section>
    );
  }

  if (inbox.isError || board.isError || assignments.isError) {
    return (
      <section aria-labelledby="overview-waiting-title" className="space-y-3">
        <h2 id="overview-waiting-title" className="text-lg font-semibold text-foreground">
          {t("cockpit.waitingTitle")}
        </h2>
        <HonestLine
          tone="warning"
          action={
            <button
              type="button"
              onClick={() => {
                if (inbox.isError) void inbox.refetch();
                if (board.isError) void board.refetch();
                if (assignments.isError) void assignments.refetch();
              }}
              className="inline-flex min-h-6 items-center gap-1 text-sm font-medium text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              {t("cockpit.retry")}
            </button>
          }
        >
          {t("cockpit.waitingError")}
        </HonestLine>
      </section>
    );
  }

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

  // Anti-dashboard: nothing waits — nothing renders.
  if (total === 0) return null;

  // The single summary action leads to the MOST URGENT list: the inbox
  // (owner decisions) first, then tasks awaiting review, then the run queue.
  const urgentTo =
    inboxCount > 0 ? "/tasks/inbox" : reviewCount > 0 ? "/tasks" : "/agents/execution";

  return (
    <section aria-labelledby="overview-waiting-title" className="space-y-3">
      <h2 id="overview-waiting-title" className="text-lg font-semibold text-foreground">
        {t("cockpit.waitingTitle")}
      </h2>
      <Link
        to={urgentTo}
        title={t("cockpit.waitingSummaryTitle")}
        className="inline-flex min-h-row-airy items-center gap-2 rounded-md border border-border-subtle bg-well px-4 shadow-well transition-colors duration-instant hover:border-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        <span className="font-mono text-2xl font-semibold text-iris-bright">{total}</span>
        <span className="text-sm font-medium text-foreground">
          {t("cockpit.waitingSummary", { count: total })}
        </span>
        <ArrowRight className="size-4 text-foreground-secondary" aria-hidden="true" />
      </Link>
      {/* Quiet per-source rows — each figure leads to its own list (§9.1);
       * a zero source renders no row (no counters for the sake of it). */}
      <ul className="flex flex-col gap-1 text-sm">
        {inboxCount > 0 ? (
          <li>
            <QuietRowLink to="/tasks/inbox">
              {t("cockpit.waitingInbox", { count: inboxCount })}
            </QuietRowLink>
          </li>
        ) : null}
        {reviewCount > 0 ? (
          <li>
            <QuietRowLink to="/tasks">
              {t("cockpit.waitingReview", { count: reviewCount })}
            </QuietRowLink>
          </li>
        ) : null}
        {queuedCount > 0 ? (
          <li>
            <QuietRowLink to="/agents/execution">
              {t("cockpit.waitingQueued", { count: queuedCount })}
            </QuietRowLink>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function QuietRowLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-6 items-center gap-1 text-foreground-secondary transition-colors duration-instant hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
    >
      {children}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}
