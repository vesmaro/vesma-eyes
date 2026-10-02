// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GatewayContext } from "@/gateway/GatewayContext";
import { setLiveLayer, DEFAULT_LIVE_LAYER } from "@/lib/liveLayerStore";
import { subscribeLiving, type LivingSignal } from "@/lib/livingFeed";
import { LivingBridge } from "./livingBridge";

/**
 * The real-data bridge of the living layer: the health poll feeds the base
 * tone, the layer-owned SSE stream feeds events, «Выключен» opens nothing
 * and closes what was open. Anti-fake: only real gateway answers travel.
 */

function stubSource() {
  let handler: ((event: { kind: string }) => void) | null = null;
  let closed = false;
  const stream = {
    onAny(cb: (event: { kind: string }) => void): () => void {
      handler = cb;
      return () => {
        handler = null;
      };
    },
    onStateChange(): () => void {
      return () => undefined;
    },
    close(): void {
      closed = true;
    },
  };
  return {
    emit(kind: string): void {
      handler?.({ kind });
    },
    get closed() {
      return closed;
    },
    stream: () => stream,
  };
}

function makeGateway(health: unknown, source: ReturnType<typeof stubSource> | null) {
  return {
    boardHealth:
      health === null
        ? undefined
        : vi.fn(() => Promise.resolve(health as never)),
    ...(source ? { events: () => source.stream() } : {}),
  };
}

async function mountBridge(gateway: unknown): Promise<{ root: Root; seen: LivingSignal[]; unmount: () => void }> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const seen: LivingSignal[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <GatewayContext.Provider value={gateway as never}>
        <QueryClientProvider client={client}>
          <BridgeProbe />
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return { root, seen, unmount: () => act(() => root.unmount()) };
}

function BridgeProbe() {
  return <LivingBridge />;
}

describe("livingBridge — real sources only, one stream, honest off", () => {
  beforeEach(() => {
    localStorage.removeItem("vesmaro.live");
    setLiveLayer(DEFAULT_LIVE_LAYER);
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("feeds per-store health states as the base-tone source", async () => {
    const seen: LivingSignal[] = [];
    const off = subscribeLiving((s) => seen.push(s));
    const { unmount } = await mountBridge(
      makeGateway(
        { ok: true, service: "x", board_tasks: 0, servers: [{ name: "a", state: "ok" }, { name: "b", state: "warn" }] },
        null,
      ),
    );
    await act(async () => {
      // react-query notifies on its own schedule — give the query a real
      // macrotask to resolve and the observer to re-render the probe.
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const health = seen.filter((s) => s.type === "health").at(-1); // the settled value
    expect(health).toEqual({ type: "health", states: ["ok", "warn"] });
    off();
    await unmount();
  });

  it("routes real SSE kinds into the feed and closes the stream on unmount", async () => {
    const source = stubSource();
    const seen: LivingSignal[] = [];
    const off = subscribeLiving((s) => seen.push(s));
    const { unmount } = await mountBridge(
      makeGateway(
        { ok: true, service: "x", board_tasks: 0, servers: [{ name: "a", state: "ok" }] },
        source,
      ),
    );
    await act(async () => {
      source.emit("task.created");
    });
    expect(seen).toContainEqual({ type: "event", kind: "task.created" });
    await unmount();
    expect(source.closed).toBe(true); // the layer owns exactly one stream
    off();
  });

  it("«Выключен»: no stream is opened (the layer sleeps entirely)", async () => {
    setLiveLayer("off");
    const source = stubSource();
    const events = vi.fn(() => source.stream());
    await mountBridge({ boardHealth: vi.fn(), events });
    expect(events).not.toHaveBeenCalled();
  });

  it("a gateway without events (vesma mode) simply never subscribes", async () => {
    const seen: LivingSignal[] = [];
    const off = subscribeLiving((s) => seen.push(s));
    const { unmount } = await mountBridge(
      makeGateway({ ok: true, service: "x", board_tasks: 0, servers: [] }, null),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(seen.every((s) => s.type !== "event")).toBe(true);
    off();
    await unmount();
  });
});
