import { describe, expect, it } from "vitest";
import type { TaskSessionFact } from "@/gateway/boardTypes";
import {
  formatDuration,
  sessionLabel,
  sessionLiveness,
  sessionTranscriptHref,
} from "./taskSessionsModel";

/** Minimal fact fixture — per-case overrides carry the assertion. */
function fact(overrides: Partial<TaskSessionFact> = {}): TaskSessionFact {
  return {
    session_id: "exec-1:sess_a1b2c3",
    executor_id: "exec-1",
    executor_name: "zcode@laptop",
    native_id: "sess_a1b2c3",
    task_id: "TB-11",
    harness: "zcode",
    specialist: "@GCW: Researcher",
    path: "/home/u/.zcode/cli/sess_a1b2c3.jsonl",
    tool_calls: 12,
    duration_s: 340,
    started_at: "2026-09-30T10:04:11+00:00",
    ended_at: "2026-09-30T10:09:51+00:00",
    parent_native_id: "",
    first_seen_at: "2026-09-30T10:09:55+00:00",
    reported_at: "2026-09-30T10:09:55+00:00",
    reported_age_s: 0,
    ...overrides,
  };
}

describe("sessionLiveness — the fact's own clocks (spec §2.1)", () => {
  it("empty ended_at is a live child (not exited yet)", () => {
    expect(sessionLiveness(fact({ ended_at: "" }))).toBe("live");
  });

  it("a stamped ended_at is idle (the process is done)", () => {
    expect(sessionLiveness(fact())).toBe("idle");
  });
});

describe("formatDuration — language-neutral mono, honest absence", () => {
  it.each([
    [0, ""],
    [-5, ""],
    [45, "0:45"],
    [60, "1:00"],
    [340, "5:40"],
    [3600, "1:00:00"],
    [3940, "1:05:40"],
  ])("%i s -> %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it("NaN is an honest absence, never a rendered NaN", () => {
    expect(formatDuration(Number.NaN)).toBe("");
  });
});

describe("sessionTranscriptHref — the frozen Kora glue (spec §2.1)", () => {
  it("rides session_id as-is: one path segment, no translation", () => {
    expect(sessionTranscriptHref(fact())).toBe("/kora/exec-1%3Asess_a1b2c3");
  });

  it("survives executor ids with path-hostile characters", () => {
    expect(sessionTranscriptHref(fact({ session_id: "ex/ec 1:sess_x" }))).toBe(
      "/kora/ex%2Fec%201%3Asess_x",
    );
  });
});

describe("sessionLabel — best-effort specialist, native id fallback", () => {
  it("prefers the spawn-registry role", () => {
    expect(sessionLabel(fact())).toBe("@GCW: Researcher");
  });

  it("falls back to the native id when the registry knew no role", () => {
    expect(sessionLabel(fact({ specialist: "" }))).toBe("sess_a1b2c3");
  });
});
