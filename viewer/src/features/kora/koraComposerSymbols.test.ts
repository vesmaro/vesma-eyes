import { describe, expect, it } from "vitest";
import type { KoraSession } from "./koraTypes";
import {
  atSuggestions,
  detectSymbolToken,
  dollarSuggestions,
  hashSuggestions,
  insertSuggestion,
  slashSuggestions,
  stripToken,
  KORA_SYMBOLS,
  SYMBOL_SUGGESTION_LIMIT,
  type KoraSymbolSuggestion,
} from "./koraComposerSymbols";

/**
 * The symbol grammar's PURE logic (В4; kora-ide contract §3.2, the zcode
 * four symbols). The pins that matter most:
 * - «!» is NOT a trigger (the anti-argv ADR-0019 pin — the board never
 *   executes shell on the composer's behalf; a «!» draft is text);
 * - a symbol glued to a word does not trigger («a@b» is that word);
 * - the @ menu degrades honestly (the registry reports no file list —
 *   the cwd reference only, links never content reads).
 */

function session(patch: Partial<KoraSession> = {}): KoraSession {
  return {
    id: "exec-zc:one",
    executor_id: "exec-zc",
    native_id: "sess-one",
    harness: "zcode",
    project: "Проект один",
    cwd: "/home/abyss/proj",
    state: "live",
    origin: "local",
    steerable: false,
    started_at: "2026-09-24T09:12:00Z",
    last_activity_at: "2026-09-24T11:41:00Z",
    age_seconds: 6_000,
    last_line_preview: null,
    ...patch,
  };
}

describe("detectSymbolToken (the closed trigger set)", () => {
  it("detects @ at the input start and after whitespace", () => {
    expect(detectSymbolToken("@", 1)).toEqual({
      symbol: "@",
      start: 0,
      end: 1,
      body: "",
    });
    expect(detectSymbolToken("привет @ho", 10)).toEqual({
      symbol: "@",
      start: 7,
      end: 10,
      body: "ho",
    });
  });

  it("detects # / and $ the same way", () => {
    expect(detectSymbolToken("#зад", 3)?.symbol).toBe("#");
    expect(detectSymbolToken("/pin", 4)?.symbol).toBe("/");
    expect(detectSymbolToken("$spec", 5)?.symbol).toBe("$");
    expect(detectSymbolToken("хочу $spec", 10)?.symbol).toBe("$");
  });

  it("NEVER triggers on «!» (the anti-argv pin: no shell, ever)", () => {
    expect(detectSymbolToken("!", 1)).toBeNull();
    expect(detectSymbolToken("!ls -la", 7)).toBeNull();
    expect(detectSymbolToken("сделай !срочно", 14)).toBeNull();
    expect(KORA_SYMBOLS).not.toContain("!");
  });

  it("does not trigger mid-word (the boundary rule)", () => {
    expect(detectSymbolToken("a@b", 3)).toBeNull();
    expect(detectSymbolToken("почта@домен", 11)).toBeNull();
    expect(detectSymbolToken("слова#тег", 9)).toBeNull();
  });

  it("does not trigger on plain words or at caret 0", () => {
    expect(detectSymbolToken("слово", 5)).toBeNull();
    expect(detectSymbolToken("@каталог", 0)).toBeNull();
  });

  it("clamps an out-of-range caret and reads no token past whitespace", () => {
    expect(detectSymbolToken("@a b", 99)).toBeNull();
    expect(detectSymbolToken("@a b", 2)?.body).toBe("a");
  });
});

describe("atSuggestions (the honest cwd degradation)", () => {
  it("offers the cwd itself as ONE reference row (links, not reads)", () => {
    const rows = atSuggestions(session(), "");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.insert).toBe("@/home/abyss/proj");
    expect(rows[0]?.label).toBe("/home/abyss/proj");
  });

  it("filters by the typed body (fuzzy: prefix, substring, subsequence)", () => {
    expect(atSuggestions(session(), "abyss")).toHaveLength(1);
    expect(atSuggestions(session(), "proj")).toHaveLength(1);
    expect(atSuggestions(session(), "prj")).toHaveLength(1);
    expect(atSuggestions(session(), "неттакого")).toHaveLength(0);
  });

  it("returns NOTHING when the session reports no cwd — no invented files", () => {
    expect(atSuggestions(session({ cwd: null }), "")).toHaveLength(0);
    expect(atSuggestions(session({ cwd: "" }), "")).toHaveLength(0);
    // A hermes row honestly carries no cwd.
    expect(atSuggestions(session({ harness: "hermes", cwd: null }), "")).toHaveLength(0);
  });
});

describe("hashSuggestions (the past-session registry search)", () => {
  const items = [
    session({ id: "exec-zc:one", project: "Весма-фронт", native_id: "s1", last_activity_at: "2026-09-24T11:00:00Z" }),
    session({ id: "exec-vscode:two", project: "Весма-бэк", harness: "vscode", native_id: "s2", last_activity_at: "2026-09-24T12:00:00Z" }),
    session({ id: "exec-pi:three", project: null, native_id: "edge-session", harness: "pi", cwd: null, last_activity_at: "2026-09-24T13:00:00Z" }),
  ];

  it("finds sessions by name substring; equal ranks order freshest-first", () => {
    const rows = hashSuggestions(items, null, "весма");
    // Both names are prefix matches (rank 0) — the fresher activity wins.
    expect(rows.map((row) => row.label)).toEqual(["Весма-бэк", "Весма-фронт"]);
  });

  it("matches the native id and the cwd when the name misses", () => {
    expect(hashSuggestions(items, null, "edge").map((row) => row.label)).toEqual(["edge-session"]);
    expect(hashSuggestions(items, null, "abyss/proj")).toHaveLength(2);
  });

  it("EXCLUDES the current session (mentioning the open session is a no-op)", () => {
    const rows = hashSuggestions(items, "exec-zc:one", "весма");
    expect(rows.some((row) => row.insert === "#Весма-фронт")).toBe(false);
  });

  it("is honest at zero: no match → empty list (the note panel reads it)", () => {
    expect(hashSuggestions(items, null, "чегонет")).toHaveLength(0);
    expect(hashSuggestions([], null, "")).toHaveLength(0);
  });

  it("caps the menu at the suggestion limit", () => {
    const many = Array.from({ length: SYMBOL_SUGGESTION_LIMIT + 5 }, (_, i) =>
      session({ id: `exec-zc:m${i}`, project: `Проект ${i}` }),
    );
    expect(hashSuggestions(many, null, "проект")).toHaveLength(SYMBOL_SUGGESTION_LIMIT);
  });
});

describe("dollarSuggestions (the В2a roster mentions)", () => {
  const roster = [
    { name: "tech-lead", slug: "gcw-tech-lead" },
    { name: "researcher", slug: "gcw-researcher" },
  ];

  it("builds $mention rows from REAL roster names only", () => {
    const rows = dollarSuggestions(roster, "");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.insert).toBe("$researcher");
  });

  it("filters by the typed body", () => {
    expect(dollarSuggestions(roster, "lead")).toHaveLength(1);
    expect(dollarSuggestions(roster, "нет")).toHaveLength(0);
  });

  it("stays empty for an empty roster (the honest «не сообщается» note)", () => {
    expect(dollarSuggestions([], "")).toHaveLength(0);
  });
});

describe("slashSuggestions (the LOCAL command vocabulary)", () => {
  it("lists exactly the three local commands on an empty body", () => {
    expect(slashSuggestions("").map((row) => row.id)).toEqual(["pin", "view", "filter"]);
  });

  it("fuzzy-filters by the typed word", () => {
    expect(slashSuggestions("pin").map((row) => row.id)).toEqual(["pin"]);
    expect(slashSuggestions("fltr").map((row) => row.id)).toEqual(["filter"]);
    expect(slashSuggestions("zzz")).toHaveLength(0);
  });
});

describe("insertion math", () => {
  const token = detectSymbolToken("глянь @pr и скажи", 9);
  expect(token).not.toBeNull();
  const suggestion: KoraSymbolSuggestion = {
    key: "cwd",
    insert: "@/home/abyss/proj",
    label: "/home/abyss/proj",
  };

  it("replaces the token with the suggestion + one trailing space", () => {
    const applied = insertSuggestion("глянь @pr и скажи", token!, suggestion);
    expect(applied.text).toBe("глянь @/home/abyss/proj  и скажи");
    expect(applied.caret).toBe("глянь @/home/abyss/proj ".length);
  });

  it("stripToken removes an executed command and parks the caret at its start", () => {
    const cmd = detectSymbolToken("/pin", 4)!;
    const stripped = stripToken("/pin", cmd);
    expect(stripped.text).toBe("");
    expect(stripped.caret).toBe(0);
  });
});
