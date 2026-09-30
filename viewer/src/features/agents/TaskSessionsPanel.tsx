import { Link } from "react-router";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { TableRowSkeleton } from "@/components/skeletons/Skeletons";
import type { BoardTask } from "@/gateway/boardTypes";
import { isAgentsSource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import { useT } from "@/i18n";
import { useValidationNow } from "@/features/tasks/useValidationClock";
import { formatAge } from "./assignmentStatus";
import {
  formatDuration,
  sessionLabel,
  sessionLiveness,
  sessionTranscriptHref,
} from "./taskSessionsModel";
import { useTaskSessions } from "./useAgents";

/**
 * «Специалисты и сессии» (ME-063, agents-ui-spec §6.2): the child level of
 * the «Исполнение» tab — the specialist sessions the task executor's AGENT
 * reported through the discovery leg (`GET /api/tasks/{id}/sessions`, the
 * `sessions[]` additive fact). The «Кто работал» block (UI-31) attributes
 * executor HOSTS; this block adds the spawned children beneath them.
 *
 * Row anatomy: liveness chip (dot + visible word — colour never carries the
 * verdict alone) · specialist (spawn registry name, native id fallback) ·
 * harness · tool-call counter · worked duration (mono, honest absence for a
 * live child) · ticking age off `started_at`. The row's second line is the
 * executor + the deep-link into the read-only transcript viewer (slice 2):
 * `/kora/{executor_id}:{native_id}` — the frozen glue id, no translation.
 *
 * Honesty ladder (spec §5 — nothing imitates loading, empty is an answer):
 * - gateway without the agents read → the honest unavailable plate (a
 *   disabled query stays pending FOREVER — never a skeleton there);
 * - facts exist → rows, oldest reported first (the server's frozen order);
 * - count 0 → «Агент ещё не отчитался о сессиях» — before the agent leg
 *   deploys that is EVERY task's honest state, not a breakage;
 * - 404/403/5xx → the error plate with the server's own verdict and Retry.
 */
export function TaskSessionsPanel({ task }: { task: BoardTask }) {
  const t = useT();
  const gateway = useGateway();
  const capable = isAgentsSource(gateway);
  // Shared 1 Hz ticker — 0 before the first subscribe (SSR-honest: no age
  // line), the same clock the tab's assignment rows use.
  const now = useValidationNow();
  const sessions = useTaskSessions(task.id);

  const heading = (
    <h3 className="mb-1.5 text-sm font-medium text-foreground-secondary">
      {t("tasks.sessionsLabel")}
    </h3>
  );

  if (!capable) {
    return (
      <section aria-label={t("tasks.sessionsLabel")} className="mt-3">
        {heading}
        <EmptyState
          variant="empty"
          title={t("tasks.sessionsUnavailableTitle")}
          message={t("tasks.sessionsUnavailableMessage")}
        />
      </section>
    );
  }
  if (sessions.isPending) {
    return (
      <section aria-label={t("tasks.sessionsLabel")} className="mt-3">
        {heading}
        <div role="status" aria-label={t("tasks.sessionsLoading")}>
          <TableRowSkeleton rows={2} columns={3} />
        </div>
      </section>
    );
  }
  if (sessions.isError) {
    return (
      <section aria-label={t("tasks.sessionsLabel")} className="mt-3">
        {heading}
        <EmptyState
          variant="error"
          title={t("tasks.sessionsFailed")}
          message={t("tasks.sessionsFailedMessage")}
          techDetail={sessions.error.message}
          action={
            <Button variant="outline" onClick={() => void sessions.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      </section>
    );
  }

  const facts = sessions.data?.items ?? [];

  return (
    <section aria-label={t("tasks.sessionsLabel")} className="mt-3">
      {heading}
      {facts.length === 0 ? (
        <EmptyState
          variant="empty"
          title={t("tasks.sessionsEmptyTitle")}
          message={t("tasks.sessionsEmptyMessage")}
        />
      ) : (
        <ul className="space-y-1.5" aria-label={t("tasks.sessionsLabel")}>
          {facts.map((fact) => {
            const live = sessionLiveness(fact) === "live";
            const age = formatAge(fact.started_at, now);
            const duration = formatDuration(fact.duration_s);
            return (
              <li
                key={fact.session_id}
                className="rounded-md border border-border-subtle bg-well px-3 py-2 text-sm shadow-well"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {/* Liveness chip: dot + VISIBLE word (WCAG 1.4.1 — the
                   * colour is decoration, the word is the verdict). */}
                  <span
                    className={
                      "inline-flex items-center gap-1.5 text-xs " +
                      (live ? "text-foreground-secondary" : "text-foreground-muted")
                    }
                  >
                    <span
                      aria-hidden="true"
                      className={
                        "size-2 shrink-0 rounded-full " +
                        (live ? "bg-success" : "border border-border bg-elevated")
                      }
                    />
                    {t(live ? "tasks.sessionsLive" : "tasks.sessionsIdle")}
                  </span>
                  <span
                    className="min-w-0 truncate font-medium"
                    title={fact.session_id}
                  >
                    {sessionLabel(fact)}
                  </span>
                  <span className="font-mono text-xs text-foreground-muted">
                    {fact.harness}
                  </span>
                  <span className="font-mono text-xs text-foreground-muted">
                    {t("tasks.sessionsToolCalls", { count: fact.tool_calls })}
                  </span>
                  {duration !== "" ? (
                    <span className="font-mono text-xs text-foreground-muted">
                      {duration}
                    </span>
                  ) : null}
                  <span className="ml-auto whitespace-nowrap font-mono text-xs text-foreground-muted">
                    {age
                      ? t("tasks.sessionsAge", {
                          age: `${age.display} ${t(age.unitKey)}`,
                        })
                      : ""}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {/* Host fact (spec §2.1): the executor that reported the
                   * child — the row's bridge to the hosts roster. */}
                  <span className="text-foreground-secondary">
                    {fact.executor_name !== ""
                      ? t("tasks.sessionsExecutor", { name: fact.executor_name })
                      : fact.executor_id}
                  </span>
                  {/* The requirement-3 deep-link: the EXISTING read-only
                   * viewer (slice 2), never a new content path. A host the
                   * board does not read answers its honest 404 coverage
                   * plate on the far side. */}
                  <Link
                    to={sessionTranscriptHref(fact)}
                    className="inline-flex shrink-0 items-center gap-1 text-iris-bright underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
                  >
                    <ExternalLink className="size-3" aria-hidden="true" />
                    {t("tasks.sessionsOpenTranscript")}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {facts.length > 0 ? (
        <p className="mt-1.5 text-xs text-foreground-muted">
          {t("tasks.sessionsReportedHint")}
        </p>
      ) : null}
    </section>
  );
}
