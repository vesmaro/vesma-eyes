import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BoardTask } from "@/gateway/boardTypes";
import { useT } from "@/i18n";
import { columnHintKey, columnLabelKey } from "./taskStatus";
import { groupTasksByProject, sortGroupTasks } from "./taskGrouping";
import { columnDropId, groupDropId } from "./boardDnd";
import { TaskBoardCard } from "./TaskBoardCard";
import type { BoardStyle } from "./tasksViewPrefs";

/**
 * One kanban column (Ф3; CV-5 adds the second style): wire column title +
 * counter, a SortableContext for the vertical in-column reorder and a
 * column-root droppable (append target / empty column landing zone) — the
 * SHARED layer of both board styles. The style prop only switches the list
 * rendering inside:
 *
 * - "groups" (Ф3 default, unchanged): project-group accordions INSIDE the
 *   column (the persisted "vesmaro.taskGroups" set is shared with the list
 *   view), each collapsed header doubling as an append droppable;
 * - "classic" (CV-5): NO accordions — one flat card list, classic kanon
 *   order priority → position (the list view's `sortGroupTasks`
 *   comparator), roomier cards, taller column with internal scroll.
 *
 * Compact density narrows the columns (verdict §3 "тонкие колонки"); the
 * board scrolls horizontally when the 7 lanes outgrow the viewport.
 *
 * DnD semantics are the SAME in both styles: the page-level resolver works
 * on the wire position order (the single source of truth for `position`),
 * so a classic-view drop resolves against the wire order and the priority
 * projection re-sorts the resting place — the standard behaviour of a
 * sorted kanban, never a second resolver.
 *
 * ME-077: the header carries a hint line (whose action moves the card
 * onward — owner vs executor) and the column can render COLLAPSED to a
 * narrow strip when it is empty (`emptyCollapsed` — the page defaults the
 * pre-validation lanes to folded in the "all 7" mode; one click unfolds).
 * The collapsed strip keeps the column-root droppable so a drag onto it
 * still appends into the lane.
 */
export function TaskBoardColumn({
  column,
  tasks,
  totalCount,
  canDrag,
  showMenu,
  reportCounts,
  query,
  collapsed,
  onToggleGroup,
  compact,
  style,
  emptyCollapsed = false,
  onToggleEmptyCollapse,
  tempo,
  waitingFocus = false,
}: {
  column: string;
  /** Position-ordered tasks of THIS column (already filtered). */
  tasks: readonly BoardTask[];
  /** Whole-board count for the header (wire semantics: never filtered). */
  totalCount: number;
  canDrag: boolean;
  showMenu: boolean;
  reportCounts: Readonly<Record<string, number>>;
  query?: string;
  /** Persisted collapsed-project set (shared with the list view). */
  collapsed: ReadonlySet<string>;
  onToggleGroup: (project: string) => void;
  compact: boolean;
  /** Board render style (CV-5): "groups" accordions or "classic" flat flow. */
  style: BoardStyle;
  /** ME-077: fold the column to a narrow strip while it is empty. */
  emptyCollapsed?: boolean;
  onToggleEmptyCollapse?: () => void;
  /** ME-071 W3 (15-WOW §3.4): the done-tempo (решений/час, trailing 60 min
   * of the live bus) — passed for the resolved column only; rendered INSIDE
   * the framed counter (one header look per ME-072 A), only when the bus
   * has actually delivered a transition this hour (no fake zeros). */
  tempo?: number;
  /** ME-071 W3: the waiting facade is active — validating cards carry the
   * golden attention edge (the chip + text duplicate the colour, 1.4.1). */
  waitingFocus?: boolean;
}) {
  const t = useT();
  const groups = groupTasksByProject(tasks);
  // Classic render order: priority → position (grouped keeps the wire order —
  // the accordions own their in-group sequencing).
  const visibleTasks = style === "classic" ? sortGroupTasks(tasks) : tasks;
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(column),
    disabled: !canDrag,
    data: { type: "column", col: column },
  });
  const hint = columnHintKey(column);
  const label = t(columnLabelKey(column));

  // ME-077 collapsed-empty strip: the lane stays visible and keeps its
  // append droppable (drag onto the strip appends), it just stops taking
  // horizontal space. The fold keys off the WHOLE-BOARD count — a column
  // emptied by the active filters still renders unfolded. aria-expanded +
  // a labelled unfold button keep the keyboard/screen-reader path equal to
  // the pointer path. U7 mobile: below md the board stacks VERTICALLY, so
  // the strip folds to a full-width horizontal band (same droppable, same
  // unfold) instead of a vertical sliver.
  if (emptyCollapsed && totalCount === 0) {
    return (
      <section
        ref={setNodeRef}
        data-column={column}
        aria-label={t("tasks.board.columnLabel", { col: label })}
        className={
          "flex h-11 w-full shrink-0 flex-row items-center justify-between gap-1 rounded-lg border border-border-subtle bg-base/40 px-2 py-1 md:h-auto md:w-11 md:flex-col md:justify-start md:px-0 md:py-2 " +
          (isOver ? " border-iris-bright/60" : "")
        }
      >
        <button
          type="button"
          onClick={onToggleEmptyCollapse}
          aria-expanded={false}
          aria-label={t("tasks.board.expandColumn", { col: label })}
          className="flex max-md:min-h-9 flex-row items-center gap-1 rounded-sm py-0.5 text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:flex-col"
        >
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <span
            className="text-xs font-semibold md:[writing-mode:vertical-rl]"
            aria-hidden="true"
          >
            {label}
          </span>
        </button>
        <Badge variant="outline" className="font-mono">
          {totalCount}
        </Badge>
      </section>
    );
  }

  return (
    <section
      data-column={column}
      aria-label={t("tasks.board.columnLabel", { col: label })}
      className={
        // U7 mobile: the board stacks vertically below md — a column takes
        // the full row width; the horizontal scroll affordance is md+ only.
        "flex w-full shrink-0 flex-col rounded-lg border border-border-subtle bg-base/40 " +
        (compact ? "md:w-60" : "md:w-72") +
        (isOver ? " border-iris-bright/60" : "")
      }
    >
      <header
        className={
          "flex items-start justify-between gap-2 border-b border-border-subtle px-3 " +
          (compact ? "py-1.5" : "py-2")
        }
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground-secondary">
            {label}
          </h2>
          {/* ME-077: whose action moves the card onward — the owner's
           * accept/validate lanes vs the executor's work lanes. */}
          {hint ? (
            <p className="mt-0.5 text-[11px] leading-tight text-foreground-muted">
              {t(hint)}
            </p>
          ) : null}
        </div>
        {/* ME-072 A: ONE header pattern — the framed outline counter for
         * EVERY column. Per-column colour chips (iris/error/success) made
         * two header looks (framed vs floating) and read as different
         * entities; card-level workflow colours are untouched. */}
        {/* ME-071 W3: the tempo rides INSIDE the same frame («ОТКРЫТО 3 ·
         * N/ч» — §3.4 tabular); tabular-nums keeps it from reflowing the
         * counter, the sr-only text names the unit (4.1.2). */}
        <Badge variant="outline" className="font-mono tabular-nums">
          {totalCount}
          {tempo !== undefined && tempo > 0 ? (
            <>
              <span aria-hidden="true" className="text-confidence">
                {" "}
                ·{tempo}
                {t("tasks.board.doneTempoUnit")}
              </span>
              <span className="sr-only">
                {t("tasks.board.doneTempoAria", { count: tempo })}
              </span>
            </>
          ) : null}
        </Badge>
      </header>

      <div
        ref={setNodeRef}
        className={
          "flex-1 p-2 md:overflow-y-auto " +
          // Classic columns run taller (CV-5 "во всю высоту" within the
          // document-scrolled shell): the viewport cap keeps the scroll
          // INTERNAL to the column, the page never scrolls under the board.
          // U7 mobile: no internal cap below md — the honest document flow
          // scrolls with the page.
          (style === "classic"
            ? compact
              ? "md:max-h-[75vh] "
              : "md:max-h-[80vh] "
            : compact
              ? "md:max-h-[70vh] "
              : "md:max-h-[75vh] ")
        }
      >
        <SortableContext
          items={visibleTasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          {style === "classic" ? (
            <ul className="space-y-2">
              {visibleTasks.map((task) => (
                <TaskBoardCard
                  key={task.id}
                  task={task}
                  reportCount={reportCounts[task.id]}
                  canDrag={canDrag}
                  showMenu={showMenu}
                  query={query}
                  skin="classic"
                  column={column}
                  attention={waitingFocus && column === "validating"}
                />
              ))}
            </ul>
          ) : (
            <div className="space-y-2">
              {groups.map((group) => (
                <BoardGroup
                  key={group.project || "__none"}
                  column={column}
                  project={group.project}
                  tasks={group.tasks}
                  canDrag={canDrag}
                  showMenu={showMenu}
                  reportCounts={reportCounts}
                  query={query}
                  collapsed={collapsed.has(group.project)}
                  onToggle={() => onToggleGroup(group.project)}
                  attention={waitingFocus && column === "validating"}
                />
              ))}
            </div>
          )}
        </SortableContext>

        {tasks.length === 0 ? (
          <p className="px-1 py-2 text-xs text-foreground-muted">
            {query ? t("tasks.board.noMatchColumn") : t("tasks.board.emptyColumn")}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * One project accordion inside a column. The header doubles as a droppable
 * target: dropping onto a COLLAPSED group header appends the card to the end
 * of that group (CV-4 §3 — the folded group's only entry point); on an
 * expanded group the cards themselves are the finer-grained targets.
 */
function BoardGroup({
  column,
  project,
  tasks,
  canDrag,
  showMenu,
  reportCounts,
  query,
  collapsed,
  onToggle,
  attention = false,
}: {
  column: string;
  project: string;
  tasks: readonly BoardTask[];
  canDrag: boolean;
  showMenu: boolean;
  reportCounts: Readonly<Record<string, number>>;
  query?: string;
  collapsed: boolean;
  onToggle: () => void;
  /** ME-071 W3: the golden waiting edge for validating cards. */
  attention?: boolean;
}) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({
    id: groupDropId(column, project),
    disabled: !canDrag,
    data: { type: "group", col: column, project },
  });

  return (
    <div>
      <button
        ref={setNodeRef}
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className={
          "flex max-md:min-h-12 w-full items-center gap-1 rounded-sm py-0.5 text-xs font-medium text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright " +
          (isOver ? "bg-iris/10 text-iris-bright" : "")
        }
      >
        {collapsed ? (
          <ChevronRight className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5" aria-hidden="true" />
        )}
        <span>{project || t("tasks.noProject")}</span>
        <span className="font-mono text-foreground-muted">{tasks.length}</span>
      </button>

      {collapsed ? null : (
        <ul className="mt-1 space-y-1.5 pl-1">
          {tasks.map((task) => (
            <TaskBoardCard
              key={task.id}
              task={task}
              reportCount={reportCounts[task.id]}
              canDrag={canDrag}
              showMenu={showMenu}
              query={query}
              column={column}
              attention={attention}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
