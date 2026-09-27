import { describe, expect, it } from "vitest";
import type { ActivityItem } from "@/gateway/boardTypes";
import {
  activityFactKey,
  activityTypeTokens,
  buildPulseAxis,
  coalescePulseSlots,
  filterActivityItem,
  hasActiveActivityFilters,
  mergeActivityRows,
  parseActivityUrlState,
  serializeActivityUrlState,
} from "./activityUrl";

/**
 * UI-28 §5.3/§8.4: ALL list state lives in the URL — parse/serialize
 * roundtrip, unknown-token honesty, the client-side filter leg for live
 * rows, the ONE merge rule (pages + live, newest-first, no dupes, no row
 * shifts) and the full histogram axis join (Ф2).
 */

function row(overrides: Partial<ActivityItem> & { id: string; ts: string }): ActivityItem {
  return { kind: "task.created", task_id: "TB-1", ...overrides };
}

describe("activity URL state — parse / serialize roundtrip", () => {
  it("roundtrips every param (?type&agent&host&task_id&from&to)", () => {
    const search = "?type=task,report&agent=exec-laptop-zcode&host=laptop&task_id=TB-1&from=2026-09-19T08%3A00%3A00.000Z&to=2026-09-19T09%3A00%3A00.000Z";
    const state = parseActivityUrlState(new URLSearchParams(search));
    expect(state).toEqual({
      type: "task,report",
      agent: "exec-laptop-zcode",
      host: "laptop",
      task_id: "TB-1",
      from: "2026-09-19T08:00:00.000Z",
      to: "2026-09-19T09:00:00.000Z",
    });
    const back = serializeActivityUrlState(state);
    expect(parseActivityUrlState(back)).toEqual(state);
  });

  it("drops garbage tokens (unknown family/kind, bad ISO) — honest, never crash", () => {
    const state = parseActivityUrlState(
      new URLSearchParams("type=task,nonsense&from=not-a-date"),
    );
    expect(state.type).toBe("task");
    expect(state.from).toBeUndefined();
  });

  it("an empty state has no active filters; any param flips it", () => {
    expect(hasActiveActivityFilters({})).toBe(false);
    expect(hasActiveActivityFilters({ from: "2026-09-19T08:00:00.000Z" })).toBe(true);
    expect(hasActiveActivityFilters({ task_id: "TB-1" })).toBe(true);
  });

  it("activityTypeTokens dedupes and keeps exact kinds", () => {
    expect(activityTypeTokens({ type: "report,task.moved,report,nonsense" })).toEqual([
      "report",
      "task.moved",
    ]);
  });
});

describe("filterActivityItem — the client leg for live rows", () => {
  const base = { from: undefined, to: undefined } as const;

  it("family + exact-kind csv both match", () => {
    const state: Parameters<typeof filterActivityItem>[1] = { ...base, type: "report" };
    expect(filterActivityItem(row({ id: "1", ts: "2026-09-19T08:00:00+00:00", kind: "report" }), state)).toBe(true);
    expect(filterActivityItem(row({ id: "2", ts: "2026-09-19T08:00:00+00:00", kind: "task.moved" }), state)).toBe(false);
    const exact: Parameters<typeof filterActivityItem>[1] = { ...base, type: "task.moved" };
    expect(filterActivityItem(row({ id: "3", ts: "2026-09-19T08:00:00+00:00", kind: "task.moved" }), exact)).toBe(true);
  });

  it("agent matches machine:<id> actor and executor_id, not the ui leg", () => {
    const state: Parameters<typeof filterActivityItem>[1] = { ...base, agent: "exec-laptop-zcode" };
    expect(
      filterActivityItem(
        row({ id: "1", ts: "2026-09-19T08:00:00+00:00", kind: "task.moved", actor: "machine:exec-laptop-zcode" }),
        state,
      ),
    ).toBe(true);
    expect(
      filterActivityItem(
        row({ id: "2", ts: "2026-09-19T08:00:00+00:00", kind: "task.moved", actor: "ui" }),
        state,
      ),
    ).toBe(false);
    expect(
      filterActivityItem(
        row({ id: "3", ts: "2026-09-19T08:00:00+00:00", kind: "assignment.started", executor_id: "exec-laptop-zcode" }),
        state,
      ),
    ).toBe(true);
  });

  it("host matches exactly; an absent host never matches a host filter", () => {
    const state: Parameters<typeof filterActivityItem>[1] = { ...base, host: "laptop" };
    expect(filterActivityItem(row({ id: "1", ts: "2026-09-19T08:00:00+00:00", host: "laptop" }), state)).toBe(true);
    expect(filterActivityItem(row({ id: "2", ts: "2026-09-19T08:00:00+00:00" }), state)).toBe(false);
  });

  it("the from/to window is [from, to)", () => {
    const state: Parameters<typeof filterActivityItem>[1] = {
      ...base,
      from: "2026-09-19T08:00:00.000Z",
      to: "2026-09-19T09:00:00.000Z",
    };
    expect(filterActivityItem(row({ id: "1", ts: "2026-09-19T08:00:00.000Z" }), state)).toBe(true);
    expect(filterActivityItem(row({ id: "2", ts: "2026-09-19T08:59:59.999Z" }), state)).toBe(true);
    expect(filterActivityItem(row({ id: "3", ts: "2026-09-19T09:00:00.000Z" }), state)).toBe(false);
    expect(filterActivityItem(row({ id: "4", ts: "2026-09-19T07:59:59.999Z" }), state)).toBe(false);
  });
});

describe("mergeActivityRows — pages + live, no dupes, no shifts", () => {
  it("interleaves newest-first and never repeats a row", () => {
    const pages = [
      row({ id: "900", ts: "2026-09-19T08:50:00.000Z" }),
      row({ id: "899", ts: "2026-09-19T08:40:00.000Z" }),
    ];
    const live = [
      row({ id: "live:task.moved-TB-9-41", ts: "2026-09-19T08:55:00.000Z", kind: "task.moved" }),
      row({ id: "live:report-TB-9-42", ts: "2026-09-19T08:30:00.000Z", kind: "report" }),
    ];
    expect(mergeActivityRows(pages, live).map((r) => r.id)).toEqual([
      "live:task.moved-TB-9-41",
      "900",
      "899",
      "live:report-TB-9-42",
    ]);
  });

  it("a refetched page re-covering a live fact drops the LIVE copy (server id wins)", () => {
    // Same fact (kind|task|second) arrives live, then comes back via GET.
    const pages = [row({ id: "910", ts: "2026-09-19T08:55:03.250Z", kind: "task.moved" })];
    const live = [
      row({ id: "live:task.moved-TB-1-41", ts: "2026-09-19T08:55:03.810Z", kind: "task.moved" }),
    ];
    const merged = mergeActivityRows(pages, live);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("910"); // the server id survives, not the live one
  });

  it("caps the merged buffer at 500 (oldest evicted)", () => {
    const pages = Array.from({ length: 600 }, (_, index) =>
      row({ id: String(600 - index), ts: new Date(1_700_000_000_000 + index * 1000).toISOString() }),
    );
    expect(mergeActivityRows(pages, [])).toHaveLength(500);
  });

  it("fact keys are stable per (kind, task, second)", () => {
    expect(
      activityFactKey(row({ id: "a", ts: "2026-09-19T08:55:03.250Z", kind: "task.moved" })),
    ).toBe(activityFactKey(row({ id: "b", ts: "2026-09-19T08:55:03.810Z", kind: "task.moved" })));
    expect(
      activityFactKey(row({ id: "a", ts: "2026-09-19T08:55:04.000Z", kind: "task.moved" })),
    ).not.toBe(activityFactKey(row({ id: "b", ts: "2026-09-19T08:55:03.000Z", kind: "task.moved" })));
  });
});

describe("pulse axis — full 24 h join + narrow-screen coalescing (Ф2)", () => {
  const NOW = Date.parse("2026-09-19T09:15:00+00:00"); // inside the 09:00 hour

  it("builds the FULL hourly axis ending at the current hour, zeros joined in", () => {
    const slots = buildPulseAxis(
      [{ ts: "2026-09-19T08:00:00.000Z", total: 5, by_type: { task: 2, assignment: 2, report: 1 } }],
      NOW,
    );
    expect(slots).toHaveLength(24);
    expect(slots[23].ts).toBe("2026-09-19T09:00:00.000Z"); // current hour, zero
    expect(slots[22]).toEqual({
      ts: "2026-09-19T08:00:00.000Z",
      total: 5,
      by_type: { task: 2, assignment: 2, report: 1 },
    });
    expect(slots[0].total).toBe(0);
  });

  it("coalesces 24 hourly slots into 12 two-hour slots (<640px)", () => {
    const slots = buildPulseAxis([], NOW);
    const wide = coalescePulseSlots(slots, 2);
    expect(wide).toHaveLength(12);
    expect(wide[11].ts).toBe("2026-09-19T08:00:00.000Z");
    // counts add up across the group boundary
    const singles = slots.slice(22, 24).reduce((sum, slot) => sum + slot.total, 0);
    expect(wide[11].total).toBe(singles);
  });
});
