import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ETHER_RING_MAX,
  etherRowFromEvent,
  etherRows,
  isEtherKind,
  pushEtherEvent,
  resetEtherForTests,
  subscribeEther,
} from "./koraEtherStore";
import type { BoardEvent } from "@/gateway/events";

/**
 * The Эфир ring (U5): ONLY the session-class slice of the dictionary maps
 * to rows (the host/no-host i18n variant is chosen honestly); the ring is
 * bounded to ETHER_RING_MAX (the ≤6 dosage), drops the OLDEST, and notifies
 * subscribers. Unknown/service kinds are dropped silently.
 */

function executorEvent(
  kind: "executor.online" | "executor.offline" | "executor.registered",
  host: string | undefined,
): BoardEvent {
  return {
    kind,
    executor: {
      id: "exec-1",
      name: "zcode@box",
      harness: "zcode",
      ...(host === undefined ? {} : { host }),
      transport: "local-poll",
      capabilities: [],
      presence: kind === "executor.online" ? "online" : "offline",
    },
    prev_state: null,
    state: kind === "executor.online" ? "online" : "offline",
    ...(kind === "executor.registered" ? {} : { last_seen_at: "2026-10-08T10:00:00Z" }),
  } as BoardEvent;
}

afterEach(() => {
  resetEtherForTests();
});

describe("isEtherKind (the session-class slice)", () => {
  it("takes presence transitions + reports; everything else is out of dose", () => {
    expect(isEtherKind("executor.online")).toBe(true);
    expect(isEtherKind("executor.offline")).toBe(true);
    expect(isEtherKind("executor.registered")).toBe(true);
    expect(isEtherKind("report")).toBe(true);
    // Deliberate omissions: registry bookkeeping, other domains' doses,
    // service frames.
    expect(isEtherKind("executor.updated")).toBe(false);
    expect(isEtherKind("executor.deleted")).toBe(false);
    expect(isEtherKind("notification")).toBe(false);
    expect(isEtherKind("task.moved")).toBe(false);
    expect(isEtherKind("hello")).toBe(false);
  });
});

describe("etherRowFromEvent (honest key/params mapping)", () => {
  it("online with a host: the host template", () => {
    const row = etherRowFromEvent(executorEvent("executor.online", "gpu-box"), 1);
    expect(row?.key).toBe("kora.ether.online");
    expect(row?.params).toEqual({ name: "zcode@box", host: "gpu-box" });
    expect(row?.host).toBe("gpu-box");
  });

  it("online without a host: the no-host variant, never a fabricated host", () => {
    const row = etherRowFromEvent(executorEvent("executor.online", undefined), 2);
    expect(row?.key).toBe("kora.ether.onlineNoHost");
    expect(row?.params).toEqual({ name: "zcode@box" });
    expect(row?.host).toBeNull();
  });

  it("offline maps to its own key; registered announces the new agent", () => {
    expect(etherRowFromEvent(executorEvent("executor.offline", "box"), 3)?.key).toBe(
      "kora.ether.offline",
    );
    expect(
      etherRowFromEvent(executorEvent("executor.registered", "box"), 4)?.key,
    ).toBe("kora.ether.registered");
  });

  it("report: actor variant when the §A.5 actor rides, plain otherwise", () => {
    const plain = etherRowFromEvent(
      { kind: "report", task_id: "T-128", report: {} } as BoardEvent,
      5,
    );
    expect(plain?.key).toBe("kora.ether.report");
    expect(plain?.params).toEqual({ task: "T-128" });
    const byActor = etherRowFromEvent(
      {
        kind: "report",
        task_id: "T-128",
        report: {},
        actor: "device:7 tablet",
      } as BoardEvent,
      6,
    );
    expect(byActor?.key).toBe("kora.ether.reportBy");
    expect(byActor?.params).toEqual({ actor: "device:7 tablet", task: "T-128" });
  });

  it("non-ether kinds map to null", () => {
    expect(
      etherRowFromEvent({ kind: "hello", last_event_id: 1 } as BoardEvent, 7),
    ).toBeNull();
  });
});

describe("the ring (≤6 dosage)", () => {
  it("keeps the last six, drops the oldest, notifies subscribers", () => {
    const listener = vi.fn();
    const off = subscribeEther(listener);
    for (let i = 0; i < ETHER_RING_MAX + 2; i += 1) {
      pushEtherEvent(executorEvent("executor.online", `box-${i}`));
    }
    const rows = etherRows();
    expect(rows.length).toBe(ETHER_RING_MAX);
    expect(rows[0].params.host).toBe("box-2"); // 0 and 1 dropped
    expect(rows[5].params.host).toBe("box-7"); // newest last (log order)
    expect(listener).toHaveBeenCalledTimes(8);
    off();
  });

  it("pushEtherEvent returns false for kinds outside the ether class", () => {
    expect(pushEtherEvent({ kind: "hello", last_event_id: 1 } as BoardEvent)).toBe(
      false,
    );
    expect(etherRows().length).toBe(0); // a silent bus = an empty ring
  });
});
