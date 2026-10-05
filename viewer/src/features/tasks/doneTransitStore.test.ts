import { afterEach, describe, expect, it, vi } from "vitest";
import {
  countDoneTotal,
  countDoneTransits,
  DONE_FRESH_MS,
  DONE_WINDOW_MS,
  latestDoneTransit,
  peekFreshTransit,
  recordDoneTransit,
  resetDoneTransits,
  subscribeClockForTests,
} from "./doneTransitStore";

/**
 * ME-071 W3 slice 1 (15-WOW §3.4/§8.5): the done-transit store — the
 * rolling 60-minute window behind the tempo chip, the freshness behind the
 * card flash, the dedup against SSE replays. The clock is injected — the
 * tests drive it, the store never reads Date.now() in a path under test.
 */

afterEach(() => {
  resetDoneTransits();
});

describe("doneTransitStore — window and tempo", () => {
  it("counts terminal transitions inside the trailing 60 minutes", () => {
    const t0 = 1_000_000;
    recordDoneTransit({ taskId: "T-1", title: "A", col: "resolved" }, t0);
    recordDoneTransit({ taskId: "T-2", title: "B", col: "done" }, t0 + 1_000);
    expect(countDoneTransits(t0 + 2_000)).toBe(2);
    // The window slides: the oldest entry ages out without a new event.
    expect(countDoneTransits(t0 + DONE_WINDOW_MS + 1)).toBe(1);
    expect(countDoneTransits(t0 + DONE_WINDOW_MS + 2_000)).toBe(0);
  });

  it("never records non-terminal columns", () => {
    recordDoneTransit({ taskId: "T-1", title: "A", col: "in-progress" }, 1_000);
    recordDoneTransit({ taskId: "T-1", title: "A", col: "open" }, 1_100);
    expect(countDoneTransits(1_200)).toBe(0);
    expect(latestDoneTransit()).toBeNull();
  });

  it("folds a same (task, col) repeat within 1s, keeps real second milestones", () => {
    // SSE reconnect replay of the same frame.
    recordDoneTransit({ taskId: "T-1", title: "A", col: "done" }, 1_000);
    recordDoneTransit({ taskId: "T-1", title: "A", col: "done" }, 1_500);
    expect(countDoneTransits(2_000)).toBe(1);
    // resolved → done is TWO honest milestones of one task.
    recordDoneTransit({ taskId: "T-1", title: "A", col: "resolved" }, 2_000);
    expect(countDoneTransits(2_500)).toBe(2);
  });

  it("folds a replayed NON-adjacent duplicate (A → B → A within 1s)", () => {
    // Review fix P2: the fold compared only the LAST item, so a replayed A
    // arriving behind B passed and doubled the tempo.
    recordDoneTransit({ taskId: "T-1", title: "A", col: "done" }, 1_000);
    recordDoneTransit({ taskId: "T-2", title: "B", col: "done" }, 1_100);
    recordDoneTransit({ taskId: "T-1", title: "A", col: "done" }, 1_400);
    expect(countDoneTransits(2_000)).toBe(2);
    expect(countDoneTotal()).toBe(2);
  });

  it("latestDoneTransit returns the newest receipt", () => {
    recordDoneTransit({ taskId: "T-1", title: "A", col: "resolved" }, 1_000);
    recordDoneTransit({ taskId: "T-2", title: "B", col: "done" }, 2_000);
    const latest = latestDoneTransit();
    expect(latest?.taskId).toBe("T-2");
    expect(latest?.col).toBe("done");
  });
});

describe("doneTransitStore — freshness (the flash trigger)", () => {
  it("a transit is fresh within 2s of receipt, stale after", () => {
    const t0 = 5_000;
    recordDoneTransit({ taskId: "T-1", title: "A", col: "done" }, t0);
    expect(peekFreshTransit("T-1", t0 + 100)?.col).toBe("done");
    expect(peekFreshTransit("T-1", t0 + DONE_FRESH_MS - 1)).not.toBeNull();
    expect(peekFreshTransit("T-1", t0 + DONE_FRESH_MS + 1)).toBeNull();
  });

  it("freshness is per task — another task's flash never leaks", () => {
    const t0 = 5_000;
    recordDoneTransit({ taskId: "T-1", title: "A", col: "done" }, t0);
    expect(peekFreshTransit("T-9", t0 + 100)).toBeNull();
  });

  it("a reloaded page (empty store) has nothing fresh", () => {
    expect(peekFreshTransit("T-1", Date.now())).toBeNull();
  });
});

describe("doneTransitStore — session total (the В1-pill ▸N, slice 2)", () => {
  it("increments synchronously with each recorded transit (TL deviation)", () => {
    const t0 = 1_000;
    recordDoneTransit({ taskId: "T-1", title: "A", col: "resolved" }, t0);
    expect(countDoneTotal()).toBe(1);
    recordDoneTransit({ taskId: "T-2", title: "B", col: "done" }, t0 + 5_000);
    expect(countDoneTotal()).toBe(2);
    // A non-terminal column never touches the total either.
    recordDoneTransit({ taskId: "T-3", title: "C", col: "open" }, t0 + 6_000);
    expect(countDoneTotal()).toBe(2);
  });

  it("the SSE-replay fold does not double-count the total", () => {
    recordDoneTransit({ taskId: "T-1", title: "A", col: "done" }, 1_000);
    recordDoneTransit({ taskId: "T-1", title: "A", col: "done" }, 1_400);
    expect(countDoneTotal()).toBe(1);
  });
});

describe("doneTransitStore — the shared duty-cycled clock", () => {
  // Frozen system clock + fake timers (the useValidationClock.test idiom):
  // the tick schedule — fast 250ms while a transit is fresh, slow 30s once
  // the freshness expires, silent after the last subscriber leaves — is the
  // subject, and every interval decision is observable through the ticks.
  it("ticks fast(250ms) while fresh, re-arms slow(30s) on expiry, tears down on the last unsubscribe", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T10:00:00+00:00"));
    try {
      recordDoneTransit(
        { taskId: "C-1", title: "A", col: "done" },
        Date.now(),
      );
      const ticks: number[] = [];
      const unsub = subscribeClockForTests(() => ticks.push(Date.now()));
      // startClock ticks synchronously and arms the fast interval.
      expect(ticks).toHaveLength(1);

      // Fast phase: a tick every 250ms while the transit stays fresh.
      // Freshness covers now - at < 2000, so the ticks at 250…2000 keep the
      // fast interval; the 2250 tick is the first to see the transit stale
      // and re-arms the clock to the slow 30s cadence.
      vi.advanceTimersByTime(2_000);
      expect(ticks).toHaveLength(9); // 250,500,…,2000
      vi.advanceTimersByTime(250);
      expect(ticks).toHaveLength(10); // 2250 — expiry noticed here

      // No more fast ticks: the clock re-armed at 2250 to the slow 30s
      // cadence — the next tick lands at 2250 + 30_000 = 32_250, exactly
      // one slow tick (a fast interval would have produced ~120).
      vi.advanceTimersByTime(250);
      expect(ticks).toHaveLength(10); // 2500 — a fast tick would land here
      vi.advanceTimersByTime(30_000);
      expect(ticks).toHaveLength(11); // 32_250 — the single slow tick

      // The last subscriber leaving tears the interval down — silence after.
      unsub();
      vi.advanceTimersByTime(120_000);
      expect(ticks).toHaveLength(11);
    } finally {
      vi.useRealTimers();
      resetDoneTransits();
    }
  });
});
