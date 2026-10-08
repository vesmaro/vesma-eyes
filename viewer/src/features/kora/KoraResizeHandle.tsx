import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The v7 seam handle (U5; 07l §3 — «Ресайз панелей», the wave's FINALE
 * BLOCKER): ONE implementation for all three seams (right panel width,
 * Пульт height, Эфир wing width).
 *
 * Anatomy (07l §3.1): a transparent hit zone ≥24px across the seam (WCAG
 * 2.5.8) carrying a 1px myelin hairline that widens to 4px and strengthens
 * on hover/focus/drag WITHOUT shifting content (the line is an absolutely
 * centred child). Drag = pointer capture, instant (no size animation,
 * §0), persist happens on COMMIT (pointerup / keyup), never per frame.
 *
 * Keyboard (07l §3.3, WCAG 2.1.1): the element is `role="separator"`,
 * `tabindex="0"` with aria-valuemin/max/now + a px valuetext; arrows move
 * ±step, Home = reset (the default/auto), End = maximum, Escape reverts
 * the whole series since focus. A keyboard step below `collapseBelow` is
 * the intent to collapse (the drag stickiness, mirrored for the keyboard —
 * without it a fixed min would make «свернуть» unreachable).
 *
 * State matrix (07l §3.4): the handle never disables; reduced-motion needs
 * no mirror (sizes never animate); the caller hides the handle where the
 * frame reflows (<lg — the panel leaves the frame geometry).
 */

export type SeamOrientation = "vertical" | "horizontal";

const px = (n: number): string => `${Math.round(n)} px`;

export function KoraResizeHandle({
  orientation,
  label,
  tooltip,
  min,
  max,
  value,
  valueText,
  step = 16,
  dragSign = 1,
  onValue,
  onCommit,
  onReset,
  collapseBelow,
  onCollapse,
  className,
}: {
  /** vertical = col-resize (a width), horizontal = row-resize (a height). */
  orientation: SeamOrientation;
  /** The accessible name, e.g. «Ширина панели хостов и сессий». */
  label: string;
  tooltip: string;
  min: number;
  max: number;
  /** The current controlled value (px) — mirrors the panel it rules. */
  value: number;
  /** Honest aria-valuetext («336 px» / «свёрнут, 40 px» / «авто»). */
  valueText: string;
  /** Keyboard step (07l §3.3: ±16px). */
  step?: number;
  onValue: (next: number) => void;
  /** Persist — on drag end / keyboard series end, never per frame (§3.2). */
  onCommit: () => void;
  /** dblclick / Home (07l §3.4: focus STAYS on the handle after a reset). */
  onReset: () => void;
  /** Vertical seams grow to the LEFT (ArrowLeft = wider) — the v12 sign. */
  dragSign?: 1 | -1;
  /** Drag/keyboard below this line means «свернуть» (Пульт гистерезис). */
  collapseBelow?: number;
  onCollapse?: () => void;
  className?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ pointer: number; value: number } | null>(null);
  // The value at focus — the Escape revert point for a keyboard series.
  const focusValue = useRef<number | null>(null);

  const clamp = (n: number): number => Math.min(max, Math.max(min, n));

  const pointerAxis = (event: React.PointerEvent): number =>
    orientation === "vertical" ? event.clientX : event.clientY;

  const startDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    dragStart.current = { pointer: pointerAxis(event), value };
    setDragging(true);
    // Capture keeps the drag alive outside the 24px zone (an enhancement —
    // engines without it still drag while the pointer stays on the seam).
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = dragStart.current;
    if (start === null) return;
    const delta =
      orientation === "vertical"
        ? (start.pointer - pointerAxis(event)) * dragSign
        : (pointerAxis(event) - start.pointer) * dragSign;
    const candidate = start.value + delta;
    if (collapseBelow !== undefined && candidate < collapseBelow) {
      onCollapse?.(); // instant stickiness (07l §3.2: <120px → свёрнут)
      return;
    }
    onValue(clamp(candidate));
  };

  const endDrag = (cancelled: boolean): void => {
    const start = dragStart.current;
    dragStart.current = null;
    setDragging(false);
    if (start === null) return;
    if (cancelled) {
      // Cancel reverts AND commits — storage must agree with the UI.
      onValue(start.value);
      onCommit();
      return;
    }
    onCommit();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const widen = orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
    const narrow = orientation === "vertical" ? "ArrowRight" : "ArrowDown";
    if (event.key === "Home") {
      event.preventDefault();
      onReset();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      onValue(max);
      onCommit();
      return;
    }
    if (event.key === "Escape") {
      const start = focusValue.current;
      if (start !== null && start !== value) {
        event.preventDefault();
        onValue(start);
        onCommit(); // the revert lands in storage too
      }
      return;
    }
    const delta =
      event.key === widen ? step : event.key === narrow ? -step : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = value + delta;
    if (delta < 0 && next < min) {
      // v12 §3.2 keyboard stickiness: a NARROWING step below the minimum is
      // the intent to collapse — without it clamp(min) gives a fixed point
      // and «свернуть» is unreachable from the keyboard. A WIDENING step
      // below the min (from the strip) deploys to the minimum instead.
      onCollapse?.();
      return;
    }
    onValue(clamp(next));
  };

  // WCAG 2.1.1 safe: no character-key shortcuts — arrows only (07l §3.3).
  const handleKeyUp = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (
      event.key.startsWith("Arrow") ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      onCommit();
    }
  };

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      tabIndex={0}
      title={tooltip}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onDoubleClick={onReset}
      onFocus={() => {
        focusValue.current = value;
      }}
      onBlur={() => {
        focusValue.current = null;
      }}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={() => endDrag(false)}
      onPointerCancel={() => endDrag(true)}
      data-dragging={dragging || undefined}
      className={cn(
        "group relative z-20 flex touch-none select-none items-center justify-center bg-transparent outline-none",
        orientation === "vertical"
          ? "w-6 cursor-col-resize"
          : "h-6 cursor-row-resize",
        className,
      )}
    >
      {/* The visual line: 1px hairline at rest → 4px strong on
       * hover/focus/drag — centred, so no content ever shifts (07l §3.1). */}
      <span
        aria-hidden
        className={cn(
          "rounded-full transition-[width,height,background-color] duration-instant",
          orientation === "vertical"
            ? "h-full w-px bg-myelin-hairline group-hover:w-1 group-hover:bg-myelin-strong group-data-[dragging]:w-1 group-data-[dragging]:bg-myelin-strong"
            : "w-full h-px bg-myelin-hairline group-hover:h-1 group-hover:bg-myelin-strong group-data-[dragging]:h-1 group-data-[dragging]:bg-myelin-strong",
        )}
      />
      {/* 2.4.7/2.4.13: the focus ring rides the HIT ZONE, not the 1px line —
       * visible over both strata, never clipped by the seam. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-sm group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-[-2px] group-focus-visible:outline-iris-bright"
      />
    </div>
  );
}

/** Honest aria-valuetext for a px value («336 px»; WCAG 4.1.2 discipline
 * of 07l §3.3 — the separator announces its own geometry). */
export { px as seamPx };
