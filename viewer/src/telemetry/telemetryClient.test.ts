import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FLUSH_THRESHOLD,
  MAX_BATCH,
  RETRY_DELAY_MS,
  RING_CAPACITY,
  TelemetryClient,
} from "./telemetryClient";

/**
 * Battery mechanics (taxonomy §3.2) over an injected fake transport — the
 * singleton's gate/attribution is covered separately (telemetry.test.ts).
 * Fake timers drive every delay (15 s cadence, retry backoff).
 */

function okResponse(): Response {
  return new Response(JSON.stringify({ ok: true, accepted: 1 }), { status: 200 });
}

interface TransportLog {
  batches: unknown[][];
  statuses: Array<number | "throw">;
}

function fakeTransport(
  statuses: Array<number | "throw">,
): { log: TransportLog; impl: (url: string, init: RequestInit) => Promise<Response> } {
  const log: TransportLog = { batches: [], statuses: [] };
  let call = 0;
  const impl = (_url: string, init: RequestInit): Promise<Response> => {
    const batch = JSON.parse(String(init.body)) as { events: unknown[] };
    log.batches.push(batch.events);
    const verdict = statuses[Math.min(call, statuses.length - 1)];
    call += 1;
    log.statuses.push(verdict);
    if (verdict === "throw") return Promise.reject(new TypeError("network down"));
    return Promise.resolve(new Response("{}", { status: verdict }));
  };
  return { log, impl };
}

function event(n: number): { kind: string; visit_id: string; n?: number } {
  return { kind: "ui.nav", visit_id: `visit-${n}-aaaaaaaaaa`, n };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TelemetryClient: buffering and flush triggers (§3.2)", () => {
  it("holds events below the threshold — no wire traffic until 10", async () => {
    const { log, impl } = fakeTransport([200]);
    const client = new TelemetryClient({ fetchImpl: impl });
    for (let i = 0; i < FLUSH_THRESHOLD - 1; i += 1) client.enqueue(event(i));
    expect(client.pending()).toHaveLength(FLUSH_THRESHOLD - 1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(log.batches).toHaveLength(0);
  });

  it("flushes immediately when the threshold is reached", async () => {
    const { log, impl } = fakeTransport([200]);
    const client = new TelemetryClient({ fetchImpl: impl });
    for (let i = 0; i < FLUSH_THRESHOLD; i += 1) client.enqueue(event(i));
    await vi.advanceTimersByTimeAsync(0);
    expect(log.batches).toHaveLength(1);
    expect(log.batches[0]).toHaveLength(FLUSH_THRESHOLD);
  });

  it("flushes whatever is buffered on the 15 s cadence", async () => {
    const { log, impl } = fakeTransport([200]);
    const client = new TelemetryClient({ fetchImpl: impl });
    client.start();
    client.enqueue(event(1));
    client.enqueue(event(2));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(log.batches).toHaveLength(1);
    expect(log.batches[0]).toHaveLength(2);
    client.stop();
  });

  it("never sends an empty batch on the cadence", async () => {
    const { log, impl } = fakeTransport([200]);
    const client = new TelemetryClient({ fetchImpl: impl });
    client.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(log.batches).toHaveLength(0);
    client.stop();
  });
});

describe("TelemetryClient: batch cap and ring (§3.2 / ME-037 413)", () => {
  it("sends a batch of at most 50 and drains the rest on the cadence", async () => {
    const { log, impl } = fakeTransport([200, 200, 200]);
    const client = new TelemetryClient({ fetchImpl: impl });
    client.start();
    // 120 events at once: the threshold flush takes the 10 available, the
    // ring caps the rest at 100 — the cadence then drains 50 + 50.
    for (let i = 0; i < 120; i += 1) client.enqueue(event(i));
    await vi.advanceTimersByTimeAsync(0);
    expect(log.batches).toHaveLength(1);
    expect(log.batches[0]).toHaveLength(10);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(log.batches).toHaveLength(2);
    expect(log.batches[1]).toHaveLength(MAX_BATCH);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(log.batches).toHaveLength(3);
    expect(log.batches[2]).toHaveLength(MAX_BATCH);
    expect(client.pending()).toHaveLength(0);
    client.stop();
  });

  it("drops the OLDEST events when the ring (100) overflows", () => {
    const { impl } = fakeTransport([200]);
    const client = new TelemetryClient({ fetchImpl: impl });
    // Keep below the flush threshold: 9 events stay buffered, then flood.
    for (let i = 0; i < 200; i += 1) client.enqueue(event(i));
    const pending = client.pending() as Array<{ n?: number }>;
    expect(pending).toHaveLength(RING_CAPACITY);
    // The newest 100 survived (99..198); the oldest were dropped.
    expect(pending[0].n).toBe(100);
    expect(pending[pending.length - 1].n).toBe(199);
  });
});

describe("TelemetryClient: failure policy (§3.2 — one retry, then silent drop)", () => {
  it("retries ONCE on a transport failure, then drops the batch", async () => {
    const { log, impl } = fakeTransport(["throw", "throw"]);
    const client = new TelemetryClient({ fetchImpl: impl });
    for (let i = 0; i < FLUSH_THRESHOLD; i += 1) client.enqueue(event(i));
    await vi.advanceTimersByTimeAsync(0); // first attempt fails
    expect(log.batches).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS); // single retry fails too
    expect(log.batches).toHaveLength(2);
    expect(client.droppedBatches).toBe(1);
    // A third attempt never happens.
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 5);
    expect(log.batches).toHaveLength(2);
  });

  it("the retry succeeding accepts the batch", async () => {
    const { log, impl } = fakeTransport(["throw", 200]);
    const client = new TelemetryClient({ fetchImpl: impl });
    for (let i = 0; i < FLUSH_THRESHOLD; i += 1) client.enqueue(event(i));
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    expect(log.batches).toHaveLength(2);
    expect(client.droppedBatches).toBe(0);
  });

  it("retries transient verdicts (429, 5xx) once", async () => {
    const { log, impl } = fakeTransport([503, 503]);
    const client = new TelemetryClient({ fetchImpl: impl });
    for (let i = 0; i < FLUSH_THRESHOLD; i += 1) client.enqueue(event(i));
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    expect(log.batches).toHaveLength(2);
    expect(client.droppedBatches).toBe(1);
  });

  it("does NOT retry server verdicts (422 batch rejection, 403, 413)", async () => {
    for (const verdict of [422, 403, 413]) {
      const { log, impl } = fakeTransport([verdict]);
      const client = new TelemetryClient({ fetchImpl: impl });
      for (let i = 0; i < FLUSH_THRESHOLD; i += 1) client.enqueue(event(i));
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 3);
      expect(log.batches, `verdict ${verdict}`).toHaveLength(1);
      expect(client.droppedBatches, `verdict ${verdict}`).toBe(1);
    }
  });
});

describe("TelemetryClient: pagehide beacon path (§3.2 sendBeacon)", () => {
  function beaconClient(beacon: (url: string, blob: Blob) => boolean) {
    const fetchLog: string[] = [];
    const client = new TelemetryClient({
      fetchImpl: async () => {
        fetchLog.push("fetch");
        return okResponse();
      },
      beaconImpl: beacon,
      makeBlob: () => new Blob([]),
    });
    return { client, fetchLog };
  }

  it("every buffered chunk leaves as its own beacon (≤50 each), queue drained", () => {
    const beacons: string[] = [];
    const { client } = beaconClient((url) => {
      beacons.push(url);
      return true;
    });
    // 10 events detach at the threshold flush (in flight, not buffered);
    // the ring then holds exactly its 100 newest — two beacon chunks.
    for (let i = 0; i < 120; i += 1) client.enqueue(event(i));
    client.flushOnPageHide();
    expect(beacons).toHaveLength(2);
    expect(client.pending()).toHaveLength(0);
  });

  it("falls back to a keepalive fetch when no beacon transport answers", async () => {
    const fetches: RequestInit[] = [];
    const client = new TelemetryClient({
      fetchImpl: async (_url, init) => {
        fetches.push(init);
        return okResponse();
      },
      beaconImpl: () => false,
      makeBlob: () => new Blob([]),
    });
    // Below the flush threshold — the only transport call must be the
    // pagehide fallback, and it must be a keepalive one.
    for (let i = 0; i < FLUSH_THRESHOLD - 1; i += 1) client.enqueue(event(i));
    client.flushOnPageHide();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toHaveLength(1);
    expect(fetches[0].keepalive).toBe(true);
    expect(client.pending()).toHaveLength(0);
  });

  it("a throwing beacon falls back instead of breaking the page", async () => {
    const { client, fetchLog } = beaconClient(() => {
      throw new Error("beacon refused");
    });
    client.enqueue(event(1));
    client.flushOnPageHide();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchLog).toHaveLength(1);
  });
});
