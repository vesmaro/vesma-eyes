import { describe, expect, it } from "vitest";
import {
  latencyClassFromMs,
  makeVisitId,
  monotonicNow,
  opFromMethod,
  statusClassFromStatus,
  surfaceFromPathname,
  validateTelemetryEvent,
  VISIT_ID_PATTERN,
} from "./events";

describe("taxonomy mirror: pure mappers (ME-041, taxonomy §1.2)", () => {
  it("maps pathnames onto the surface slug vocabulary", () => {
    expect(surfaceFromPathname("/")).toBe("overview");
    expect(surfaceFromPathname("/memory")).toBe("memory");
    expect(surfaceFromPathname("/memory/search")).toBe("memory");
    expect(surfaceFromPathname("/memory/abc-123")).toBe("memory");
    expect(surfaceFromPathname("/tasks")).toBe("tasks");
    // Number 6's denominator: activity is its own surface, not "tasks".
    expect(surfaceFromPathname("/tasks/activity")).toBe("activity");
    expect(surfaceFromPathname("/tasks/abc")).toBe("tasks");
    expect(surfaceFromPathname("/agents/hosts")).toBe("agents");
    expect(surfaceFromPathname("/kora")).toBe("kora");
    expect(surfaceFromPathname("/kora/session-1")).toBe("kora");
    expect(surfaceFromPathname("/docs/vesma-eyes")).toBe("docs");
    expect(surfaceFromPathname("/system/status")).toBe("status");
    expect(surfaceFromPathname("/system/settings")).toBe("settings");
    expect(surfaceFromPathname("/system/sessions/xyz")).toBe("sessions");
    expect(surfaceFromPathname("/system/traces")).toBe("traces");
    expect(surfaceFromPathname("/pair")).toBe("pair");
    expect(surfaceFromPathname("/definitely-not-a-route")).toBe("not_found");
  });

  it("every mapped slug satisfies the server surface charset", () => {
    for (const path of [
      "/",
      "/memory",
      "/tasks",
      "/tasks/activity",
      "/agents",
      "/kora",
      "/docs",
      "/system/status",
      "/system/devices",
      "/pair",
      "/nope",
    ]) {
      expect(surfaceFromPathname(path)).toMatch(/^[a-z][a-z0-9_-]{0,39}$/);
    }
  });

  it("maps statuses onto the frozen class vocabulary", () => {
    expect(statusClassFromStatus(401)).toBe("e401");
    expect(statusClassFromStatus(403)).toBe("e403");
    expect(statusClassFromStatus(404)).toBe("e404");
    expect(statusClassFromStatus(429)).toBe("e429");
    expect(statusClassFromStatus(500)).toBe("e5xx");
    expect(statusClassFromStatus(503)).toBe("e5xx");
    expect(statusClassFromStatus(0)).toBe("network");
  });

  it("statuses the v0 vocabulary cannot express map to null (local drop, no mislabel)", () => {
    expect(statusClassFromStatus(400)).toBeNull();
    expect(statusClassFromStatus(413)).toBeNull();
    expect(statusClassFromStatus(422)).toBeNull();
    expect(statusClassFromStatus(200)).toBeNull();
  });

  it("maps methods onto the coarse read/write intent", () => {
    expect(opFromMethod("GET")).toBe("read");
    expect(opFromMethod("get")).toBe("read");
    expect(opFromMethod("POST")).toBe("write");
    expect(opFromMethod("PATCH")).toBe("write");
    expect(opFromMethod("DELETE")).toBe("write");
  });

  it("buckets delays into a/b/c at the v0-frozen boundaries", () => {
    expect(latencyClassFromMs(0)).toBe("a");
    expect(latencyClassFromMs(299)).toBe("a");
    expect(latencyClassFromMs(300)).toBe("b");
    expect(latencyClassFromMs(999)).toBe("b");
    expect(latencyClassFromMs(1000)).toBe("c");
    expect(latencyClassFromMs(60_000)).toBe("c");
  });

  it("visit ids satisfy the server charset (8–64, slug pattern)", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(makeVisitId()).toMatch(VISIT_ID_PATTERN);
    }
  });

  it("monotonicNow answers a finite number", () => {
    expect(Number.isFinite(monotonicNow())).toBe(true);
  });
});

describe("taxonomy mirror: batch-poisoning guard (validateTelemetryEvent)", () => {
  const visitId = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";

  it("accepts each П3 kind with exactly its property set", () => {
    const valid: unknown[] = [
      { kind: "ui.visit", visit_id: visitId },
      { kind: "ui.nav", visit_id: visitId, surface: "tasks", via: "palette" },
      {
        kind: "kora.entered",
        visit_id: visitId,
        entry: "route",
        latency_class: "a",
      },
      { kind: "cmdk.palette_opened", visit_id: visitId, trigger: "hotkey" },
      {
        kind: "cmdk.item_selected",
        visit_id: visitId,
        group: "nav",
        via: "enter",
      },
      {
        kind: "ui.surface_error",
        visit_id: visitId,
        surface: "memory",
        status_class: "e404",
        op: "read",
      },
    ];
    for (const event of valid) expect(validateTelemetryEvent(event)).toBe(true);
  });

  it("rejects an unknown kind (the И1/И3 families are not in this slice)", () => {
    expect(
      validateTelemetryEvent({ kind: "kora.intent_started", visit_id: visitId }),
    ).toBe(false);
    expect(
      validateTelemetryEvent({
        kind: "living.layer_toggled",
        visit_id: visitId,
        from: "off",
        to: "calm",
        where: "quick",
      }),
    ).toBe(false);
    expect(validateTelemetryEvent({ kind: "totally.new", visit_id: visitId })).toBe(
      false,
    );
  });

  it("rejects extra fields — the server 422s the whole batch for them", () => {
    expect(
      validateTelemetryEvent({
        kind: "ui.visit",
        visit_id: visitId,
        ts: Date.now(),
      }),
    ).toBe(false);
    expect(
      validateTelemetryEvent({
        kind: "cmdk.palette_opened",
        visit_id: visitId,
        trigger: "hotkey",
        query: "secret search text",
      }),
    ).toBe(false);
  });

  it("rejects off-enum values and malformed ids/surfaces", () => {
    expect(
      validateTelemetryEvent({ kind: "ui.nav", visit_id: visitId, surface: "tasks", via: "menu" }),
    ).toBe(false);
    expect(
      validateTelemetryEvent({
        kind: "cmdk.item_selected",
        visit_id: visitId,
        group: "misc",
        via: "enter",
      }),
    ).toBe(false);
    // visit_id: too short / wrong charset.
    expect(validateTelemetryEvent({ kind: "ui.visit", visit_id: "abc" })).toBe(false);
    expect(
      validateTelemetryEvent({ kind: "ui.visit", visit_id: "has space in it!" }),
    ).toBe(false);
    // surface: uppercase, slashes, too long.
    expect(
      validateTelemetryEvent({
        kind: "ui.nav",
        visit_id: visitId,
        surface: "Tasks",
        via: "link",
      }),
    ).toBe(false);
    expect(
      validateTelemetryEvent({
        kind: "ui.nav",
        visit_id: visitId,
        surface: "/tasks",
        via: "link",
      }),
    ).toBe(false);
    expect(
      validateTelemetryEvent({
        kind: "ui.nav",
        visit_id: visitId,
        surface: "a".repeat(41),
        via: "link",
      }),
    ).toBe(false);
  });
});
