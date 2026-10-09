import { describe, expect, it } from "vitest";
import type { AssignmentItem, ExecutorItem } from "@/gateway/boardTypes";
import {
  UNREPORTED_HOST_ID,
  activeAssignmentForExecutor,
  activeAssignmentsForHost,
  groupExecutorsByHost,
  hostAwaitingDecision,
  hostLastReportAgeS,
  hostLifecycle,
  hostNeedsAttention,
  hostPresence,
  hostPrimaryExecutor,
  hostRoutable,
  hostRevoked,
  hostRouteId,
} from "./rosterModel";

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

// --- the HOST projection (agents-redesign A1) ---------------------------------

/** Attach a server lifecycle status to an executor fixture. */
function withStatus(
  executor: ExecutorItem,
  state: NonNullable<ExecutorItem["status"]>["state"],
): ExecutorItem {
  return {
    ...executor,
    status: {
      state,
      since: ago(60),
      last_report_age_s: 30,
      reason: "fixture",
      next_action: "",
    },
  };
}

describe("hostRouteId — the URL id of a host group", () => {
  it("keeps the wire host verbatim and sends '' under the __unreported__ sentinel", () => {
    const groups = groupExecutorsByHost(
      [executor({ id: "a", host: "" }), executor({ id: "b", host: "laptop" })],
      META,
      NOW,
    );
    expect(hostRouteId(groups[0])).toBe("laptop");
    expect(hostRouteId(groups[1])).toBe(UNREPORTED_HOST_ID);
  });
});

describe("hostPresence — the aggregate of the members' meta-TTL verdicts", () => {
  const group = (members: ExecutorItem[]) =>
    groupExecutorsByHost(members, META, NOW)[0];

  it("online when ANY member is online; stale when one skips the pulse", () => {
    const laptop = group([
      executor({ id: "a", last_seen: ago(30) }),
      executor({ id: "b", last_seen: ago(300) }),
    ]);
    expect(hostPresence(laptop, META, NOW)).toBe("online");
    const quiet = group([executor({ id: "c", last_seen: ago(300) })]);
    expect(hostPresence(quiet, META, NOW)).toBe("stale");
  });

  it("offline only when EVERY member is beyond the bound; unknown without meta", () => {
    const dead = group([executor({ id: "a", last_seen: ago(3600) })]);
    expect(hostPresence(dead, META, NOW)).toBe("offline");
    const mixed = group([
      executor({ id: "a", last_seen: ago(3600) }),
      executor({ id: "b", last_seen: ago(300) }),
    ]);
    expect(hostPresence(mixed, META, NOW)).toBe("stale");
    expect(hostPresence(dead, undefined, NOW)).toBeNull();
  });
});

describe("hostLifecycle — the attention ladder over the members' statuses", () => {
  const group = (members: ExecutorItem[]) =>
    groupExecutorsByHost(members, META, NOW)[0];

  it("the pending decision outranks everything; a partially-alive host reads silent", () => {
    const pending = group([
      withStatus(executor({ id: "a", last_seen: ago(10) }), "online"),
      withStatus(executor({ id: "b" }), "awaiting-approval"),
    ]);
    expect(hostLifecycle(pending)).toBe("awaiting-approval");
    const mixed = group([
      withStatus(executor({ id: "a" }), "online"),
      withStatus(executor({ id: "b", last_seen: ago(300) }), "silent"),
    ]);
    expect(hostLifecycle(mixed)).toBe("silent");
  });

  it("revoked only when the WHOLE host is revoked; online beats disabled at the tail", () => {
    const dead = group([
      withStatus(executor({ id: "a", state: "revoked" }), "revoked"),
      withStatus(executor({ id: "b", state: "revoked" }), "revoked"),
    ]);
    expect(hostLifecycle(dead)).toBe("revoked");
    const mixed = group([
      withStatus(executor({ id: "a" }), "online"),
      withStatus(executor({ id: "b", state: "revoked" }), "revoked"),
    ]);
    expect(hostLifecycle(mixed)).toBe("online");
  });

  it("null when no member carries a lifecycle object (pre-UXE-2 board)", () => {
    const legacy = group([executor({ id: "a" })]);
    expect(hostLifecycle(legacy)).toBeNull();
  });
});

describe("hostNeedsAttention — the A1 filter set (silent + offline + awaiting-*)", () => {
  const group = (members: ExecutorItem[]) =>
    groupExecutorsByHost(members, META, NOW)[0];

  it("flags the attention states and passes the living/intentional ones", () => {
    expect(
      hostNeedsAttention(
        group([withStatus(executor({ id: "a", last_seen: ago(300) }), "silent")]),
      ),
    ).toBe(true);
    expect(
      hostNeedsAttention(
        group([withStatus(executor({ id: "a", last_seen: ago(3600) }), "offline")]),
      ),
    ).toBe(true);
    expect(
      hostNeedsAttention(
        group([withStatus(executor({ id: "a" }), "awaiting-first-report")]),
      ),
    ).toBe(true);
    expect(
      hostNeedsAttention(group([withStatus(executor({ id: "a" }), "online")])),
    ).toBe(false);
    // Provisioning is transient, disabled/revoked are owner-intentional —
    // neither is attention (the blueprint's own set).
    expect(
      hostNeedsAttention(
        group([withStatus(executor({ id: "a" }), "provisioning")]),
      ),
    ).toBe(false);
    expect(
      hostNeedsAttention(group([withStatus(executor({ id: "a" }), "disabled")])),
    ).toBe(false);
  });
});

describe("hostAwaitingDecision / hostRevoked — the row verdicts", () => {
  it("a pending-confirmation member wears the «ждёт решения» pill", () => {
    const pending = groupExecutorsByHost(
      [
        withStatus(executor({ id: "a", host: "new-host", state: "pending" }), "awaiting-approval"),
      ],
      META,
      NOW,
    )[0];
    expect(hostAwaitingDecision(pending)).toBe(true);
    // Legacy board: no status objects, the registry state carries it.
    const legacy = groupExecutorsByHost(
      [executor({ id: "b", host: "new-host", state: "pending" })],
      META,
      NOW,
    )[0];
    expect(hostAwaitingDecision(legacy)).toBe(true);
    expect(hostAwaitingDecision(groupExecutorsByHost([executor({ id: "c" })], META, NOW)[0])).toBe(false);
  });

  it("a host is muted only when EVERY member is revoked", () => {
    const dead = groupExecutorsByHost(
      [executor({ id: "a", host: "old", state: "revoked" })],
      META,
      NOW,
    )[0];
    expect(hostRevoked(dead)).toBe(true);
    const half = groupExecutorsByHost(
      [
        executor({ id: "a", host: "old", state: "revoked" }),
        executor({ id: "b", host: "old" }),
      ],
      META,
      NOW,
    )[0];
    expect(hostRevoked(half)).toBe(false);
  });
});

describe("hostLastReportAgeS — the host's freshest report", () => {
  it("takes the MINIMUM member age; null when nothing ever reported", () => {
    const group = groupExecutorsByHost(
      [
        executor({ id: "a", last_seen: ago(300) }),
        executor({ id: "b", last_seen: ago(30) }),
      ],
      META,
      NOW,
    )[0];
    expect(hostLastReportAgeS(group, NOW)).toBe(30);
    const silent = groupExecutorsByHost(
      [executor({ id: "c", last_seen: "not-a-date" })],
      META,
      NOW,
    )[0];
    expect(hostLastReportAgeS(silent, NOW)).toBeNull();
  });
});

describe("hostPrimaryExecutor / hostRoutable — the host actions' gate", () => {
  it("the primary is the first approved+enabled member; none on a dead host", () => {
    const mixed = groupExecutorsByHost(
      [
        executor({ id: "a", enabled: false }),
        executor({ id: "b", state: "revoked" }),
        executor({ id: "c", last_seen: ago(300) }),
      ],
      META,
      NOW,
    )[0];
    expect(hostPrimaryExecutor(mixed)?.id).toBe("c");
    const dead = groupExecutorsByHost(
      [executor({ id: "a", state: "revoked" })],
      META,
      NOW,
    )[0];
    expect(hostPrimaryExecutor(dead)).toBeNull();
  });

  it("routable: online/silent/awaiting-first-report; not offline/pending/revoked", () => {
    const group = (members: ExecutorItem[]) =>
      groupExecutorsByHost(members, META, NOW)[0];
    expect(
      hostRoutable(group([withStatus(executor({ id: "a" }), "online")]), META, NOW),
    ).toBe(true);
    expect(
      hostRoutable(
        group([withStatus(executor({ id: "a", last_seen: ago(300) }), "silent")]),
        META,
        NOW,
      ),
    ).toBe(true);
    expect(
      hostRoutable(
        group([withStatus(executor({ id: "a" }), "awaiting-first-report")]),
        META,
        NOW,
      ),
    ).toBe(true);
    expect(
      hostRoutable(
        group([withStatus(executor({ id: "a", last_seen: ago(3600) }), "offline")]),
        META,
        NOW,
      ),
    ).toBe(false);
    expect(
      hostRoutable(
        group([withStatus(executor({ id: "a", state: "pending" }), "awaiting-approval")]),
        META,
        NOW,
      ),
    ).toBe(false);
    expect(
      hostRoutable(group([withStatus(executor({ id: "a", state: "revoked" }), "revoked")]), META, NOW),
    ).toBe(false);
    // Pre-UXE-2 board: the presence reading carries the verdict.
    expect(hostRoutable(group([executor({ id: "a" })]), META, NOW)).toBe(true);
    expect(hostRoutable(group([executor({ id: "a", last_seen: ago(3600) })]), META, NOW)).toBe(false);
  });
});

describe("activeAssignmentsForHost — the chip join across members", () => {
  it("joins every member's active work, dedups, and orders by the chip precedence", () => {
    const groups = groupExecutorsByHost(
      [executor({ id: "a" }), executor({ id: "b", host: "laptop" })],
      META,
      NOW,
    );
    const running = assignment({
      id: 3,
      task_id: "TB-3",
      state: "running",
      claimed_by_executor: "b",
      started_at: ago(20),
    });
    const queued = assignment({
      id: 4,
      task_id: "TB-4",
      state: "queued",
      executor_id: "a",
      created_at: ago(60),
    });
    const chips = activeAssignmentsForHost([running, queued], groups[0]);
    expect(chips.map((chip) => chip.task_id)).toEqual(["TB-3", "TB-4"]);
    // Nobody's work → honestly idle.
    expect(activeAssignmentsForHost([], groups[0])).toEqual([]);
  });
});
