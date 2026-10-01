import { describe, expect, it } from "vitest";
import type { ExecutorItem } from "@/gateway/boardTypes";
import type { KoraSession } from "./koraTypes";
import {
  buildKoraTree,
  formatTranscriptTime,
  koraAgeUnit,
  koraSessionName,
  koraSummary,
  quickFilterMatches,
  sessionCoverageSupport,
  sortKoraSessions,
} from "./koraWorkspaceModel";

/**
 * The workspace derivation layer (union И1, 07j §1–3): every number the
 * frame shows is a pure function of the two registries — these tests pin
 * the tree shape, the honest gaps (unknown-host grouping, no fake host
 * state), the summary derivatives and the sorting/name rules.
 */

function session(
  partial: Partial<KoraSession> &
    Pick<KoraSession, "id" | "executor_id" | "state" | "harness">,
): KoraSession {
  return {
    native_id: partial.id,
    origin: "local",
    steerable: false,
    project: null,
    cwd: null,
    started_at: null,
    last_activity_at: null,
    age_seconds: 0,
    last_line_preview: null,
    ...partial,
  };
}

function executor(id: string, harness: string, host: string): ExecutorItem {
  return {
    id,
    name: `${harness}@${host}`,
    harness,
    host,
    transport: "local-poll",
    capabilities: [],
    version: "1.0.0",
    enabled: true,
    state: "approved",
    last_seen: "2026-09-24T10:00:00Z",
    presence: "online",
    registered_via: "",
    registered_at: "2026-09-20T09:00:00Z",
    updated_at: "2026-09-24T10:00:00Z",
  };
}

const EXECUTORS = [
  executor("exec-zc", "zcode", "laptop"),
  executor("exec-vs", "vscode", "laptop"),
  executor("exec-pi", "pi", "pi-host"),
];

const SESSIONS: KoraSession[] = [
  session({
    id: "exec-zc:s1",
    executor_id: "exec-zc",
    harness: "zcode",
    state: "live",
    project: "Тема сессии",
    age_seconds: 600,
    last_activity_at: "2026-09-24T11:00:00Z",
  }),
  session({
    id: "exec-zc:s2",
    executor_id: "exec-zc",
    harness: "zcode",
    state: "dead",
    age_seconds: 200_000,
    last_activity_at: "2026-09-22T08:00:00Z",
  }),
  session({
    id: "exec-vs:s3",
    executor_id: "exec-vs",
    harness: "vscode",
    state: "idle",
    age_seconds: 5_000,
    last_activity_at: "2026-09-23T20:00:00Z",
  }),
  session({
    id: "exec-pi:s4",
    executor_id: "exec-pi",
    harness: "pi",
    state: "dead",
    age_seconds: 100_000,
    last_activity_at: "2026-09-23T09:00:00Z",
  }),
];

describe("buildKoraTree (07j §1.2)", () => {
  it("groups hosts → agents → sessions; every session lands in ONE place", () => {
    const model = buildKoraTree(SESSIONS, EXECUTORS);
    expect(model.hosts.map((host) => host.host)).toEqual(["laptop", "pi-host"]);
    const laptop = model.hosts[0];
    expect(laptop.agents.map((agent) => agent.executorId)).toEqual([
      "exec-vs",
      "exec-zc",
    ]);
    expect(laptop.agents[0].sessions.map((s) => s.id)).toEqual(["exec-vs:s3"]);
    expect(laptop.agents[1].sessions.map((s) => s.id)).toEqual([
      "exec-zc:s1",
      "exec-zc:s2",
    ]);
    expect(laptop.sessionCount).toBe(3);
    expect(model.unknown).toEqual([]);
  });

  it("aggregates the host state live > idle > dead; NO state when no sessions", () => {
    const model = buildKoraTree(SESSIONS, EXECUTORS);
    expect(model.hosts[0].state).toBe("live"); // laptop: live + idle + dead
    expect(model.hosts[1].state).toBe("dead"); // pi-host: dead only
    const empty = buildKoraTree([], EXECUTORS);
    expect(empty.hosts.every((host) => host.state === null)).toBe(true);
  });

  it("groups registry misses under the executor id (host honestly unknown)", () => {
    const orphan = session({
      id: "exec-ghost:s9",
      executor_id: "exec-ghost",
      harness: "zcode",
      state: "live",
    });
    const model = buildKoraTree([orphan], EXECUTORS);
    expect(model.unknown).toHaveLength(1);
    expect(model.unknown[0].host).toBeNull();
    expect(model.unknown[0].agents[0].executorId).toBe("exec-ghost");
    expect(model.unknown[0].agents[0].sessions.map((s) => s.id)).toEqual([
      "exec-ghost:s9",
    ]);
    // Unknown groups are NOT hosts — the summary must not count them.
    expect(model.hosts).toHaveLength(2);
  });

  it("sorts live-first, freshest activity within a state (07j §3.4)", () => {
    const sorted = sortKoraSessions(SESSIONS);
    expect(sorted.map((s) => s.state)).toEqual(["live", "idle", "dead", "dead"]);
    expect(sorted[0].id).toBe("exec-zc:s1");
    // Within dead: s4 (2026-09-23) is fresher than s2 (2026-09-22).
    expect(sorted[2].id).toBe("exec-pi:s4");
    expect(sorted[3].id).toBe("exec-zc:s2");
  });
});

describe("koraSummary (07j §3.2 — numbers are registry derivatives)", () => {
  it("counts named hosts, live sessions and the 24 h window", () => {
    const model = buildKoraTree(SESSIONS, EXECUTORS);
    const summary = koraSummary(model, SESSIONS);
    expect(summary).toEqual({ hosts: 2, running: 1, day: 2 }); // 600 s + 5_000 s
  });
});

describe("koraSessionName (07j §1.1 honest cut)", () => {
  it("prefers the harness project, then the preview, then the native id", () => {
    expect(
      koraSessionName(
        session({
          id: "a",
          executor_id: "e",
          harness: "zcode",
          state: "live",
          project: "proj",
        }),
      ),
    ).toBe("proj");
    expect(
      koraSessionName(
        session({
          id: "b",
          executor_id: "e",
          harness: "zcode",
          state: "live",
          project: null,
          last_line_preview: "последняя строка",
        }),
      ),
    ).toBe("последняя строка");
    expect(
      koraSessionName(
        session({ id: "native-1", executor_id: "e", harness: "zcode", state: "live" }),
      ),
    ).toBe("native-1");
  });
});

describe("sessionCoverageSupport (07j §3.5)", () => {
  it("maps the session to its harness coverage row; null when absent", () => {
    const coverage = {
      harnesses: [
        { harness: "zcode", support: "full" as const },
        { harness: "vscode", support: "lists-only" as const },
      ],
      gaps: [],
    };
    expect(sessionCoverageSupport(coverage, "zcode")).toBe("full");
    expect(sessionCoverageSupport(coverage, "vscode")).toBe("lists-only");
    expect(sessionCoverageSupport(coverage, "pi")).toBeNull();
    expect(sessionCoverageSupport(null, "zcode")).toBeNull();
  });
});

describe("quickFilterMatches", () => {
  it("running = live only; day = started within 24 h", () => {
    expect(quickFilterMatches(SESSIONS[0], "running")).toBe(true);
    expect(quickFilterMatches(SESSIONS[2], "running")).toBe(false);
    expect(quickFilterMatches(SESSIONS[0], "day")).toBe(true);
    expect(quickFilterMatches(SESSIONS[1], "day")).toBe(false);
    expect(quickFilterMatches(SESSIONS[1], null)).toBe(true);
  });
});

describe("formatting helpers", () => {
  it("formats transcript times as deterministic UTC HH:MM", () => {
    expect(formatTranscriptTime("2026-09-24T09:12:20Z")).toBe("09:12");
    expect(formatTranscriptTime("2026-09-24T23:59:59Z")).toBe("23:59");
    expect(formatTranscriptTime(null)).toBe("");
    expect(formatTranscriptTime("garbage")).toBe("");
  });

  it("maps ages to whole units for the pill", () => {
    expect(koraAgeUnit(59)).toEqual({ unit: "min", n: 0 });
    expect(koraAgeUnit(2_460)).toEqual({ unit: "min", n: 41 });
    expect(koraAgeUnit(8_940)).toEqual({ unit: "hour", n: 2 });
    expect(koraAgeUnit(169_200)).toEqual({ unit: "day", n: 1 });
  });
});
