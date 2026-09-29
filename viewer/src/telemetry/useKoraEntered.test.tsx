// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { __resetForTests, __stateForTests, markPaletteNavigation, startVisit, trackRouteChange } from "./telemetry";
import { useKoraEntered } from "./useKoraEntered";

/**
 * The kora.entered hook in isolation: the domain-entry rule (previous
 * pathname decides), the entry attribution (palette mark), the latency
 * bucketing at settle, and the drop when the page never settles.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function pendingEvents(): Array<Record<string, unknown>> {
  return __stateForTests().pending as Array<Record<string, unknown>>;
}

function koraEvents(): Array<Record<string, unknown>> {
  return pendingEvents().filter((event) => event.kind === "kora.entered");
}

function Harness({ settled }: { settled: boolean }) {
  useKoraEntered(settled);
  return <p>harness</p>;
}

async function renderHarness(initialSettled: boolean): Promise<{
  rerender: (settled: boolean) => Promise<void>;
  unmount: () => Promise<void>;
}> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Harness settled={initialSettled} />);
  });
  return {
    rerender: async (settled: boolean) => {
      await act(async () => {
        root!.render(<Harness settled={settled} />);
      });
    },
    unmount: async () => {
      await act(async () => {
        root!.unmount();
      });
    },
  };
}

beforeEach(() => {
  __resetForTests();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  __resetForTests();
  vi.restoreAllMocks();
});

/**
 * A controllable clock: React's own scheduler also calls performance.now,
 * so sequencing one-shot return values is fragile — every call answers the
 * CURRENT value and the test moves time between renders.
 */
function useControllableClock(): { set: (ms: number) => void } {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  return { set: (ms: number) => (now = ms) };
}

describe("useKoraEntered: the domain-entry rule (§1.2 #3)", () => {
  it("a direct load (no previous pathname) enters via route", async () => {
    startVisit();
    const clock = useControllableClock();
    clock.set(100);
    const harness = await renderHarness(false);
    expect(koraEvents()).toHaveLength(0); // pending list — no verdict yet
    clock.set(150);
    await harness.rerender(true);
    expect(koraEvents()).toHaveLength(1);
    expect(koraEvents()[0]).toMatchObject({
      kind: "kora.entered",
      entry: "route",
      latency_class: "a",
    });
    await harness.unmount();
  });

  it("arriving from another surface (previous pathname) is an entry", async () => {
    startVisit();
    trackRouteChange("/tasks"); // the observer has seen /tasks before us
    const harness = await renderHarness(true); // already settled (cached list)
    expect(koraEvents()).toHaveLength(1);
    expect(koraEvents()[0]).toMatchObject({ entry: "route" });
    await harness.unmount();
  });

  it("a fresh palette mark at mount attributes entry=palette", async () => {
    startVisit();
    markPaletteNavigation();
    const harness = await renderHarness(true);
    expect(koraEvents()[0]).toMatchObject({ entry: "palette" });
    await harness.unmount();
  });

  it("kora→kora movement (previous pathname IS /kora) is NOT an entry", async () => {
    startVisit();
    trackRouteChange("/kora"); // came from the list, mounting the transcript
    const harness = await renderHarness(false);
    await harness.rerender(true);
    expect(koraEvents()).toHaveLength(0);
    await harness.unmount();
  });

  it("latency buckets by the settle delay (a, b and c boundaries)", async () => {
    startVisit();
    const clock = useControllableClock();
    clock.set(0);
    let harness = await renderHarness(false);
    clock.set(299);
    await harness.rerender(true);
    expect(koraEvents().at(-1)).toMatchObject({ latency_class: "a" });
    await harness.unmount();

    clock.set(0);
    harness = await renderHarness(false);
    clock.set(999);
    await harness.rerender(true);
    expect(koraEvents().at(-1)).toMatchObject({ latency_class: "b" });
    await harness.unmount();

    clock.set(0);
    harness = await renderHarness(false);
    clock.set(1_000);
    await harness.rerender(true);
    expect(koraEvents().at(-1)).toMatchObject({ latency_class: "c" });
    await harness.unmount();
  });

  it("leaving before the list settles drops the event (no fabricated class)", async () => {
    startVisit();
    const harness = await renderHarness(false);
    await harness.unmount();
    expect(koraEvents()).toHaveLength(0);
  });

  it("settling twice emits exactly once", async () => {
    startVisit();
    const harness = await renderHarness(false);
    await harness.rerender(true);
    await harness.rerender(false);
    await harness.rerender(true);
    expect(koraEvents()).toHaveLength(1);
    await harness.unmount();
  });
});
