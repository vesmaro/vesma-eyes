import { afterEach, describe, expect, it } from "vitest";
import {
  countDoneTransits,
  DONE_FRESH_MS,
  DONE_WINDOW_MS,
  latestDoneTransit,
  peekFreshTransit,
  recordDoneTransit,
  resetDoneTransits,
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
