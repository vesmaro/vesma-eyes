// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildVeins, mountLivingLayer, type SeamRect } from "./engine";
import { DEFAULT_LIVE_LAYER, setLiveLayer } from "@/lib/liveLayerStore";
import { feedLivingEvent, muteLiving } from "@/lib/livingFeed";

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
  asMqList({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
);

/** Real seam elements in the DOM (zero rects would be skipped as hidden). */
function addSeam(
  kind: string,
  left: number,
  top: number,
  right: number,
  bottom: number,
): void {
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
    // Fake timers FIRST (the default vitest fake includes requestAnimation-
    // Frame and would otherwise stomp the manual RAF stub); the manual clock
    // below then wins and stays authoritative for frame assertions.
    vi.useFakeTimers(); // fakes setTimeout AND performance.now (the window clock)
    raf = fakeRaf();
    vi.stubGlobal("matchMedia", mmStub);
    mmStub.mockReset();
    mmStub.mockImplementation(() =>
      asMqList({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    );
    document.body.innerHTML = "";
    addSeam("topbar", 0, 0, 1440, 48);
    localStorage.removeItem("vesmaro.live");
    setLiveLayer(DEFAULT_LIVE_LAYER);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("D1b ambient: a silent bus in «Полный» keeps exactly ONE ambient RAF", () => {
    const { destroy, calls } = mount();
    expect(raf.count).toBe(1); // the quiet undulation is alive (W1a caps)
    expect(document.documentElement.dataset.ambient).toBe("true");
    raf.tick(16);
    expect(calls.stroke).toBeGreaterThan(0); // the sheen draws
    destroy();
  });

  it("«Спокойный»: a silent bus still stands — the ambient is «Полный»-only", () => {
    setLiveLayer("calm");
    const { destroy } = mount();
    expect(raf.count).toBe(0);
    expect(document.documentElement.dataset.ambient).toBe("false");
    destroy();
  });

  it("«Выключен»: no frames are ever scheduled, even after an event", () => {
    setLiveLayer("off");
    const { destroy } = mount();
    feedLivingEvent("task.created");
    expect(raf.count).toBe(0);
    destroy();
  });

  it("«Спокойный»: an event opens the breath window; off settles it", () => {
    setLiveLayer("calm");
    const { destroy, calls } = mount();
    expect(raf.count).toBe(0); // still until the bus speaks
    feedLivingEvent("task.created");
    expect(raf.count).toBe(1); // the single living RAF inside the window
    raf.tick(16);
    expect(calls.clear).toBeGreaterThan(0);
    setLiveLayer("off");
    expect(raf.count).toBe(0);
    destroy();
  });

  it("an event opens the window; when it closes the ambient continues (Полный)", () => {
    setLiveLayer("live");
    const { destroy } = mount();
    expect(raf.count).toBe(1); // the ambient is already alive
    feedLivingEvent("task.created");
    expect(document.documentElement.dataset.breath).toBe("true"); // the window
    // The window (3500ms) expires; the event's bead trail decays on its own —
    // the RAF chain no longer ends with it: the AMBIENT carries the loop on.
    vi.advanceTimersByTime(3500);
    expect(document.documentElement.dataset.breath).toBe("false");
    expect(raf.count).toBe(1); // D1b: the quiet undulation never dropped
    raf.tick(16);
    destroy();
  });

  it("duty: an event inside the rest window re-opens no window (tones flow regardless)", () => {
    setLiveLayer("live");
    const { destroy } = mount();
    feedLivingEvent("task.created");
    expect(document.documentElement.dataset.breath).toBe("true");
    vi.advanceTimersByTime(3500); // window over — rest begins
    expect(document.documentElement.dataset.breath).toBe("false");
    feedLivingEvent("task.updated"); // within the 10.5s rest
    // The AMBIENT window stays shut (duty law); the event still tones and may
    // bead — separately budgeted (≤2 alive, coalesced).
    expect(document.documentElement.dataset.breath).toBe("false");
    vi.advanceTimersByTime(10_500); // rest over
    feedLivingEvent("report");
    expect(document.documentElement.dataset.breath).toBe("true"); // opens again
    destroy();
  });

  it("the input freeze kills the window and the beads instantly", () => {
    setLiveLayer("live");
    const { destroy } = mount();
    feedLivingEvent("task.created");
    expect(raf.count).toBe(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    vi.advanceTimersByTime(0); // flush the close timer
    expect(raf.count).toBe(0);
    expect(document.documentElement.dataset.ambient).toBe("false"); // ≤80ms law
    destroy();
  });

  it("input freezes the ambient; one wake resumes it after --duration-breath-rest", () => {
    setLiveLayer("live");
    const { destroy } = mount();
    expect(raf.count).toBe(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    vi.advanceTimersByTime(0);
    expect(raf.count).toBe(0);
    expect(document.documentElement.dataset.ambient).toBe("false");
    vi.advanceTimersByTime(10_499); // still inside the hold
    expect(raf.count).toBe(0);
    vi.advanceTimersByTime(1); // the hold is over — the wake restarts the breath
    expect(raf.count).toBe(1);
    expect(document.documentElement.dataset.ambient).toBe("true");
    destroy();
  });

  it("«Выключен» stops the ambient and clears the carrier attribute", () => {
    setLiveLayer("live");
    const { destroy } = mount();
    expect(raf.count).toBe(1);
    setLiveLayer("off");
    expect(raf.count).toBe(0);
    expect(document.documentElement.dataset.ambient).toBe("false");
    destroy();
  });

  it("the ambient wake timer does not outlive the destructor", () => {
    setLiveLayer("live");
    const { destroy } = mount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    destroy();
    vi.advanceTimersByTime(20_000);
    expect(raf.count).toBe(0);
  });

  it("document.hidden pauses the loop (the RAF chain ends)", () => {
    setLiveLayer("live");
    const { destroy } = mount();
    feedLivingEvent("task.created");
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    raf.tick(32);
    expect(raf.count).toBe(0);
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    destroy();
  });

  it("reduced motion: a static drawing, the RAF never starts", () => {
    mmStub.mockReturnValue(
      asMqList({
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    );
    const { destroy, calls } = mount();
    feedLivingEvent("task.created"); // even the bus may not move reduced
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

  // LAST: muteLiving() has no reverse — the module flag would kill the
  // ambient for every test declared after this one.
  it("muted (?quiet=1): the ambient never starts — strict static", () => {
    muteLiving(); // the anti-fake gate (?quiet=1 pins it at load)
    setLiveLayer("live");
    const { destroy } = mount();
    feedLivingEvent("task.created"); // the feed drops muted input anyway
    expect(raf.count).toBe(0);
    expect(document.documentElement.dataset.ambient).toBe("false");
    destroy();
  });
});
