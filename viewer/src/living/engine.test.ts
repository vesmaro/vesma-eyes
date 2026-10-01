// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildVeins, mountLivingLayer, type SeamRect } from "./engine";
import { DEFAULT_LIVE_LAYER, setLiveLayer } from "@/lib/liveLayerStore";
import { feedLivingEvent } from "@/lib/livingFeed";

/** A recording 2d-context stub — the engine talks to it, tests count calls. */
function fakeCtx() {
  const calls = { stroke: 0, arc: 0, clear: 0 };
  const ctx = {
    setTransform: () => undefined,
    clearRect: () => {
      calls.clear++;
    },
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    stroke: () => {
      calls.stroke++;
    },
    arc: () => {
      calls.arc++;
    },
    fill: () => undefined,
  };
  return { ctx, calls };
}

/** Manual RAF clock: no frames run until tick() is called. */
function fakeRaf() {
  const pending = new Map<number, FrameRequestCallback>();
  let next = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    pending.set(next, cb);
    return next++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    pending.delete(id);
  });
  return {
    get count() {
      return pending.size;
    },
    tick(now: number): void {
      const cbs = [...pending.values()];
      pending.clear();
      for (const cb of cbs) cb(now);
    },
  };
}

interface FakeMqList {
  matches: boolean;
  addEventListener: () => undefined;
  removeEventListener: () => undefined;
}
const asMqList = (v: FakeMqList): MediaQueryList => v as unknown as MediaQueryList;
const mmStub = vi.fn((): MediaQueryList =>
  asMqList({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
);

/** Real seam elements in the DOM (zero rects would be skipped as hidden). */
function addSeam(kind: string, left: number, top: number, right: number, bottom: number): void {
  const el = document.createElement("div");
  el.dataset.livingSeam = kind;
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      x: left,
      y: top,
      toJSON: () => undefined,
    }) as DOMRect;
  document.body.appendChild(el);
}

function mount() {
  const { ctx, calls } = fakeCtx();
  const canvas = document.createElement("canvas");
  (canvas as unknown as { getContext: () => unknown }).getContext = () => ctx;
  const destroy = mountLivingLayer(canvas);
  return { canvas, calls, destroy };
}

describe("buildVeins — the seams of the real Shell become veins", () => {
  const vw = 1440;
  const vh = 900;
  const full: SeamRect[] = [
    { k: "topbar", l: 0, t: 0, r: vw, b: 48 },
    { k: "sidebar", l: 0, t: 48, r: 232, b: vh },
    { k: "crumbs", l: 232, t: 48, r: vw, b: 88 },
  ];

  it("three seams → three veins at the real seam coordinates", () => {
    const veins = buildVeins(full, vw, vh);
    expect(veins).toHaveLength(3);
    expect(veins[0].pts).toEqual([
      [0, 48],
      [vw, 48],
    ]); // Ж1: full-width topbar spine
    expect(veins[1].pts).toEqual([
      [232, 48],
      [232, vh],
    ]); // Ж2: sidebar contour joins the spine corner
    expect(veins[2].pts).toEqual([
      [232, 88],
      [vw, 88],
    ]); // Ж3: crumbs seam from the sidebar edge
  });

  it("breathing phases are staggered, never synchronised", () => {
    const phases = buildVeins(full, vw, vh).map((v) => v.phase);
    expect(new Set(phases).size).toBe(3);
  });

  it("a zero-size seam (mobile drawer, display:none) is skipped", () => {
    const mobile: SeamRect[] = [
      { k: "topbar", l: 0, t: 0, r: 375, b: 48 },
      { k: "sidebar", l: 0, t: 0, r: 0, b: 0 },
      { k: "crumbs", l: 0, t: 48, r: 375, b: 88 },
    ];
    const veins = buildVeins(mobile, 375, 667);
    expect(veins).toHaveLength(2);
    expect(veins[1].pts[0][0]).toBe(0); // crumbs starts at the screen edge
  });
});

describe("engine lifecycle — one RAF, honest pauses, clean destructor", () => {
  let raf: ReturnType<typeof fakeRaf>;
  beforeEach(() => {
    raf = fakeRaf();
    vi.stubGlobal("matchMedia", mmStub);
    mmStub.mockReset();
    mmStub.mockImplementation(() =>
      asMqList({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    );
    document.body.innerHTML = "";
    addSeam("topbar", 0, 0, 1440, 48);
    localStorage.removeItem("vesmaro.live");
    setLiveLayer(DEFAULT_LIVE_LAYER);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("«Выключен»: no frames are ever scheduled", () => {
    setLiveLayer("off");
    const { destroy } = mount();
    expect(raf.count).toBe(0);
    destroy();
  });

  it("«Спокойный»: runs; switching to off stops the RAF and clears", () => {
    const { destroy, calls } = mount();
    expect(raf.count).toBe(1); // the single living RAF
    raf.tick(16);
    expect(calls.clear).toBeGreaterThan(0);
    setLiveLayer("off");
    expect(raf.count).toBe(0);
    destroy();
  });

  it("document.hidden pauses the loop (the RAF chain ends)", () => {
    const { destroy } = mount();
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    raf.tick(32);
    expect(raf.count).toBe(0);
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    destroy();
  });

  it("reduced motion: a static drawing, the RAF never starts", () => {
    mmStub.mockReturnValue(
      asMqList({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }),
    );
    const { destroy, calls } = mount();
    expect(raf.count).toBe(0);
    expect(calls.stroke).toBeGreaterThan(0); // static frame drawn once
    destroy();
  });

  it("impulses: a real bus event spawns a bead only in «Полный»", () => {
    setLiveLayer("live");
    const { destroy, calls } = mount();
    feedLivingEvent("task.created");
    raf.tick(performance.now() + 50);
    const arcsInLive = calls.arc;
    expect(arcsInLive).toBeGreaterThan(0);
    setLiveLayer("calm"); // Спокойный: tones without festival beads
    feedLivingEvent("report");
    raf.tick(performance.now() + 100);
    expect(calls.arc).toBe(arcsInLive);
    destroy();
  });

  it("the destructor is idempotent and StrictMode double-mount safe", () => {
    const a = mount();
    const b = mount(); // second mount on its own canvas
    a.destroy();
    a.destroy();
    b.destroy();
    expect(raf.count).toBe(0);
  });
});
