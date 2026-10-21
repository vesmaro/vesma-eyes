import { describe, expect, it } from "vitest";
import { pulseFreshness } from "./pulseFreshness";

const DAY = 86_400_000;

/** Feed whose records are `gapsHours` apart, ending `ageDays` before now. */
function feed(gapsHours: number, count: number, ageDays: number, now: number) {
  const items = Array.from({ length: count }, (_, i) => ({
    created_at: new Date(now - ageDays * DAY - i * gapsHours * 3_600_000).toISOString(),
  }));
  return items;
}

describe("pulseFreshness (D7 P5 — порог по данным, не MAGIC)", () => {
  const now = new Date("2026-10-21T12:00:00Z").getTime();

  it("flags a stalled feed: hourly cadence, newest record a month old", () => {
    // Prod-shaped: the feed wrote every couple of hours, then went silent.
    const verdict = pulseFreshness(feed(2, 20, 30, now), now);
    expect(verdict.thresholdMs).toBe(2 * DAY); // 10×2h = 20h → clamped to 48h
    expect(verdict.stalled).toBe(true);
    expect(verdict.newestAgeDays).toBe(30);
    expect(verdict.newestAt).toBe(new Date(now - 30 * DAY).toISOString());
  });

  it("stays quiet on a live feed (newest record today)", () => {
    const verdict = pulseFreshness(feed(2, 20, 0, now), now);
    expect(verdict.stalled).toBe(false);
    expect(verdict.newestAgeDays).toBe(0);
  });

  it("does not false-alarm a naturally slow weekly digest", () => {
    // Weekly gaps → 10×median is capped at 14 days; a 6-day-old newest
    // record is within the feed's own cadence.
    const verdict = pulseFreshness(feed(24 * 7, 6, 6, now), now);
    expect(verdict.thresholdMs).toBe(14 * DAY);
    expect(verdict.stalled).toBe(false);
  });

  it("flags a slow digest that missed its own cadence several times over", () => {
    const verdict = pulseFreshness(feed(24 * 7, 6, 40, now), now);
    expect(verdict.stalled).toBe(true);
    expect(verdict.newestAgeDays).toBe(40);
  });

  it("handles a single-item feed with the 48-hour clamp", () => {
    expect(pulseFreshness([{ created_at: new Date(now - 3_600_000).toISOString() }], now).stalled).toBe(false);
    expect(pulseFreshness([{ created_at: new Date(now - 10 * DAY).toISOString() }], now).stalled).toBe(true);
  });

  it("answers honestly on an empty or unparsable feed", () => {
    const empty = pulseFreshness([], now);
    expect(empty).toEqual({ stalled: false, newestAgeDays: -1, newestAt: null, thresholdMs: 2 * DAY });
    expect(pulseFreshness([{ created_at: "garbage" }], now).stalled).toBe(false);
  });
});
