import { useCallback, useMemo, useState } from "react";
import { Link, Navigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AssignmentItem,
  ExecutorListMeta,
} from "@/gateway/boardTypes";
import { isAgentsSource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import { useT, type TranslationKey } from "@/i18n";
import { cn } from "@/lib/utils";
import { useBoardTasks } from "@/features/tasks/useTasks";
import { useValidationNow } from "@/features/tasks/useValidationClock";
import { KoraResizeHandle, seamPx } from "@/features/kora/KoraResizeHandle";
import { AgentsUnsupported } from "./AgentsUnsupported";
import { AssignmentStateBadge } from "./AssignmentStateBadge";
import {
  formatReportAge,
  isLifecycle,
  lifecycleLabelKey,
  lifecycleNextKey,
  lifecycleBadgeVariant,
  silentMaxAgeS,
} from "./lifecycle";
import {
  PRESENCE_DOT,
  PRESENCE_TEXT,
  formatPulseAge,
  presenceLabelKey,
} from "./presence";
import { usePresenceFlashFor } from "./presenceLight";
import {
  activeAssignmentsForHost,
  hostAwaitingDecision,
  hostLastReportAgeS,
  hostLifecycle,
  hostNeedsAttention,
  hostPresence,
  hostRevoked,
  hostRouteId,
  groupExecutorsByHost,
  type HostGroup,
} from "./rosterModel";
import { useAssignments, useExecutors } from "./useAgents";
import {
  AGENTS_SIDE_DEFAULT,
  AGENTS_SIDE_MAX,
  AGENTS_SIDE_MIN,
  readAgentsRightW,
  writeAgentsRightW,
} from "./hostsFrameStorage";
import { pageGridClass } from "@/layout/pageGrid";

/**
 * `/agents/hosts` — the HOSTS frame (agents-redesign A1, blueprint
 * 2026-10-09 «каркас-инверсия»): the Kora v7 frame pattern (100vh app frame
 * ≥xl, NO page scroll, one grid — the host field + the roster panel + a REAL
 * seam) with the selection as a ROUTE (`/agents/hosts/:host?`) — the frame
 * never re-assembles, the center's content changes.
 *
 * THE INVERSION: the roster moves to the RIGHT PANEL as compact host ROWS
 * (not cards): presence word + dot, the host name, «N/M harnesses online»,
 * the active-work chip, the freshest report age. The MAIN FIELD is the
 * selected host's scaffold — name, lifecycle pill + next_action (the server
 * `ExecutorLifecycleStatus`), the stats line — and an honest one-line
 * placeholder: the work field itself (Сейчас / Харнесы / Недавно) lands in
 * slices B1/B2.
 *
 * A «host» is a CLIENT-SIDE projection of the executor registry
 * (rosterModel.groupExecutorsByHost — no host API exists in the engine):
 * every host fact here is an aggregate over the group's real member rows.
 * Fabricated host telemetry (OS/uptime/IP) is impossible from this data and
 * forbidden by the blueprint (anti-slop). The «Без хоста» bucket (the wire
 * '') travels under the __unreported__ sentinel route id.
 *
 * Честный свет (red line): the only motion is the presence flash on REAL
 * executor.online/offline bus transitions (presenceLight, one shot per
 * transition) and the ticking report age (the shared 1 Hz ticker — data,
 * not motion). No pulses, no breathing, no fake counters: while the
 * registry read is pending the summary shows a skeleton with NO numbers.
 */
export function HostsWorkspace({ hostId }: { hostId: string | null }) {
  const t = useT();
  const gateway = useGateway();
  const capable = isAgentsSource(gateway);
  const executors = useExecutors();
  const assignments = useAssignments();
  const board = useBoardTasks();
  // Shared 1 Hz ticker (SSR snapshot 0 — ages render client-side only).
  const now = useValidationNow();

  // The roster seam (the Kora 07l §3 contract, re-used component): width
  // state + persist on COMMIT, never per frame.
  const [sideW, setSideW] = useState(readAgentsRightW);
  const onSideValue = useCallback((next: number): void => setSideW(next), []);
  const onSideCommit = useCallback((): void => {
    writeAgentsRightW(sideW);
  }, [sideW]);
  const onSideReset = useCallback((): void => {
    setSideW(AGENTS_SIDE_DEFAULT);
    writeAgentsRightW(AGENTS_SIDE_DEFAULT);
  }, []);

  // The ONE panel filter (the blueprint's three chips).
  const [filter, setFilter] = useState<HostFilter>("all");

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

  const summary = useMemo(
    () => ({
      machines: groups.length,
      online: groups.filter((group) => hostPresence(group, meta, now) === "online")
        .length,
      attention: groups.filter(hostNeedsAttention).length,
    }),
    [groups, meta, now],
  );

  const visibleGroups = useMemo(() => {
    if (filter === "attention") return groups.filter(hostNeedsAttention);
    if (filter === "decision") return groups.filter(hostAwaitingDecision);
    return groups;
  }, [filter, groups]);

  const titleOf = (taskId: string): string =>
    (board.data?.tasks ?? []).find((task) => task.id === taskId)?.title || taskId;

  if (!capable) {
    return <AgentsUnsupported />;
  }

  // The honest retry state: 5xx/transport keeps the error + retry (the
  // Kora pattern — gates/errors are NOT the frame).
  if (executors.isError) {
    return (
      <div className={pageGridClass("operational", "space-y-4")}>
        <Header summary={null} />
        <EmptyState
          variant="error"
          title={t("agents.roster.failed")}
          techDetail={executors.error.message}
          action={
            <Button variant="outline" onClick={() => void executors.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      </div>
    );
  }

  // `/agents/hosts` without a host = the FIRST host by the canon sort (the
  // «Без хоста» bucket sinks last); an empty roster skips the redirect and
  // renders the canonical empty state in the field.
  if (hostId === null && groups.length > 0) {
    return (
      <Navigate
        replace
        to={`/agents/hosts/${encodeURIComponent(hostRouteId(groups[0]))}`}
      />
    );
  }

  const selected =
    hostId === null ? null : (groups.find((group) => hostRouteId(group) === hostId) ?? null);
  // A settled roster + a URL host that projects to nothing = the honest
  // not-found (a deleted/renamed host deep link); the panel keeps working.
  const unknownHost = hostId !== null && groups.length > 0 && selected === null;

  return (
    <section
      aria-labelledby="agents-hosts-title"
      className={cn(
        pageGridClass("operational"),
        "flex flex-col gap-4 xl:h-[var(--agents-frame-h)] xl:gap-3 xl:overflow-hidden",
      )}
    >
      <div className="shrink-0">
        <Header summary={executors.isPending ? null : summary} />
      </div>

      <div
        className="relative grid min-h-0 min-w-0 flex-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_var(--agents-right-w)] xl:items-stretch xl:gap-0"
        style={{ "--agents-right-w": `${sideW}px` } as React.CSSProperties}
      >
        {/* Central column: the selected host's scaffold. The work field
         * (Сейчас/Харнесы/Недавно) arrives in B1/B2 — the placeholder is
         * one honest line, not an illustration. */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-myelin bg-well xl:rounded-none xl:border-0">
          {executors.isPending ? (
            <div
              role="status"
              aria-label={t("agents.hosts.loading")}
              className="space-y-3 px-6 py-6"
            >
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          ) : groups.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <EmptyState
                variant="empty"
                title={t("agents.roster.emptyTitle")}
                message={t("agents.roster.emptyMessage")}
                action={
                  <Button asChild variant="outline">
                    <Link to="/agents/harnesses?connect=1">
                      {t("agents.hosts.connectAction")}
                    </Link>
                  </Button>
                }
              />
            </div>
          ) : unknownHost || selected === null ? (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <EmptyState
                variant="not-found"
                title={t("agents.hosts.notFound")}
                message={t("agents.hosts.notFoundMessage", { host: hostId ?? "" })}
                action={
                  <Button variant="outline" asChild>
                    <Link to="/agents/hosts">{t("agents.hosts.backToRoster")}</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <HostField
              group={selected}
              assignments={assignmentItems}
              meta={meta}
              now={now}
              titleOf={titleOf}
            />
          )}
        </div>

        {/* The RIGHT SEAM: pointer drag with capture, the full keyboard path
         * (arrows/Home/End/Esc), dblclick reset, persist on commit — the
         * Kora component as-is, anchored to the PANEL EDGE it rules (07l §2
         * «стык без зазора»: the line rides calc(100% - w), NOT the bare var
         * offset — the Kora call site anchors it to the bare var, which lets
         * the line drift into the field; reported upstream, not copied).
         * Lives only inside the frame (≥xl). */}
        <KoraResizeHandle
          orientation="vertical"
          label={t("agents.hosts.resize.label")}
          tooltip={t("agents.hosts.resize.tooltip")}
          min={AGENTS_SIDE_MIN}
          max={AGENTS_SIDE_MAX}
          value={sideW}
          valueText={seamPx(sideW)}
          dragSign={1}
          onValue={onSideValue}
          onCommit={onSideCommit}
          onReset={onSideReset}
          className="absolute inset-y-0 left-[calc(100%-var(--agents-right-w))] hidden -translate-x-1/2 xl:flex"
        />

        {/* Right panel: THE ROSTER (the inversion) — filter chips, compact
         * host rows (ONE list scroll), the connect action pinned at the
         * bottom (the conveyor via ?connect=1). */}
        <aside
          aria-label={t("agents.hosts.rosterRegion")}
          className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-myelin bg-well xl:rounded-none xl:border-0"
        >
          {groups.length > 0 ? (
            <div className="shrink-0 px-3 pt-3">
              <HostFilterChips filter={filter} onFilter={setFilter} />
            </div>
          ) : null}
          <div className="kora-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-2">
            {executors.isPending ? (
              <div
                role="status"
                aria-label={t("agents.hosts.loading")}
                className="space-y-2"
              >
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-4/5" />
              </div>
            ) : (
              <ul className="space-y-0.5">
                {visibleGroups.map((group) => (
                  <HostRow
                    key={group.host || "__unreported__"}
                    group={group}
                    selected={selected !== null && hostRouteId(group) === hostId}
                    assignments={assignmentItems}
                    meta={meta}
                    now={now}
                    titleOf={titleOf}
                  />
                ))}
              </ul>
            )}
            {!executors.isPending &&
            groups.length > 0 &&
            visibleGroups.length === 0 ? (
              <p className="px-2 py-3 text-xs text-foreground-muted">
                {t("agents.hosts.filterEmpty")}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 border-t border-myelin-hairline p-3">
            <Button asChild size="sm" className="w-full">
              <Link to="/agents/harnesses?connect=1">
                {t("agents.hosts.connectAction")}
              </Link>
            </Button>
          </div>
        </aside>
      </div>
    </section>
  );
}

// --- the panel filter -----------------------------------------------------------

type HostFilter = "all" | "attention" | "decision";

const FILTER_CHIPS: readonly { id: HostFilter; labelKey: TranslationKey }[] = [
  { id: "all", labelKey: "agents.hosts.filter.all" },
  { id: "attention", labelKey: "agents.hosts.filter.attention" },
  { id: "decision", labelKey: "agents.hosts.filter.decision" },
];

function HostFilterChips({
  filter,
  onFilter,
}: {
  filter: HostFilter;
  onFilter: (next: HostFilter) => void;
}) {
  const t = useT();
  return (
    <div
      role="group"
      aria-label={t("agents.hosts.filter.groupLabel")}
      className="flex flex-wrap gap-1.5"
    >
      {FILTER_CHIPS.map((chip) => (
        <button
          key={chip.id}
          type="button"
          aria-pressed={filter === chip.id}
          onClick={() => onFilter(chip.id)}
          className={
            "min-h-12 md:min-h-6 rounded-full border px-2.5 text-xs transition-colors duration-instant focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright " +
            (filter === chip.id
              ? "border-transparent bg-iris-tint text-iris-bright"
              : "border-border-subtle text-foreground-secondary hover:bg-elevated hover:text-foreground")
          }
        >
          {t(chip.labelKey)}
        </button>
      ))}
    </div>
  );
}

// --- the section header ---------------------------------------------------------

/**
 * «Хосты» + the derived summary («машин: N · на связи: M · требуют внимания:
 * K» — the plural-safe genitive counter style of the Kora header). While the
 * registry read is pending: a skeleton with NO numbers — no fake counters.
 */
function Header({ summary }: { summary: { machines: number; online: number; attention: number } | null }) {
  const t = useT();
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 id="agents-hosts-title" className="text-xl font-semibold">
        {t("nav.agentsHosts")}
      </h1>
      {summary === null ? (
        <span aria-hidden="true" className="flex items-center gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-36" />
        </span>
      ) : (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums text-foreground-secondary">
          <span>{t("agents.hosts.summary.machines", { n: summary.machines })}</span>
          <span>{t("agents.hosts.summary.online", { n: summary.online })}</span>
          <span>
            {t("agents.hosts.summary.attention", { n: summary.attention })}
          </span>
        </p>
      )}
    </header>
  );
}

// --- the main field (A1 scaffold) ------------------------------------------------

/**
 * The selected host's scaffold: name + the lifecycle pill, the next_action
 * as a VISIBLE line (07a §1.1: a pill is never alone), the stats line —
 * then the one-line placeholder for B1/B2. The pill reads the server's
 * `ExecutorLifecycleStatus` through the host aggregate (rosterModel
 * .hostLifecycle — the attention ladder); pre-UXE-2 boards (no member
 * status) fall back to the presence word, never a guessed state.
 */
function HostField({
  group,
  assignments,
  meta,
  now,
  titleOf,
}: {
  group: HostGroup;
  assignments: readonly AssignmentItem[];
  meta: ExecutorListMeta | undefined;
  now: number;
  titleOf: (taskId: string) => string;
}) {
  const t = useT();
  const state = hostLifecycle(group);
  const presence = hostPresence(group, meta, now);
  const presenceKey = presence ?? "unknown";
  const awaitingDecision = hostAwaitingDecision(group);
  const revoked = hostRevoked(group);
  const activeWork = activeAssignmentsForHost(assignments, group);

  // The next_action line: the state-defining member's server-owned report
  // age, humanised exactly like the registry pill (the {{silentMax}} var
  // for the awaiting-first-report corridor comes from meta).
  const defining =
    state !== null
      ? group.members.find((member) => member.status?.state === state)
      : undefined;
  const status = isLifecycle(defining?.status) ? defining.status : undefined;
  const silentMax = silentMaxAgeS(meta);
  const nextVars: Record<string, string> | undefined =
    status !== undefined && status.state === "awaiting-first-report" && silentMax !== null
      ? {
          silentMax: formatPulseAge(silentMax, {
            minutes: t("agents.age.unitMinutes"),
            hours: t("agents.age.unitHours"),
            days: t("agents.age.unitDays"),
          }),
        }
      : status !== undefined && status.last_report_age_s !== ""
        ? {
            age: formatReportAge(status.last_report_age_s, {
              agoTemplate: "{{age}}",
              never: "",
              units: {
                minutes: t("agents.age.unitMinutes"),
                hours: t("agents.age.unitHours"),
                days: t("agents.age.unitDays"),
              },
            }),
          }
        : undefined;

  const ageS = hostLastReportAgeS(group, now);
  const age =
    ageS !== null
      ? formatPulseAge(ageS, {
          minutes: t("agents.age.unitMinutes"),
          hours: t("agents.age.unitHours"),
          days: t("agents.age.unitDays"),
        })
      : "";

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <header className="space-y-1.5 px-6 pb-3 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id="agents-host-title"
            className={cn(
              "text-lg font-semibold",
              revoked && "text-foreground-muted",
            )}
          >
            {group.label ?? t("agents.roster.hostUnknown")}
          </h2>
          {awaitingDecision ? (
            <Badge
              variant="outline"
              title={t("agents.executor.pendingReason")}
              className="font-normal"
            >
              {t("agents.hosts.pendingPill")}
            </Badge>
          ) : state !== null ? (
            <Badge
              variant={lifecycleBadgeVariant(state)}
              className="font-normal"
            >
              {t(lifecycleLabelKey(state))}
            </Badge>
          ) : (
            <Badge variant="outline" className="font-normal">
              {t(presenceLabelKey(presenceKey))}
            </Badge>
          )}
          {activeWork.length > 0 ? (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground-secondary">
              <span className="min-w-0 truncate">{titleOf(activeWork[0].task_id)}</span>
              <AssignmentStateBadge state={activeWork[0].state} />
              {activeWork.length > 1 ? (
                <span className="shrink-0 text-foreground-muted">
                  +{activeWork.length - 1}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        {/* The next_action — the second line under the pill (07a §1.1), the
         * state-keyed dictionary hint the registry pill only whispers. */}
        {state !== null ? (
          <p className="text-sm text-foreground-secondary">
            {t(lifecycleNextKey(state), nextVars)}
          </p>
        ) : null}
        <p className="font-mono text-xs tabular-nums text-foreground-muted">
          {t("agents.hosts.onlineCounter", {
            online: group.online,
            total: group.members.length,
          })}
          {" · "}
          {t("agents.strip.lastSeen")}: {age || t("agents.executor.neverSeen")}
        </p>
      </header>
      <div className="flex min-h-0 flex-1 items-start px-6 py-4">
        <p className="text-sm text-foreground-muted">
          {t("agents.hosts.fieldPlaceholder")}
        </p>
      </div>
    </div>
  );
}

// --- the roster row (the inversion: compact row, NOT a card) ---------------------

/**
 * One host row: presence word + dot (or the «ждёт решения» pill while a
 * registration decision is pending), the host name, «N/M harnesses online»,
 * the active-work chip, the freshest report age. The row IS the route link
 * (selection = URL), carries aria-current when selected and flares ONCE on
 * a real member presence transition (presenceLight; a revoked host renders
 * muted — a dead row invites no colour optimism).
 */
function HostRow({
  group,
  selected,
  assignments,
  meta,
  now,
  titleOf,
}: {
  group: HostGroup;
  selected: boolean;
  assignments: readonly AssignmentItem[];
  meta: ExecutorListMeta | undefined;
  now: number;
  titleOf: (taskId: string) => string;
}) {
  const t = useT();
  const flash = usePresenceFlashFor(group.members.map((member) => member.id));
  const awaitingDecision = hostAwaitingDecision(group);
  const revoked = hostRevoked(group);
  const presence = hostPresence(group, meta, now);
  const presenceKey = presence ?? "unknown";
  const ageS = hostLastReportAgeS(group, now);
  const age =
    ageS !== null
      ? formatPulseAge(ageS, {
          minutes: t("agents.age.unitMinutes"),
          hours: t("agents.age.unitHours"),
          days: t("agents.age.unitDays"),
        })
      : "";
  const activeWork = activeAssignmentsForHost(assignments, group);

  return (
    <li>
      <Link
        to={`/agents/hosts/${encodeURIComponent(hostRouteId(group))}`}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "flex min-h-11 flex-col gap-0.5 rounded-sm border-l-2 px-2 py-1.5 text-left text-sm transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
          selected ? "border-iris bg-iris/10" : "border-transparent",
          // The one-shot presence flare (event-driven, never background).
          flash
            ? flash.tone === "online"
              ? "agents-presence-online"
              : "agents-presence-offline"
            : "",
          revoked ? "text-foreground-muted" : undefined,
        )}
      >
        <span className="flex w-full items-center gap-1.5">
          {awaitingDecision ? (
            <Badge
              variant="outline"
              title={t("agents.executor.pendingReason")}
              className="shrink-0 whitespace-nowrap font-normal"
            >
              {t("agents.hosts.pendingPill")}
            </Badge>
          ) : (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  PRESENCE_DOT[presenceKey] ?? PRESENCE_DOT.unknown,
                )}
              />
              <span
                className={cn(
                  "shrink-0 text-xs",
                  PRESENCE_TEXT[presenceKey] ?? PRESENCE_TEXT.unknown,
                )}
              >
                {t(presenceLabelKey(presenceKey))}
              </span>
            </>
          )}
          <span className="ml-auto truncate text-right font-mono text-xs tabular-nums text-foreground-muted">
            {t("agents.strip.lastSeen")}: {age || t("agents.executor.neverSeen")}
          </span>
        </span>
        {/* Name + the work STATE (shrink-0 — the badge never wraps); the
         * task TITLE rides the stats line where the counter leaves room. */}
        <span className="flex w-full items-center gap-1.5">
          <span className="min-w-0 truncate font-medium">
            {group.label ?? t("agents.roster.hostUnknown")}
          </span>
          {activeWork.length > 0 ? (
            <>
              <AssignmentStateBadge state={activeWork[0].state} />
              {activeWork.length > 1 ? (
                <span className="shrink-0 text-xs text-foreground-muted">
                  +{activeWork.length - 1}
                </span>
              ) : null}
            </>
          ) : null}
        </span>
        <span className="flex w-full items-center gap-1.5 text-xs">
          <span className="shrink-0 font-mono tabular-nums text-foreground-muted">
            {t("agents.hosts.onlineCounter", {
              online: group.online,
              total: group.members.length,
            })}
          </span>
          {activeWork.length > 0 ? (
            <span className="min-w-0 truncate text-foreground-secondary">
              {titleOf(activeWork[0].task_id)}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
