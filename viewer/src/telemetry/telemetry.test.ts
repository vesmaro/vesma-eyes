import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requestJson } from "@/gateway/http";
import {
  __resetForTests,
  __stateForTests,
  getCurrentSurface,
  getPreviousPathname,
  markPaletteNavigation,
  startVisit,
  trackItemSelected,
  trackKoraEntered,
  trackPaletteOpened,
  trackRouteChange,
} from "./telemetry";

/**
 * The singleton gate (taxonomy §1.3: anonymous never emits) and the
 * cross-surface state the emitters share. In tests the singleton rides a
 * silent transport (see telemetry.ts), so assertions read the queue.
 */

beforeEach(() => {
  __resetForTests();
});

afterEach(() => {
  __resetForTests();
});

function pendingEvents(): Array<Record<string, unknown>> {
  return __stateForTests().pending as Array<Record<string, unknown>>;
}

describe("telemetry gate: ui.visit and the anonymous no-op (§1.2 #1, §1.3)", () => {
  it("a disarmed (anonymous) session emits NOTHING", () => {
    trackRouteChange("/tasks");
    trackPaletteOpened("hotkey");
    trackItemSelected("nav", "enter");
    trackKoraEntered("route", 100);
    const state = __stateForTests();
    expect(state.armed).toBe(false);
    expect(state.pending).toHaveLength(0);
    expect(state.visitId).toBeNull();
  });

  it("startVisit arms once and emits exactly one ui.visit", () => {
    startVisit();
    startVisit(); // StrictMode double probe / re-mount — still one visit
    const state = __stateForTests();
    expect(state.armed).toBe(true);
    expect(state.visitId).toMatch(/^[0-9A-Za-z][0-9A-Za-z-]{7,63}$/);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]).toMatchObject({ kind: "ui.visit" });
    expect(state.pending[0]).toHaveProperty("visit_id", state.visitId);
  });

  it("armed events share the visit id", () => {
    startVisit();
    trackPaletteOpened("button");
    const events = pendingEvents();
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({
      kind: "cmdk.palette_opened",
      visit_id: events[1].visit_id,
      trigger: "button",
    });
  });
});

describe("telemetry route state: ui.nav + surface + attribution (§1.2 #2)", () => {
  it("stamps the surface slug and tracks the previous pathname", () => {
    startVisit();
    trackRouteChange("/tasks/activity");
    expect(pendingEvents().at(-1)).toMatchObject({
      kind: "ui.nav",
      surface: "activity",
      via: "route",
    });
    expect(getPreviousPathname()).toBe("/tasks/activity");
    expect(getCurrentSurface()).toBe("activity");
  });

  it("a fresh palette mark attributes via=palette exactly once", () => {
    startVisit();
    markPaletteNavigation();
    trackRouteChange("/kora");
    expect(pendingEvents().at(-1)).toMatchObject({ kind: "ui.nav", via: "palette" });
    // Consumed: the next unmarked navigation is a plain route change.
    trackRouteChange("/memory");
    expect(pendingEvents().at(-1)).toMatchObject({ kind: "ui.nav", via: "route" });
  });

  it("a stale palette mark (user navigated elsewhere first) is not consumed by a later nav", () => {
    startVisit();
    markPaletteNavigation();
    trackRouteChange("/tasks"); // consumes the mark right away — via=palette
    expect(pendingEvents().at(-1)).toMatchObject({ via: "palette" });
    trackRouteChange("/kora");
    expect(pendingEvents().at(-1)).toMatchObject({ via: "route" });
  });
});

describe("telemetry emitters: kora.entered and cmdk.* (§1.2 #3, #7, #8)", () => {
  it("kora.entered carries entry and the bucketed latency class", () => {
    startVisit();
    trackKoraEntered("palette", 350);
    expect(pendingEvents().at(-1)).toEqual({
      kind: "kora.entered",
      visit_id: pendingEvents().at(-1)!.visit_id,
      entry: "palette",
      latency_class: "b",
    });
  });

  it("cmdk.item_selected carries group and via", () => {
    startVisit();
    trackItemSelected("memory", "click");
    expect(pendingEvents().at(-1)).toMatchObject({
      kind: "cmdk.item_selected",
      group: "memory",
      via: "click",
    });
  });
});

describe("telemetry surface_error: the http.ts seam (§1.2 #10)", () => {
  function fetchWithStatus(status: number | "throw"): typeof fetch {
    return (async () => {
      if (status === "throw") throw new TypeError("offline");
      return new Response("{}", { status });
    }) as typeof fetch;
  }

  it("an http failure on a ui surface lands as a classed event", async () => {
    startVisit();
    trackRouteChange("/memory"); // the surface stamp rides along
    const err = await requestJson(
      { baseUrl: "/api", fetchImpl: fetchWithStatus(503) },
      "/mnemos/search",
      { method: "POST", body: {} },
    ).catch((error: unknown) => error);
    expect((err as { status: number }).status).toBe(503);
    expect(pendingEvents().at(-1)).toMatchObject({
      kind: "ui.surface_error",
      surface: "memory",
      status_class: "e5xx",
      op: "write",
    });
  });

  it("transport failures class as network, GET as read", async () => {
    startVisit();
    await requestJson(
      { baseUrl: "/api", fetchImpl: fetchWithStatus("throw") },
      "/mnemos/search",
    ).catch(() => undefined);
    expect(pendingEvents().at(-1)).toMatchObject({
      kind: "ui.surface_error",
      status_class: "network",
      op: "read",
    });
  });

  it("a status v0 cannot express is dropped locally, not mislabeled", async () => {
    startVisit();
    const before = pendingEvents().length;
    await requestJson(
      { baseUrl: "/api", fetchImpl: fetchWithStatus(400) },
      "/tasks",
      { method: "POST", body: {} },
    ).catch(() => undefined);
    expect(pendingEvents()).toHaveLength(before);
    expect(__stateForTests().locallyDropped).toBe(1);
  });

  it("caller-initiated aborts are NOT failures (a cancelled query is not an error)", async () => {
    startVisit();
    const before = pendingEvents().length;
    const controller = new AbortController();
    controller.abort();
    // Abort-realistic fake: a real fetch with an aborted signal rejects
    // before any response exists — the 500 below must stay unreachable.
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return new Response("{}", { status: 500 });
    }) as unknown as typeof fetch;
    await requestJson(
      { baseUrl: "/api", fetchImpl },
      "/tasks",
      { signal: controller.signal },
    ).catch(() => undefined);
    expect(pendingEvents()).toHaveLength(before);
  });

  it("a disarmed session ignores the seam entirely", async () => {
    await requestJson(
      { baseUrl: "/api", fetchImpl: fetchWithStatus(404) },
      "/mnemos/memories/xyz",
    ).catch(() => undefined);
    expect(__stateForTests().pending).toHaveLength(0);
  });
});
