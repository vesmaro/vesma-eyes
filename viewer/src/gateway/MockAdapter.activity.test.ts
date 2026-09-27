import { describe, expect, it } from "vitest";
import { MockAdapter } from "./MockAdapter";
import type { ApiError } from "@/lib/errors";

/**
 * UI-28: the mock adapter speaks the /api/activity contract (spec §3.2) —
 * the audit-mirror corpus, the cursor pages, the filter grammar with the
 * honest gates, the bucket view, and the runtime append from ui-leg
 * mutations. Parity with the HTTP shape is pinned in
 * BoardAdapter.activity.test.ts through the SHARED reference semantics.
 */

const NOW = Date.parse("2026-09-19T09:00:00+00:00");

/** Deterministic adapter: no latency, frozen clock at the corpus point. */
function adapter(): MockAdapter {
  return new MockAdapter({ latency: false, now: () => NOW });
}

describe("MockAdapter.activity — cursor pages", () => {
  it("answers newest-first with has_more and an honest end", async () => {
    const mock = adapter();
    const page1 = await mock.activity({ limit: 10 });
    expect(page1.items).toHaveLength(10);
    expect(page1.has_more).toBe(true);
    const ids = page1.items.map((row) => Number(row.id));
    expect([...ids].sort((a, b) => b - a)).toEqual(ids); // newest first

    const page2 = await mock.activity({ limit: 10, before_id: page1.items[9].id });
    expect(page2.items.every((row) => Number(row.id) < Number(page1.items[9].id))).toBe(true);
    // page to the very end — has_more goes false, items never repeat
    const seen = new Set([...page1.items, ...page2.items].map((row) => row.id));
    let cursor: string | undefined = page2.items[page2.items.length - 1].id;
    for (let guard = 0; guard < 20; guard += 1) {
      const page = await mock.activity({ limit: 10, before_id: cursor });
      for (const row of page.items) expect(seen.has(row.id)).toBe(false);
      for (const row of page.items) seen.add(row.id);
      if (!page.has_more) break;
      cursor = page.items[page.items.length - 1].id;
    }
    expect(seen.size).toBe((await mock.activity({ limit: 200 })).items.length);
  });

  it("carries the §3.2 row shape on every row", async () => {
    const mock = adapter();
    const page = await mock.activity({ limit: 200 });
    for (const row of page.items) {
      expect(Number(row.id)).not.toBeNaN();
      expect(Number.isNaN(Date.parse(row.ts))).toBe(false);
      expect(row.kind).toMatch(/^(task\.|assignment\.|report$)/);
      expect(typeof row.task_id).toBe("string");
      if (row.detail !== undefined) expect(row.detail.length).toBeLessThanOrEqual(200);
    }
    // task_title joins best-effort — a known task carries its title.
    const withTitle = page.items.find((row) => row.task_id === "TB-1");
    expect(withTitle?.task_title).toContain("борд");
  });

  it("keeps the HONEST gaps: pre-1.35 rows without actor render no badge", async () => {
    const mock = adapter();
    const page = await mock.activity({ limit: 200 });
    expect(page.items.some((row) => row.actor === undefined)).toBe(true);
    expect(page.items.some((row) => row.actor === "device:dev-7pad night-tablet")).toBe(true);
    expect(page.items.some((row) => row.actor === "machine:reaper")).toBe(true);
  });
});

describe("MockAdapter.activity — filters and gates", () => {
  it("filters by family csv, exact kind, task_id, agent and host", async () => {
    const mock = adapter();
    const reports = await mock.activity({ type: "report", limit: 200 });
    expect(reports.items.every((row) => row.kind === "report")).toBe(true);

    const moved = await mock.activity({ type: "task.moved", limit: 200 });
    expect(moved.items.every((row) => row.kind === "task.moved")).toBe(true);

    const byTask = await mock.activity({ task_id: "TB-1", limit: 200 });
    expect(byTask.items.every((row) => row.task_id === "TB-1")).toBe(true);

    const unknown = await mock.activity({ task_id: "TB-404" });
    expect(unknown).toEqual({ items: [], has_more: false });

    const byAgent = await mock.activity({ agent: "exec-laptop-zcode", limit: 200 });
    expect(byAgent.items.length).toBeGreaterThan(0);
    expect(
      byAgent.items.every(
        (row) => row.executor_id === "exec-laptop-zcode" || row.actor === `machine:exec-laptop-zcode`,
      ),
    ).toBe(true);

    const byHost = await mock.activity({ host: "mesh-2", limit: 200 });
    expect(byHost.items.every((row) => row.host === "mesh-2")).toBe(true);
  });

  it("422s a non-positive limit (wire convention) and clamps limit > 200", async () => {
    const mock = adapter();
    await expect(mock.activity({ limit: 0 })).rejects.toMatchObject({
      status: 422,
    } satisfies Partial<ApiError>);
    const clamped = await mock.activity({ limit: 5000 });
    expect(clamped.truncated).toBe(true);
    expect(clamped.items.length).toBeLessThanOrEqual(200);
  });
});

describe("MockAdapter.activityBuckets — the Ф2 view", () => {
  it("returns sparse hourly buckets over the same filters", async () => {
    const mock = adapter();
    const view = await mock.activityBuckets({ bucket: "hour", hours: 24 });
    expect(view.buckets.length).toBeGreaterThan(0);
    for (const bucket of view.buckets) {
      expect(bucket.total).toBe(
        bucket.by_type.task + bucket.by_type.assignment + bucket.by_type.report,
      );
    }
    const filtered = await mock.activityBuckets({ bucket: "hour", hours: 24, type: "report" });
    expect(filtered.buckets.every((bucket) => bucket.by_type.report === bucket.total)).toBe(true);
  });
});

describe("MockAdapter — runtime ui-leg mutations append to the audit mirror", () => {
  it("a created task lands as task.created with the ui actor", async () => {
    const mock = adapter();
    const before = await mock.activity({ limit: 1 });
    const newestBefore = before.items[0];

    const task = await mock.createTask({
      title: "UI-28: проверить ленту",
      summary: "",
      spec: "",
      col: "open",
      priority: "normal",
      env: "unknown",
      agents: [],
      specialists: [],
      project: "",
      memory_ids: [],
      mnemos_tags: [],
    });
    const after = await mock.activity({ limit: 1 });
    expect(after.items[0].kind).toBe("task.created");
    expect(after.items[0].task_id).toBe(task.id);
    expect(after.items[0].actor).toBe("ui");
    expect(Number(after.items[0].id)).toBeGreaterThan(Number(newestBefore.id));
  });

  it("a move lands with the column-transition detail; a patch lands as правка", async () => {
    const mock = adapter();
    await mock.moveTask("TB-1", "resolved");
    const head = await mock.activity({ limit: 1 });
    expect(head.items[0].kind).toBe("task.moved");
    expect(head.items[0].detail).toBe("in-progress → resolved");

    await mock.patchTask("TB-1", { priority: "low", force: true });
    const next = await mock.activity({ limit: 1 });
    expect(next.items[0].kind).toBe("task.updated");
    expect(next.items[0].actor).toBe("ui");
  });
});
