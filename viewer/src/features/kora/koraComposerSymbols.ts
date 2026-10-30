import type { KoraSession } from "./koraTypes";
import { koraSessionName } from "./koraWorkspaceModel";

/**
 * The composer SYMBOL grammar (В4; kora-ide contract §3.2 — the zcode four
 * symbols, research §7.3): @ (a file/directory reference of the session's
 * cwd), # (a reference to a past session — search over the session
 * registry), / (LOCAL commands: /pin, /view, /filter — the relay ones
 * arrive with the relay-transport line), $ (a specialist mention — the В2a
 * roster). PURE logic, zero DOM: token detection over the draft+caret,
 * suggestion building over the ALREADY-LOADED registries (zero new
 * requests, §5.4), and the insertion math. The component renders what this
 * module decides.
 *
 * THE ANTI-ARGV PIN (ADR-0019, contract В4 acceptance (а)): «!» is NOT a
 * symbol. The board never executes shell on the composer's behalf — a
 * draft beginning with «!» is TEXT, the menu never opens, and no command
 * vocabulary exists for it. detectSymbolToken returns null for it BY
 * CONSTRUCTION (the symbol set is closed) and the test-pins hold the line.
 *
 * @ — HONEST DEGRADATION: no registry in the chain reports the cwd's FILE
 * LIST (the session row carries only `cwd`; verified 2026-10-30), so the
 * @ menu offers the cwd ITSELF as one insertable reference and says so —
 * it never invents file rows, and it never reads content (links, not
 * reads, per the contract).
 */

/** The closed trigger set. «!» is deliberately absent (anti-argv). */
export const KORA_SYMBOLS: readonly string[] = ["@", "#", "/", "$"];

/** One suggestion row the symbol menu renders. */
export interface KoraSymbolSuggestion {
  /** Stable row key (React key). */
  readonly key: string;
  /** The text a selection inserts (without the trailing space; the
   * insertion adds it). */
  readonly insert: string;
  /** The human label (the row's visible text). */
  readonly label: string;
  /** Optional secondary text (the row's muted detail). */
  readonly detail?: string;
}

/** A detected symbol token: the draft slice `[start, end)` under the
 * caret, opened by `symbol`, with the typed `token` body (the text after
 * the symbol). */
export interface KoraSymbolToken {
  readonly symbol: string;
  readonly start: number;
  readonly end: number;
  readonly body: string;
}

const isWhitespace = (ch: string): boolean => /\s/.test(ch);

/**
 * Detect the symbol token under the caret, if any: the token starts at
 * the input boundary (position 0 or after whitespace) with one of the
 * FOUR symbols and runs to the caret without whitespace. «a@b» does NOT
 * trigger (no boundary); «!» NEVER triggers (not in the closed set — the
 * anti-argv pin). A selection is read at its START caret.
 */
export function detectSymbolToken(text: string, caret: number): KoraSymbolToken | null {
  const at = Math.max(0, Math.min(caret, text.length));
  if (at === 0) return null;
  // Walk back to the token's first character.
  let start = at;
  while (start > 0 && !isWhitespace(text[start - 1] ?? "")) start--;
  if (start >= at) return null;
  const symbol = text[start] ?? "";
  if (!KORA_SYMBOLS.includes(symbol)) return null;
  // The trigger must sit at the input boundary (position 0 or after
  // whitespace) — a symbol glued to a word is that word's character.
  if (start > 0 && !isWhitespace(text[start - 1] ?? "")) return null;
  return {
    symbol,
    start,
    end: at,
    body: text.slice(start + 1, at),
  };
}

/** Fuzzy rank of `needle` inside `hay`: 0 = prefix, 1 = substring, 2 =
 * in-order subsequence, null = no match. Case-insensitive. */
export function fuzzyRank(hay: string, needle: string): number | null {
  if (needle.length === 0) return 0;
  const h = hay.toLowerCase();
  const n = needle.toLowerCase();
  if (h.startsWith(n)) return 0;
  const includes = h.indexOf(n);
  if (includes !== -1) return 1;
  // In-order subsequence: every needle char appears, in order.
  let cursor = 0;
  for (const ch of n) {
    const found = h.indexOf(ch, cursor);
    if (found === -1) return null;
    cursor = found + 1;
  }
  return 2;
}

/** How many suggestions one menu keeps (the dock-scale menu, not an
 * endless list). */
export const SYMBOL_SUGGESTION_LIMIT = 8;

/**
 * @ — the session's cwd reference (links, not reads). ONE real row when
 * the session reports a cwd and it matches the typed body; an empty list
 * otherwise (the component renders the honest note — no invented files,
 * the registry reports no file list).
 */
export function atSuggestions(session: KoraSession, body: string): readonly KoraSymbolSuggestion[] {
  const cwd = session.cwd;
  if (typeof cwd !== "string" || cwd.length === 0) return [];
  if (fuzzyRank(cwd, body) === null) return [];
  return [
    {
      key: `cwd:${cwd}`,
      insert: `@${cwd}`,
      label: cwd,
      detail: "cwd",
    },
  ];
}

/**
 * # — a reference to a past session: fuzzy search over the ALREADY-LOADED
 * registry slice (name → project → native id → cwd), the current session
 * excluded (mentioning the open session is a no-op), freshest first
 * within a rank. Zero new requests (§5.4).
 */
export function hashSuggestions(
  items: readonly KoraSession[],
  currentSessionId: string | null,
  body: string,
): readonly KoraSymbolSuggestion[] {
  const ranked: { rank: number; stamp: number; suggestion: KoraSymbolSuggestion }[] = [];
  for (const session of items) {
    if (currentSessionId !== null && session.id === currentSessionId) continue;
    const name = koraSessionName(session);
    const rank =
      fuzzyRank(name, body) ??
      fuzzyRank(session.native_id, body) ??
      (typeof session.cwd === "string" ? fuzzyRank(session.cwd, body) : null);
    if (rank === null) continue;
    const stamp = Date.parse(session.last_activity_at ?? session.started_at ?? "") || 0;
    ranked.push({
      rank,
      stamp,
      suggestion: {
        key: session.id,
        insert: `#${name}`,
        label: name,
        detail: session.harness,
      },
    });
  }
  ranked.sort((a, b) => a.rank - b.rank || b.stamp - a.stamp || a.suggestion.label.localeCompare(b.suggestion.label));
  return ranked.slice(0, SYMBOL_SUGGESTION_LIMIT).map((entry) => entry.suggestion);
}

/** One $ mention row from the В2a roster (the composer validates before
 * calling — this builder accepts ONLY the roster's real names). */
export function dollarSuggestions(
  roster: readonly { readonly name: string; readonly slug: string }[],
  body: string,
): readonly KoraSymbolSuggestion[] {
  const rows: KoraSymbolSuggestion[] = [];
  for (const item of roster) {
    if (fuzzyRank(item.name, body) === null) continue;
    rows.push({
      key: item.slug,
      insert: `$${item.name}`,
      label: item.name,
    });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label)).slice(0, SYMBOL_SUGGESTION_LIMIT);
}

/** The slash-menu command vocabulary (LOCAL only — the relay commands
 * arrive with the relay-transport line, honest footer note says so). */
export type KoraSlashCommandId = "pin" | "view" | "filter";

export interface KoraSlashSuggestion {
  readonly id: KoraSlashCommandId;
  readonly label: string;
}

export const KORA_SLASH_COMMANDS: readonly KoraSlashSuggestion[] = [
  { id: "pin", label: "/pin" },
  { id: "view", label: "/view" },
  { id: "filter", label: "/filter" },
];

/** The typed /-body → matching command rows (prefix/subsequence fuzzy on
 * the command word). */
export function slashSuggestions(body: string): readonly KoraSlashSuggestion[] {
  const rows: KoraSlashSuggestion[] = [];
  for (const command of KORA_SLASH_COMMANDS) {
    if (fuzzyRank(command.label.slice(1), body) === null) continue;
    rows.push(command);
  }
  return rows;
}

/** The outcome of executing one slash command (the workspace's real
 * result — the composer announces it; no outcome is invented here). */
export type KoraSlashOutcome =
  | { ok: true; note: "pin.on" | "pin.off" | "view.open" | "filter.host" }
  | { ok: false; reason: "unavailable" | "noHost" };

/** The workspace-provided command handlers (each runs ONE real action —
 * dock pin toggle / route navigation). */
export interface KoraSlashCommands {
  pin: () => KoraSlashOutcome;
  view: () => KoraSlashOutcome;
  filter: () => KoraSlashOutcome;
}

/** Insert a suggestion into the draft: the token `[start, end)` is
 * replaced with the suggestion's text plus ONE trailing space; the new
 * caret sits after it. Pure string math. */
export function insertSuggestion(
  text: string,
  token: KoraSymbolToken,
  suggestion: KoraSymbolSuggestion,
): { text: string; caret: number } {
  const replacement = `${suggestion.insert} `;
  const next = text.slice(0, token.start) + replacement + text.slice(token.end);
  return { text: next, caret: token.start + replacement.length };
}

/** Remove the executed command's token from the draft (a command is an
 * action, not text — the draft returns to its pre-token shape). */
export function stripToken(text: string, token: KoraSymbolToken): { text: string; caret: number } {
  const next = text.slice(0, token.start) + text.slice(token.end);
  return { text: next, caret: token.start };
}
