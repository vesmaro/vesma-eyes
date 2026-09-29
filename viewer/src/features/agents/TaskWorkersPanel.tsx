import { useCallback, useMemo } from "react";
import { Link } from "react-router";
import {
  useQuery,
  type QueryFunctionContext,
} from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { TableRowSkeleton } from "@/components/skeletons/Skeletons";
import type { ActivityPage, BoardTask } from "@/gateway/boardTypes";
import { isActivitySource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import { useI18n, useT } from "@/i18n";
import { keys } from "@/lib/queryKeys";
import { GC_TIMES, STALE_TIMES } from "@/lib/queryClient";
import { formatTaskDate } from "@/features/tasks/taskStatus";
import { collectContributors, MAX_WORKER_VERBS } from "./taskWorkersModel";
import { useExecutors } from "./useAgents";

/**
 * «Кто работал» (UI-31) — the attribution block of the «Исполнение» tab for
 * tasks with NO assignments. The owner's pain (TB-1: done, but the tab says
 * «Поручений ещё нет» — with whom to settle accounts?): the assignments
 * queue is NOT the only execution record. The per-task activity feed
 * (`GET /api/activity?task_id=`, UI-28) carries the AUTH-2 actor grammar on
 * every event (`ui` | `device:<id> <name>` | `machine:<executor_id>` |
 * `machine:board`); unique actors of that feed ARE the people and machines
 * who worked the task.
 *
 * Recon fact (UI-31, 2026-09-29): `GET /api/tasks/{id}/history` does NOT
 * expose actor (EventItem = ts/title/detail only) — the activity feed is the
 * single wire source of attribution. One deep page (limit 200, the server's
 * hard cap) is enough: a task's own audit depth.
 *
 * Honesty ladder (spec §2.3: an absent actor is an honest absence):
 * - gateway without the activity read → «журнал недоступен в этом режиме»
 *   (a disabled query is pending FOREVER — never a skeleton there);
 * - feed rows exist and carry actors → the contributor list (resolved names,
 *   verb digest, last-seen stamp); `has_more`/`truncated` surfaces the
 *   «последние 200 событий» window caveat — older contributors may exist;
 * - rows exist but NONE carries an actor → «атрибуция не велась до 1.35»
 *   (pre-1.35 audit records + stripped anonymous legs are indistinguishable
 *   by contract — one honest line covers both);
 * - no rows at all → «событий по задаче нет».
 *
 * Declared `agents` (the task's own chips) ride along as the DECLARED side —
 * separate from the OBSERVED activity attribution, never merged.
 */

/** Deep single page: the server clamps at 200 — the task's whole depth. */
const WORKERS_PAGE_LIMIT = 200;

/**
 * The panel. `reportsHref`/`reportsCount` come from the detail page (the
 * reports query is already loaded there) — the «отчётов: N →» jump to the
 * «Отчёты» tab. Absent href → no jump rendered (standalone test mounts).
 */
export function TaskWorkersPanel({
  task,
  reportsHref,
  reportsCount,
}: {
  task: BoardTask;
  reportsHref?: string;
  reportsCount?: number;
}) {
  const t = useT();
  const { lang } = useI18n();
  const gateway = useGateway();
  const capable = isActivitySource(gateway);
  const executors = useExecutors();
  const executorNameOf = useCallback(
    (id: string): string | undefined =>
      (executors.data?.items ?? []).find((row) => row.id === id)?.name,
    [executors.data],
  );

  // BE-15 discipline: stable queryKey (module factory, constant params) +
  // stable queryFn identity (useCallback) — no observer churn on re-render.
  const queryKey = useMemo(
    () => keys.tasks.activity.list({ task_id: task.id, limit: WORKERS_PAGE_LIMIT }),
    [task.id],
  );
  const queryFn = useCallback(
    ({ signal }: QueryFunctionContext): Promise<ActivityPage> => {
      if (!isActivitySource(gateway)) {
        throw new Error("TaskWorkersPanel: gateway has no activity capability.");
      }
      return gateway.activity({ task_id: task.id, limit: WORKERS_PAGE_LIMIT }, signal);
    },
    [gateway, task.id],
  );
  const feed = useQuery({
    queryKey,
    queryFn,
    enabled: capable,
    staleTime: STALE_TIMES.taskActivity,
    gcTime: GC_TIMES.taskActivity,
  });

  if (!capable) {
    // P2-1 (UI-31 review): a gateway WITHOUT the activity read leaves the
    // query disabled — isPending forever. The honest unavailable state
    // (the TasksUnsupported pattern, panel-sized) instead of a skeleton
    // that would never resolve.
    return (
      <section aria-label={t("tasks.workersLabel")}>
        <WorkersHeading />
        <EmptyState
          variant="empty"
          title={t("tasks.workersUnavailableTitle")}
          message={t("tasks.workersUnavailableMessage")}
        />
      </section>
    );
  }
  if (feed.isPending) {
    return (
      <section aria-label={t("tasks.workersLabel")}>
        <WorkersHeading />
        <div role="status" aria-label={t("tasks.workersLoading")}>
          <TableRowSkeleton rows={2} columns={2} />
        </div>
      </section>
    );
  }
  if (feed.isError) {
    return (
      <section aria-label={t("tasks.workersLabel")}>
        <WorkersHeading />
        <EmptyState
          variant="error"
          title={t("tasks.workersFailed")}
          message={feed.error.message}
          action={
            <Button variant="outline" onClick={() => void feed.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      </section>
    );
  }

  const rows = feed.data?.items ?? [];
  // `attributed` drives the honesty ladder: rows without a single actor are
  // the pre-1.35 / stripped-legs case, zero rows is the never-executed case.
  const { contributors, attributed } = collectContributors(rows, executorNameOf);
  const noAttributionAtAll = rows.length > 0 && attributed === 0;
  // P2-2 (UI-31 review): the one deep page is a WINDOW. A task with more
  // events than the page carried may have older contributors we never saw —
  // say so instead of implying the list is complete.
  const windowPartial = feed.data?.has_more === true || feed.data?.truncated === true;

  return (
    <section aria-label={t("tasks.workersLabel")}>
      <WorkersHeading />
      {contributors.length > 0 ? (
        <ul className="space-y-1.5" aria-label={t("tasks.workersLabel")}>
          {contributors.map((contributor) => (
            <li
              key={contributor.actor}
              className="rounded-md border border-border-subtle bg-well px-3 py-2 text-sm shadow-well"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium" title={contributor.actor}>
                  {contributor.labelKey ? t(contributor.labelKey) : contributor.name}
                </span>
                <span className="ml-auto whitespace-nowrap font-mono text-xs text-foreground-muted">
                  {t("tasks.workersLast", {
                    time: formatTaskDate(contributor.lastTs, lang),
                  })}
                </span>
              </div>
              <p className="mt-1 text-xs text-foreground-secondary">
                {t("tasks.workersEvents", { count: contributor.events })}
                {contributor.verbKeys.length > 0
                  ? ` · ${contributor.verbKeys
                      .slice(0, MAX_WORKER_VERBS)
                      .map((verbKey) => t(verbKey))
                      .join(" · ")}${
                      contributor.verbKeys.length > MAX_WORKER_VERBS
                        ? ` +${contributor.verbKeys.length - MAX_WORKER_VERBS}`
                        : ""
                    }`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          variant="empty"
          title={t("tasks.workersEmptyTitle")}
          message={
            noAttributionAtAll
              ? t("tasks.workersNoAttribution")
              : t("tasks.workersEmpty")
          }
        />
      )}

      {windowPartial ? (
        <p className="mt-1.5 text-xs text-foreground-muted">
          {t("tasks.workersPartial", { limit: WORKERS_PAGE_LIMIT })}
        </p>
      ) : null}

      {/* The DECLARED side: the task's own agent chips (observed attribution
       * above is the activity feed's; the two are different facts). */}
      {(task.agents ?? []).length > 0 ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-foreground-secondary">
          <span>{t("tasks.workersAgents")}:</span>
          {(task.agents ?? []).map((agent) => (
            <Badge key={agent} variant="default">
              {t("tasks.agentChip", { agent })}
            </Badge>
          ))}
        </p>
      ) : null}

      {reportsHref !== undefined && reportsCount !== undefined ? (
        <p className="mt-2 text-xs">
          {/* P3-1 (UI-31 review): a router Link, not a raw <a> — the jump
           * stays an SPA transition, consistent with the tab links. */}
          <Link
            to={reportsHref}
            className="text-iris-bright underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
          >
            {t("tasks.workersReportsLink", { count: reportsCount })}
          </Link>
        </p>
      ) : null}
    </section>
  );
}

function WorkersHeading() {
  const t = useT();
  return (
    <h3 className="mb-1.5 text-sm font-medium text-foreground-secondary">
      {t("tasks.workersLabel")}
    </h3>
  );
}
