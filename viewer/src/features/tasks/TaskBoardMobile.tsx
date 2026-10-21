import { useCallback, useRef } from "react";
import type { BoardTask } from "@/gateway/boardTypes";
import { useT } from "@/i18n";
import { columnLabelKey } from "./taskStatus";
import { TaskBoardColumn } from "./TaskBoardColumn";
import type { BoardStyle } from "./tasksViewPrefs";
import { swipeColumnIntent, type SwipePoint } from "./mobileBoardSwipe";

/**
 * W-C (user-panel verdict D5, P0): the 375 representation of the kanban —
 * ONE column at a time under a horizontally scrolling chip rail of all
 * visible lanes with their live (wire-semantics) counts, plus a
 * left/right swipe as the one-hand column switch. Replaces the old
 * below-md behaviour (ALL 7 columns stacked — prod measured 47 509 px of
 * page height, the panel's «десятки экранов»).
 *
 * Decisions:
 * - The chips are the SAME control grammar as the two header toggles
 *   (role="group" + aria-pressed buttons — the `button "все 7" [pressed]`
 *   pattern), not a tablist: they switch an in-page rendering mode, they
 *   do not move the user anywhere.
 * - Only the ACTIVE column mounts, so the page height collapses to
 *   roughly one screen (the column's card list scrolls INTERNALLY —
 *   `max-md:max-h-[60vh]` in TaskBoardColumn, the same honest internal
 *   scroll the desktop lanes already use). Cross-column DnD is impossible
 *   with a single mounted lane BY CONSTRUCTION — the canonical move path
 *   on touch is the card ⋯ menu («Переместить…» → column), which the
 *   always-visible mobile ⋯ trigger guarantees in ≤3 taps.
 * - The ACTIVE lane is OWNED BY THE PAGE (prop + onSelectColumn), not by
 *   this view: the waiting facade's one-gesture jump is then a plain
 *   event in the facade chip's onClick (and the cold ?waiting=1 deep
 *   link rides the initial state) — no state-sync effects anywhere.
 *   `null` means "auto" = the first visible lane; a lane dropped out of
 *   the visible set (a 5↔7 columnsMode switch) simply falls back —
 *   derived at render, no clamping effects.
 * - The active column is SESSION state (not persisted, not URL): a stale
 *   stored lane would fight the filters; the chips make any lane one tap
 *   away, so persistence buys nothing.
 * - Column switches are INSTANT (honest-light: no slide/fade animation).
 *
 * The viewport seam itself lives in boardViewport.ts (the Sidebar
 * useSyncExternalStore contract, SSR/tests → desktop).
 */

export interface TaskBoardMobileProps {
  visibleColumns: readonly string[];
  /** The page-owned active lane; null = auto (the first visible lane). */
  activeColumn: string | null;
  onSelectColumn: (column: string) => void;
  columns: ReadonlyMap<string, readonly BoardTask[]>;
  wholeBoardCounts: Readonly<Record<string, number>>;
  canDrag: boolean;
  showMenu: boolean;
  reportCounts: Readonly<Record<string, number>>;
  query?: string;
  collapsed: ReadonlySet<string>;
  onToggleGroup: (project: string) => void;
  compact: boolean;
  style: BoardStyle;
  waitingFocus: boolean;
  /** The resolved column's done-tempo (rides its header, desktop parity). */
  tempo?: number;
}

export function TaskBoardMobile({
  visibleColumns,
  activeColumn,
  onSelectColumn,
  columns,
  wholeBoardCounts,
  canDrag,
  showMenu,
  reportCounts,
  query,
  collapsed,
  onToggleGroup,
  compact,
  style,
  waitingFocus,
  tempo,
}: TaskBoardMobileProps) {
  const t = useT();
  // Derived clamp: a stale selection (lane hidden by a columnsMode switch)
  // falls back to the first visible lane — no effect, no second state.
  const effectiveColumn =
    activeColumn != null && visibleColumns.includes(activeColumn)
      ? activeColumn
      : (visibleColumns[0] ?? "");

  const stepColumn = useCallback(
    (intent: "next" | "prev") => {
      if (!effectiveColumn) return;
      const index = visibleColumns.indexOf(effectiveColumn);
      if (index < 0) return;
      const next = visibleColumns[index + (intent === "next" ? 1 : -1)];
      if (next) onSelectColumn(next);
    },
    [visibleColumns, effectiveColumn, onSelectColumn],
  );

  // The swipe seam: only the START/END points matter (a flick), the pure
  // classifier does the geometry — vertical scrolls, taps and reorder
  // drags all fail its thresholds and change nothing.
  const touchStart = useRef<SwipePoint | null>(null);
  const onTouchStart = useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }, []);
  const onTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start) return;
      const end = event.changedTouches[0];
      const intent = swipeColumnIntent(start, {
        x: end.clientX,
        y: end.clientY,
      });
      if (intent) stepColumn(intent);
    },
    [stepColumn],
  );

  if (!effectiveColumn) return null;
  const tasks = columns.get(effectiveColumn) ?? [];

  return (
    <div className="flex flex-col gap-3">
      {/* The chip rail — every visible lane with its live count, one tap
       * to jump. aria-pressed carries the selection (1.4.1/4.1.2: state
       * never rides colour alone — the pressed chip gets the iris tint,
       * exactly like the two header segmented controls). */}
      <div
        role="group"
        aria-label={t("tasks.board.mobileChipsLabel")}
        className="board-scroll-x flex items-center gap-1.5 overflow-x-auto pb-1"
      >
        {visibleColumns.map((column) => {
          const pressed = column === effectiveColumn;
          return (
            <button
              key={column}
              type="button"
              aria-pressed={pressed}
              onClick={() => onSelectColumn(column)}
              className={
                "inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors duration-instant focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright " +
                (pressed
                  ? "border-iris-bright/60 bg-iris-tint text-iris-bright"
                  : "border-border text-foreground-secondary hover:text-foreground")
              }
            >
              <span>{t(columnLabelKey(column))}</span>
              <span className="font-mono tabular-nums text-foreground-muted">
                {wholeBoardCounts[column] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
      {/* The swipe hint is screen-reader-only: the visual affordance is the
       * chip rail itself; swipe is the one-hand accelerator. */}
      <p className="sr-only">{t("tasks.board.mobileSwipeHint")}</p>
      <div className="touch-pan-y" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <TaskBoardColumn
          column={effectiveColumn}
          tasks={tasks}
          totalCount={wholeBoardCounts[effectiveColumn] ?? 0}
          canDrag={canDrag}
          showMenu={showMenu}
          reportCounts={reportCounts}
          query={query}
          collapsed={collapsed}
          onToggleGroup={onToggleGroup}
          compact={compact}
          style={style}
          // Folding an EMPTY lane makes no sense when it is the only lane
          // on screen — the chip already says 0.
          emptyCollapsed={false}
          tempo={effectiveColumn === "resolved" ? tempo : undefined}
          waitingFocus={waitingFocus}
        />
      </div>
    </div>
  );
}
