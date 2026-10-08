// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountScrollTone } from "./scrollTone";
import { DEFAULT_LIVE_LAYER, setLiveLayer } from "@/lib/liveLayerStore";
import {
  feedLivingEvent,
  feedLivingHealth,
  feedLivingUpdate,
  muteLiving,
} from "@/lib/livingFeed";

/**
 * The scroll tone organ (U4) against the §14.6.1 canon — the well organ's
 * tone describe narrowed to the scroll surface: a STEP engine, timers only
 * per event window, strictly neutral while muted/off; lilac = the update
 * tone (the sixth semantic colour). Vitest fake timers ARE the clock.
 */

const GOLD = "rgb(201,147,58)"; // --synapse-write fallback
const LILAC = "rgb(168,143,199)"; // --web-tone-update fallback

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

function buildScroll(): HTMLElement {
  const el = document.createElement("article");
  el.className = "memory-scroll";
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  vi.useFakeTimers();
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
  localStorage.removeItem("vesmaro.live");
  setLiveLayer(DEFAULT_LIVE_LAYER);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("scrollTone — the memory surface carries the living tone", () => {
  it("starts honestly neutral: no data-tone, no --scroll-tone, zero timers", () => {
    const el = buildScroll();
    const destroy = mountScrollTone(el);
    expect(el.dataset.tone).toBeUndefined();
    expect(el.style.getPropertyValue("--scroll-tone")).toBe("");
    destroy();
  });

  it("a real event tints the edge; the window expiry returns the rest state", () => {
    const el = buildScroll();
    const destroy = mountScrollTone(el);
    feedLivingEvent("task.created"); // write · 12s
    expect(el.dataset.tone).toBe("active");
    expect(el.style.getPropertyValue("--scroll-tone")).toBe(GOLD);
    vi.advanceTimersByTime(12000 * 0.8 + 1); // the 80% mark → back to base
    expect(el.dataset.tone).toBeUndefined(); // base = resting recall family → «none»
    destroy();
  });

  it("the update flag tints LILAC on the scroll edge (the sixth semantic colour)", () => {
    const el = buildScroll();
    const destroy = mountScrollTone(el);
    feedLivingUpdate(true);
    expect(el.dataset.tone).toBe("active");
    expect(el.style.getPropertyValue("--scroll-tone")).toBe(LILAC);
    destroy();
  });

  it("health drives the base tone; null health is the honest neutral", () => {
    const el = buildScroll();
    const destroy = mountScrollTone(el);
    feedLivingHealth(["ok", "error"]);
    expect(el.dataset.tone).toBe("active");
    destroy();
  });

  it("mute (?quiet=1) forces strictly neutral regardless of signals", () => {
    const el = buildScroll();
    const destroy = mountScrollTone(el);
    muteLiving();
    feedLivingEvent("provisioning.failed");
    feedLivingHealth(["error"]);
    expect(el.dataset.tone).toBeUndefined();
    expect(el.style.getPropertyValue("--scroll-tone")).toBe("");
    destroy();
  });

  it("«Выключен» forces the neutral regardless of signals", () => {
    const el = buildScroll();
    const destroy = mountScrollTone(el);
    setLiveLayer("off");
    feedLivingEvent("provisioning.failed");
    feedLivingHealth(["error"]);
    expect(el.dataset.tone).toBeUndefined();
    destroy();
  });

  it("destroy is idempotent and clears the surface (StrictMode-safe)", () => {
    const el = buildScroll();
    const destroy = mountScrollTone(el);
    feedLivingEvent("task.created");
    destroy();
    destroy();
    expect(el.dataset.tone).toBeUndefined();
    expect(el.style.getPropertyValue("--scroll-tone")).toBe("");
  });
});
