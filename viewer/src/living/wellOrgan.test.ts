// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountWellOrgan } from "./wellOrgan";
import { DEFAULT_LIVE_LAYER, setLiveLayer } from "@/lib/liveLayerStore";
import {
  feedLivingEvent,
  feedLivingHealth,
  feedLivingUpdate,
  muteLiving,
} from "@/lib/livingFeed";

/**
 * The well organ (W1b) against the §14.6.1 canon, driven by vitest fake
 * timers: the sinon clock IS the organ's clock (it fakes performance.now),
 * so every tone step and bead frame is deterministic. Bead frames run on
 * the manual RAF clock (engine.test.ts pattern) with explicit timestamps.
 */

const GOLD = "rgb(201,147,58)"; // --synapse-write fallback
const RED = "rgb(224,101,92)"; // --synapse-error fallback
const GREEN = "rgb(63,191,127)"; // --color-success fallback
const LILAC = "rgb(168,143,199)"; // --web-tone-update fallback

interface FakeMqList {
  matches: boolean;
  addEventListener: () => undefined;
  removeEventListener: () => undefined;
}
const asMqList = (v: FakeMqList): MediaQueryList => v as unknown as MediaQueryList;
const mmStub = vi.fn((): MediaQueryList =>
  asMqList({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
);

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

let raf: ReturnType<typeof fakeRaf>;

/** Minimal honest scene: substrate group, 2 real edges, 2 data nodes. */
function buildWell(withEdges = true): HTMLElement {
  const win = document.createElement("div");
  win.dataset.wellWindow = "";
  win.dataset.live = "live";
  win.innerHTML = `
    <svg viewBox="0 0 1000 620" preserveAspectRatio="xMidYMax meet">
      <g class="well-substrate"></g>
      <g class="well-drift">
        ${withEdges ? '<line class="well-node" x1="100" y1="300" x2="300" y2="300"></line><line class="well-node" x1="300" y1="300" x2="500" y2="400"></line>' : ""}
      </g>
      <g class="well-drift">
        <circle class="well-node" data-id="aaaaaaaa-1111" data-title="Hello" data-date="2026-01-02" cx="100" cy="300" r="4"></circle>
        <circle class="well-node" data-id="bbbbbbbb-2222" cx="300" cy="300" r="6"></circle>
      </g>
      <g class="well-live"></g>
    </svg>
    <p data-well-readout=""></p>`;
  const svg = win.querySelector("svg")!;
  svg.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 1000,
      height: 620,
      right: 1000,
      bottom: 620,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    }) as DOMRect;
  document.body.appendChild(win);
  return win;
}

function mount(win = buildWell()) {
  const destroy = mountWellOrgan(win);
  return { win, destroy };
}

const pointer = (win: HTMLElement, type: string, x: number, y: number): void => {
  win.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
};

beforeEach(() => {
  vi.useFakeTimers();
  raf = fakeRaf();
  vi.stubGlobal("matchMedia", mmStub);
  mmStub.mockReset();
  mmStub.mockImplementation(() =>
    asMqList({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  );
  document.body.innerHTML = "";
  localStorage.removeItem("vesmaro.live");
  setLiveLayer(DEFAULT_LIVE_LAYER);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("wellOrgan — the step tone (no RAF, timers only per window)", () => {
  it("starts honestly neutral: data-well-tone=none, no --well-tone, ZERO timers", () => {
    const { win, destroy } = mount();
    expect(win.dataset.wellTone).toBe("none");
    expect(win.style.getPropertyValue("--well-tone")).toBe("");
    expect(raf.count).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    destroy();
  });

  it("a real event tints the nodes; the 80% mark returns to base (none at rest)", () => {
    const { win, destroy } = mount();
    feedLivingEvent("task.created");
    expect(win.dataset.wellTone).toBe("active");
    expect(win.style.getPropertyValue("--well-tone")).toBe(GOLD);
    expect(vi.getTimerCount()).toBe(1); // exactly one window timer, nothing else
    vi.advanceTimersByTime(9600); // 80% of the 12s window
    expect(win.dataset.wellTone).toBe("none"); // neutral base → honest rest
    expect(win.style.getPropertyValue("--well-tone")).toBe("");
    expect(vi.getTimerCount()).toBe(0); // back to the zero-timer idle
    destroy();
  });

  it("a same-kind event prolongs the window past the original expiry", () => {
    const { win, destroy } = mount();
    feedLivingEvent("task.created"); // window [0, 12000]
    vi.advanceTimersByTime(11000); // the original 80% mark (9600) fired — idle again
    expect(win.dataset.wellTone).toBe("none");
    feedLivingEvent("task.created"); // t=11000: the window restarts [11000, 23000]
    expect(win.dataset.wellTone).toBe("active");
    vi.advanceTimersByTime(1600); // t=12600 — PAST the original expiry (12000)
    expect(win.dataset.wellTone).toBe("active"); // prolonged, not expired
    expect(win.style.getPropertyValue("--well-tone")).toBe(GOLD);
    vi.advanceTimersByTime(8000); // t=20600 = the restarted window's 80% mark
    expect(win.dataset.wellTone).toBe("none");
    destroy();
  });

  it("hold tones persist past 60s without flicker; the terminal event releases", () => {
    const { win, destroy } = mount();
    feedLivingEvent("provisioning.failed");
    expect(win.dataset.wellTone).toBe("active");
    expect(win.style.getPropertyValue("--well-tone")).toBe(RED);
    expect(vi.getTimerCount()).toBe(0); // holds are signal-driven, no timers
    vi.advanceTimersByTime(70000);
    expect(win.dataset.wellTone).toBe("active"); // no flicker, holds for its family
    expect(win.style.getPropertyValue("--well-tone")).toBe(RED);
    feedLivingEvent("provisioning.ok");
    expect(win.style.getPropertyValue("--well-tone")).toBe(GREEN);
    vi.advanceTimersByTime(9600);
    expect(win.dataset.wellTone).toBe("none");
    destroy();
  });

  it("health drives the base tone; null health is the honest neutral", () => {
    const { win, destroy } = mount();
    feedLivingHealth(["ok", "error"]);
    expect(win.dataset.wellTone).toBe("active");
    expect(win.style.getPropertyValue("--well-tone")).toBe(RED);
    feedLivingHealth(null);
    expect(win.dataset.wellTone).toBe("none");
    destroy();
  });

  it("the update flag tints lilac (the sixth semantic colour)", () => {
    const { win, destroy } = mount();
    feedLivingUpdate(true);
    expect(win.style.getPropertyValue("--well-tone")).toBe(LILAC);
    destroy();
  });

  it("«Выключен» forces the neutral regardless of signals", () => {
    setLiveLayer("off");
    const { win, destroy } = mount();
    feedLivingEvent("provisioning.failed");
    feedLivingHealth(["error"]);
    expect(win.dataset.wellTone).toBe("none");
    destroy();
  });
});

describe("wellOrgan — beads: live events over real edges only", () => {
  it("a live event runs a bead along a deterministic edge; ≤2 alive; extras feed tones only", () => {
    setLiveLayer("live");
    const { win, destroy } = mount();
    feedLivingEvent("task.created");
    expect(raf.count).toBe(1);
    expect(win.querySelectorAll("circle.well-bead")).toHaveLength(1);
    feedLivingEvent("report");
    feedLivingEvent("assignment.started");
    expect(win.querySelectorAll("circle.well-bead")).toHaveLength(2); // hard cap
    destroy();
  });

  it("bead position is deterministic: same kind → same edge, same direction", () => {
    setLiveLayer("live");
    const a = mount();
    feedLivingEvent("task.created");
    raf.tick(performance.now() + 400);
    const cx = a.win.querySelector("circle.well-bead")!.getAttribute("cx");
    const cy = a.win.querySelector("circle.well-bead")!.getAttribute("cy");
    a.destroy();

    document.body.innerHTML = "";
    const b = mount();
    feedLivingEvent("task.created");
    raf.tick(performance.now() + 400);
    expect(b.win.querySelector("circle.well-bead")!.getAttribute("cx")).toBe(cx);
    expect(b.win.querySelector("circle.well-bead")!.getAttribute("cy")).toBe(cy);
    b.destroy();
  });

  it("zero beads without edges, in calm, when muted, and under reduced motion", () => {
    const noEdges = mount(buildWell(false));
    feedLivingEvent("task.created");
    expect(raf.count).toBe(0);
    noEdges.destroy();

    document.body.innerHTML = "";
    const calm = mount(); // DEFAULT_LIVE_LAYER = calm
    feedLivingEvent("task.created");
    expect(raf.count).toBe(0);
    calm.destroy();

    document.body.innerHTML = "";
    mmStub.mockReturnValue(
      asMqList({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }),
    );
    setLiveLayer("live");
    const reduced = mount();
    feedLivingEvent("task.created");
    expect(raf.count).toBe(0);
    reduced.destroy();
  });

  it("the bead dies after its pass + trail decay; hidden tab pauses the chain", () => {
    setLiveLayer("live");
    const { win, destroy } = mount();
    feedLivingEvent("task.created");
    const t0 = performance.now();
    raf.tick(t0 + 100);
    expect(win.querySelectorAll("circle.well-bead")).toHaveLength(1);
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    raf.tick(t0 + 200);
    expect(raf.count).toBe(0); // chain ends while hidden
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(raf.count).toBe(1); // the live bead resumes
    raf.tick(t0 + 1600 + 1500 + 1);
    expect(win.querySelectorAll("circle.well-bead")).toHaveLength(0);
    expect(win.querySelectorAll(".well-bead-trail")).toHaveLength(0);
    destroy();
  });
});

describe("wellOrgan — hover: halo + honest readout (works muted, data layer)", () => {
  it("hit: «title · YYYY-MM-DD» readout + myelin halo ring at r+3", () => {
    const { win, destroy } = mount();
    pointer(win, "pointermove", 100, 300);
    const readout = win.querySelector("[data-well-readout]")!;
    expect(readout.textContent).toBe("Hello · 2026-01-02");
    const halo = win.querySelector("circle.well-node-halo")!;
    expect(halo.getAttribute("r")).toBe("7");
    expect(halo.getAttribute("cx")).toBe("100");
    destroy();
  });

  it("miss clears; a node without a title falls back to id.slice(0,8)", () => {
    const { win, destroy } = mount();
    pointer(win, "pointermove", 700, 100);
    expect(win.querySelector("[data-well-readout]")!.textContent).toBe("");
    pointer(win, "pointermove", 300, 300);
    expect(win.querySelector("[data-well-readout]")!.textContent).toBe("bbbbbbbb");
    pointer(win, "pointermove", 700, 100);
    expect(win.querySelector("[data-well-readout]")!.textContent).toBe("");
    expect(win.querySelector("circle.well-node-halo")).toBeNull();
    destroy();
  });

  it("Escape and pointerleave reset the hover state", () => {
    const { win, destroy } = mount();
    pointer(win, "pointermove", 100, 300);
    expect(win.querySelector("[data-well-readout]")!.textContent).not.toBe("");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(win.querySelector("[data-well-readout]")!.textContent).toBe("");
    pointer(win, "pointermove", 100, 300);
    pointer(win, "pointerleave", 0, 0);
    expect(win.querySelector("[data-well-readout]")!.textContent).toBe("");
    destroy();
  });
});

describe("wellOrgan — lifecycle", () => {
  it("the destructor is idempotent and detaches every listener", () => {
    setLiveLayer("live");
    const { win, destroy } = mount();
    destroy();
    destroy();
    feedLivingEvent("task.created");
    feedLivingHealth(["error"]);
    expect(win.dataset.wellTone).toBeUndefined(); // organ removed its traces
    expect(raf.count).toBe(0);
    expect(win.querySelectorAll("circle.well-bead")).toHaveLength(0);
  });

  it("StrictMode double-mount: two organs on one window tear down cleanly", () => {
    setLiveLayer("live");
    const win = buildWell();
    const first = mountWellOrgan(win);
    const second = mountWellOrgan(win);
    first();
    second();
    feedLivingEvent("task.created");
    expect(win.querySelectorAll("circle.well-bead")).toHaveLength(0);
    expect(raf.count).toBe(0);
  });
});

// NOTE: runs LAST — muteLiving() pins the livingFeed module gate for the
// whole file (there is no unmute; the canon resets only on reload).
describe("wellOrgan — the anti-fake mute gate", () => {
  it("muted: strictly neutral tone, zero beads, zero timers", () => {
    setLiveLayer("live");
    const { win, destroy } = mount();
    feedLivingEvent("task.created"); // unmuted: tone + bead
    expect(win.dataset.wellTone).toBe("active");
    expect(raf.count).toBe(1);
    muteLiving();
    expect(win.dataset.wellTone).toBe("none");
    expect(win.style.getPropertyValue("--well-tone")).toBe("");
    expect(win.querySelectorAll("circle.well-bead")).toHaveLength(0);
    expect(raf.count).toBe(0);
    destroy();
  });
});
