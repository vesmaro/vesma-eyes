import { Link } from "react-router";
import { ArrowRight, Bot, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { isAgentsSource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import { useAssignments, useExecutors } from "@/features/agents/useAgents";
import { useAutomationStatus } from "@/features/automation/useAutomation";
import { useT } from "@/i18n";

/**
 * «Кто занят» — the cockpit's live busy block (UX-overhaul §3, Ф2): ONE
 * aggregate line from EXISTING data — the executor registry (presence) and
 * the assignment queue (in progress / queued) — plus the entries it leads
 * to («Исполнение →», «Задачи →», «Все агенты →»). The SCHED-1-UI
 * auto-launch counter lives here now (it lost its solo block).
 *
 * Anti-dashboard rules (§3.1/§9.1): a gateway without the agents capability
 * renders NOTHING; zero approved agents render the honest «Агентов пока
 * нет» line WITH the connect action; an error renders an HonestLine with a
 * retry — the block never disappears silently; a partial failure renders
 * the live half and an HonestLine for the failed half (independent queries).
 */
export function CockpitBusy() {
  const t = useT();
  const gateway = useGateway();
  const capable = isAgentsSource(gateway);
  const executors = useExecutors();
  const assignments = useAssignments();
  const automation = useAutomationStatus();

  if (!capable) return null;

  if (executors.isPending || assignments.isPending) {
    return (
      <CockpitSection id="overview-busy" title={t("cockpit.busyTitle")}>
        <div role="status" aria-label={t("cockpit.busyTitle")}>
          {/* Skeleton of the SAME height as the aggregate line — no layout
           * shift when the data lands (§9.1 loading). */}
          <Skeleton className="h-6 w-full max-w-md" />
        </div>
      </CockpitSection>
    );
  }

  if (executors.isError && assignments.isError) {
    return (
      <CockpitSection id="overview-busy" title={t("cockpit.busyTitle")}>
        <HonestLine tone="warning" action={<RetryButton queries={[executors, assignments]} />}>
          {t("cockpit.busyError")}
        </HonestLine>
      </CockpitSection>
    );
  }

  const approved = (executors.data?.items ?? []).filter(
    (executor) => executor.state === "approved",
  );
  const online = approved.filter((executor) => executor.presence === "online").length;
  const items = assignments.data?.items ?? [];
  // «В работе» = the ≤1-active invariant states an executor actually holds
  // (claimed/running); queued is its own count (the two tiles of §3.1).
  const working = items.filter(
    (row) => row.state === "claimed" || row.state === "running",
  ).length;
  const queued = items.filter((row) => row.state === "queued").length;

  // Zero agents: the honest absence line WITH the connect action — the
  // block is not rendered, the line leads somewhere (§9.1 empty/zero).
  // Review P3-3: a FAILED queue must not be swallowed by that line — with
  // the registry empty AND the queue erroring, the render is the error's
  // HonestLine (the connect line would claim an emptiness we cannot prove).
  if (executors.isSuccess && approved.length === 0) {
    if (assignments.isError) {
      return (
        <CockpitSection id="overview-busy" title={t("cockpit.busyTitle")}>
          <HonestLine tone="warning" action={<RetryButton queries={[assignments]} />}>
            {t("cockpit.busyError")}
          </HonestLine>
        </CockpitSection>
      );
    }
    return (
      <CockpitSection id="overview-busy" title={t("cockpit.busyTitle")}>
        <HonestLine
          action={
            <Link
              to="/agents/harnesses"
              className="inline-flex min-h-12 md:min-h-6 items-center gap-1 text-sm font-medium text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {t("cockpit.agentsNoneAction")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          }
        >
          {t("cockpit.agentsNone")}
        </HonestLine>
      </CockpitSection>
    );
  }

  // The auto-launch counter (SCHED-1-UI): the server's OWN daily_used —
  // provably 0 while the engine is off, so the line does not render then.
  const autoLaunchesToday = automation.data?.daily_used ?? 0;
  const showAutoLaunches =
    automation.isSuccess && autoLaunchesToday > 0;

  return (
    <CockpitSection
      id="overview-busy"
      title={t("cockpit.busyTitle")}
      after={
        <Link
          to="/agents/hosts"
          className="inline-flex min-h-12 md:min-h-6 items-center gap-1 text-sm text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Bot className="size-4" aria-hidden="true" />
          {t("cockpit.busyAll")}
        </Link>
      }
    >
      <div className="flex flex-col gap-1.5">
        {/* div, not p: the partial-failure branch nests a block-level
         * HonestLine — valid HTML beats the one-liner (§9.1 partial). */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground-secondary">
          {/* Presence dot: colour never alone — the words carry the state. */}
          <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full bg-iris" />
          {executors.isError ? (
            <HonestLine
              tone="warning"
              action={<RetryButton queries={[executors]} />}
              className="border-0 bg-transparent px-0 py-0 shadow-none"
            >
              {t("cockpit.busyError")}
            </HonestLine>
          ) : (
            <Link
              to="/agents/hosts"
              className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {t("cockpit.busyOnline", { online, total: approved.length })}
            </Link>
          )}
          {assignments.isError ? (
            <HonestLine
              tone="warning"
              action={<RetryButton queries={[assignments]} />}
              className="border-0 bg-transparent px-0 py-0 shadow-none"
            >
              {t("cockpit.busyError")}
            </HonestLine>
          ) : (
            <>
              <span aria-hidden="true" className="text-foreground-muted">·</span>
              <Link
                to="/agents/execution"
                className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {t("cockpit.busyWorking", { count: working })}
              </Link>
              <span aria-hidden="true" className="text-foreground-muted">·</span>
              <Link
                to="/agents/execution"
                className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {t("cockpit.busyQueued", { count: queued })}
              </Link>
            </>
          )}
        </div>
        {showAutoLaunches ? (
          <p className="text-xs text-foreground-muted">
            {t("overview.autoLaunchesToday", { count: autoLaunchesToday })}
          </p>
        ) : null}
        {/* The block leads, it does not merely count (§3): entries into the
         * working surfaces the line speaks about. */}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            to="/agents/execution"
            className="inline-flex min-h-12 md:min-h-6 items-center gap-1 font-medium text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {t("nav.agentsExecution")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link
            to="/tasks"
            className="inline-flex min-h-12 md:min-h-6 items-center gap-1 font-medium text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {t("nav.tasks")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </CockpitSection>
  );
}

function CockpitSection({
  id,
  title,
  after,
  children,
}: {
  id: string;
  title: string;
  after?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
          {title}
        </h2>
        {after}
      </div>
      {children}
    </section>
  );
}

/** The retry action for an HonestLine error state (§9.1 error row): refetch
 * the failed queries — the block never disappears silently. */
function RetryButton({
  queries,
}: {
  queries: readonly { refetch: () => Promise<unknown> }[];
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => {
        for (const query of queries) void query.refetch();
      }}
      className="inline-flex min-h-12 md:min-h-6 items-center gap-1 text-sm font-medium text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <RefreshCw className="size-3.5" aria-hidden="true" />
      {t("cockpit.retry")}
    </button>
  );
}
