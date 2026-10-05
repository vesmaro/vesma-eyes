import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
// @dnd-kit (ARCHCOM-3 verdict §3, ratified): the kanban is the PRIMARY
// surface of the Задачи domain; core+sortable land ~14–18 KB gz together,
// over the 10 KB gz dependency budget — accepted in writing by the verdict
// (pointer + later-keyboard dragging with accessible semantics; no
// hand-rolled alternative covers both within budget).
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { TableRowSkeleton } from "@/components/skeletons/Skeletons";
import { useDensity } from "@/components/density-provider";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useToast } from "@/components/Toast/toastContext";
import { isTaskMutationSource, isTaskSource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import { useUiToken } from "@/features/ui-token/UiTokenContext";
import { hasDeviceToken } from "@/gateway/deviceToken";
import { useT } from "@/i18n";
import { columnLabelKey } from "./taskStatus";
import { buildOrderedColumns } from "./boardDnd";
import { BoardColumnsToggle } from "./BoardColumnsToggle";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { TaskBoardColumn } from "./TaskBoardColumn";
import { TaskBoardCardGhost } from "./TaskBoardCard";
import { TaskDateFilter } from "./TaskDateFilter";
import { TaskFilterSelect } from "./TaskFilterSelect";
import { TasksUnsupported } from "./TasksUnsupported";
import { TasksViewToggle } from "./TasksViewToggle";
import { loadCollapsedGroups, saveCollapsedGroups } from "./taskGrouping";
import {
  loadBoardColumnsMode,
  saveBoardColumnsMode,
  visibleColumnsFor,
  type BoardColumnsMode,
} from "./tasksViewPrefs";
import {
  agentOptions,
  filterTasks,
  hasActiveTaskFilters,
  parseTaskListParams,
  projectOptions,
  serializeTaskListParams,
} from "./taskFilters";
import { useKanbanDnd } from "./useKanbanDnd";
import { useBoardTasks, useReportCounts } from "./useTasks";
import { useTaskMutations } from "./useTaskMutations";
import { useDoneTempo, useLatestDoneTransit } from "./doneTransitStore";
import { BoardStyleToggle } from "./BoardStyleToggle";
import { useBoardStyle } from "@/lib/boardStyleStore";
import { pageGridClass } from "@/layout/pageGrid";

/**
 * ME-071 W3 review fix (P1): a given transit announces AT MOST ONCE per page
 * session. The announce bookkeeping used to live in a useRef, which resets on
 * every remount — /tasks → /tasks/:id → back re-ran the effect with the SAME
 * store item (useLatestDoneTransit is age-blind; the store buffers up to 60
 * minutes) and replayed the old toast. Module scope survives the remount;
 * a reload replays nothing because the store itself is empty (fed only by
 * the live bridge). Bounded like the store buffer: past the cap the set
 * clears — the dropped keys belong to long-stale transits no remount will
 * reasonably resurrect.
 */
const announcedDoneTransits = new Set<string>();
const ANNOUNCED_CAP = 200;

/**
 * `/tasks` — the KANBAN view of the domain, view №1 per the redesign concept
 * §2 (Ф3 / CV-4, ADR 0011): 7 WF-1 columns from the wire `board.columns`,
 * project-group accordions inside each column (persisted
 * "vesmaro.taskGroups", shared with the list), pointer DnD with an overlay
 * ghost + optimistic move. URL filters: ?project=&agent=&q= — the same
 * dialect as the list (deep links and the view switch carry them over);
 * `q` additionally highlights the match inside card titles.
 *
 * The SSE bridge lives in the domain layout (TasksLayout) and patches
 * `tasks.board` surgically — this page NEVER refetches on task events.
 */
export function TaskBoardPage() {
  const gateway = useGateway();
  const capable = isTaskSource(gateway);
  return capable ? <TaskBoardView /> : <TasksUnsupported />;
}

/**
 * ME-072 A: does the board row overflow horizontally? Overlay-scroll
 * platforms (most Linux/GTK desktops, macOS, headless) render NO scrollbar
 * for overflow-x-auto, so a clipped 4th column read as broken layout. The
 * hook drives the right-edge fade affordance: measured, resize-aware
 * (ResizeObserver covers viewport changes and the sidebar collapse), never
 * guessed from column counts. Callback-ref shape: the board div does not
 * exist while the board is pending, so a plain ref + mount-time effect
 * would never (re)attach — the element identity IS the dependency.
 */
function useBoardOverflows() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    if (!el) return;
    const update = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  // ME-071 W3: the element itself rides along — the waiting facade's
  // bring-the-lane-into-view effect scrolls this container.
  return { boardRef: setEl, boardEl: el, overflows };
}

/** The board view — mounted only on task-capable gateways. */
function TaskBoardView() {
  const t = useT();
  const gateway = useGateway();
  const canMutate = isTaskMutationSource(gateway);
  const { tokenPresent } = useUiToken();
  const { density } = useDensity();
  const board = useBoardTasks();
  const [searchParams, setSearchParams] = useSearchParams();
  const state = parseTaskListParams(searchParams);
  // ME-071 W3: the waiting facade state — declared ahead of the hooks that
  // read it (the bring-the-lane-into-view effect's dep array evaluates
  // inline, before the visibleColumns memo below).
  const waitingActive = state.waiting === true;
  const [collapsed, setCollapsed] = useState(() => loadCollapsedGroups());
  // CV-5 / UI-23: the board render style («Группы | Классика») lives in the
  // shared store (lib/boardStyleStore.ts, persisted "vesmaro.boardStyle") —
  // the kanban toggle and the settings hub are two controls of ONE state
  // (spec §4.3); both styles share columns, DnD and filters.
  const [boardStyle] = useBoardStyle();
  // ME-077: column visibility («5 колонок | все 7») — a persisted board
  // setting; the pre-validation lanes fold by default while empty.
  const [columnsMode, setColumnsMode] = useState<BoardColumnsMode>(
    () => loadBoardColumnsMode(),
  );
  const changeColumnsMode = (mode: BoardColumnsMode) => {
    setColumnsMode(mode);
    saveBoardColumnsMode(mode);
  };
  // Session-local unfold overrides for the folded-empty lanes ("all" mode):
  // the DEFAULT is folded, the owner's unfold does not persist — the fold
  // is a de-clutter affordance, not a second board configuration.
  const [unfoldedEmpty, setUnfoldedEmpty] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleEmptyCollapse = (column: string) =>
    setUnfoldedEmpty((prev) => {
      const next = new Set(prev);
      if (next.has(column)) next.delete(column);
      else next.add(column);
      return next;
    });
  const [createOpen, setCreateOpen] = useState(false);
  const mutations = useTaskMutations();

  // ME-071 W3 (15-WOW §3.4/§8.5): the done-tempo derivation (решений/час,
  // trailing 60 min of the live bus) and the task.done toast — beat 3 of
  // the спектакль lands with slice 2; the toast IS the shared polite live
  // region (WCAG 4.1.3). Both hooks run on EVERY render (hook-order
  // discipline above) and stay inert until the first terminal event.
  const doneTempo = useDoneTempo();
  const latestTransit = useLatestDoneTransit();
  const toast = useToast();
  useEffect(() => {
    if (!latestTransit) return;
    const key = `${latestTransit.taskId}:${latestTransit.col}:${latestTransit.at}`;
    if (announcedDoneTransits.has(key)) return; // once per session, never on remount
    if (announcedDoneTransits.size >= ANNOUNCED_CAP) announcedDoneTransits.clear();
    announcedDoneTransits.add(key);
    toast.push({
      kind: "ok",
      title: t(
        latestTransit.col === "done"
          ? "tasks.board.doneToast"
          : "tasks.board.resolvedToast",
        { title: latestTransit.title },
      ),
    });
  }, [latestTransit, toast, t]);

  // Owner decision (CV-4 §3, the simpler honest variant) + scope v1
  // (ADR 0012 Amendment): cards drag on an owner session OR a paired
  // control device (the server's scope table rules the move itself);
  // a tokenless, deviceless browser still does not drag at all — tooltip
  // «войдите для управления». The keyboard move (⋯ → «Переместить…») still
  // leads through the standard token gate (runAuthorized).
  const canDrag = canMutate && (tokenPresent || hasDeviceToken());

  const tasks = useMemo(() => board.data?.tasks ?? [], [board.data]);
  const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const reportCounts = useReportCounts(taskIds);
  const reducedMotion = useReducedMotion();
  // ME-072 A: the measured overflow behind the right-edge fade affordance
  // (hook-order stable: runs before the pending/error early returns).
  const { boardRef, boardEl, overflows: boardOverflows } = useBoardOverflows();

  // ME-071 W3: the facade's «one gesture» promise (15-WOW §3.4) — when the
  // waiting filter is active the board BRINGS THE DECISION LANE INTO VIEW.
  // On a narrow viewport the wire-ordered board starts at the backlog lane;
  // a solutions mode that opens pointing at an empty lane reads as broken.
  // Viewport-rect math (never offsetParent), smooth unless reduced.
  // Review fix (P2): the lane DOM exists only once board.data has arrived
  // (columns render from data) — a cold ?waiting=1 deep link ran this effect
  // before the data landed and never re-ran. The readiness flag re-arms the
  // scroll exactly at data arrival (null → object), not on every patch.
  const boardReady = board.data != null;
  useEffect(() => {
    if (!waitingActive || !boardEl || !boardReady) return;
    const lane = boardEl.querySelector<HTMLElement>('[data-column="validating"]');
    if (!lane) return;
    const delta =
      lane.getBoundingClientRect().left - boardEl.getBoundingClientRect().left;
    if (Math.abs(delta) < 4) return;
    boardEl.scrollTo({
      left: boardEl.scrollLeft + delta,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [waitingActive, boardEl, reducedMotion, boardReady]);

  // Hook-order discipline: every hook below runs on EVERY render (the
  // pending/error early-returns come after), so the DnD wiring stays mounted
  // across fetch-state transitions — a drag started against stale-but-live
  // data never loses its sensor mid-flight.
  const filteredTasks = useMemo(() => filterTasks(tasks, state), [tasks, state]);
  const columns = useMemo(
    () => buildOrderedColumns(board.data?.columns ?? [], filteredTasks),
    [board.data, filteredTasks],
  );
  // ME-077 projection: compact shows the 5 workflow lanes; "all" shows the
  // full wire order. Hidden lanes with live cards surface in the honest
  // note row below — nothing disappears silently.
  // ME-071 W3: the waiting facade SURFACES the decision lane even in compact
  // mode — a filter that hides its own results would be a lie.
  const visibleColumns = useMemo(() => {
    const wire = board.data?.columns ?? [];
    const base = visibleColumnsFor(wire, columnsMode);
    if (!waitingActive || base.includes("validating")) return base;
    return wire.filter((c) => base.includes(c) || c === "validating");
  }, [board.data, columnsMode, waitingActive]);
  const preValidationLanes = new Set(["backlog", "validating"]);
  const dnd = useKanbanDnd({
    columns,
    canDrag,
    move: (task, col, position) => mutations.moveTaskOptimistic(task, col, position),
  });

  const patch = (changes: Partial<typeof state>) => {
    setSearchParams(serializeTaskListParams({ ...state, ...changes }), {
      replace: false,
    });
  };

  const toggleGroup = (project: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      saveCollapsedGroups(next);
      return next;
    });
  };

  // ME-072 A: the two segmented controls live at OPPOSITE ends of the
  // header — projection («Канбан | Список») next to the H1, board style
  // («Группы | Классика») on the actions side with «+ Задача». Adjacent
  // they read as one six-option control (audit v№10).
  // ME-071 W3: the whole-board validating count for the waiting facade —
  // derived from the UNFILTERED rows (wire semantics, the same rule as the
  // column counters), never from the filtered projection.
  const validatingCount = useMemo(
    () => tasks.filter((task) => task.col === "validating").length,
    [tasks],
  );
  const header = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 id="tasks-title" className="text-xl font-semibold">
            {t("tasks.title")}
          </h1>
          <TasksViewToggle />
          {/* ME-071 W3 (15-WOW §3.4): the «Ждут владельца» facade — the
           * golden chip-filter above the board; one gesture into decision
           * mode. WCAG 1.4.1: the gold edge on cards is duplicated by the
           * pressed chip + the count text; 4.1.2: aria-pressed carries the
           * toggle state. */}
          <Button
            variant="outline"
            size="sm"
            aria-pressed={waitingActive}
            onClick={() => patch({ waiting: waitingActive ? undefined : true })}
            title={t("tasks.board.waitingChipTitle")}
            className={
              "font-mono tabular-nums " +
              // The accepted Badge-confidence pair (T7-audited); the border
              // goes full-strength — an alpha modifier on a var-based token
              // is not composable in Tailwind 3 and would silently no-op.
              (waitingActive
                ? "border-confidence bg-confidence-tint text-confidence"
                : "")
            }
          >
            <span aria-hidden="true" className={waitingActive ? "" : "text-confidence"}>
              ◆
            </span>
            {t("tasks.board.waitingChip", { count: validatingCount })}
          </Button>
        </div>
        <div
          data-testid="board-header-actions"
          className="flex flex-wrap items-center gap-2"
        >
          {/* CV-5: board style lives ONLY on the kanban — the list has no
           * accordion/classic distinction. The toggle owns the store write. */}
          <BoardStyleToggle />
          {/* ME-077: column visibility (компакт 5 / все 7), persisted. */}
          <BoardColumnsToggle mode={columnsMode} onChange={changeColumnsMode} />
          {canMutate ? (
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              {t("tasks.create.label")}
            </Button>
          ) : null}
        </div>
      </div>
      {canMutate ? (
        <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
      ) : null}
    </>
  );

  if (board.isPending) {
    return (
      <section aria-labelledby="tasks-title" className={pageGridClass("operational", "space-y-4")}>
        {header}
        <div role="status" aria-label={t("tasks.loading")}>
          <TableRowSkeleton rows={6} columns={6} />
        </div>
      </section>
    );
  }

  if (board.isError) {
    return (
      <section aria-labelledby="tasks-title" className={pageGridClass("operational", "space-y-4")}>
        {header}
        <EmptyState
          variant="error"
          title={t("tasks.loadFailed")}
          message={board.error.message}
          action={
            <Button variant="outline" onClick={() => void board.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      </section>
    );
  }

  const wholeBoardCounts = board.data?.counts ?? {};
  const projectChoices = projectOptions(tasks);
  const agentChoices = agentOptions(tasks);
  const filtered = hasActiveTaskFilters(state);
  // ME-077 honest-degradation note: compact mode hides the pre-validation
  // lanes — when they hold live cards the board says so explicitly instead
  // of letting them vanish.
  const hiddenNonEmpty = (board.data?.columns ?? [])
    .filter((c) => !visibleColumns.includes(c))
    .filter((c) => (wholeBoardCounts[c] ?? 0) > 0);

  return (
    <section aria-labelledby="tasks-title" className={pageGridClass("operational", "space-y-4")}>
      {header}

      {/* Filters — URL state (?project=&agent=&q=), shared dialect with the
       * list view; q highlights matches inside card titles. */}
      <form
        className="flex flex-wrap items-end gap-3"
        aria-label={t("tasks.filterLabel")}
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="board-q" className="text-xs text-foreground-secondary">
            {t("tasks.searchLabel")}
          </label>
          <input
            id="board-q"
            type="search"
            value={state.q ?? ""}
            onChange={(event) => patch({ q: event.target.value || undefined })}
            placeholder={t("tasks.searchPlaceholder")}
            className="h-9 w-48 rounded-md border border-border bg-well px-2 text-sm text-foreground placeholder:text-foreground-muted focus-visible:border-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
          />
        </div>
        <TaskFilterSelect
          id="board-project"
          label={t("tasks.projectLabel")}
          value={state.project ?? ""}
          onChange={(value) => patch({ project: value || undefined })}
          allLabel={t("tasks.allProjects")}
          options={projectChoices.map((project) => ({
            value: project,
            label: project,
          }))}
        />
        <TaskFilterSelect
          id="board-agent"
          label={t("tasks.agentLabel")}
          value={state.agent ?? ""}
          onChange={(value) => patch({ agent: value || undefined })}
          allLabel={t("tasks.allAgents")}
          options={agentChoices.map((agent) => ({ value: agent, label: agent }))}
        />
        {/* ME-075: arrival/completion date bounds + presets (shared URL dialect). */}
        <TaskDateFilter state={state} patch={patch} />
        {filteredTasks.length === 0 && filtered ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              patch({
                project: undefined,
                agent: undefined,
                q: undefined,
                created_from: undefined,
                created_to: undefined,
                completed_from: undefined,
                completed_to: undefined,
                waiting: undefined,
              })
            }
          >
            {t("tasks.clearFilters")}
          </Button>
        ) : null}
      </form>

      {tasks.length === 0 ? (
        <EmptyState
          variant="empty"
          title={t("tasks.boardEmpty")}
          message={t("tasks.boardEmptyHint")}
        />
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          variant="empty"
          title={t("tasks.noMatch")}
          message={t("tasks.noMatchHint")}
        />
      ) : (
        <>
          {/* ME-077: hidden-but-non-empty lanes stay honest — the note names
           * them with their live counts. */}
          {columnsMode === "compact" && hiddenNonEmpty.length > 0 ? (
            <p className="text-xs text-foreground-muted" role="note">
              {t("tasks.board.hiddenColumns", {
                cols: hiddenNonEmpty
                  .map(
                    (c) =>
                      `${t(columnLabelKey(c))} (${wholeBoardCounts[c] ?? 0})`,
                  )
                  .join(", "),
              })}
            </p>
          ) : null}
          <DndContext {...dnd.dndContextProps}>
            {/* ME-072 A: the board row stretches its columns to ONE height
             * (items-stretch — empty columns no longer collapse) and the
             * horizontal scroll is an explicit AFFORDANCE: .board-scroll-x
             * keeps the scrollbar visible where the platform draws classic
             * ones, tabIndex keeps it keyboard-able (WCAG 2.1.1), and the
             * measured right-edge fade (below) signals the offscreen columns
             * on overlay-scroll platforms — at 1440 the 4th column peeks cut
             * and the cut reads as scrollable, not broken. */}
            <div className="relative">
              <div
                ref={boardRef}
                aria-label={t("tasks.board.label")}
                tabIndex={0}
                className="board-scroll-x flex items-stretch gap-3 overflow-x-auto pb-2"
              >
                {visibleColumns.map((column) => (
                  <TaskBoardColumn
                    key={column}
                    column={column}
                    tasks={columns.get(column) ?? []}
                    totalCount={wholeBoardCounts[column] ?? 0}
                    canDrag={canDrag}
                    showMenu={canMutate}
                    reportCounts={reportCounts}
                    query={state.q}
                    collapsed={collapsed}
                    onToggleGroup={toggleGroup}
                    compact={density === "compact"}
                    style={boardStyle}
                    emptyCollapsed={
                      columnsMode === "all" &&
                      preValidationLanes.has(column) &&
                      !unfoldedEmpty.has(column)
                    }
                    onToggleEmptyCollapse={() => toggleEmptyCollapse(column)}
                    tempo={column === "resolved" ? doneTempo : undefined}
                    waitingFocus={waitingActive}
                  />
                ))}
              </div>
              {/* The scroll affordance (ME-072 A): only when the board really
               * overflows — a page-background fade over the clipped last
               * column. Decorative: aria-hidden + pointer-events-none, the
               * scroll stays on the row (wheel/keyboard/drag). */}
              {boardOverflows ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent"
                />
              ) : null}
            </div>
            <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
              {dnd.activeTask ? (
                <TaskBoardCardGhost
                  task={dnd.activeTask}
                  reportCount={reportCounts[dnd.activeTask.id]}
                  showMenu={false}
                  query={state.q}
                  skin={boardStyle === "classic" ? "classic" : "dense"}
                  reducedMotion={reducedMotion}
                  column={dnd.activeTask.col}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
      )}
    </section>
  );
}

/**
 * `/tasks` index element: ALWAYS the kanban — the route is the contract
 * (owner feedback 2026-09-22: «Канбан — на канбан, список — на список»).
 * The former persisted-view redirect made /tasks silently land on the
 * list whenever `vesmaro.tasksView` held "list", overriding the explicit
 * sidebar navigation — the two entries appeared to override each other.
 * A stale localStorage key from older builds is simply ignored.
 */
export function TasksIndex() {
  return <TaskBoardPage />;
}
