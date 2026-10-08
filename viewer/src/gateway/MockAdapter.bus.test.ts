// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockAdapter } from "./MockAdapter";
import type { BoardEvent } from "./events";

/**
 * The mock SSE twin (U2): SILENT by default (the 5-second honesty gate's
 * premise — a silent mock means zero frames after `hello`); `events()`
 * hands out real EventStream connections over an in-memory source; the
 * test handle (emitBusEvent/quietBus) drives frames; `?bus=demo` runs the
 * bounded six-frame dev sequence.
 */

async function flush(): Promise<void> {
  // The file runs on fake timers — advance the clock instead of awaiting a
  // real (faked, never-firing) setTimeout.
  await vi.advanceTimersByTimeAsync(0);
}

describe("MockAdapter — the SSE twin (U2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete window.VesmaMockBus;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete window.VesmaMockBus;
  });

  it("opens with the hello contract frame and then stays SILENT", async () => {
    const gateway = new MockAdapter({ latency: false });
    const seen: string[] = [];
    const off = gateway.events().onAny((event: BoardEvent) => seen.push(event.kind));
    await flush(); // hello dispatches synchronously on handler attach
    expect(seen).toEqual(["hello"]);
    vi.advanceTimersByTime(60_000); // a full minute of silence
    expect(seen).toEqual(["hello"]); // no phantom traffic, ever
    off();
  });

  it("each events() call is its own connection; frames broadcast to all", async () => {
    const gateway = new MockAdapter({ latency: false });
    const a: string[] = [];
    const b: string[] = [];
    const offA = gateway.events().onAny((event) => a.push(event.kind));
    const offB = gateway.events().onAny((event) => b.push(event.kind));
    await flush();
    expect(a).toEqual(["hello"]);
    expect(b).toEqual(["hello"]);
    gateway.emitBusEvent("task.updated", { task: { id: "TB-1" } });
    expect(a).toEqual(["hello", "task.updated"]);
    expect(b).toEqual(["hello", "task.updated"]);
    offA();
    gateway.emitBusEvent("report", { task_id: "TB-1", report: {} });
    expect(a).toEqual(["hello", "task.updated"]); // unsubscribed
    expect(b).toEqual(["hello", "task.updated", "report"]);
    offB();
  });

  it("close() on the stream stops that connection's frames", async () => {
    const gateway = new MockAdapter({ latency: false });
    const a: string[] = [];
    const stream = gateway.events();
    const off = stream.onAny((event) => a.push(event.kind));
    await flush();
    stream.close();
    gateway.emitBusEvent("task.updated", { task: { id: "TB-1" } });
    expect(a).toEqual(["hello"]);
    off();
  });

  it("quietBus(): the silence switch drops every further frame", async () => {
    const gateway = new MockAdapter({ latency: false });
    const seen: string[] = [];
    const off = gateway.events().onAny((event) => seen.push(event.kind));
    await flush();
    gateway.quietBus();
    gateway.emitBusEvent("task.updated", { task: { id: "TB-1" } });
    vi.advanceTimersByTime(60_000);
    expect(seen).toEqual(["hello"]); // silenced for good
    off();
  });

  it("?bus=demo: SIX well-formed frames, paced, then silence forever", async () => {
    location.search = "?bus=demo";
    try {
      const gateway = new MockAdapter({ latency: false });
      const seen: string[] = [];
      const off = gateway.events().onAny((event) => seen.push(event.kind));
      await flush();
      expect(seen).toEqual(["hello"]);
      vi.advanceTimersByTime(400); // first demo frame at +400ms
      expect(seen).toEqual(["hello", "executor.online"]);
      vi.advanceTimersByTime(1100 * 5); // the remaining five, 1.1s apart
      expect(seen).toEqual([
        "hello",
        "executor.online",
        "task.created",
        "report",
        "task.updated",
        "notification",
        "assignment.started",
      ]);
      vi.advanceTimersByTime(60_000); // the sequence never repeats
      expect(seen).toHaveLength(7);
      off();
    } finally {
      location.search = "";
    }
  });

  it("exposes the window test handle (dev/console steering)", async () => {
    const gateway = new MockAdapter({ latency: false });
    const seen: string[] = [];
    const off = gateway.events().onAny((event) => seen.push(event.kind));
    await flush();
    expect(window.VesmaMockBus).toBeDefined();
    window.VesmaMockBus!.emit("task.created", { task: { id: "TB-2" } });
    expect(seen).toEqual(["hello", "task.created"]);
    window.VesmaMockBus!.quiet();
    window.VesmaMockBus!.emit("report", { task_id: "TB-2", report: {} });
    expect(seen).toEqual(["hello", "task.created"]);
    off();
    void gateway;
  });
});
