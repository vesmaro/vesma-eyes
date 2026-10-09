// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import {
  clearConveyorDraft,
  FLOW_KEY_PREFIX,
  loadConveyorDraft,
  saveConveyorDraft,
  type ConveyorDraft,
} from "./conveyorStorage";

/**
 * U8 conveyor draft keeper (the koraFrameStorage test posture): round-trip,
 * version-mismatch drop, garbage drop, guard reject, clear — and the SSR /
 * private-mode safety (no storage → null, never a throw).
 */

interface FakeDraft {
  readonly label: string;
  readonly port: string;
}

const VERSION = 3;

const guard = (value: unknown): FakeDraft | null => {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<FakeDraft>;
  if (typeof candidate.label !== "string" || typeof candidate.port !== "string") {
    return null;
  }
  return { label: candidate.label, port: candidate.port };
};

afterEach(() => {
  clearConveyorDraft("test-flow");
});

describe("conveyorStorage", () => {
  it("round-trips a draft through save/load", () => {
    saveConveyorDraft<FakeDraft>("test-flow", VERSION, 2, {
      label: "vps-1",
      port: "22",
    });
    const draft = loadConveyorDraft<FakeDraft>("test-flow", VERSION, guard);
    expect(draft).not.toBeNull();
    expect(draft?.step).toBe(2);
    expect(draft?.value).toEqual({ label: "vps-1", port: "22" });
    expect(draft?.version).toBe(VERSION);
    expect(draft?.savedAt).toBeTruthy();
  });

  it("stores drafts under the vesmaro.flow. namespace", () => {
    saveConveyorDraft<FakeDraft>("test-flow", VERSION, 0, { label: "vps-9", port: "b" });
    const raw = localStorage.getItem(FLOW_KEY_PREFIX + "test-flow");
    expect(raw).not.toBeNull();
    expect(raw).toContain("vps-9");
  });

  it("drops a draft whose version does not match (stale shape)", () => {
    saveConveyorDraft<FakeDraft>("test-flow", 2, 1, { label: "old", port: "1" });
    expect(loadConveyorDraft<FakeDraft>("test-flow", VERSION, guard)).toBeNull();
    // The stale raw record is left for the next save to overwrite cleanly.
  });

  it("drops a draft failing the value guard", () => {
    localStorage.setItem(
      FLOW_KEY_PREFIX + "test-flow",
      JSON.stringify({ version: VERSION, step: 1, savedAt: "2026-10-09T00:00:00Z", value: 42 }),
    );
    expect(loadConveyorDraft<FakeDraft>("test-flow", VERSION, guard)).toBeNull();
  });

  it("drops garbage JSON instead of throwing", () => {
    localStorage.setItem(FLOW_KEY_PREFIX + "test-flow", "{not json");
    expect(loadConveyorDraft<FakeDraft>("test-flow", VERSION, guard)).toBeNull();
  });

  it("drops a draft with a non-integer step", () => {
    localStorage.setItem(
      FLOW_KEY_PREFIX + "test-flow",
      JSON.stringify({ version: VERSION, step: 1.5, savedAt: "x", value: { label: "a", port: "b" } }),
    );
    expect(loadConveyorDraft<FakeDraft>("test-flow", VERSION, guard)).toBeNull();
  });

  it("clear removes the draft", () => {
    saveConveyorDraft<FakeDraft>("test-flow", VERSION, 0, { label: "a", port: "b" });
    clearConveyorDraft("test-flow");
    expect(loadConveyorDraft<FakeDraft>("test-flow", VERSION, guard)).toBeNull();
  });

  it("returns null when storage is unavailable (SSR shape)", () => {
    const original = globalThis.localStorage;
    // Simulating the SSR / private-mode absence.
    delete (globalThis as { localStorage?: Storage }).localStorage;
    try {
      expect(loadConveyorDraft<FakeDraft>("test-flow", VERSION, guard)).toBeNull();
      expect(() =>
        saveConveyorDraft<FakeDraft>("test-flow", VERSION, 0, { label: "a", port: "b" }),
      ).not.toThrow();
      expect(() => clearConveyorDraft("test-flow")).not.toThrow();
    } finally {
      (globalThis as { localStorage?: Storage }).localStorage = original;
    }
  });

  it("keeps the draft shape compatible with the ConveyorDraft contract", () => {
    saveConveyorDraft<FakeDraft>("test-flow", VERSION, 1, { label: "a", port: "b" });
    const raw = JSON.parse(
      localStorage.getItem(FLOW_KEY_PREFIX + "test-flow") ?? "{}",
    ) as ConveyorDraft<FakeDraft>;
    expect(Object.keys(raw).sort()).toEqual(["savedAt", "step", "value", "version"]);
  });
});
