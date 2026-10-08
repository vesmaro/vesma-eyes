import { useCallback, forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BoardTask } from "@/gateway/boardTypes";
import { ActiveAssignmentBadge } from "@/features/agents/ActiveAssignmentBadge";
import { useT, useI18n } from "@/i18n";
import { withReturn } from "@/lib/returnParams";
import {
  formatTaskDate,
  isArchcomReviewTask,
  isValidatingTask,
  priorityBadgeVariant,
  priorityLabelKey,
  taskLifecycleLabel,
} from "./taskStatus";
import { BlockedReasonLine, HighlightedTitle, ValidatingClock } from "./taskCardParts";
import { useValidationNow } from "./useValidationClock";
import { useFreshDoneTransit } from "./doneTransitStore";
import { TaskRowMenu } from "./TaskRowMenu";

/**
 * One kanban card (Ф3, ARCHCOM-3 verdict §3), TWO skins (CV-5):
 * - "dense" — the Ф3 grouped-board card (project accordions), unchanged;
 * - "classic" — the flat classic-kanban card: the SAME content (priority,
 *   archcom badge, ⋯ menu, title link + q highlight, validation clock,
 *   project/agents/date/reports meta) with roomier padding and rhythm —
 *   the classic kanon without a second feature set.
 * The card BODY is the pointer drag surface (pointer sensor + DragOverlay
 * live in the page); the TITLE is the keyboard/screen-reader path into
 * `/tasks/:id`, and the ⋯ menu carries the canonical keyboard move
 * («Переместить…» — the verdict's keyboard path; a dnd-kit keyboard sensor
 * stays a deliberate later enhancement).
 *
 * Without a ui token the card is NOT draggable (owner decision CV-4 §3: the
 * simpler honest option — no phantom "drag then log in" queue): the drag is
 * disabled, the cursor stays default and the tooltip says why. The card
 * remains fully readable and navigable.
 *
 * `content-visibility: auto` + `contain-intrinsic-size` keep long columns
 * cheap to paint (verdict §3: the 100+-tasks posture without virtualizing).
 *
 * Context menu (fix/kanban-context-menu): the card carries the SAME ⋯ menu
 * as the list (TaskRowMenu in controlled mode) with TWO entries — the
 * hover-revealed ⋯ trigger (tab-reachable, focus-visible) and the card
 * right-click (`onContextMenu` + preventDefault → popup at the cursor).
 * The card root gets a light hover state (token border shift) so the ⋯
 * affordance reads; pointer presses inside the trigger/popup never reach
 * the dnd-kit listeners (TaskRowMenu stops pointerdown propagation).
 */

/** Per-skin spacing/intrinsic-size scale (CV-5: classic = roomier canon). */
const CARD_SKIN = {
  dense: {
    pad: "px-2.5 py-2 ",
    intrinsic: "[contain-intrinsic-size:auto_7rem] ",
    clockGap: "mt-0.5 ",
    titleGap: "mt-1 ",
    metaGap: "mt-1.5 gap-x-2 gap-y-1 ",
  },
  classic: {
    pad: "px-3 py-3 ",
    intrinsic: "[contain-intrinsic-size:auto_9rem] ",
    clockGap: "mt-1 ",
    titleGap: "mt-2 ",
    metaGap: "mt-2 gap-x-2.5 gap-y-1.5 ",
  },
} as const;

export type TaskCardSkin = keyof typeof CARD_SKIN;

/**
 * ME-071 W3 slice 2 (15-WOW §3.4.2): the перелёт (FLIP from the pre-patch
 * viewport position, 400ms --ease-enter via --duration-fly) → gold flash +
 * hold (the W0 token pair) on arrival. DEVIATION from the stand's beat order
 * (flash on the OLD spot → fly): the SSE mirror patches the cache INSTANTLY
 * (ARCHCOM-3 verdict §3 forbids the refetch/deferral), so the old row leaves
 * the React tree at once — the flight starts from the measured position and
 * the flash lands on arrival. Reduced: --duration-fly collapses to 0ms (the
 * token mirror) → instant reposition + the static 1.5s tint. A reloaded page
 * replays nothing: no records → no beat (the store is fed only by the live
 * bridge).
 *
 * Review fix (P2): this is a NULL-rendering leaf. The freshness read
 * subscribes to the shared duty-cycled clock (250ms while a transit is
 * fresh) — at card-body level every tick re-rendered EVERY card on the board
 * (~8 full-tree renders per event, and bursts stack). Here only this leaf
 * re-renders per tick; the heavy card body stays out of the clock
 * subscription. Behaviour identical, the one-beat-per-transit guard intact.
 */
function DoneFlashChoreography({
  taskId,
  targetRef,
  active,
}: {
  taskId: string;
  /** The card root li — the classes and the beat marker land here. */
  targetRef: React.RefObject<HTMLLIElement | null>;
  /** A terminal transit choreographs only the in-board card (never the ghost). */
  active: boolean;
}) {
  const freshTransit = useFreshDoneTransit(taskId);
  useLayoutEffect(() => {
    if (!active || !freshTransit) return;
    // Child layout effects run BEFORE the host <li>'s ref callback attaches
    // (React commits a host ref at the host fiber, after its subtree's
    // layout effects) — the old body-level effect ran after the attach; this
    // leaf runs before it and saw targetRef.current === null. One microtask
    // later the commit has finished and the ref is set, and a microtask
    // still flushes before the next paint, so the FLIP stays pre-paint
    // (verified by the 2026-10-06 instrumented run: layout pass null,
    // microtask attached, always).
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const el = targetRef.current;
      if (!el) return;
      if (el.dataset.doneBeat === String(freshTransit.at)) return; // one beat per transit
      el.dataset.doneBeat = String(freshTransit.at);
      const rootStyle = getComputedStyle(document.documentElement);
      const flyMs = parseFloat(rootStyle.getPropertyValue("--duration-fly")) || 0;
      const flash = () => {
        el.classList.add("task-done-flash");
        // Drop the class after the token-driven animation (fallback covers
        // engines without Animation events).
        const total = (parseFloat(getComputedStyle(el).animationDuration) || 0.84) * 1000;
        window.setTimeout(() => el.classList.remove("task-done-flash"), total + 120);
      };
      if (freshTransit.from && flyMs > 0 && typeof el.animate === "function") {
        const dx = freshTransit.from.x - el.getBoundingClientRect().left;
        const dy = freshTransit.from.y - el.getBoundingClientRect().top;
        // Review fix: the flying card must pass OVER later-DOM columns, not
        // under them — z-lift for the flight duration, dropped at finish just
        // like the flash class.
        el.classList.add("task-done-fly");
        const anim = el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: "translate(0, 0)" },
          ],
          {
            duration: flyMs,
            easing: rootStyle.getPropertyValue("--ease-enter").trim() || "ease-out",
          },
        );
        anim.onfinish = () => {
          el.classList.remove("task-done-fly");
          flash();
        };
      } else {
        flash();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [freshTransit, active, targetRef]);
  // The classes are applied imperatively above; this cleanup only guarantees
  // a clean unmount path (no class leak into reused DOM).
  useEffect(() => () => {
    targetRef.current?.classList.remove("task-done-flash");
    targetRef.current?.classList.remove("task-done-fly");
  }, [targetRef]);
  return null;
}

/** Shared card body — the sortable card and the DragOverlay ghost render it. */
const TaskCardBody = forwardRef<
  HTMLLIElement,
  {
    task: BoardTask;
    reportCount?: number;
    canDrag: boolean;
    showMenu: boolean;
    query?: string;
    skin: TaskCardSkin;
    overlay?: boolean;
    dragging?: boolean;
    style?: React.CSSProperties;
    /** The kanban lane the card sits in (ME-071 W3: drives the blocked
     * edge; the ghost passes the dragged task's own column). */
    column?: string;
    /** ME-071 W3: the golden waiting edge («Ждут владельца» facade active
     * and the card sits in the decision lane). */
    attention?: boolean;
    /** dnd-kit pointer listeners, spread onto the card root. */
    dragHandlers?: React.DOMAttributes<HTMLLIElement>;
  } & React.HTMLAttributes<HTMLLIElement>
>(function TaskCardBody(
  {
    task,
    reportCount,
    canDrag,
    showMenu,
    query = "",
    skin,
    overlay = false,
    dragging = false,
    style,
    column,
    attention = false,
    dragHandlers,
    ...rest
  },
  ref,
) {
  const t = useT();
  const { lang } = useI18n();
  // ME-071 W3 slice 2: the done спектакль (перелёт + gold flash) lives in
  // DoneFlashChoreography — the null-rendering leaf above — so the heavy
  // card body stays out of the freshness clock's subscription (review fix).
  const liRef = useRef<HTMLLIElement | null>(null);
  const isTerminal = task.col === "resolved" || task.col === "done";
  // ME-071 W3 slice 1: the blocked lane carries the reason edge — the
  // colour edge is duplicated by the sr-only reason text (WCAG 1.4.1).
  const blocked = column === "blocked";
  // ME-074: the card's lifecycle line — «поступила 28.09 · висит 2 дня» on
  // live lanes, «… · завершена 01.10 в 14:05» on resolved/done. The shared
  // 1 Hz domain clock (useValidationClock) supplies "now": one interval for
  // the whole board, ages stay live, SSR renders deterministic (snapshot 0
  // → arrival only, the browser fills the age on mount).
  const now = useValidationNow();
  // UI-18 pair 1: the board URL (filters included) rides along as `return=`
  // so the detail page's back control leads home. Read once per render —
  // no effects, no subscriptions (freeze-gate safe by construction).
  const location = useLocation();
  const detailHref = withReturn(
    `/tasks/${encodeURIComponent(task.id)}`,
    location.pathname,
    location.search,
  );
  const spacing = CARD_SKIN[skin];
  // Card-owned context menu (right-click + ⋯): `menuAt` is the cursor anchor
  // of the LAST right-click; it is cleared on close so the next ⋯ open
  // anchors to the button again.
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const handleMenuOpenChange = useCallback((next: boolean) => {
    setMenuOpen(next);
    if (!next) setMenuAt(null);
  }, []);
  return (
    <li
      ref={(node) => {
        // The choreography ref (slice 2) composed with the caller's ref
        // (dnd-kit's setNodeRef / the ghost's plain pass-through).
        liRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      data-task-id={task.id}
      style={style}
      title={canDrag ? undefined : t("tasks.board.dragDisabled")}
      onContextMenu={
        showMenu
          ? (event) => {
              // Right-click = the same ⋯ menu, anchored at the cursor (the
              // browser menu yields; the keyboard path stays the ⋯ button).
              event.preventDefault();
              setMenuAt({ x: event.clientX, y: event.clientY });
              setMenuOpen(true);
            }
          : undefined
      }
      className={
        "group/card relative list-none rounded-md border border-border-subtle bg-well text-sm shadow-well transition-colors duration-instant hover:border-iris-bright/40 [content-visibility:auto] " +
        spacing.pad +
        spacing.intrinsic +
        (overlay
          ? "rotate-2 border-iris-bright/60 shadow-modal "
          : "focus-within:border-iris-bright/60 ") +
        (canDrag && !overlay
          ? "cursor-grab active:cursor-grabbing "
          : "cursor-default ") +
        (dragging && !overlay ? "opacity-30 " : "") +
        // ME-071 W3: blocked reason edge (left accent, error family).
        (blocked && !overlay
          ? "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:rounded-l-md before:bg-error/80 before:content-[''] "
          : "") +
        // ME-071 W3: the waiting facade's golden attention edge — colour
        // duplicated by the pressed chip and the count (1.4.1). No alpha
        // modifier on the var-based token (Tailwind 3 cannot compose it —
        // the ring would silently fall back to the default blue).
        (attention && !overlay ? "ring-2 ring-confidence " : "")
      }
      {...dragHandlers}
      {...rest}
    >
      <DoneFlashChoreography
        taskId={task.id}
        targetRef={liRef}
        active={isTerminal && !overlay}
      />
      <div className="flex items-start justify-between gap-1">
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          <Badge variant={priorityBadgeVariant(task.priority)} className="shrink-0">
            {t(priorityLabelKey(task.priority))}
          </Badge>
          {/* Active-assignment chip (AGW-2): iris contour for claimed/running,
           * neutral for queued; deep-links to the «Исполнение» tab. */}
          <ActiveAssignmentBadge taskId={task.id} />
        </span>
        <span className="flex items-center gap-1">
          {isArchcomReviewTask(task) ? (
            <Badge
              variant="confidence"
              className="font-mono uppercase"
              title={t("tasks.board.archcomTitle")}
            >
              {t("tasks.board.archcomBadge")}
            </Badge>
          ) : null}
          {showMenu ? (
            <TaskRowMenu
              task={task}
              open={menuOpen}
              onOpenChange={handleMenuOpenChange}
              position={menuAt}
              revealOnParentHover
            />
          ) : null}
        </span>
      </div>

      <h3
        className={
          "break-words text-sm font-medium leading-snug " + spacing.titleGap
        }
      >
        <Link
          to={detailHref}
          className="text-foreground underline-offset-2 hover:text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
        >
          <HighlightedTitle title={task.title} query={query} />
        </Link>
      </h3>

      {/* ME-071 W3 → U3: the blocked lane's reason is now a VISIBLE human
       * line (⟂ + text from the task's own data) — the colour edge alone was
       * the 1.4.1 risk and the old sr-only line said only the generic. The
       * caller-level gate keeps the observers off the 6 non-blocked lanes. */}
      {blocked && !overlay ? (
        <BlockedReasonLine task={task} className={spacing.clockGap} />
      ) : null}

      {isValidatingTask(task) ? (
        <ValidatingClock since={task.validating_since} className={spacing.clockGap} />
      ) : null}

      <div
        className={
          "flex flex-wrap items-center text-xs text-foreground-secondary " +
          spacing.metaGap
        }
      >
        {task.project ? (
          <span className="rounded-sm bg-elevated px-1.5 py-0.5">{task.project}</span>
        ) : null}
        {(task.agents ?? []).length > 0 ? (
          <span
            className="truncate"
            title={(task.agents ?? [])
              .map((agent) => t("tasks.agentChip", { agent }))
              .join(", ")}
          >
            {(task.agents ?? []).join(", ")}
          </span>
        ) : null}
        <span
          className="ml-auto whitespace-nowrap text-foreground-muted"
          title={`${t("tasks.updatedLabel")}: ${formatTaskDate(task.updated_at, lang)}`}
        >
          {taskLifecycleLabel(task, lang, now, t) ||
            formatTaskDate(task.updated_at, lang)}
        </span>
        {reportCount ? (
          <span
            className="inline-flex items-center gap-0.5 text-foreground-muted"
            title={t("tasks.reportsCountTitle", { count: reportCount })}
          >
            <MessageSquare className="size-3" aria-hidden="true" />
            {reportCount}
          </span>
        ) : null}
      </div>

      {!canDrag ? (
        <span className="sr-only">{t("tasks.board.dragDisabled")}</span>
      ) : null}
    </li>
  );
});

/** The sortable card — dnd-kit wiring around the shared body. */
export function TaskBoardCard(props: {
  task: BoardTask;
  reportCount?: number;
  canDrag: boolean;
  showMenu: boolean;
  query?: string;
  /** Card skin (CV-5): "dense" for the grouped board, "classic" for flat. */
  skin?: TaskCardSkin;
  /** The lane the card sits in (ME-071 W3: blocked edge). */
  column?: string;
  /** The golden waiting edge (ME-071 W3 facade). */
  attention?: boolean;
}) {
  const { task, canDrag } = props;
  // NOTE: dnd-kit's useSortable returns plain render values (transform,
  // transition, isDragging, listeners) alongside a callback ref (setNodeRef)
  // in ONE object — destructuring (not member access) keeps the compiler-
  // based react-hooks/refs rule from misreading the values as ref access.
  const { setNodeRef, transform, transition, isDragging, listeners } = useSortable({
    id: task.id,
    disabled: !canDrag,
    data: { type: "task", task },
  });
  return (
    <TaskCardBody
      {...props}
      skin={props.skin ?? "dense"}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      dragging={isDragging}
      dragHandlers={
        canDrag
          ? (listeners as unknown as React.DOMAttributes<HTMLLIElement>)
          : undefined
      }
    />
  );
}

/**
 * The DragOverlay ghost (verdict §3): the same body WITHOUT sortable wiring
 * (a second registered sortable id would collide with the real card), lifted
 * visual treatment. Reduced-motion users get the plain card — no rotation.
 */
export function TaskBoardCardGhost({
  task,
  reportCount,
  showMenu,
  query,
  skin = "dense",
  reducedMotion = false,
  column,
}: {
  task: BoardTask;
  reportCount?: number;
  showMenu: boolean;
  query?: string;
  /** Card skin (CV-5) — the ghost mirrors the board the drag started on. */
  skin?: TaskCardSkin;
  reducedMotion?: boolean;
  /** The dragged task's own lane (ME-071 W3; edges stay off the ghost). */
  column?: string;
}) {
  return (
    <TaskCardBody
      task={task}
      reportCount={reportCount}
      canDrag
      showMenu={showMenu}
      query={query}
      skin={skin}
      overlay={!reducedMotion}
      column={column}
    />
  );
}
