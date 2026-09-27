import { describe, expect, it } from "vitest";
import type { AssignmentItem, ExecutorItem } from "@/gateway/boardTypes";
import { activeAssignmentForExecutor, groupExecutorsByHost } from "./rosterModel";

/**
 * ME-014 roster model (pure): the host grouping is a CLIENT-SIDE
 * projection of the GET /api/executors page (no server grouping), the
 * online counter reads the meta TTLs at an injected `now` (never the
 * enabled flag), and the assignment chip join picks the executor's active
 * work (claim or pre-claim pin) or nothing at all.
 */

const META = {
  presence: { online_max_age_s: 120, stale_max_age_s: 600 },
  sweeper_interval_s: 60,
};
const NOW = Date.parse("2026-09-19T09:00:00Z");
const ago = (seconds: number): string => new Date(NOW - seconds * 1000).toISOString();

function executor(overrides: Partial<ExecutorItem> & { id: string }): ExecutorItem {
  return {
    name: overrides.id,
    harness: "zcode",
    host: "laptop",
    transport: "local-poll",
    capabilities: [],
    version: "1.0.0",
    enabled: true,
    state: "approved",
    last_seen: ago(30),
    presence: "online",
    registered_via: "",
    registered_at: "",
    updated_at: "",
    ...overrides,
  };
}

function assignment(overrides: Partial<AssignmentItem>): AssignmentItem {
  return {
    id: 1,
    task_id: "TB-1",
    specialist: "SFE",
    harness: "zcode",
    state: "queued",
    created_by: "owner",
    claimed_by: null,
    note: "",
    spec_hash: "",
    executor_id: "",
    claimed_by_executor: "",
    created_at: ago(60),
    claimed_at: null,
    started_at: null,
    heartbeat_at: null,
    finished_at: null,
    topics: [],
    routing: null,
    ...overrides,
  };
}

describe("groupExecutorsByHost — the client-side host projection", () => {
  it("groups 3 executors across 2 hosts and counts online by the meta TTLs", () => {
    const groups = groupExecutorsByHost(
      [
        executor({ id: "a", name: "zcode@laptop", host: "laptop", last_seen: ago(30) }),
        executor({
          id: "b",
          name: "hermes@laptop",
          host: "laptop",
          last_seen: ago(300),
        }),
        executor({ id: "c", name: "zcode@mesh-2", host: "mesh-2", last_seen: ago(30) }),
      ],
      META,
      NOW,
    );
    expect(groups.map((group) => group.host)).toEqual(["laptop", "mesh-2"]);
    expect(groups[0].members.map((member) => member.name)).toEqual([
      "hermes@laptop",
      "zcode@laptop",
    ]);
    // The stale member (300 s > 120 s online bound) is NOT online.
    expect(groups[0].online).toBe(1);
    expect(groups[1].online).toBe(1);
  });

  it("never folds the enabled flag into the online counter (two-clock rule)", () => {
    const groups = groupExecutorsByHost(
      [executor({ id: "a", enabled: false, last_seen: ago(10) })],
      META,
      NOW,
    );
    // Disabled but reporting — presence stays honest.
    expect(groups[0].online).toBe(1);
  });

  it("sinks the never-reported host last and labels it null", () => {
    const groups = groupExecutorsByHost(
      [executor({ id: "a", host: "" }), executor({ id: "b", host: "laptop" })],
      META,
      NOW,
    );
    expect(groups.map((group) => group.label)).toEqual(["laptop", null]);
  });
});

describe("activeAssignmentForExecutor — the chip join", () => {
  it("picks the claimed assignment; running beats queued; newest breaks ties", () => {
    const claimed = assignment({
      id: 2,
      task_id: "TB-2",
      state: "claimed",
      claimed_by_executor: "a",
      claimed_at: ago(30),
    });
    const running = assignment({
      id: 3,
      task_id: "TB-3",
      state: "running",
      claimed_by_executor: "a",
      started_at: ago(20),
    });
    expect(activeAssignmentForExecutor([claimed, running], "a")?.task_id).toBe("TB-3");
    // Same state → the newest attempt leads.
    const older = assignment({
      id: 4,
      task_id: "TB-4",
      state: "queued",
      created_at: ago(60),
      executor_id: "a",
    });
    const newer = assignment({
      id: 5,
      task_id: "TB-5",
      state: "queued",
      created_at: ago(10),
      executor_id: "a",
    });
    expect(activeAssignmentForExecutor([older, newer], "a")?.task_id).toBe("TB-5");
  });

  it("follows the pre-claim pin (queued, executor_id set, not claimed yet)", () => {
    const pinned = assignment({
      state: "queued",
      executor_id: "a",
      claimed_by_executor: "",
    });
    expect(activeAssignmentForExecutor([pinned], "a")?.task_id).toBe("TB-1");
  });

  it("is honest about nobody's work: terminal rows and other executors don't count", () => {
    const done = assignment({
      state: "done",
      claimed_by_executor: "a",
      finished_at: ago(5),
    });
    const foreign = assignment({ state: "running", claimed_by_executor: "b" });
    const autoQueued = assignment({
      state: "queued",
      executor_id: "",
      claimed_by_executor: "",
    });
    expect(
      activeAssignmentForExecutor([done, foreign, autoQueued], "a"),
    ).toBeUndefined();
    expect(activeAssignmentForExecutor([], "a")).toBeUndefined();
  });
});
