import { describe, expect, it } from "vitest";
import type { ActivityItem } from "./boardTypes";
import {
  ACTIVITY_DEFAULT_LIMIT,
  ACTIVITY_MAX_LIMIT,
  bucketActivityRows,
  filterActivityRows,
  pageActivityRows,
} from "./activityQuery";

/**
 * UI-28: reference semantics of `GET /api/activity` (spec §3.2). The mock
 * adapter AND the BoardAdapter parity tests answer through this module, so
 * these cases pin the contract once: strict before_id cursor, the limit cap
 * convention, the filter grammar (csv families + exact kinds, agent grammar,
 * unknown task = empty page), and the sparse hour buckets.
 */

function row(overrides: Partial<ActivityItem> & { id: string; ts: string }): ActivityItem {
  return { kind: "task.created", task_id: "TB-1", ...overrides };
}

const CORPUS: ActivityItem[] = [
  row({ id: "900", ts: "2026-09-19T08:59:00+00:00", kind: "report" }),
  row({ id: "899", ts: "2026-09-19T08:40:00+00:00", kind: "assignment.done", actor: "machine:exec-laptop-zcode", executor_id: "exec-laptop-zcode", host: "laptop" }),
  row({ id: "898", ts: "2026-09-19T07:30:00+00:00", kind: "task.moved", actor: "ui" }),
  row({ id: "897", ts: "2026-09-19T06:10:00+00:00", kind: "task.created", task_id: "TB-2" }),
  row({ id: "896", ts: "2026-09-18T08:00:00+00:00", kind: "report" }), // 25 h old — outside the 24 h window
];

describe("pageActivityRows — before_id cursor + limit cap", () => {
  it("answers newest-first and honours the default limit", () => {
    const page = pageActivityRows(CORPUS, {});
    expect(page.items.map((row) => row.id)).toEqual(["900", "899", "898", "897", "896"]);
    expect(page.has_more).toBe(false);
  });

  it("keeps only ids STRICTLY below the cursor (stable pages under live refill)", () => {
    const page = pageActivityRows(CORPUS, { before_id: "898" });
    expect(page.items.map((row) => row.id)).toEqual(["897", "896"]);
    expect(page.has_more).toBe(false);
  });

  it("reports has_more until the cursor exhausts the corpus", () => {
    const page = pageActivityRows(CORPUS, { limit: 2 });
    expect(page.items.map((row) => row.id)).toEqual(["900", "899"]);
    expect(page.has_more).toBe(true);
    const tail = pageActivityRows(CORPUS, { limit: 2, before_id: "899" });
    expect(tail.items.map((row) => row.id)).toEqual(["898", "897"]);
    expect(tail.has_more).toBe(true);
  });

  it("clamps limit > 200 silently with truncated:true (CV-6 convention)", () => {
    const page = pageActivityRows(CORPUS, { limit: ACTIVITY_MAX_LIMIT + 1 });
    expect(page.truncated).toBe(true);
    expect(page.items.length).toBeLessThanOrEqual(ACTIVITY_MAX_LIMIT);
  });

  it("sorts string ids numerically ('899' > '900' is false — no lexicographic trap)", () => {
    const wide = [
      row({ id: "1000", ts: "2026-09-19T09:00:00+00:00" }),
      row({ id: "999", ts: "2026-09-19T08:59:59+00:00" }),
    ];
    expect(pageActivityRows(wide, {}).items.map((row) => row.id)).toEqual(["1000", "999"]);
  });
});

describe("filterActivityRows — the four server-side filters", () => {
  it("matches a family csv and exact kinds alike", () => {
    const byFamily = filterActivityRows(CORPUS, { type: "task,report" });
    expect(byFamily.every((row) => row.kind !== "assignment.done")).toBe(true);
    const byKind = filterActivityRows(CORPUS, { type: "assignment.done" });
    expect(byKind.map((row) => row.id)).toEqual(["899"]);
  });

  it("treats an unknown task_id as an EMPTY PAGE, not a 404 (filter, not resource)", () => {
    expect(filterActivityRows(CORPUS, { task_id: "TB-404" })).toEqual([]);
    expect(filterActivityRows(CORPUS, { task_id: "TB-1" }).length).toBeGreaterThan(0);
  });

  it("agent= matches the machine:<id> actor leg AND the executor_id column", () => {
    const byActor = filterActivityRows(CORPUS, { agent: "exec-laptop-zcode" });
    expect(byActor.map((row) => row.id)).toEqual(["899"]);
    const byColumn = filterActivityRows(CORPUS, {
      agent: "exec-laptop-zcode",
      type: "assignment",
    });
    expect(byColumn.map((row) => row.id)).toEqual(["899"]);
  });

  it("host= is an exact read-time match", () => {
    expect(filterActivityRows(CORPUS, { host: "laptop" }).map((row) => row.id)).toEqual(["899"]);
  });

  it("composes cursor + filters without surprises", () => {
    const page = pageActivityRows(filterActivityRows(CORPUS, { type: "report" }), { limit: 1 });
    expect(page.items.map((row) => row.id)).toEqual(["900"]);
    expect(page.has_more).toBe(true);
  });
});

describe("bucketActivityRows — sparse hourly buckets (Ф2)", () => {
  const NOW = Date.parse("2026-09-19T09:00:00+00:00");

  it("buckets only the window, hours WITH events, oldest first", () => {
    const view = bucketActivityRows(CORPUS, { bucket: "hour", hours: 24 }, NOW);
    expect(view.buckets.length).toBe(3); // 06:xx, 07:xx, 08:xx hours
    expect(view.buckets[0].ts).toBe("2026-09-19T06:00:00.000Z");
    expect(view.buckets[2].ts).toBe("2026-09-19T08:00:00.000Z");
    const last = view.buckets[2]; // 08:00–09:00: one report + one assignment
    expect(last.total).toBe(2);
    expect(last.by_type).toEqual({ task: 0, assignment: 1, report: 1 });
  });

  it("drops rows older than the window", () => {
    const view = bucketActivityRows(CORPUS, { bucket: "hour", hours: 1 }, NOW);
    expect(view.buckets.length).toBe(1);
    expect(view.buckets[0].total).toBe(2); // 08:00–09:00
  });

  it("reads rows the caller already filtered — the same filter leg as the list view (spec §3.2)", () => {
    const reports = filterActivityRows(CORPUS, { type: "report" });
    const view = bucketActivityRows(reports, { bucket: "hour", hours: 24 }, NOW);
    expect(view.buckets.every((bucket) => bucket.by_type.report === bucket.total)).toBe(true);
    // and the composed result matches the mock's composed endpoint (parity
    // is pinned in BoardAdapter.activity.test.ts).
    expect(view.buckets.length).toBe(1);
  });

  it("defaults to the 24 h window", () => {
    expect(ACTIVITY_DEFAULT_LIMIT).toBe(50);
    const view = bucketActivityRows(CORPUS, { bucket: "hour" }, NOW);
    expect(view.buckets.length).toBe(3);
  });
});
