import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { List, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AssignmentItem,
  ExecutorLifecycleState,
  ExecutorListMeta,
} from "@/gateway/boardTypes";
import { isAgentsSource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import { useT, type TranslationKey } from "@/i18n";
import { cn } from "@/lib/utils";
import { withReturn } from "@/lib/returnParams";
import { useBoardTasks } from "@/features/tasks/useTasks";
import { useValidationNow } from "@/features/tasks/useValidationClock";
import {
  KoraGatewayContext,
  makeKoraGateway,
} from "@/features/kora/koraGatewayContext";
import { useKoraSessionPages } from "@/features/kora/useKora";
import type { KoraSession } from "@/features/kora/koraTypes";
import { KoraResizeHandle, seamPx } from "@/features/kora/KoraResizeHandle";
import {
  HostsPresenceBlock,
  HostsPulseBlock,
  HostsSettingsBlock,
} from "./HostsMetaPanel";
import { AgentsUnsupported } from "./AgentsUnsupported";
import { AssignmentStateBadge } from "./AssignmentStateBadge";
import { CreateTaskDialog } from "@/features/tasks/CreateTaskDialog";
import { ExecutorLinkCheck } from "./ExecutorLinkCheck";
import { HarnessChipStrip } from "./HarnessChipStrip";
import { SessionPreview } from "./SessionPreview";
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
  hostPrimaryExecutor,
  hostRevoked,
  hostRoutable,
  hostRouteId,
  hostSessionDisplayLabels,
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
 * 2026-10-09 «каркас-инверсия»; A2 mobile reflow + keyboard path; W2
 * «Мета-панель» of agents-workspace-ide): the Kora v7 frame pattern ≥xl
 * (100vh app frame, NO page scroll, one grid — the host field + a REAL
 * seam + the META-PANEL) with the selection as a ROUTE
 * (`/agents/hosts/:host?`) — the frame never re-assembles.
 *
 * W2 META-PANEL (states.md §2, blueprint §2-4): the right side is three
 * collapsible blocks under ONE panel scroll — «Присутствие» (the roster
 * listbox + filter chips, moved as-is), «Пульс» (the host-scoped 24h
 * strip + fresh activity, moved OUT of the field), «Настройки» (the
 * routing verdict + quiet hub links, collapsed by default). The field
 * keeps the working content only: header → harness chips (W1) → «Сейчас».
 *
 * A2 RESPONSIVE LADDER (blueprint §3.D + W2 §6 re-cut):
 * - ≥xl: the frame — field | seam | meta-panel (one panel scroll).
 * - md..xl (768–1279): the seams leave, the page scrolls honestly (the
 *   Kora precedent); the roster compresses to a RIBBON of compact host
 *   chips under the section header (one-tap selection) + a trigger opening
 *   the full roster as a right-side SHEET; «Пульс» becomes a section
 *   UNDER the field; settings live in the hub only.
 * - <768: the sheet IS the roster (trigger button, ≥48px rows, fullscreen
 *   below sm); the field is one column; the conveyor stays a full page.
 *
 * A2 KEYBOARD PATH (§3.E): the roster rows are a LISTBOX — one tab stop,
 * ↑/↓/j/k move the highlight (aria-activedescendant), Home/End jump, Enter
 * opens the host (route + focus lands on the field's h2), Esc closes the
 * top overlay (the sheet; Radix handles it, the list mirrors the intent).
 * The ≥xl seam keeps its KoraResizeHandle arrow/Home/End/Esc path.
 *
 * W3 «СЕССИЯ В ЦЕНТРЕ» (agents-workspace-ide, states.md §1 S-SESSION + §3):
 * the session selection is a ROUTE segment (`/agents/hosts/:host/sessions/
 * :sessionId` — the SAME frame element). A resolved live session renders the
 * READ-ONLY transcript preview in the field (SessionPreview — the Kora
 * reading grammar; the chat lives ONLY in Kora, blueprint §9); the preview
 * is the field's ONLY transcript-wire carrier and mounts/unmounts with the
 * selection (blueprint §7 — the 1 Hz ticker stays the single shared beat).
 * Esc inside the preview / the ✕ button return to S-HOST-LIVE.
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
export function HostsWorkspace({
  hostId,
  sessionId,
}: {
  hostId: string | null;
  /** The `sessions/:sessionId` route segment (W3) — null = S-HOST-LIVE. */
  sessionId: string | null;
}) {
  const t = useT();
  const gateway = useGateway();
  const capable = isAgentsSource(gateway);
  const executors = useExecutors();
  const assignments = useAssignments();
  const board = useBoardTasks();
  const navigate = useNavigate();
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
  // The roster SHEET (the <xl roster): session-only state, Radix owns Esc.
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetTriggerRef = useRef<HTMLButtonElement>(null);
  // B1 «Дать задачу»: the new-task wizard pre-pointed at the host's primary
  // executor (the engine's other legal assignment path — the sheet needs a
  // task, the wizard creates task + assignment in one flow).
  const [giveOpen, setGiveOpen] = useState(false);
  // The Kora sessions read (B1 «Сейчас»): the kora seams live on their OWN
  // context — the provider wraps the FIELD below (hooks read the tree), and
  // the adapter choice follows the global ADAPTER (mock fixtures in
  // dev/smoke builds).
  const [koraGateway] = useState(makeKoraGateway);

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
    if (filter === "archive") {
      // Roster-host-binding-cleanup (2026-10-18): the «Архив» view —
      // groups built WITH archived members, filtered to the groups that
      // actually carry one.
      return groupExecutorsByHost(items, meta, now, { includeArchived: true })
        .filter((group) =>
          group.members.some((member) => member.archived === true));
    }
    return groups;
  }, [filter, groups, items, meta, now]);

  const titleOf = (taskId: string): string =>
    (board.data?.tasks ?? []).find((task) => task.id === taskId)?.title || taskId;

  /** The shared «open this host» action: route only — the field-title focus
   * is owned by the effect below (single focus owner, no races). */
  const openHost = useCallback(
    (group: HostGroup): void => {
      navigate(`/agents/hosts/${encodeURIComponent(hostRouteId(group))}`);
    },
    [navigate],
  );

  // A2 §3.E: on a host CHANGE the focus lands on the field's title (the
  // h2 is the landing landmark). Shell's FocusMain refocuses <main> on any
  // pathname change in the SAME commit — parent effects run after child
  // effects, so the title focus defers one frame (rAF) and lands last.
  // Skipped on mount (no focus steal on plain load) and while the sheet is
  // open (its own focus trap owns the tab).
  const prevHostId = useRef(hostId);
  useEffect(() => {
    const changed = prevHostId.current !== hostId;
    prevHostId.current = hostId;
    if (!changed || hostId === null || sheetOpen) return;
    const raf = requestAnimationFrame(() => {
      document
        .getElementById("agents-host-title")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [hostId, sheetOpen]);

  // W3: the SESSION selection is a navigation too — on CLOSE (the ✕/Esc
  // path unmounts the preview) the focus returns to the field's h2, the
  // same landing landmark the host change uses. Opening focuses the
  // preview's own title (SessionPreview's mount effect).
  const prevSessionId = useRef(sessionId);
  useEffect(() => {
    const changed = prevSessionId.current !== sessionId;
    prevSessionId.current = sessionId;
    if (!changed || sessionId !== null) return;
    const raf = requestAnimationFrame(() => {
      document
        .getElementById("agents-host-title")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [sessionId]);

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
    hostId === null
      ? null
      : (groups.find((group) => hostRouteId(group) === hostId) ??
        // The «Архив» view can open an archived-only host (its members
        // are hidden from the default projection) — resolve from the
        // visible groups there so the row click lands, not 404s.
        (filter === "archive"
          ? (visibleGroups.find((group) => hostRouteId(group) === hostId) ??
            null)
          : null));
  // A settled roster + a URL host that projects to nothing = the honest
  // not-found (a deleted/renamed host deep link); the panel keeps working.
  const unknownHost =
    hostId !== null &&
    groups.length > 0 &&
    selected === null &&
    !(filter === "archive" &&
      visibleGroups.some((group) => hostRouteId(group) === hostId));

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

      {/* A2 §3.D: the md..xl RIBBON — compact host chips under the section
       * header, one tap selects the host (route); the full roster (counters,
       * ages, filters) stays in the sheet. Hidden at xl (the panel owns the
       * roster) and below md (the sheet IS the roster there). */}
      {!executors.isPending && groups.length > 0 ? (
        <HostRibbon
          groups={groups}
          selectedId={hostId}
          meta={meta}
          now={now}
          onOpen={openHost}
          className="shrink-0 max-md:hidden xl:hidden"
        />
      ) : null}

      {/* A2 §3.D: the <xl roster trigger — opens the roster sheet (a right
       * sheet ≥sm, FULLSCREEN below sm). ≥48px target (touch pass). */}
      {!executors.isPending && groups.length > 0 ? (
        <Button
          ref={sheetTriggerRef}
          type="button"
          variant="outline"
          onClick={() => setSheetOpen(true)}
          className="min-h-12 justify-start gap-2 xl:hidden"
        >
          <List aria-hidden className="size-4" />
          {t("agents.hosts.rosterTrigger", { n: groups.length })}
        </Button>
      ) : null}

      <div
        className="relative grid min-h-0 min-w-0 flex-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_var(--agents-right-w)] xl:items-stretch xl:gap-0"
        style={{ "--agents-right-w": `${sideW}px` } as React.CSSProperties}
      >
        {/* Central column: the selected host's WORKBENCH. At xl the frame
         * height is fixed — the column scrolls INSIDE itself (07l §1.2:
         * every surface scrolls internally, the page never does). */}
        <div className="kora-scroll flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-md border border-myelin bg-well xl:rounded-none xl:border-0">
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
            <KoraGatewayContext.Provider value={koraGateway}>
              <HostField
                group={selected}
                sessionId={sessionId}
                assignments={assignmentItems}
                meta={meta}
                now={now}
                titleOf={titleOf}
                onGiveTask={() => setGiveOpen(true)}
              />
            </KoraGatewayContext.Provider>
          )}
        </div>

        {/* The RIGHT SEAM (≥xl): pointer drag with capture, the full keyboard
         * path (arrows/Home/End/Esc), dblclick reset, persist on commit —
         * the Kora component as-is, anchored to the PANEL EDGE it rules
         * (07l §2 «стык без зазора»; the bare-var drift is a Kora call-site
         * finding, reported, not copied). Lives only inside the frame. */}
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

        {/* RIGHT META-PANEL (≥xl, W2): three collapsible blocks —
         * «Присутствие» (the roster as-is), «Пульс» (the host-scoped
         * activity, ex-«Недавно» of the field), «Настройки» (collapsed) —
         * under ONE panel scroll; the connect action stays pinned at the
         * bottom (the roster CTA of blueprint §2). */}
        <aside
          aria-label={t("agents.hosts.panelRegion")}
          className="hidden min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-myelin bg-well xl:flex xl:rounded-none xl:border-0"
        >
          <div className="kora-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
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
              <>
                {/* «Присутствие»: the roster listbox + filter chips moved
                 * AS-IS (blueprint §5 reuse map). The chips stay reachable
                 * even when the DEFAULT view is empty (every host
                 * archived): the registry rows, not the default projection,
                 * gate the filter. */}
                <HostsPresenceBlock>
                  {items.length > 0 ? (
                    <HostFilterChips filter={filter} onFilter={setFilter} />
                  ) : null}
                  <HostsRosterList
                    idPrefix="hosts-panel"
                    groups={visibleGroups}
                    selectedId={hostId}
                    assignments={assignmentItems}
                    meta={meta}
                    now={now}
                    titleOf={titleOf}
                    onNavigate={openHost}
                  />
                  {items.length > 0 && visibleGroups.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-foreground-muted">
                      {t("agents.hosts.filterEmpty")}
                    </p>
                  ) : null}
                </HostsPresenceBlock>
                {/* «Пульс»: the selected host's 24h strip + fresh events
                 * (host-scoped, states.md §2); the honest no-host line
                 * while the URL names nothing the roster can resolve. The
                 * body id is panel-scoped — the field copy below carries
                 * its own (review W2-1: no shared DOM ids across the two
                 * mounted copies). */}
                <HostsPulseBlock
                  id="hosts-meta-pulse-body-panel"
                  group={selected}
                  now={now}
                />
                {/* «Настройки»: the routing verdict + quiet hub links,
                 * collapsed by default (states.md §2). */}
                <HostsSettingsBlock />
              </>
            )}
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

      {/* W2 md..xl ladder (blueprint §6): «Пульс» becomes a section UNDER
       * the field — the honest page scroll carries it; the roster stays in
       * the sheet, the settings in the hub. The SAME block component as the
       * panel (one react-query key per host — one wire read). */}
      {!executors.isPending && selected !== null ? (
        <div className="xl:hidden">
          <HostsPulseBlock
            id="hosts-meta-pulse-body-field"
            group={selected}
            now={now}
          />
        </div>
      ) : null}

      {/* A2 §3.D: the roster SHEET (<xl) — the full roster as an overlay:
       * filters + the listbox + connect; FULLSCREEN below sm, a right-side
       * sheet ≥sm. Radix owns the focus trap and Esc; the listbox mirrors
       * the Esc intent for its own key handler. */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent
          /* The roster is the dialog's purpose: the initial focus goes to
           * the LISTBOX (Radix's default lands on the first filter chip),
           * so Esc/arrow keys work from the first beat. */
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("hosts-sheet-listbox")?.focus();
          }}
          /* The canonical overlay return (A2 polish): the trigger regains
           * focus on close — unless a host was just opened, in which case
           * the field-title effect takes focus one frame later anyway. */
          onCloseAutoFocus={(event) => {
            if (document.activeElement?.id !== "agents-host-title") {
              event.preventDefault();
              sheetTriggerRef.current?.focus();
            }
          }}
          className={cn(
            "flex flex-col gap-3 p-4 text-left",
            // The sheet: fullscreen <sm, right-anchored ≥sm (inset overrides
            // of the centered dialog default).
            "inset-y-0 left-auto right-0 top-auto h-full max-h-none w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 sm:max-w-sm sm:border-l",
          )}
        >
          <DialogTitle className="text-base">
            {t("agents.hosts.rosterRegion")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("agents.hosts.sheetHint")}
          </DialogDescription>
          {!executors.isPending && items.length > 0 ? (
            <div className="shrink-0">
              <HostFilterChips filter={filter} onFilter={setFilter} />
            </div>
          ) : null}
          <div className="kora-scroll -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            <HostsRosterList
              idPrefix="hosts-sheet"
              groups={visibleGroups}
              selectedId={hostId}
              assignments={assignmentItems}
              meta={meta}
              now={now}
              titleOf={titleOf}
              variant="sheet"
              onNavigate={(group) => {
                setSheetOpen(false);
                openHost(group);
              }}
              onEscape={() => setSheetOpen(false)}
            />
            {items.length > 0 && visibleGroups.length === 0 ? (
              <p className="px-2 py-3 text-xs text-foreground-muted">
                {t("agents.hosts.filterEmpty")}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 border-t border-myelin-hairline pt-3">
            <Button asChild size="sm" className="w-full">
              <Link
                to="/agents/harnesses?connect=1"
                onClick={() => setSheetOpen(false)}
              >
                {t("agents.hosts.connectAction")}
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* B1 «Дать задачу»: the new-task wizard («Что → Кому → Проверка»)
       * pre-pointed at the host's primary executor — the engine's legal
       * task+assignment creation flow. */}
      <CreateTaskDialog
        open={giveOpen}
        onOpenChange={setGiveOpen}
        initialExecutorId={selected ? hostPrimaryExecutor(selected)?.id ?? null : null}
      />
    </section>
  );
}

// --- the panel filter -----------------------------------------------------------

type HostFilter = "all" | "attention" | "decision" | "archive";

const FILTER_CHIPS: readonly { id: HostFilter; labelKey: TranslationKey }[] = [
  { id: "all", labelKey: "agents.hosts.filter.all" },
  { id: "attention", labelKey: "agents.hosts.filter.attention" },
  { id: "decision", labelKey: "agents.hosts.filter.decision" },
  // Roster-host-binding-cleanup: the «Архив» view — aged-out disabled
  // rows stay out of the default views; this chip shows them.
  { id: "archive", labelKey: "agents.hosts.filter.archive" },
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
 *
 * The header also carries the PERMANENT quiet connect entry (UX-AUDIT A5,
 * 2026-10-20): the connect conveyor left the nav (agents-redesign C1), and
 * on a FILLED roster its contextual entries (the panel CTA, the empty
 * state) are out of sight — the «how do I add a host» path went dark. The
 * button rides the SAME route as those CTAs (one action, not a second
 * implementation) and stays visible in every state of the page.
 */
function Header({
  summary,
}: {
  summary: { machines: number; online: number; attention: number } | null;
}) {
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
      {/* The quiet connect action (ghost — the button dictionary's quietest
       * step); the Plus glyph + the short word read as «+ Подключить». */}
      <Button asChild variant="ghost" size="sm" className="ml-auto shrink-0">
        <Link to="/agents/harnesses?connect=1">
          <Plus aria-hidden="true" />
          {t("agents.hosts.connectShort")}
        </Link>
      </Button>
    </header>
  );
}

// --- the md..xl ribbon ------------------------------------------------------------

/**
 * The compact host-chip ribbon (A2 §3.D): one chip per host — presence dot
 * (+ the «ждёт решения» pill where a decision is pending), the name — one
 * horizontal scroll, one tap selects (route). The counters/ages/filters
 * stay in the panel/sheet; the ribbon is the quick-selection strip.
 */
function HostRibbon({
  groups,
  selectedId,
  meta,
  now,
  onOpen,
  className,
}: {
  groups: readonly HostGroup[];
  selectedId: string | null;
  meta: ExecutorListMeta | undefined;
  now: number;
  onOpen: (group: HostGroup) => void;
  className?: string;
}) {
  const t = useT();
  return (
    <nav
      aria-label={t("agents.hosts.ribbonLabel")}
      className={cn("min-w-0", className)}
    >
      <ul className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {groups.map((group) => {
          const routeId = hostRouteId(group);
          const isSelected = routeId === selectedId;
          const awaitingDecision = hostAwaitingDecision(group);
          const presence = hostPresence(group, meta, now);
          const presenceKey = presence ?? "unknown";
          return (
            <li key={group.host || "__unreported__"}>
              <button
                type="button"
                aria-current={isSelected ? "page" : undefined}
                onClick={() => onOpen(group)}
                className={
                  "flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm transition-colors duration-instant focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright " +
                  (isSelected
                    ? "border-transparent bg-iris-tint text-iris-bright"
                    : "border-border-subtle text-foreground-secondary hover:bg-elevated hover:text-foreground")
                }
              >
                {awaitingDecision ? (
                  <Badge
                    variant="outline"
                    title={t("agents.executor.pendingReason")}
                    className="shrink-0 whitespace-nowrap border-border-subtle font-normal"
                  >
                    {t("agents.hosts.pendingPill")}
                  </Badge>
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      PRESENCE_DOT[presenceKey] ?? PRESENCE_DOT.unknown,
                    )}
                  />
                )}
                <span className="min-w-0 truncate font-medium">
                  {group.label ?? t("agents.roster.hostUnknown")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// --- the main field (B1 + W2: header + actions + Сейчас) --------------------------

/** The field is the host's WORKBENCH (agents-redesign B1, blueprint §3.C.1-2;
 * W2 «Мета-панель» re-cut): the header (identity pill + stats + the three
 * actions), the honest state blocks (off / revoked / provisioning), the W1
 * harness chip strip, and «Сейчас» — the host's active assignments (→ the
 * task's live execution feed) and live harness sessions (→ the Kora
 * transcript). «Недавно» left for the meta-panel's «Пульс» block (W2).
 * Every row links into an EXISTING surface. Nothing here is invented: the
 * sessions come from the Kora registry (the `executor_id` join with the
 * group members) — what the engine does not have, the field does not draw. */
function HostField({
  group,
  sessionId,
  assignments,
  meta,
  now,
  titleOf,
  onGiveTask,
}: {
  group: HostGroup;
  /** The selected session's id (the route segment) — null = none. */
  sessionId: string | null;
  assignments: readonly AssignmentItem[];
  meta: ExecutorListMeta | undefined;
  now: number;
  titleOf: (taskId: string) => string;
  onGiveTask: () => void;
}) {
  const t = useT();
  const state = hostLifecycle(group);
  const presence = hostPresence(group, meta, now);
  const presenceKey = presence ?? "unknown";
  const awaitingDecision = hostAwaitingDecision(group);
  const revoked = hostRevoked(group);
  const routable = hostRoutable(group, meta, now);
  const primary = hostPrimaryExecutor(group);
  const activeWork = activeAssignmentsForHost(assignments, group);
  const routeId = hostRouteId(group);

  // The Kora registry (provider-mounted): the host's LIVE sessions (state
  // `live`; idle/dead are not «сейчас»), joined by executor_id.
  const kora = useKoraSessionPages(100);
  const memberIds = useMemo(
    () => new Set(group.members.map((member) => member.id)),
    [group.members],
  );
  const liveSessions = useMemo(
    () =>
      kora.items.filter(
        (session) => session.state === "live" && memberIds.has(session.executor_id),
      ),
    [kora.items, memberIds],
  );
  const sessionSupport = (session: KoraSession): string | undefined =>
    kora.coverage?.harnesses.find((row) => row.harness === session.harness)
      ?.support;

  // W3 S-SESSION: the selected session resolves within the host's LIVE
  // sessions (the same registry read the «Сейчас» list renders). An
  // unresolved id is the honest not-found — the transcript wire does NOT
  // mount for it (blueprint §7: the read lives only with a real selection).
  const selectedSession =
    sessionId !== null
      ? (liveSessions.find((session) => session.id === sessionId) ?? null)
      : null;

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

  // The state block (B1 §3): the field says WHY it is not a workbench —
  // off / revoked / provisioning speak in the server lifecycle's own words.
  const blockState: ExecutorLifecycleState | null =
    state !== null &&
    (state === "offline" || state === "disabled" || state === "provisioning" || state === "revoked")
      ? state
      : null;
  const giveDisabledReason =
    state !== null && !routable ? t(lifecycleNextKey(state), nextVars) : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <header className="space-y-1.5 px-6 pb-3 pt-5">
        {/* THE ONE lore accent of the surface (agents-workspace-ide W1,
         * blueprint §8.1): the caps «cortex zone» above the host name. The
         * rest of the lore vocabulary left the structure (the «Сплетения
         * зоны» accordion dissolved) — the dictionary survives in THIS
         * tooltip only. */}
        <p
          className="text-xs font-medium uppercase tracking-wide text-foreground-secondary"
          title={t("agents.lore.zoneTooltip")}
        >
          {t("agents.lore.zone")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id="agents-host-title"
            tabIndex={-1}
            className={cn(
              "text-lg font-semibold outline-none",
              revoked && "text-foreground-muted",
            )}
          >
            {group.label ?? t("agents.roster.hostUnknown")}
          </h2>
          {awaitingDecision ? (
            <Badge
              variant="outline"
              title={t("agents.executor.pendingReason")}
              className="shrink-0 whitespace-nowrap font-normal"
            >
              {t("agents.hosts.pendingPill")}
            </Badge>
          ) : state !== null ? (
            <Badge
              variant={lifecycleBadgeVariant(state)}
              className="shrink-0 whitespace-nowrap font-normal"
            >
              {t(lifecycleLabelKey(state))}
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 whitespace-nowrap font-normal">
              {t(presenceLabelKey(presenceKey))}
            </Badge>
          )}
        </div>
        {/* The next_action — the second line under the pill (07a §1.1), the
         * state-keyed dictionary hint the registry pill only whispers. */}
        {state !== null ? (
          <p className="text-sm text-foreground-secondary">
            {t(lifecycleNextKey(state), nextVars)}
          </p>
        ) : null}
        <p
          className="font-mono text-xs tabular-nums text-foreground-muted"
          title={t("agents.hosts.harnessHint")}
        >
          {t("agents.hosts.onlineCounter", {
            online: group.online,
            total: group.members.length,
          })}
          {" · "}
          {t("agents.hosts.taskCount", { n: activeWork.length })}
          {" · "}
          {t("agents.strip.lastSeen")}: {age || t("agents.executor.neverSeen")}
        </p>
        {/* The header actions (B1 §3.C.1): give a task (the wizard,
         * pre-pointed at the host's primary executor), the Kora sessions of
         * this host, and the real link verdict. off/revoked hosts disable
         * «Дать задачу» with the lifecycle explanation in the tooltip. */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            onClick={onGiveTask}
            disabled={!routable || primary === null}
            title={giveDisabledReason ?? undefined}
          >
            {t("agents.hosts.actionGiveTask")}
          </Button>
          <Button asChild type="button" variant="outline" size="sm">
            <Link
              to={
                group.host
                  ? `/kora?host=${encodeURIComponent(group.host)}`
                  : "/kora"
              }
            >
              {t("agents.hosts.actionKora")}
            </Link>
          </Button>
          {primary !== null ? (
            <ExecutorLinkCheck
              executor={primary}
              variant="card"
              autoCheck
              triggerLabel={t("agents.hosts.actionLinkCheck")}
            />
          ) : null}
        </div>
      </header>

      {/* The state block: the field speaks in the server lifecycle's own
       * words; a revoked host carries the reconnect CTA. */}
      {blockState !== null ? (
        <div
          role="note"
          className={cn(
            "mx-6 mb-3 space-y-1 rounded-md border p-3",
            blockState === "revoked"
              ? "border-border bg-elevated"
              : "border-border-subtle bg-elevated",
          )}
        >
          <p className="text-sm font-medium text-foreground-secondary">
            {t(lifecycleLabelKey(blockState))}
          </p>
          <p className="text-xs text-foreground-muted">
            {t(lifecycleNextKey(blockState), nextVars)}
          </p>
          {blockState === "revoked" ? (
            <Button asChild variant="outline" size="sm" className="mt-1">
              <Link to="/agents/harnesses?connect=1">
                {t("agents.hosts.reconnectAction")}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Харнесы (agents-workspace-ide W1 «Распустить сплетения»): the
       * compact chip strip UNDER THE HEADER (blueprint §3: header → chips →
       * the working content) — glance facts only; the full workbench is the
       * ExecutorSheet drawer OVER the field (parity with /agents/harnesses
       * by construction). */}
      <HarnessChipStrip members={group.members} meta={meta} now={now} />

      {/* W3 S-SESSION (states.md §1): the selected live session's READ-ONLY
       * transcript preview + mini-meta + [Открыть в Корe] (blueprint §4).
       * The preview is the ONLY transcript-wire carrier — it mounts ONLY
       * with a resolved selection and unmounts on switch/close (§7). While
       * the registry read is in flight: skeleton, no verdict; an id that
       * projects to nothing gets the honest not-found line (the deep link
       * outlived the live list) — never a transcript read. */}
      {sessionId !== null ? (
        kora.isPending ? (
          <div
            role="status"
            aria-label={t("agents.hosts.loading")}
            className="mx-6 mb-3 space-y-2 rounded-md border border-border-subtle p-3"
          >
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : selectedSession !== null ? (
          <SessionPreview
            session={selectedSession}
            hostRouteId={routeId}
            coverage={kora.coverage}
          />
        ) : (
          <div className="mx-6 mb-3 space-y-1 rounded-md border border-border-subtle p-3">
            <p className="text-sm font-medium text-foreground-secondary">
              {t("agents.hosts.session.notFound")}
            </p>
            <p className="text-xs text-foreground-muted">
              {t("agents.hosts.session.notFoundHint")}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button asChild variant="outline" size="sm">
                <Link to={`/agents/hosts/${routeId}`}>
                  {t("agents.hosts.session.backToHost")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to={`/kora/${encodeURIComponent(sessionId)}`}>
                  {t("agents.hosts.session.openInKora")}
                </Link>
              </Button>
            </div>
          </div>
        )
      ) : null}

      {/* «Сейчас»: the host's active work — assignments (→ the task's live
       * execution feed) and live harness sessions (→ the Kora transcript;
       * lists-only harnesses wear the honest badge, never a dead link). */}
      <section aria-label={t("agents.hosts.nowTitle")} className="space-y-2 px-6 pb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
          {t("agents.hosts.nowTitle")}
        </h3>
        {activeWork.length === 0 && liveSessions.length === 0 ? (
          <p className="text-sm text-foreground-muted">{t("agents.hosts.nowIdle")}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {/* min-w-0: a grid item defaults to min-width:auto — a long
             * nowrap title stretches the column and defeats the row's
             * truncate (hard clip at 375, no ellipsis). */}
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-foreground-muted">
                {t("agents.hosts.nowAssignments")}
              </p>
              <ul className="space-y-0.5">
                {activeWork.map((row) => (
                  <li key={row.id}>
                    <Link
                      to={withReturn(
                        `/tasks/${row.task_id}?tab=execution`,
                        `/agents/hosts/${routeId}`,
                      )}
                      className="flex min-h-9 items-center gap-1.5 rounded-sm px-1 text-sm transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
                    >
                      <AssignmentStateBadge state={row.state} />
                      <span className="min-w-0 truncate">{titleOf(row.task_id)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-foreground-muted">
                {t("agents.hosts.nowSessions")}
              </p>
              {kora.error !== null ? (
                <p className="px-1 text-xs text-foreground-muted">
                  {t("agents.hosts.sessionsFailed")}
                </p>
              ) : liveSessions.length === 0 ? (
                <p className="px-1 text-xs text-foreground-muted">
                  {t("agents.hosts.nowNoSessions")}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {hostSessionDisplayLabels(liveSessions).map((label, index) => {
                    const session = liveSessions[index]!;
                    // W3 (states.md §1 S-HOST-LIVE → S-SESSION): a live row
                    // selects the session IN THE FIELD (the route segment);
                    // Kora stays one [Открыть в Корe] away from the preview.
                    const selected = session.id === sessionId;
                    return (
                      <li key={session.id}>
                        <Link
                          to={`/agents/hosts/${routeId}/sessions/${encodeURIComponent(session.id)}`}
                          aria-current={selected ? "true" : undefined}
                          className={cn(
                            "flex min-h-9 items-center gap-1.5 rounded-sm px-1 text-sm transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
                            // iris-tint, NOT bg-iris/10 — the /-opacity
                            // spelling produces NO utility on var() colours
                            // (the config's color-mix note).
                            selected && "bg-iris-tint",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full bg-success presence-dot-live"
                          />
                          {/* D9: the harness chip shows only when the label
                           * does not already carry the source prefix — the
                           * hermes row read «hermes hermes:api_server», the
                           * same name twice in one line. */}
                          {label.toLowerCase().startsWith(`${session.harness}:`) ? null : (
                            <span className="shrink-0 font-mono text-xs text-foreground-secondary">
                              {session.harness}
                            </span>
                          )}
                          <span className="min-w-0 truncate text-foreground-secondary">
                            {/* D9: same-project live sessions are told apart
                             * by the session's own native-id tail — the row
                             * never renders two identical names. */}
                            {label}
                          </span>
                          {sessionSupport(session) === "lists-only" ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 whitespace-nowrap font-normal"
                            >
                              {t("kora.coverage.support.lists-only")}
                            </Badge>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      {/* «Недавно» left the field in W2 — it is the meta-panel's «Пульс»
       * block now (HostsMetaPanel.tsx); the center keeps the working
       * content only (blueprint §3: the field never grows a second feed). */}
    </div>
  );
}

// --- the roster LISTBOX (A2 §3.E) -------------------------------------------------

const optionId = (prefix: string, group: HostGroup): string =>
  `${prefix}-opt-${hostRouteId(group)}`;

/**
 * The roster rows as a LISTBOX (A2 §3.E): ONE tab stop on the list; the
 * highlight rides aria-activedescendant; ↑/↓/j/k move it, Home/End jump,
 * Enter opens the highlighted host (the caller navigates + lands focus on
 * the field's h2), Esc mirrors «close the top overlay» to the caller. The
 * selected option carries aria-selected + aria-current (the A1 contract).
 * Sheet variant raises the rows to ≥48px (the touch pass).
 */
function HostsRosterList({
  idPrefix,
  groups,
  selectedId,
  assignments,
  meta,
  now,
  titleOf,
  onNavigate,
  onEscape,
  variant = "panel",
}: {
  idPrefix: string;
  groups: readonly HostGroup[];
  selectedId: string | null;
  assignments: readonly AssignmentItem[];
  meta: ExecutorListMeta | undefined;
  now: number;
  titleOf: (taskId: string) => string;
  onNavigate: (group: HostGroup) => void;
  /** «Close the top overlay» — set only where an overlay exists (the sheet). */
  onEscape?: () => void;
  variant?: "panel" | "sheet";
}) {
  const t = useT();
  // The highlighted option: null = track the selection (or the first row).
  const [activeState, setActive] = useState<string | null>(null);

  const activeRouteId = useMemo(() => {
    if (activeState !== null && groups.some((g) => hostRouteId(g) === activeState)) {
      return activeState;
    }
    if (selectedId !== null && groups.some((g) => hostRouteId(g) === selectedId)) {
      return selectedId;
    }
    return groups.length > 0 ? hostRouteId(groups[0]) : null;
  }, [activeState, groups, selectedId]);

  const move = (offset: number | "first" | "last"): void => {
    if (groups.length === 0) return;
    const index = groups.findIndex((g) => hostRouteId(g) === activeRouteId);
    const next =
      offset === "first"
        ? 0
        : offset === "last"
          ? groups.length - 1
          : Math.max(0, Math.min(groups.length - 1, index + offset));
    setActive(hostRouteId(groups[next]));
    // Keep the moving highlight visible inside the list's own scroll.
    document
      .getElementById(optionId(idPrefix, groups[next]))
      ?.scrollIntoView?.({ block: "nearest" });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>): void => {
    switch (event.key) {
      case "ArrowDown":
      case "j":
      case "J":
        event.preventDefault();
        move(1);
        return;
      case "ArrowUp":
      case "k":
      case "K":
        event.preventDefault();
        move(-1);
        return;
      case "Home":
        event.preventDefault();
        move("first");
        return;
      case "End":
        event.preventDefault();
        move("last");
        return;
      case "Enter": {
        event.preventDefault();
        const active =
          activeRouteId === null
            ? undefined
            : groups.find((g) => hostRouteId(g) === activeRouteId);
        if (active !== undefined) onNavigate(active);
        return;
      }
      case "Escape":
        // The caller owns the overlay (the sheet closes; ≥xl panel: no-op).
        onEscape?.();
        return;
      default:
        return;
    }
  };

  return (
    <ul
      role="listbox"
      id={`${idPrefix}-listbox`}
      aria-label={t("agents.hosts.rosterRegion")}
      aria-activedescendant={
        activeRouteId !== null ? `${idPrefix}-opt-${activeRouteId}` : undefined
      }
      tabIndex={0}
      onKeyDown={onKeyDown}
      // The sheet mounts open: the LIST takes the initial focus (not the
      // filter chips — the roster is the dialog's purpose).
      autoFocus={variant === "sheet"}
      className="space-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
    >
      {groups.map((group) => (
        <HostRow
          key={group.host || "__unreported__"}
          idPrefix={idPrefix}
          group={group}
          selected={hostRouteId(group) === selectedId}
          active={hostRouteId(group) === activeRouteId}
          onSelect={() => {
            setActive(hostRouteId(group));
            onNavigate(group);
          }}
          assignments={assignments}
          meta={meta}
          now={now}
          titleOf={titleOf}
          variant={variant}
        />
      ))}
    </ul>
  );
}

// --- the roster row (the inversion: compact row, NOT a card) ---------------------

/**
 * One host OPTION: presence word + dot (or the «ждёт решения» pill while a
 * registration decision is pending), the host name, «N/M harnesses online»,
 * the active-work chip, the freshest report age. The row is a listbox
 * option (A2 §3.E) — click selects+opens, aria-selected+aria-current carry
 * the selection, the row flares ONCE on a real member presence transition
 * (presenceLight); a revoked host renders muted — a dead row invites no
 * colour optimism. Sheet variant: ≥48px rows (the touch pass).
 */
function HostRow({
  idPrefix,
  group,
  selected,
  active,
  onSelect,
  assignments,
  meta,
  now,
  titleOf,
  variant = "panel",
}: {
  idPrefix: string;
  group: HostGroup;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
  assignments: readonly AssignmentItem[];
  meta: ExecutorListMeta | undefined;
  now: number;
  titleOf: (taskId: string) => string;
  variant?: "panel" | "sheet";
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
    <li
      role="option"
      id={optionId(idPrefix, group)}
      aria-selected={selected}
      aria-current={selected ? "page" : undefined}
      onClick={onSelect}
      className={cn(
        "flex min-h-11 cursor-pointer flex-col justify-center gap-0.5 rounded-sm border-l-2 px-2 py-1.5 text-left text-sm transition-colors duration-instant hover:bg-elevated",
        variant === "sheet" && "min-h-12 py-2",
        active && "-outline-offset-2 outline-2 outline-iris-bright",
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
        <span
          className="shrink-0 font-mono tabular-nums text-foreground-muted"
          title={t("agents.hosts.harnessHint")}
        >
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
    </li>
  );
}
