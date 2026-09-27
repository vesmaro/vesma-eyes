import { afterEach, describe, expect, it } from "vitest";
import { parseBoardEvent } from "@/gateway/events";
import type { BoardEvent } from "@/gateway/events";
import {
  ACTIVITY_BUFFER_CAP,
  activityItemFromEvent,
  pushActivityEvent,
  readActivityLive,
  resetActivityStore,
  setActivityStreamState,
  subscribeActivityLive,
} from "./activityStore";

/**
 * UI-28 live buffer (spec §5.2): the SSE fold into live rows (task.* with
 * the §A.5 actor, assignment declared identity, report agent/flavour), the
 * 500-row cap, and the stream-state mirror whose recovery counter drives
 * the reconnect refetch (§8.7).
 */

const RECEIVED = Date.parse("2026-09-19T09:00:00+00:00");

function wire(payload: unknown): BoardEvent {
  const parsed = parseBoardEvent(JSON.stringify(payload));
  if (parsed.status !== "event") throw new Error(`bad fixture: ${String(parsed)}`);
  return parsed.event;
}

afterEach(() => resetActivityStore());

describe("activityItemFromEvent — the SSE fold", () => {
  it("task.moved keeps the §A.5 actor and the wire updated_at", () => {
    const event = wire(
      {
        kind: "task.moved",
        task: { id: "TB-1", col: "resolved", updated_at: "2026-09-19T08:59:59+00:00" },
        actor: "ui",
      },
    );
    const item = activityItemFromEvent(event, RECEIVED, 1);
    expect(item).toMatchObject({
      kind: "task.moved",
      task_id: "TB-1",
      actor: "ui",
      ts: "2026-09-19T08:59:59+00:00",
    });
    expect(item?.id.startsWith("live:")).toBe(true);
  });

  it("a pre-§A.5 frame (no actor) folds WITHOUT an actor — the honest gap", () => {
    const event = wire(
      { kind: "task.created", task: { id: "TB-9", updated_at: "2026-09-19T08:00:00+00:00" } },
    );
    expect(activityItemFromEvent(event, RECEIVED, 2)?.actor).toBeUndefined();
  });

  it("assignment.* takes the declared identity (claimed_by → created_by → machine)", () => {
    const claimed = wire(
      { kind: "assignment.claimed", task_id: "TB-1", assignment: { id: "7", state: "claimed", claimed_by: "z:l" } },
    );
    expect(activityItemFromEvent(claimed, RECEIVED, 3)).toMatchObject({ actor: "z:l", task_id: "TB-1" });

    const machine = wire(
      {
        kind: "assignment.started",
        task_id: "TB-1",
        assignment: { id: "7", state: "running", executor_id: "exec-laptop-zcode" },
      },
    );
    const item = activityItemFromEvent(machine, RECEIVED, 4);
    expect(item).toMatchObject({
      actor: "machine:exec-laptop-zcode",
      executor_id: "exec-laptop-zcode",
    });
  });

  it("report keeps created_at, the agent and the final flavour", () => {
    const final = wire(
      {
        kind: "report",
        task_id: "TB-2",
        actor: "machine:exec-laptop-hermes",
        report: { kind: "final", agent: "machine:exec-laptop-hermes", body: "готово", created_at: "2026-09-19T08:58:00+00:00" },
      },
    );
    expect(activityItemFromEvent(final, RECEIVED, 5)).toMatchObject({
      kind: "report",
      task_id: "TB-2",
      actor: "machine:exec-laptop-hermes",
      detail: "готово",
      report_kind: "final",
      ts: "2026-09-19T08:58:00+00:00",
    });
  });

  it("non-feed frames (hello, notification, executor.*) fold to nothing", () => {
    expect(activityItemFromEvent(wire({ kind: "hello", last_event_id: 5 }), RECEIVED, 6)).toBeNull();
    expect(
      activityItemFromEvent(
        wire(
          {
            kind: "executor.online",
            executor: { id: "exec-x", name: "x", harness: "zcode", presence: "online" },
            state: "approved",
            last_seen_at: "2026-09-19T09:00:00+00:00",
          },
        ),
        RECEIVED,
        7,
      ),
    ).toBeNull();
  });
});

describe("pushActivityEvent — the capped newest-first buffer", () => {
  it("prepends newcomers and evicts the oldest past the cap, quietly", () => {
    for (let index = 0; index < ACTIVITY_BUFFER_CAP + 10; index += 1) {
      pushActivityEvent(
        wire(
          { kind: "task.updated", task: { id: `TB-${index}`, updated_at: "2026-09-19T08:00:00+00:00" }, actor: "ui" },
        ),
        RECEIVED + index * 1000,
      );
    }
    const { items } = readActivityLive();
    expect(items).toHaveLength(ACTIVITY_BUFFER_CAP); // ≤500 (spec §7)
    expect(items[0].task_id).toBe(`TB-${ACTIVITY_BUFFER_CAP + 9}`); // newest first
  });

  it("notifies subscribers on every fold", () => {
    let seen = 0;
    const unsubscribe = subscribeActivityLive(() => {
      seen += 1;
    });
    pushActivityEvent(
      wire({ kind: "task.created", task: { id: "TB-1", updated_at: "2026-09-19T08:00:00+00:00" } }),
      RECEIVED,
    );
    expect(seen).toBe(1);
    unsubscribe();
  });
});

describe("stream state mirror — live indicator + recovery counter (§8.7)", () => {
  it("the FIRST open does not count as a recovery; a drop→open does", () => {
    setActivityStreamState("connecting");
    setActivityStreamState("open"); // initial connect
    expect(readActivityLive().reconnects).toBe(0);
    setActivityStreamState("connecting"); // drop (native retry)
    setActivityStreamState("open"); // recovery
    expect(readActivityLive().reconnects).toBe(1);
    expect(readActivityLive().streamState).toBe("open");
  });

  it("lastDataAt mirrors the bridge for the amber «данные на HH:MM» marker", () => {
    setActivityStreamState("open", RECEIVED);
    expect(readActivityLive().lastDataAt).toBe(RECEIVED);
  });
});
