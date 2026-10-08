import { describe, expect, it } from "vitest";
import { createTones } from "./tones";

/**
 * The tone state machine against the §14.6.1 canon, driven by a fake clock:
 * `frame(now, dt)` is the only time input, so tests step it deterministically.
 */

const IRIS = "rgb(79,194,206)"; // --synapse-recall (neutral tint)
const GOLD = "rgb(201,147,58)"; // --synapse-write
const RED = "rgb(224,101,92)"; // --synapse-error
const LILAC = "rgb(168,143,199)"; // --web-tone-update

function make(muted = false) {
  return createTones(
    (_name, fb) => fb,
    () => muted,
  );
}

describe("tones — base tone from real health (§14.6.1 §1)", () => {
  it("starts neutral (iris family) with no data", () => {
    expect(make().frame(0, 16)).toBe(IRIS);
  });

  it("crossfades to error and back over --duration-tone-fade, never jumps", () => {
    const t = make();
    t.health(["ok", "error"]);
    const mid = t.frame(0, 600); // halfway through the 1200ms fade
    expect(mid).not.toBe(IRIS);
    expect(mid).not.toBe(RED);
    expect(t.frame(1200, 600)).toBe(RED); // fade settled
    t.health(["ok", "ok"]);
    expect(t.frame(1300, 100)).not.toBe(RED); // fading back, not instant
    expect(t.frame(2500, 1200)).toBe(IRIS);
  });

  it("null health is the honest neutral (no fabricated tone)", () => {
    const t = make();
    t.health(null);
    expect(t.frame(0, 16)).toBe(IRIS);
  });

  it("priority: error > warn > update > neutral", () => {
    const t = make();
    t.setUpdate(true);
    expect(t.frame(0, 1200)).toBe(LILAC);
    t.health(["warn"]);
    expect(t.frame(1400, 1200)).toBe("rgb(217,160,63)"); // --color-warning
    t.health(["warn", "error"]);
    expect(t.frame(2800, 1200)).toBe(RED);
  });

  it("warn holds while the poll keeps it, releases when ok returns", () => {
    const t = make();
    t.health(["warn"]);
    expect(t.frame(1500, 1500)).toBe("rgb(217,160,63)");
    t.health(["ok"]);
    expect(t.frame(3000, 1500)).toBe(IRIS);
  });
});

describe("tones — event temp tones (§14.6.1 §2)", () => {
  it("task.created tints gold for 12s; the last 20% fades to base", () => {
    const t = make();
    t.event("task.created");
    expect(t.frame(1000, 1000)).toBe(GOLD);
    const late = t.frame(11000, 1000); // k≈0.92 → blended toward base
    expect(late).not.toBe(GOLD);
    expect(t.frame(12100, 1100)).toBe(IRIS); // expired
  });

  it("a same-key event prolongs the window", () => {
    const t = make();
    t.event("task.created");
    t.frame(11000, 11000); // the clock advances; the tone is nearly spent
    t.event("task.created"); // …the window restarts from now
    expect(t.frame(13000, 2000)).toBe(GOLD);
  });

  it("coalesce: ≤2 tones; a lower-priority newcomer is dropped", () => {
    const t = make();
    t.event("task.blocked"); // warn · hold
    t.event("pairing.requested"); // conf · hold
    t.event("task.created"); // write — lowest of the three
    expect(t.frame(100, 100)).toBe("rgb(217,160,63)"); // warn wins
    expect(t.frame(100, 0)).toBe("rgb(217,160,63)");
  });

  it("a higher-priority newcomer replaces the lowest sitting tone", () => {
    const t = make();
    t.event("pairing.requested"); // conf
    t.event("task.created"); // write
    t.event("provisioning.failed"); // error — replaces write
    expect(t.frame(200, 200)).toBe(RED);
  });

  it("error tone holds the base red ≤60s and releases on terminal ok", () => {
    const t = make();
    t.event("provisioning.failed");
    expect(t.frame(70_000, 1000)).toBe(RED); // still holding (≤ --duration-tone-hold)
    t.event("provisioning.ok"); // terminal: releases the hold, its own success tone
    expect(t.frame(72_000, 2000)).toBe("rgb(63,191,127)");
    expect(t.frame(85_000, 13_000)).toBe(IRIS); // and fades back to neutral
  });

  it("assignment.done releases the task.blocked warning hold", () => {
    const t = make();
    t.event("task.blocked");
    expect(t.frame(1000, 1000)).toBe("rgb(217,160,63)");
    t.event("assignment.done"); // the release carries its own gold beat
    expect(t.frame(3000, 2000)).toBe(GOLD);
    expect(t.frame(15000, 12_000)).toBe(IRIS); // …then honest neutral
  });

  it("unknown kinds carry no tone (no colour without a source)", () => {
    const t = make();
    t.event("hello");
    expect(t.frame(10, 10)).toBe(IRIS);
  });
});

describe("tones — the anti-fake mute gate", () => {
  it("muted: strictly neutral, events and health ignored", () => {
    const t = make(true);
    t.event("task.created");
    t.health(["error"]);
    t.setUpdate(true);
    expect(t.frame(0, 16)).toBeNull();
    expect(t.frame(60_000, 1000)).toBeNull();
  });
});

// --- the breath window (U2 honesty of light) ---------------------------------
//
// SPEC-2026-10-07: «первое дыхание из шины; шина молчит — экран стоит».
// The window is the ONE motion gate: a real event opens it, it closes
// itself after --duration-breath, rests ≥ --duration-breath-rest (25% duty
// ceiling), freezes instantly on input, and never opens when the reduced
// mirror zeroes the durations. Driven by vitest fake timers (setTimeout +
// performance.now are the window's whole clock).

import { afterEach, beforeEach, vi } from "vitest";
import { createBreath, isBusServiceKind } from "./tones";

describe("breath — the motion window opened by a real bus event (U2)", () => {
  beforeEach(() => {
    vi.useFakeTimers(); // fakes setTimeout AND performance.now (the window clock)
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function make(allowed = true) {
    const events: boolean[] = [];
    const breath = createBreath(
      (_name, fb) => fb, // fallbacks: window 3500ms, rest 10500ms
      () => allowed,
    );
    breath.subscribe((open) => events.push(open));
    return { breath, events };
  }

  it("rests closed until the first event; the window then opens", () => {
    const { breath, events } = make();
    expect(breath.isOpen).toBe(false);
    expect(events).toEqual([false]);
    breath.event();
    expect(breath.isOpen).toBe(true);
    expect(events).toEqual([false, true]);
  });

  it("closes itself after the window; the close is announced once", () => {
    const { breath, events } = make();
    breath.event();
    vi.advanceTimersByTime(3500);
    expect(breath.isOpen).toBe(false);
    expect(events).toEqual([false, true, false]);
    vi.advanceTimersByTime(30_000);
    expect(events).toEqual([false, true, false]); // silence stays silent
  });

  it("duty ceiling: events during the rest do NOT reopen the window", () => {
    const { breath, events } = make();
    breath.event();
    vi.advanceTimersByTime(3500); // window over, rest begins
    breath.event(); // inside the 10.5s rest — ignored
    expect(breath.isOpen).toBe(false);
    vi.advanceTimersByTime(5000);
    breath.event(); // still resting (t=8.5s < 14s)
    expect(breath.isOpen).toBe(false);
    vi.advanceTimersByTime(5500); // rest over (t=14s)
    breath.event();
    expect(breath.isOpen).toBe(true);
    expect(events).toEqual([false, true, false, true]);
  });

  it("input freeze: instant close, and NO cooldown — the next event breathes", () => {
    const { breath, events } = make();
    breath.event();
    breath.freeze();
    expect(breath.isOpen).toBe(false);
    breath.event(); // right after the freeze — allowed
    expect(breath.isOpen).toBe(true);
    expect(events).toEqual([false, true, false, true]);
  });

  it("a disallowed regime never opens (reduced mirror 0ms works the same)", () => {
    const { breath } = make(false);
    breath.event();
    expect(breath.isOpen).toBe(false);
  });

  it("zero durations (the reduced mirror) can never open a window", () => {
    const breath = createBreath(
      (name, fb) => (name === "--duration-breath" ? "0" : fb),
      () => true,
    );
    breath.event();
    expect(breath.isOpen).toBe(false);
  });

  it("destroy closes and detaches; post-destroy events are no-ops", () => {
    const { breath, events } = make();
    breath.event();
    breath.destroy();
    expect(breath.isOpen).toBe(false);
    breath.event();
    expect(breath.isOpen).toBe(false);
    expect(events).toEqual([false, true, false]);
  });

  it("service frames are not events: hello never opens anything", () => {
    expect(isBusServiceKind("hello")).toBe(true);
    expect(isBusServiceKind("task.created")).toBe(false);
  });
});
