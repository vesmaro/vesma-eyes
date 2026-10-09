import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { TableRowSkeleton } from "@/components/skeletons/Skeletons";
import type {
  AssignmentItem,
  ExecutorItem,
  ExecutorListMeta,
} from "@/gateway/boardTypes";
import { isAgentsSource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import { useT } from "@/i18n";
import { useBoardTasks } from "@/features/tasks/useTasks";
import { useValidationNow } from "@/features/tasks/useValidationClock";
import { AgentsUnsupported } from "./AgentsUnsupported";
import { AssignmentDrawer } from "./AssignmentDrawer";
import { AssignmentStateBadge } from "./AssignmentStateBadge";
import { ExecutorSheet } from "./ExecutorSheet";
import {
  PRESENCE_DOT,
  PRESENCE_TEXT,
  formatPulseAge,
  lastSeenAgeS,
  presenceFromLastSeen,
  presenceLabelKey,
} from "./presence";
import { usePresenceFlash } from "./presenceLight";
import { activeAssignmentForExecutor, groupExecutorsByHost } from "./rosterModel";
import { useAssignments, useExecutors } from "./useAgents";
import { useAssignmentMutations } from "./useAssignmentMutations";
import { pageGridClass } from "@/layout/pageGrid";

/**
 * `/agents/hosts` — «Хосты» (ME-014, product verdict 2026-09-27): the agent
 * ROSTER, now the section's default landing (/agents replace-redirects
 * here; /agents/execution and /agents/harnesses keep their paths — nothing
 * breaks). One host group per reported host with an «N/M online» header;
 * the grouping is a CLIENT-SIDE projection of the same
 * `GET /api/executors` page the registry reads (rosterModel.ts) — no new
 * endpoint, no server-side grouping (anti-scope).
 *
 * One row answers three things and NOTHING more (zero registry-field
 * duplication, zero mutations — approve/revoke/enable live in
 * /agents/harnesses, version is ME-015's honest server work): the presence
 * dot + ticking last_seen age STRICTLY off the server meta TTLs
 * (presence.ts, the shared 1 Hz ticker), the enabled/state badge (a green
 * dot never means «может взять задачу» — the badge carries the refusal),
 * and the active-assignment chip (client join with `GET /api/assignments`;
 * no active work renders the honest «простаивает»).
 *
 * Drill-down reuses the EXISTING surfaces, not a new screen: a row with
 * active work opens the AssignmentDrawer (the assignment + the link into
 * the task's live execution feed — «сессия»); an idle row opens the
 * ExecutorSheet (the registry card as-is).
 */
export function HostsRosterPage() {
  const t = useT();
  const gateway = useGateway();
  const capable = isAgentsSource(gateway);
  const executors = useExecutors();
  const assignments = useAssignments();
  const board = useBoardTasks();
  // The AssignmentDrawer is the EXISTING execution drill-down — its cancel
  // goes through the same gated mutation the execution page uses. The
  // ROSTER surface itself renders zero action buttons.
  const mutations = useAssignmentMutations();
  // Shared 1 Hz ticker (SSR snapshot 0 — ages render client-side only).
  const now = useValidationNow();

  // Drill-down state: exactly one of the two existing drawers at a time.
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [drawerRow, setDrawerRow] = useState<AssignmentItem | null>(null);

  const items = useMemo(() => executors.data?.items ?? [], [executors.data]);
  const meta = executors.data?.meta;
  const assignmentItems = useMemo(
    () => assignments.data?.items ?? [],
    [assignments.data],
  );

  // Host projection — recomputes on the ticker so «N/M online» stays live.
  const groups = useMemo(
    () => groupExecutorsByHost(items, meta, now),
    [items, meta, now],
  );

  const executorName = (id: string): string =>
    items.find((row) => row.id === id)?.name ?? id;
  const titleOf = (taskId: string): string =>
    (board.data?.tasks ?? []).find((task) => task.id === taskId)?.title || taskId;

  const openRow = (executor: ExecutorItem): void => {
    const active = activeAssignmentForExecutor(assignmentItems, executor.id);
    if (active) setDrawerRow(active);
    else setSheetId(executor.id);
  };

  if (!capable) {
    return <AgentsUnsupported />;
  }

  return (
    <div className={pageGridClass("operational", "flex flex-col gap-3")}>
      {/* ME-072 C: the visible h1 on the page axis (the pattern-A posture of
       * Sessions/Tasks pages) — the section's default landing reads its name.
       * The nav key is the source («Хосты»), the roster title stays for the
       * a11y outline parity. */}
      <h1 className="text-xl font-semibold">{t("nav.agentsHosts")}</h1>

      {executors.isPending ? (
        <div role="status" aria-label={t("agents.roster.loading")}>
          <TableRowSkeleton rows={4} columns={3} />
        </div>
      ) : executors.isError ? (
        <EmptyState
          variant="error"
          title={t("agents.roster.failed")}
          message={executors.error.message}
          action={
            <Button variant="outline" onClick={() => void executors.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          variant="empty"
          title={t("agents.roster.emptyTitle")}
          message={t("agents.roster.emptyMessage")}
          action={
            <Button asChild variant="outline">
              <Link to="/agents/harnesses">{t("agents.roster.emptyAction")}</Link>
            </Button>
          }
        />
      ) : (
        groups.map((group) => (
          <section
            key={group.host || "__unreported__"}
            aria-label={group.label ?? t("agents.roster.hostUnknown")}
          >
            {/* Group header: host name + «N/M online» (the verdict's live
             * counter — presence only, dispatch eligibility never folds
             * into it). */}
            <h2 className="flex items-baseline gap-1.5 text-xs font-medium text-foreground-secondary">
              {group.label ?? t("agents.roster.hostUnknown")}
              <span className="font-mono font-normal text-foreground-muted">
                {t("agents.roster.onlineCounter", {
                  online: group.online,
                  total: group.members.length,
                })}
              </span>
            </h2>
            {/* U6 (v12 canon hosts.html §07c): the roster is a GRID of host
             * cards (auto-fill ≥240px), not stacked slim rows. */}
            <ul className="mt-1 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
              {group.members.map((executor) => (
                <RosterCard
                  key={executor.id}
                  executor={executor}
                  assignment={activeAssignmentForExecutor(assignmentItems, executor.id)}
                  titleOf={titleOf}
                  meta={meta}
                  now={now}
                  onOpen={() => openRow(executor)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {/* The existing drill-downs (ME-014 verdict: no new screen). */}
      <AssignmentDrawer
        row={drawerRow}
        executorName={executorName}
        onCancel={(row) => mutations.cancelAssignment(row)}
        /* Unreachable by construction: the roster opens the drawer ONLY
         * for active rows (queued/claimed/running) — failed/expired retries
         * live on the task and execution surfaces. */
        onRetry={() => undefined}
        onClose={() => setDrawerRow(null)}
      />
      {sheetId !== null ? (
        <ExecutorSheet
          executorId={sheetId}
          open
          onOpenChange={(open) => {
            if (!open) setSheetId(null);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * One roster card — the v12 host-card dress (hosts.html §07c: well surface,
 * hairline border, name over meta lines) over the SAME ME-014 facts:
 * presence + badge + chip, one click target, ZERO action buttons (the
 * registry owns the mutations). Everything the card shows is a status;
 * every field beyond status lives in the drill-down cards.
 *
 * U6 присутствие-свет: the card carries the visible presence WORD (the v12
 * pill canon — the same fact the SR heard before) and flares ONCE on a
 * real executor.online/offline transition (presenceLight.ts; impulse
 * 240+400ms, amplitude ≤0.18, reduced = instant static tint). No pulse,
 * no breathing — a silent bus leaves the card standing. The ticking
 * last_seen age is DATA (the shared 1 Hz ticker), not motion.
 */
function RosterCard({
  executor,
  assignment,
  titleOf,
  meta,
  now,
  onOpen,
}: {
  executor: ExecutorItem;
  assignment: AssignmentItem | undefined;
  titleOf: (taskId: string) => string;
  meta: ExecutorListMeta | undefined;
  now: number;
  onOpen: () => void;
}) {
  const t = useT();
  const flash = usePresenceFlash(executor.id);
  const revoked = executor.state === "revoked";
  const pending = executor.state === "pending";
  const disabled = executor.state === "approved" && !executor.enabled;
  // Presence STRICTLY from the server meta TTLs (§5.1) — the dot and the
  // age both tick off the shared clock; unknown renders the honest
  // non-verdict (never a guess).
  const presence = presenceFromLastSeen(executor.last_seen, meta, now);
  const presenceKey = presence ?? "unknown";
  const ageS = lastSeenAgeS(executor.last_seen, now);
  const pulseAge =
    ageS !== null && presence !== null
      ? formatPulseAge(ageS, {
          minutes: t("agents.age.unitMinutes"),
          hours: t("agents.age.unitHours"),
          days: t("agents.age.unitDays"),
        })
      : "";

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={
          "flex min-h-11 w-full flex-col items-start gap-1 rounded-lg border bg-well p-3 text-left text-sm shadow-well transition-colors duration-instant hover:border-iris-bright/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright " +
          // The one-shot presence flare (event-driven, never background):
          // success tone for an arrival, warning for a departure.
          (flash
            ? flash.tone === "online"
              ? "agents-presence-online "
              : "agents-presence-offline "
            : "") +
          (revoked
            ? "border-border-subtle text-foreground-muted"
            : "border-border-subtle")
        }
      >
        {/* Presence line (v12 pill canon): dot + visible verdict, the mono
         * last_seen age right-aligned. The visible word IS the SR text
         * (WCAG 1.4.1) — no hidden duplicate; the age keeps its explicit
         * «последний доклад» prefix (data, not a stopwatch). */}
        <span className="flex w-full items-center gap-1.5">
          <span aria-hidden="true" className="flex items-center">
            <span
              className={
                "size-2 shrink-0 rounded-full " +
                (PRESENCE_DOT[presenceKey] ?? PRESENCE_DOT.unknown)
              }
            />
          </span>
          <span
            className={
              "shrink-0 text-xs " +
              (PRESENCE_TEXT[presenceKey] ?? PRESENCE_TEXT.unknown)
            }
          >
            {t(presenceLabelKey(presenceKey))}
          </span>
          <span className="ml-auto truncate text-right font-mono text-xs tabular-nums text-foreground-muted">
            {t("agents.strip.lastSeen")}: {pulseAge || t("agents.executor.neverSeen")}
          </span>
        </span>
        <span className="flex w-full items-center gap-1.5">
          <span className="min-w-0 truncate font-medium">{executor.name}</span>
          {/* The dispatch-refusal badges: a green dot never means «может
           * взять задачу» — the badge states WHY not (the registry's keys,
           * the roster's compact labels; no field duplication). */}
          {disabled ? (
            <Badge
              variant="outline"
              title={t("agents.executor.disabledReason")}
              className="font-normal"
            >
              {t("agents.roster.disabledBadge")}
            </Badge>
          ) : null}
          {pending ? (
            <Badge
              variant="outline"
              title={t("agents.executor.pendingReason")}
              className="font-normal"
            >
              {t("agents.roster.pendingBadge")}
            </Badge>
          ) : null}
          {revoked ? (
            <Badge
              variant="outline"
              title={t("agents.registry.revokedHint")}
              className="font-normal"
            >
              {t("agents.roster.revokedBadge")}
            </Badge>
          ) : null}
        </span>
        {/* The active-assignment chip (client join): task title + state.
         * No active work → the honest «простаивает». */}
        {assignment ? (
          <span className="flex w-full min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-xs text-foreground-secondary">
              {titleOf(assignment.task_id)}
            </span>
            <AssignmentStateBadge state={assignment.state} />
          </span>
        ) : (
          <span className="w-full truncate text-xs text-foreground-muted">
            {t("agents.roster.idle")}
          </span>
        )}
      </button>
    </li>
  );
}
