// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountVesma } from "./vesma";
import { DEFAULT_LIVE_LAYER, setLiveLayer } from "@/lib/liveLayerStore";
import { feedLivingEvent, feedLivingHealth } from "@/lib/livingFeed";

/**
 * The Весма keeper (W2) against the §14.3.2 dosage canon, driven by vitest
 * fake timers (the sinon clock IS the keeper's clock — it fakes
 * performance.now, wellOrgan.test.ts pattern). Flights and bubbles are read
 * from the slot's honest state attributes: data-vesma-flights,
 * data-vesma-speaking, data-vesma-sleep, data-vesma-reduced.
 *
 * NOTE: the anti-fake mute flag in livingFeed is sticky by canon (until
 * reload) — the mute test therefore runs LAST on a fresh module instance
 * (vi.resetModules), so it cannot poison the other tests.
 */

interface FakeMqList {
  matches: boolean;
  addEventListener: () => undefined;
  removeEventListener: () => undefined;
}
const asMqList = (v: FakeMqList): MediaQueryList => v as unknown as MediaQueryList;
const mmStub = vi.fn((): MediaQueryList =>
  asMqList({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
);

const REST = 60_000; // --satellite-rest fallback
const DONE_A = "Есть решение по «Задача А» — ждёт вас.";
const DONE_GENERIC = "Работа закончилась — результат ждёт в задачах.";

/** A flight target: happy-dom provides presence, not rects — enough. */
function addTarget(selector: string): void {
  const href = /href="([^"]+)"/.exec(selector);
  const el = document.createElement(href ? "a" : "header");
  if (href) el.setAttribute("href", href[1]);
  else el.dataset.livingSeam = "topbar";
  document.body.appendChild(el);
}

function buildSlot(): HTMLElement {
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  return slot;
}

/** Mount with the intro suppressed (the session flag preset). */
function mountQuiet(): { slot: HTMLElement; destroy: () => void } {
  sessionStorage.setItem("vesma.intro", "1");
  const slot = buildSlot();
  const destroy = mountVesma(slot);
  return { slot, destroy };
}

/** The parsed payload shape the bridge hands over (only what vesma reads). */
function ev(kind: string, title?: string): Parameters<typeof feedLivingEvent>[1] {
  return title === undefined
    ? undefined
    : ({ kind, notification: { title } } as unknown as Parameters<typeof feedLivingEvent>[1]);
}

const cloud = (slot: HTMLElement): HTMLDivElement =>
  slot.querySelector<HTMLDivElement>(".vesma-cloud")!;

let hidden = false;
Object.defineProperty(document, "hidden", {
  configurable: true,
  get: () => hidden,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", mmStub);
  mmStub.mockReset();
  mmStub.mockImplementation(() =>
    asMqList({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  );
  document.body.innerHTML = "";
  sessionStorage.clear();
  localStorage.removeItem("vesmaro.live");
  hidden = false;
  setLiveLayer(DEFAULT_LIVE_LAYER); // calm
  addTarget('a[href="/tasks"]');
  addTarget('a[href="/agents/hosts"]');
  addTarget('header[data-living-seam="topbar"]');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setLiveLayer(DEFAULT_LIVE_LAYER);
});

describe("vesma — the verb mapping (real kinds only)", () => {
  it("assignment.done flies to /tasks and speaks the named phrase", () => {
    setLiveLayer("live");
    const { slot, destroy } = mountQuiet();
    feedLivingEvent("assignment.done", ev("assignment.done", "Задача А"));
    expect(slot.dataset.vesmaFlights).toBe("1");
    expect(slot.dataset.vesmaSpeaking).toBe("1");
    expect(cloud(slot).textContent).toBe(DONE_A);
    destroy();
  });

  it("report without a notification payload flies silent (no ids in phrases)", () => {
    setLiveLayer("live");
    const { slot, destroy } = mountQuiet();
    feedLivingEvent("report");
    expect(slot.dataset.vesmaFlights).toBe("1");
    expect(slot.dataset.vesmaSpeaking).toBeUndefined();
    expect(cloud(slot).hidden).toBe(true);
    destroy();
  });

  it("background classes never gesture: 5× task.updated → zero flights", () => {
    setLiveLayer("live");
    const { slot, destroy } = mountQuiet();
    for (let i = 0; i < 5; i++) feedLivingEvent("task.updated");
    expect(slot.dataset.vesmaFlights).toBeUndefined();
    expect(cloud(slot).hidden).toBe(true);
    destroy();
  });

  it("provisioning.failed flies to hosts; a relay title speaks in the nest", () => {
    setLiveLayer("live");
    const { slot, destroy } = mountQuiet();
    feedLivingEvent("provisioning.failed");
    expect(slot.dataset.vesmaFlights).toBe("1");
    vi.advanceTimersByTime(4_000); // the bubble auto-hides
    expect(slot.dataset.vesmaSpeaking).toBeUndefined();
    vi.advanceTimersByTime(86_000); // the 90s cloud window reopens
    feedLivingEvent("notification", ev("notification", "Письмо от команды"));
    expect(slot.dataset.vesmaFlights).toBe("1"); // relay: no flight
    expect(cloud(slot).textContent).toBe("Письмо от команды");
    destroy();
  });

  it("health ok→warn/error calls (flight); error→ok recovers in the nest", () => {
    setLiveLayer("live");
    const { slot, destroy } = mountQuiet();
    feedLivingHealth(["ok", "ok"]); // the baseline — no verb on the first read
    feedLivingHealth(["ok", "warn"]);
    expect(slot.dataset.vesmaFlights).toBe("1");
    vi.advanceTimersByTime(90_000); // the recovery bubble needs a free window
    feedLivingHealth(["ok"]);
    expect(slot.dataset.vesmaFlights).toBe("1"); // recovery: bubble, no flight
    expect(cloud(slot).textContent).toBe("Связь с памятью восстановлена.");
    destroy();
  });
});

describe("vesma — dosage (§14.3.2)", () => {
  it("10 consecutive dones → ≤1 flight (identical text in a row is silence)", () => {
    setLiveLayer("live");
    const { slot, destroy } = mountQuiet();
    feedLivingEvent("assignment.done"); // no payload → the generic phrase
    expect(cloud(slot).textContent).toBe(DONE_GENERIC);
    for (let i = 0; i < 9; i++) feedLivingEvent("assignment.done");
    expect(slot.dataset.vesmaFlights).toBe("1");
    vi.advanceTimersByTime(REST + 1_000); // the rest elapsed, the queue is empty
    expect(slot.dataset.vesmaFlights).toBe("1");
    destroy();
  });

  it("flights keep ≥ --satellite-rest apart", () => {
    setLiveLayer("live");
    const { slot, destroy } = mountQuiet();
    feedLivingEvent("assignment.done", ev("assignment.done", "А"));
    feedLivingEvent("assignment.done", ev("assignment.done", "Б"));
    vi.advanceTimersByTime(REST - 1);
    expect(slot.dataset.vesmaFlights).toBe("1");
    vi.advanceTimersByTime(1); // the retry fires exactly at the rest border
    expect(slot.dataset.vesmaFlights).toBe("2");
    destroy();
  });

  it("≤3 flights per rolling 10 minutes; the window frees the 4th", () => {
    setLiveLayer("live");
    const { slot, destroy } = mountQuiet();
    feedLivingEvent("assignment.done", ev("assignment.done", "А"));
    vi.advanceTimersByTime(REST);
    feedLivingEvent("assignment.done", ev("assignment.done", "Б"));
    vi.advanceTimersByTime(REST);
    feedLivingEvent("assignment.done", ev("assignment.done", "В"));
    vi.advanceTimersByTime(1);
    feedLivingEvent("assignment.done", ev("assignment.done", "Г"));
    vi.advanceTimersByTime(300_000);
    expect(slot.dataset.vesmaFlights).toBe("3"); // the window still holds
    vi.advanceTimersByTime(300_000 - 1); // flights[0] ages out of the window
    expect(slot.dataset.vesmaFlights).toBe("4");
    destroy();
  });

  it("a nest bubble is ≤1/90s, auto-hides in 4s, and never repeats a text", () => {
    setLiveLayer("live");
    const { slot, destroy } = mountQuiet();
    feedLivingEvent("notification", ev("notification", "Первое"));
    expect(cloud(slot).hidden).toBe(false);
    vi.advanceTimersByTime(4_000);
    expect(cloud(slot).hidden).toBe(true);
    feedLivingEvent("notification", ev("notification", "Второе"));
    expect(cloud(slot).hidden).toBe(true); // <90s: silence
    vi.advanceTimersByTime(86_000);
    feedLivingEvent("notification", ev("notification", "Третье"));
    expect(cloud(slot).hidden).toBe(false);
    vi.advanceTimersByTime(90_000 + 4_000);
    feedLivingEvent("notification", ev("notification", "Третье"));
    expect(cloud(slot).hidden).toBe(true); // same text in a row → silence
    destroy();
  });

  it("an open [role=dialog] defers the flight (accumulates, no jump-cut)", () => {
    setLiveLayer("live");
    const { slot, destroy } = mountQuiet();
    feedLivingEvent("assignment.done", ev("assignment.done", "А"));
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    feedLivingEvent("assignment.done", ev("assignment.done", "Б"));
    vi.advanceTimersByTime(REST + 5_000);
    expect(slot.dataset.vesmaFlights).toBe("1"); // held while the dialog is open
    dialog.remove();
    vi.advanceTimersByTime(5_000); // the 4s dialog poll re-checks
    expect(slot.dataset.vesmaFlights).toBe("2");
    destroy();
  });

  it("a hidden tab sleeps and keeps only the LAST reason for the return", () => {
    setLiveLayer("live");
    const { slot, destroy } = mountQuiet();
    feedLivingEvent("assignment.done", ev("assignment.done", "А"));
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    feedLivingEvent("assignment.done", ev("assignment.done", "Б"));
    feedLivingEvent("assignment.done", ev("assignment.done", "В"));
    vi.advanceTimersByTime(90_000); // still hidden: rest + cloud window reopen
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(slot.dataset.vesmaFlights).toBe("2"); // only the last reason flew
    expect(cloud(slot).textContent).toContain("В");
    destroy();
  });

  it("5 min of silence → sleep (breath 0.08); any event wakes", () => {
    setLiveLayer("live");
    const { slot, destroy } = mountQuiet();
    vi.advanceTimersByTime(300_000);
    expect(slot.dataset.vesmaSleep).toBe("1");
    feedLivingEvent("task.updated");
    expect(slot.dataset.vesmaSleep).toBeUndefined();
    destroy();
  });
});

describe("vesma — the levels and gates", () => {
  it("calm: static in the nest — lantern keeps the last tone, ZERO gestures", () => {
    const { slot, destroy } = mountQuiet(); // calm is the default
    feedLivingEvent("assignment.done", ev("assignment.done", "А"));
    expect(slot.dataset.vesmaFlights).toBeUndefined();
    expect(cloud(slot).hidden).toBe(true);
    expect(slot.style.getPropertyValue("--vesma-lantern")).not.toBe(""); // the tone lives
    destroy();
  });

  it("off: no gestures even if a signal leaks through the feed", () => {
    setLiveLayer("off");
    const { slot, destroy } = mountQuiet();
    feedLivingEvent("assignment.done", ev("assignment.done", "А"));
    expect(slot.dataset.vesmaFlights).toBeUndefined();
    expect(slot.style.getPropertyValue("--vesma-lantern")).toBe("");
    destroy();
  });

  it("reduced: a static dot — reduced state set, gestures off", () => {
    mmStub.mockImplementation(() =>
      asMqList({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }),
    );
    setLiveLayer("live");
    const { slot, destroy } = mountQuiet();
    expect(slot.dataset.vesmaReduced).toBe("1");
    feedLivingEvent("assignment.done", ev("assignment.done", "А"));
    expect(slot.dataset.vesmaFlights).toBeUndefined();
    expect(cloud(slot).hidden).toBe(true);
    destroy();
  });

  it("the intro speaks once per session, with the «Понятно» button", () => {
    setLiveLayer("live");
    const slot = buildSlot();
    const destroy = mountVesma(slot);
    expect(cloud(slot).hidden).toBe(false);
    expect(cloud(slot).textContent).toContain("Я Весма");
    const ok = cloud(slot).querySelector<HTMLButtonElement>(".vesma-ok")!;
    expect(ok.textContent).toBe("Понятно");
    ok.click();
    expect(cloud(slot).hidden).toBe(true);
    destroy();
    const second = buildSlot();
    const destroy2 = mountVesma(second);
    expect(cloud(second).hidden).toBe(true); // once per session
    destroy2();
  });

  it("StrictMode: mount → destroy → mount leaves zero timers and works", () => {
    setLiveLayer("live");
    const first = buildSlot();
    const d1 = mountVesma(first);
    d1();
    d1(); // idempotent
    const second = buildSlot();
    const d2 = mountVesma(second);
    feedLivingEvent("assignment.done", ev("assignment.done", "А"));
    expect(second.dataset.vesmaFlights).toBe("1");
    expect(first.dataset.vesmaFlights).toBeUndefined(); // the dead mount is inert
    d2();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the creature is aria-hidden; the bubble is one polite status region", () => {
    setLiveLayer("live"); // gestures live only in Полный
    const { slot, destroy } = mountQuiet();
    expect(slot.querySelector(".vesma-fly")!.getAttribute("aria-hidden")).toBe("true");
    expect(slot.querySelector(".vesma-nest")!.getAttribute("aria-hidden")).toBe("true");
    expect(cloud(slot).getAttribute("role")).toBe("status");
    feedLivingEvent("notification", ev("notification", "Первое"));
    expect(cloud(slot).textContent).toBe("Первое");
    destroy();
  });
});

// LAST: the mute flag is sticky in livingFeed (canon: until reload). This
// block runs on a fresh module instance so nothing above or below is
// poisoned by it.
describe("vesma — the anti-fake mute gate (fresh modules)", () => {
  it("muted: instantly neutral — queue, bubble, lantern cleared, stays inert", async () => {
    vi.resetModules();
    const feed = await import("@/lib/livingFeed");
    const vesma = await import("./vesma");
    mmStub.mockImplementation(() =>
      asMqList({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    );
    sessionStorage.setItem("vesma.intro", "1");
    setLiveLayer("live");
    const slot = buildSlot();
    const destroy = vesma.mountVesma(slot);
    feed.feedLivingEvent("notification", ev("notification", "Первое"));
    expect(slot.dataset.vesmaSpeaking).toBe("1");
    feed.muteLiving();
    expect(slot.dataset.vesmaSpeaking).toBeUndefined();
    expect(slot.style.getPropertyValue("--vesma-lantern")).toBe("");
    feed.feedLivingEvent("assignment.done", ev("assignment.done", "А")); // dropped
    expect(slot.dataset.vesmaFlights).toBeUndefined();
    destroy();
  });
});
