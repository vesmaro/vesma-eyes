import { describe, expect, it } from "vitest";
import type { ModelsRosterPage } from "@/gateway/boardTypes";
import { dedupeDiscovered, hubZones, isRosterEmpty, providersOff } from "./modelsModel";

/**
 * MF1 pure projections for the models fleet hub (the execEnvModel test
 * discipline): every field narrowed defensively — a buggy wire degrades to
 * the honest empty / fewer rows, never to a crash or a fabricated fact;
 * the (provider, base_url) dedup merges seen-on attribution; the 8-row
 * cut yields the honest «…и ещё N» overflow.
 */

function rosterPage(overrides: Partial<ModelsRosterPage> = {}): ModelsRosterPage {
  return {
    ok: true,
    providers: [],
    discovered: [],
    board: [
      {
        provider: "hermes",
        base_url: "http://hermes.cluster:8642",
        models: ["hermes-4.5-405b", "hermes-4.5-70b"],
        default_model: "hermes-4.5-405b",
        provenance: "board",
      },
    ],
    meta: { max_models_per_row: 50 },
    ...overrides,
  };
}

describe("hubZones — defensive narrowing", () => {
  it("projects the board row: provider, base_url, models cut, default", () => {
    const zones = hubZones(rosterPage());
    expect(zones.connectedCount).toBe(0);
    expect(zones.discovered).toEqual([]);
    expect(zones.board).toHaveLength(1);
    const row = zones.board[0];
    expect(row.provider).toBe("hermes");
    expect(row.baseUrl).toBe("http://hermes.cluster:8642");
    expect(row.shownModels).toEqual(["hermes-4.5-405b", "hermes-4.5-70b"]);
    expect(row.modelsOverflow).toBe(0);
    expect(row.defaultModel).toBe("hermes-4.5-405b");
  });

  it("an undefined/partial page degrades to empty zones, never a crash", () => {
    expect(hubZones(undefined)).toEqual({
      connectedCount: 0,
      connected: [],
      discovered: [],
      board: [],
    });
    expect(isRosterEmpty(hubZones(undefined))).toBe(true);
    // Garbage rows drop out row by row.
    const zones = hubZones(
      rosterPage({ board: [{ provider: "", base_url: "", models: "not-a-list", provenance: "board" } as never] }),
    );
    expect(zones.board).toEqual([]);
    expect(isRosterEmpty(zones)).toBe(true);
  });

  it("owner-registry rows narrow to metadata cards (MF2): the slot enum is closed, hostile values degrade", () => {
    const zones = hubZones(
      rosterPage({
        providers: [
          {
            provider_key: "openrouter",
            base_url: "https://openrouter.ai/api/v1",
            fingerprint: "3f9a21c0bde4",
            created_at: "2026-10-24T00:00:00+00:00",
            rotated_at: null,
            status: "set",
          },
          {
            provider_key: "weird",
            base_url: "https://x.example",
            fingerprint: "zzz-not-from-a-set-row",
            created_at: "",
            rotated_at: "",
            // A status outside the closed enum → honest unset, and the
            // fingerprint is shown ONLY on a genuinely set row.
            status: "maybe" as never,
          },
          { provider_key: "", base_url: "x" },
          "not-an-object",
        ] as never,
      }),
    );
    expect(zones.connectedCount).toBe(2);
    const [set, degraded] = zones.connected;
    expect(set.providerKey).toBe("openrouter");
    expect(set.status).toBe("set");
    expect(set.fingerprint).toBe("3f9a21c0bde4");
    expect(set.createdAt).not.toBeNull();
    expect(degraded.status).toBeNull();
    expect(degraded.fingerprint).toBeNull();
    expect(isRosterEmpty(zones)).toBe(false);
  });

  it("bounds hostile strings and lists (the execEnvModel narrowing discipline)", () => {
    const zones = hubZones(
      rosterPage({
        board: [
          {
            provider: "  x  ".repeat(100),
            base_url: "http://h/",
            models: ["", "   ", 42, "m-1"].filter(Boolean) as never,
            provenance: "board",
          },
        ],
      }),
    );
    const row = zones.board[0];
    expect(row.provider.length).toBeLessThanOrEqual(60);
    expect(row.shownModels).toEqual(["m-1"]);
    expect(row.defaultModel).toBeNull();
  });
});

describe("hubZones — the caps cut (MF-HUB-CAPS)", () => {
  it("shows 8 model ids and counts the honest «…и ещё N» overflow", () => {
    const models = Array.from({ length: 12 }, (_, i) => `m-${i + 1}`);
    const zones = hubZones(
      rosterPage({ board: [{ provider: "hermes", base_url: "u", models, provenance: "board" }] }),
    );
    const row = zones.board[0];
    expect(row.shownModels).toHaveLength(8);
    expect(row.modelsOverflow).toBe(4);
    expect(row.models).toHaveLength(12);
  });

  it("the mirror row caps seen-on attribution at 3 + N", () => {
    const zones = hubZones(
      rosterPage({
        discovered: [
          {
            provider: "deepseek",
          base_url: "https://api.deepseek.com/v1",
          models: ["deepseek-chat"],
            auth: "configured",
            source: "config",
            seen_on: [
              { executor_id: "zcode@desk-2", harness: "zcode", exec_env: "metal", last_reported_at: "2026-10-26T00:00:00Z" },
              { executor_id: "zcode@laptop-1", harness: "zcode", exec_env: "metal", last_reported_at: "2026-10-26T00:00:00Z" },
              { executor_id: "pi@desk-2", harness: "pi", exec_env: "pod:x", last_reported_at: "2026-10-26T00:00:00Z" },
              { executor_id: "vscode@desk-2", harness: "vscode", exec_env: "metal", last_reported_at: "2026-10-26T00:00:00Z" },
            ],
            provenance: "agent",
          },
        ],
      }),
    );
    const row = zones.discovered[0];
    expect(row.seenOn.map((s) => s.executorId)).toHaveLength(3);
    expect(row.seenOnOverflow).toBe(1);
    expect(row.auth).toBe("configured");
    expect(row.source).toBe("config");
  });

  it("an out-of-enum auth degrades to unknown, never invented", () => {
    const zones = hubZones(
      rosterPage({
        discovered: [
          { provider: "x", base_url: "u", models: [], auth: "yes-please" as never, source: "config", seen_on: [], provenance: "agent" },
        ],
      }),
    );
    expect(zones.discovered[0].auth).toBe("unknown");
  });
});

describe("dedupeDiscovered — (provider, base_url) identity", () => {
  it("merges two rows sharing the identity: models concat-dedupe, seen-on union, auth takes the strongest fact", () => {
    const merged = dedupeDiscovered([
      {
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com/v1",
        models: ["deepseek-chat"],
        shownModels: ["deepseek-chat"],
        modelsOverflow: 0,
        auth: "anonymous",
        source: "probe",
        seenOn: [{ executorId: "zcode@desk-2", harness: "zcode", execEnv: "metal", lastReportedAt: null }],
        seenOnOverflow: 0,
      },
      {
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com/v1",
        models: ["deepseek-chat", "deepseek-reasoner"],
        shownModels: ["deepseek-chat", "deepseek-reasoner"],
        modelsOverflow: 0,
        auth: "configured",
        source: "config",
        seenOn: [
          { executorId: "zcode@desk-2", harness: "zcode", execEnv: "metal", lastReportedAt: null },
          { executorId: "pi@desk-2", harness: "pi", execEnv: "pod:x", lastReportedAt: null },
        ],
        seenOnOverflow: 0,
      },
    ]);
    expect(merged).toHaveLength(1);
    const row = merged[0];
    expect(row.models).toEqual(["deepseek-chat", "deepseek-reasoner"]);
    expect(row.seenOn.map((s) => s.executorId)).toEqual(["zcode@desk-2", "pi@desk-2"]);
    expect(row.auth).toBe("configured");
  });

  it("keeps rows apart when only the provider matches but the URL differs", () => {
    const merged = dedupeDiscovered([
      { provider: "ollama", baseUrl: "http://127.0.0.1:11434", models: [], shownModels: [], modelsOverflow: 0, auth: "anonymous", source: "probe", seenOn: [], seenOnOverflow: 0 },
      { provider: "ollama", baseUrl: "http://desk-2:11434", models: [], shownModels: [], modelsOverflow: 0, auth: "anonymous", source: "probe", seenOn: [], seenOnOverflow: 0 },
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe("isRosterEmpty — MF-HUB-EMPTY verdict", () => {
  it("true only when ALL three zones are empty", () => {
    expect(isRosterEmpty(hubZones(rosterPage()))).toBe(false);
    expect(
      isRosterEmpty(hubZones(rosterPage({ providers: [providerRow()] }))),
    ).toBe(false);
    expect(
      isRosterEmpty(hubZones(rosterPage({ board: [], discovered: [] }))),
    ).toBe(true);
  });
});

/** One metadata-only registry row in the wire shape. */
function providerRow() {
  return {
    provider_key: "openrouter",
    base_url: "https://openrouter.ai/api/v1",
    fingerprint: "3f9a21c0bde4",
    created_at: "2026-10-24T00:00:00+00:00",
    rotated_at: null,
    status: "set" as const,
  };
}

describe("providersOff — the MF-HUB-OFF meta fact", () => {
  it("true only when the roster meta says so; absent meta = unknown = false", () => {
    expect(providersOff(rosterPage({ meta: { max_models_per_row: 50, providers_off: true } }))).toBe(true);
    expect(providersOff(rosterPage())).toBe(false);
    // A partial/garbage meta degrades to the renderable default.
    expect(providersOff(rosterPage({ meta: {} as never }))).toBe(false);
    expect(providersOff(undefined)).toBe(false);
  });
});
