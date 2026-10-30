import { describe, expect, it } from "vitest";
import type { ExecutorItem } from "@/gateway/boardTypes";
import type { KoraExecutorModels, KoraSession } from "./koraTypes";
import {
  buildKoraTree,
  buildProjectGroups,
  formatTranscriptTime,
  groupKoraTranscript,
  koraAgeUnit,
  koraGroupListId,
  koraHarnessModels,
  koraHostHealth,
  koraNodeHealth,
  koraSessionName,
  koraSummary,
  koraTranscriptAnchorId,
  koraTranscriptFoldId,
  pathBasename,
  quickFilterMatches,
  sessionCoverageSupport,
  sortKoraSessions,
  KORA_GROUP_NO_CWD,
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

describe("groupKoraTranscript (transcript-ux wave)", () => {
  type Row = { readonly seq: number; readonly role: string };

  const row = (seq: number, role: string): Row => ({ seq, role });

  it("dialog rows open groups in order; raw rows append to the current group", () => {
    const groups = groupKoraTranscript([
      row(1, "user"),
      row(2, "assistant"),
      row(3, "tool"),
      row(4, "system"),
      row(5, "user"),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0]?.anchor).toEqual(row(1, "user"));
    expect(groups[0]?.raw).toEqual([]);
    expect(groups[1]?.anchor).toEqual(row(2, "assistant"));
    expect(groups[1]?.raw).toEqual([row(3, "tool"), row(4, "system")]);
    expect(groups[2]?.anchor).toEqual(row(5, "user"));
    expect(groups[2]?.raw).toEqual([]);
  });

  it("leading raw rows (anchor on a previous page) form a null-anchor group", () => {
    const groups = groupKoraTranscript([
      row(7, "tool"),
      row(8, "tool"),
      row(9, "assistant"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.anchor).toBeNull();
    expect(groups[0]?.raw).toEqual([row(7, "tool"), row(8, "tool")]);
    expect(groups[1]?.anchor).toEqual(row(9, "assistant"));
  });

  it("empty page → no groups; consecutive dialog rows → one group each", () => {
    expect(groupKoraTranscript([])).toEqual([]);
    const groups = groupKoraTranscript([row(1, "user"), row(2, "assistant")]);
    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.raw.length === 0)).toBe(true);
  });

  it("order preserving and non-mutating: the input array comes back untouched", () => {
    const items = [row(1, "user"), row(2, "tool"), row(3, "assistant")];
    const frozen = [...items];
    groupKoraTranscript(items);
    expect(items).toEqual(frozen);
  });

  it("anchor/fold DOM ids are deterministic and seq-disjoint", () => {
    expect(koraTranscriptAnchorId(12)).toBe("kora-anchor-12");
    expect(koraTranscriptFoldId(12)).toBe("kora-fold-12");
    expect(koraTranscriptAnchorId(12)).not.toBe(koraTranscriptFoldId(12));
  });
});

describe("buildProjectGroups (KW4 «Поле хоста», blueprint-kw4 §1–3)", () => {
  const host = executor("exec-z", "zcode", "abyss-laptop");

  it("groups by the FULL cwd — the key is the path, not the basename", () => {
    const groups = buildProjectGroups([
      session({
        id: "a",
        executor_id: host.id,
        state: "live",
        harness: "zcode",
        project: "proj",
        cwd: "/home/a/proj",
      }),
      session({
        id: "b",
        executor_id: host.id,
        state: "idle",
        harness: "zcode",
        project: "proj",
        cwd: "/home/a/proj",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("/home/a/proj");
    expect(groups[0]?.kind).toBe("cwd");
    expect(groups[0]?.cwd).toBe("/home/a/proj");
    expect(groups[0]?.sessions.map((s) => s.id)).toEqual(["a", "b"]); // live on top
  });

  it("basename collisions do NOT merge (gate §9.2): two cwds, one basename", () => {
    const groups = buildProjectGroups([
      session({
        id: "a",
        executor_id: host.id,
        state: "idle",
        harness: "zcode",
        cwd: "/home/a/proj",
      }),
      session({
        id: "b",
        executor_id: host.id,
        state: "idle",
        harness: "zcode",
        cwd: "/home/b/proj",
      }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.key).sort()).toEqual(["/home/a/proj", "/home/b/proj"]);
    // The component derives BOTH titles from basename("…/proj") = "proj" —
    // the keys above are what keeps them apart.
  });

  it("empty cwd lands in ONE honest no-directory group (sentinel key)", () => {
    const groups = buildProjectGroups([
      session({ id: "a", executor_id: host.id, state: "idle", harness: "pi" }),
      session({
        id: "b",
        executor_id: host.id,
        state: "dead",
        harness: "pi",
        cwd: "",
        project: null,
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("__nocwd__");
    expect(groups[0]?.kind).toBe("none");
    expect(groups[0]?.cwd).toBeNull();
  });

  it("hermes groups by SOURCE (the project tag), not by cwd", () => {
    const groups = buildProjectGroups([
      session({
        id: "h1",
        executor_id: "hermes",
        state: "live",
        harness: "hermes",
        project: "hermes:api_server",
        cwd: null,
      }),
      session({
        id: "h2",
        executor_id: "hermes",
        state: "idle",
        harness: "hermes",
        project: "hermes:telegram",
        cwd: null,
      }),
      session({
        id: "h3",
        executor_id: "hermes",
        state: "idle",
        harness: "hermes",
        project: "hermes:api_server",
        cwd: null,
      }),
    ]);
    expect(groups).toHaveLength(2);
    const api = groups.find((g) => g.key === "hermes:api_server");
    expect(api?.kind).toBe("source");
    expect(api?.source).toBe("api_server");
    expect(api?.hasLive).toBe(true);
    expect(api?.sessions.map((s) => s.id)).toEqual(["h1", "h3"]);
  });

  it("a hermes row without the project tag degrades to the no-cwd group", () => {
    const groups = buildProjectGroups([
      session({ id: "h1", executor_id: "hermes", state: "live", harness: "hermes" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.kind).toBe("none");
  });

  it("hasLive marks exactly the groups holding a live session (default open-set)", () => {
    const groups = buildProjectGroups([
      session({
        id: "live1",
        executor_id: host.id,
        state: "live",
        harness: "zcode",
        cwd: "/hot",
      }),
      session({
        id: "idle1",
        executor_id: host.id,
        state: "idle",
        harness: "zcode",
        cwd: "/cold",
      }),
    ]);
    expect(groups.map((g) => [g.key, g.hasLive])).toEqual([
      ["/hot", true],
      ["/cold", false],
    ]);
  });

  it("order: live groups first, then freshest activity, then key — deterministic", () => {
    const groups = buildProjectGroups([
      session({
        id: "old-idle",
        executor_id: host.id,
        state: "idle",
        harness: "zcode",
        cwd: "/b-old",
        last_activity_at: "2026-09-24T09:00:00Z",
      }),
      session({
        id: "old-live",
        executor_id: host.id,
        state: "live",
        harness: "zcode",
        cwd: "/z-live",
        last_activity_at: "2026-09-24T09:00:00Z",
      }),
      session({
        id: "fresh-idle",
        executor_id: host.id,
        state: "idle",
        harness: "zcode",
        cwd: "/a-fresh",
        last_activity_at: "2026-09-24T11:00:00Z",
      }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["/z-live", "/a-fresh", "/b-old"]);
  });

  it("pure over the input: the registry slice comes back untouched (no new reads)", () => {
    const input = [
      session({
        id: "a",
        executor_id: host.id,
        state: "live",
        harness: "zcode",
        cwd: "/p",
      }),
    ];
    const frozen = [...input];
    buildProjectGroups(input);
    expect(input).toEqual(frozen);
  });
});

describe("koraGroupListId (the disclosure id, hygiene-batch collision tail)", () => {
  it("two different cwds that sanitize to the SAME slug get DIFFERENT ids", () => {
    // The old bare form collided: `/data/proj+one` and `/data/proj.one`
    // both flatten to `kora-group-_data_proj_one` — one DOM id for two
    // disclosure lists, aria-controls resolving to the wrong element.
    const plus = koraGroupListId("/data/proj+one");
    const dot = koraGroupListId("/data/proj.one");
    expect(plus.replace(/[0-9a-f]{8}$/, "").replace(/-/g, "")).toBe(
      dot.replace(/[0-9a-f]{8}$/, "").replace(/-/g, ""),
    ); // the slug collision is real (precondition)
    expect(plus).not.toBe(dot); // the digest separates them
  });

  it("is deterministic and DOM-id-safe: stable across calls, no raw path chars", () => {
    const id = koraGroupListId("/var/home/abyss/LABs/Projects/Project Vesma");
    expect(id).toBe(koraGroupListId("/var/home/abyss/LABs/Projects/Project Vesma"));
    expect(id.startsWith("kora-group-")).toBe(true);
    // A DOM id must be usable in querySelector/CSS — every char stays in
    // the [A-Za-z0-9_-] set even though the raw key carries a space.
    expect(id).toMatch(/^kora-group-[A-Za-z0-9_-]+$/);
    // The digest suffix is the fixed 8-hex FNV-1a of the raw key.
    expect(id.split("-").at(-1)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("the no-cwd sentinel keeps its honest distinct id", () => {
    expect(koraGroupListId(KORA_GROUP_NO_CWD)).not.toBe(
      koraGroupListId("/any/real/cwd"),
    );
    expect(koraGroupListId(KORA_GROUP_NO_CWD)).toBe(
      koraGroupListId(KORA_GROUP_NO_CWD),
    );
  });
});

describe("pathBasename", () => {
  it("cuts the last segment; trailing slashes strip; bare segment is itself", () => {
    expect(pathBasename("/var/home/a/proj")).toBe("proj");
    expect(pathBasename("/var/home/a/proj/")).toBe("proj");
    expect(pathBasename("proj")).toBe("proj");
    expect(pathBasename("/")).toBe("/");
    expect(pathBasename("/a/b/c.dee")).toBe("c.dee");
  });
});

/* ── Kora IDE В3 — the model level + the health dots ───────────────────── */

function executorWithPresence(
  id: string,
  harness: string,
  host: string,
  presence: ExecutorItem["presence"],
): ExecutorItem {
  return { ...executor(id, harness, host), presence };
}

const MIRROR_ROW: KoraExecutorModels = {
  executor_id: "exec-zc",
  reported_at: "2026-10-28T18:20:00+00:00",
  installations: [
    {
      harness: "zcode",
      provider: "z-ai",
      auth: "configured",
      source: "config",
      models: ["glm-5.3"],
    },
    {
      // The SAME provider on a second installation of the SAME harness:
      // the merge unions the model ids and strengthens the auth fact.
      harness: "zcode",
      provider: "z-ai",
      auth: "anonymous",
      source: "probe",
      models: ["glm-4.6"],
    },
    {
      harness: "vscode",
      provider: "openai",
      auth: "configured",
      source: "config",
      models: ["gpt-5.1-codex"],
    },
  ],
};

describe("koraHarnessModels (В3, KORA-MODELS-1 consumer)", () => {
  const ready = {
    mirror: new Map([["exec-zc", MIRROR_ROW]]),
    mirrorReady: true,
    hermes: { models: ["hermes-4.5-405b", "hermes-4.5-70b"], defaultModel: "hermes-4.5-405b" },
    hermesReady: true,
  };

  it("hermes reads the /status roster: bare rows, provider null, the server default marked", () => {
    const result = koraHarnessModels(
      { harness: "hermes", executorId: "hermes" },
      ready,
    );
    if (result.state !== "known") throw new Error("expected known");
    expect(result.models).toEqual([
      { model: "hermes-4.5-405b", provider: null, auth: null, source: null, isDefault: true },
      { model: "hermes-4.5-70b", provider: null, auth: null, source: null, isDefault: false },
    ]);
  });

  it("hermes with an unsettled status read reads PENDING — never «не сообщаются»", () => {
    expect(
      koraHarnessModels(
        { harness: "hermes", executorId: "hermes" },
        { ...ready, hermesReady: false },
      ),
    ).toEqual({ state: "pending" });
  });

  it("hermes with an empty roster reads unknown (the honest nothing)", () => {
    expect(
      koraHarnessModels(
        { harness: "hermes", executorId: "hermes" },
        { ...ready, hermes: { models: [], defaultModel: null } },
      ),
    ).toEqual({ state: "unknown" });
  });

  it("hermes with a SETTLED read and no data reads unknown — a failed /status is «не сообщаются», never the eternal «загрузка»", () => {
    // The В3 review pin: the workspace resolves hermesReady=true with
    // hermes=null when the /status fetch settled with an error; the
    // mirror leg's settled-miss shape applies (unknown), pending would
    // hang the node forever.
    expect(
      koraHarnessModels(
        { harness: "hermes", executorId: "hermes" },
        { ...ready, hermes: null },
      ),
    ).toEqual({ state: "unknown" });
  });

  it("a mirror hit filters to the node's OWN harness and merges per provider", () => {
    const result = koraHarnessModels(
      { harness: "zcode", executorId: "exec-zc" },
      ready,
    );
    if (result.state !== "known") throw new Error("expected known");
    // Two z-ai installations merge: model ids sorted+unioned, auth takes
    // the STRONGEST fact (configured beats anonymous), config beats probe.
    expect(result.models).toEqual([
      { model: "glm-4.6", provider: "z-ai", auth: "configured", source: "config", isDefault: false },
      { model: "glm-5.3", provider: "z-ai", auth: "configured", source: "config", isDefault: false },
    ]);
  });

  it("the mirror's OTHER-harness installations never leak into this node", () => {
    const result = koraHarnessModels(
      { harness: "pi", executorId: "exec-zc" },
      ready,
    );
    // exec-zc reported zcode+vscode installations only — pi reads the
    // honest «не сообщаются», no cross-harness invention.
    expect(result).toEqual({ state: "unknown" });
  });

  it("a mirror miss (the executor never reported) reads unknown", () => {
    expect(
      koraHarnessModels(
        { harness: "pi", executorId: "exec-ghost" },
        ready,
      ),
    ).toEqual({ state: "unknown" });
  });

  it("an unsettled mirror read reads PENDING — the honest wait", () => {
    expect(
      koraHarnessModels(
        { harness: "zcode", executorId: "exec-zc" },
        { ...ready, mirrorReady: false },
      ),
    ).toEqual({ state: "pending" });
  });
});

describe("koraNodeHealth / koraHostHealth (В3 health dots, presence ≠ liveness)", () => {
  it("a node with an online executor reads present; expired presence reads silent", () => {
    expect(koraNodeHealth(executorWithPresence("e1", "zcode", "h", "online"))).toBe("present");
    expect(koraNodeHealth(executorWithPresence("e1", "zcode", "h", "stale"))).toBe("silent");
    expect(koraNodeHealth(executorWithPresence("e1", "zcode", "h", "offline"))).toBe("silent");
  });

  it("no executor row reads unknown — no state is invented", () => {
    expect(koraNodeHealth(null)).toBe("unknown");
    expect(koraNodeHealth(undefined)).toBe("unknown");
  });

  it("a host is present when ANY executor ticks; silent when only expired ones report", () => {
    const mixed = [
      { executor: executorWithPresence("e1", "zcode", "h", "offline"), executorId: "e1", harness: "zcode", sessions: [] },
      { executor: executorWithPresence("e2", "pi", "h", "online"), executorId: "e2", harness: "pi", sessions: [] },
    ];
    expect(koraHostHealth(mixed)).toBe("present");
    const silentOnly = [
      { executor: executorWithPresence("e1", "zcode", "h", "stale"), executorId: "e1", harness: "zcode", sessions: [] },
    ];
    expect(koraHostHealth(silentOnly)).toBe("silent");
    const unknownOnly = [{ executor: null, executorId: "g", harness: "zcode", sessions: [] }];
    expect(koraHostHealth(unknownOnly)).toBe("unknown");
  });
});
