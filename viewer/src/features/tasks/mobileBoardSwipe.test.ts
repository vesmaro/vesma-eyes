import { describe, expect, it } from "vitest";
import {
  SWIPE_DOMINANCE_RATIO,
  SWIPE_THRESHOLD_PX,
  swipeColumnIntent,
} from "./mobileBoardSwipe";

/**
 * W-C (D5): the pure geometry of the mobile board's swipe-to-switch-column
 * gesture. The component forwards raw touch points; every guard rail the
 * module doc lists is pinned here.
 */
describe("swipeColumnIntent", () => {
  const start = { x: 200, y: 400 };

  it("treats a left flick as next", () => {
    expect(swipeColumnIntent(start, { x: start.x - 120, y: start.y })).toBe("next");
  });

  it("treats a right flick as prev", () => {
    expect(swipeColumnIntent(start, { x: start.x + 120, y: start.y })).toBe("prev");
  });

  it("rejects a tap (travel below threshold)", () => {
    expect(swipeColumnIntent(start, { x: start.x - 10, y: start.y })).toBeNull();
    expect(
      swipeColumnIntent(start, { x: start.x - (SWIPE_THRESHOLD_PX - 1), y: start.y }),
    ).toBeNull();
  });

  it("accepts exactly-at-threshold travel (the minimum swipe)", () => {
    expect(
      swipeColumnIntent(start, { x: start.x - SWIPE_THRESHOLD_PX, y: start.y }),
    ).toBe("next");
  });

  it("rejects a vertical scroll that happens to travel far", () => {
    expect(swipeColumnIntent(start, { x: start.x, y: start.y - 300 })).toBeNull();
  });

  it("rejects a diagonal gesture whose vertical travel dominates", () => {
    // 100px horizontal (past the threshold) but 60px vertical: 60*2 > 100.
    expect(swipeColumnIntent(start, { x: start.x - 100, y: start.y + 60 })).toBeNull();
  });

  it("accepts a diagonal flick whose horizontal travel dominates", () => {
    // 120px horizontal, 30px vertical: 30*2 < 120.
    expect(swipeColumnIntent(start, { x: start.x - 120, y: start.y - 30 })).toBe(
      "next",
    );
  });

  it("keeps the dominance contract at 2:1 and the threshold at ~1/6 viewport", () => {
    expect(SWIPE_DOMINANCE_RATIO).toBe(2);
    expect(SWIPE_THRESHOLD_PX).toBe(64);
  });
});
