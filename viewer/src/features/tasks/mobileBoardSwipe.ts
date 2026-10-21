/**
 * The mobile board's swipe intent (W-C / D5): a pure classifier over a touch
 * gesture — decides whether a touchstart→touchend pair means "switch board
 * column" and in which direction. Kept pure so the unit suite pins the
 * geometry; the component only forwards the DOM events.
 *
 * Guard rails, in order of importance:
 * - HORIZONTAL dominance: |dx| must exceed the threshold AND dominate the
 *   vertical travel (2:1) — the column list scrolls VERTICALLY, so a
 *   vertical scroll must never flip the column;
 * - a TAP (small dx) is not a swipe — card taps, the ⋯ menu and the chips
 *   keep working inside the same gesture area;
 * - the gesture must be a flick-like single touch, not a long press-drag
 *   (a kanban drag's touch life lives in dnd-kit's pointer sensor, which
 *   activates at 5px — an in-column reorder drag produces large |dy| and is
 *   rejected here by the dominance rule, never by timing luck).
 */
export interface SwipePoint {
  x: number;
  y: number;
}

/** Minimum horizontal travel for a swipe (CSS px — ~1/6 of a 375 viewport). */
export const SWIPE_THRESHOLD_PX = 64;
/** |dy| budget relative to |dx| before the gesture reads as a vertical scroll. */
export const SWIPE_DOMINANCE_RATIO = 2;

export type SwipeIntent = "next" | "prev" | null;

export function swipeColumnIntent(
  start: SwipePoint,
  end: SwipePoint,
  threshold: number = SWIPE_THRESHOLD_PX,
): SwipeIntent {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < threshold) return null;
  if (Math.abs(dy) * SWIPE_DOMINANCE_RATIO > Math.abs(dx)) return null;
  // Content follows the finger: a LEFT flick moves to the NEXT column.
  return dx < 0 ? "next" : "prev";
}
