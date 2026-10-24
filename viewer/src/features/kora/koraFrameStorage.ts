/**
 * Kora v7 frame storage (U5; 07l §3/§5.2 via the v12 stand contract): the
 * `vesmaro.kora*` localStorage keys the frame hardware owns. koraTreeState
 * reserved this namespace («localStorage … for the И3 frame hardware») —
 * this module IS that hardware's key keeper:
 *
 * - `vesmaro.koraRightW`  — the right panel width, 240..420 px (def 320);
 * - `vesmaro.koraGroups`  — the host-field session-group open-set (KW4
 *   «Поле хоста»; live groups open by default, the user's toggles persist);
 * - `vesmaro.koraMovesH`  — the «Все ходы» zone FIXED height, 160..420 px
 *   (the key's ABSENCE = the auto mode ≤280; kora-rethink blueprint §4 —
 *   KW2 «Живой чат»; the height hardware lives in useKoraBandHeight);
 * - `vesmaro.koraDraft:{sessionId}` — the composer draft, one key per
 *   session (the v9-аддендум key naming), survives reloads.
 *
 * RETIRED IN KW2 (the Пульт dissolved by KW1 — kora-rethink blueprint §6;
 * the keepers and their tests are gone with the last reader):
 * `vesmaro.koraPultH` superseded by `vesmaro.koraMovesH` (the height
 * mechanics moved to the «Все ходы» zone), `vesmaro.koraEtherW` (the Эфир
 * wing column is gone — Эфир lives in the meta panel).
 *
 * RETIRED IN KW4 (blueprint-kw4 §5): `vesmaro.koraLeftW` — the LEFT
 * navigation column died with the two-zone frame; its named helpers are
 * gone with the last reader. A stale value under the dead key is IGNORED
 * by the safe getters (nothing reads it) — the storage version is NOT
 * bumped: the 07l §5.2 contract covers BREAKING schema changes, not
 * ignored leftovers.
 *
 * Guards (07l §5.2 «безопасные геттеры»): every read/write is try/catch —
 * private mode, disabled storage and SSR all degrade to the in-memory
 * default. Garbage values reset to the default, out-of-range numbers clamp
 * — storage never throws, the frame never falls (the v4 P0 lesson).
 */

const RIGHT_W_KEY = "vesmaro.koraRightW";
/** The host-field group open-set (KW4). */
const GROUPS_KEY = "vesmaro.koraGroups";
/** The «Все ходы» fixed height (KW2; absent = the auto mode). */
const MOVES_H_KEY = "vesmaro.koraMovesH";
export const DRAFT_PREFIX = "vesmaro.koraDraft:";

/** v7 §3.1 ranges: the panel width (the ONE seam of the two-zone frame). */
export const KORA_SIDE_MIN = 240;
export const KORA_SIDE_MAX = 420;
export const KORA_SIDE_DEFAULT = 320;
/** The band hardware ranges (07l §3.1) — the «Все ходы» height mechanics
 * live in useKoraBandHeight and mount on the zone in KW2. */
export const KORA_BAND_MIN = 160;
export const KORA_BAND_MAX = 420;
/** Drag/keyboard below this line means «свернуть» (07l §3.2 гистерезис). */
export const KORA_BAND_COLLAPSE_AT = 120;
/** The auto mode's content ceiling (07l §3.2: авто по контенту ≤280). */
export const KORA_BAND_AUTO_MAX = 280;

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Read a clamped int; garbage/absent → default, never throws (07l §5.2). */
export function readFrameInt(key: string, def: number, min: number, max: number): number {
  const storage = safeLocalStorage();
  if (storage === undefined) return def;
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw === "") return def;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  } catch {
    return def;
  }
}

/** Write a value; storage failures are non-fatal by design. */
export function writeFrameValue(key: string, value: string): void {
  const storage = safeLocalStorage();
  if (storage === undefined) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Private mode / quota — the in-memory state still works this visit.
  }
}

export function removeFrameValue(key: string): void {
  const storage = safeLocalStorage();
  if (storage === undefined) return;
  try {
    storage.removeItem(key);
  } catch {
    // Non-fatal by design.
  }
}

// --- the named frame keys -----------------------------------------------------

export const readKoraSideW = (): number =>
  readFrameInt(RIGHT_W_KEY, KORA_SIDE_DEFAULT, KORA_SIDE_MIN, KORA_SIDE_MAX);
export const writeKoraSideW = (w: number): void =>
  writeFrameValue(RIGHT_W_KEY, String(w));

// --- the host-field group open-set (KW4; vesmaro.koraGroups) -------------------

/**
 * Read the persisted group open-set; null when absent or garbage. The
 * payload is a JSON array of group keys (strings — cwd paths, hermes source
 * keys, the no-cwd sentinel); any other shape resets, never throws.
 */
export function readKoraGroups(): readonly string[] | null {
  const storage = safeLocalStorage();
  if (storage === undefined) return null;
  try {
    const raw = storage.getItem(GROUPS_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.every((key) => typeof key === "string")
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the group open-set; storage failures are non-fatal by design. */
export function writeKoraGroups(keys: readonly string[]): void {
  const storage = safeLocalStorage();
  if (storage === undefined) return;
  try {
    storage.setItem(GROUPS_KEY, JSON.stringify([...keys]));
  } catch {
    // Private mode / quota — the in-memory state still works this visit.
  }
}

// --- the «Все ходы» fixed height (KW2; the Пульт mechanics moved here) -------

/** The zone's fixed height; 0 = auto mode (the key stays absent, 07l §3.2). */
export const readKoraMovesH = (): number =>
  readFrameInt(MOVES_H_KEY, 0, KORA_BAND_MIN, KORA_BAND_MAX);
export const writeKoraMovesH = (h: number): void =>
  writeFrameValue(MOVES_H_KEY, String(h));
export const clearKoraMovesH = (): void => removeFrameValue(MOVES_H_KEY);

// --- the composer draft (v9-аддендум: vesmaro.koraDraft:{sessionId}) -----------

const DRAFT_LIMIT = 20_000; // a composer draft, not an archive — quota guard

/**
 * Read the persisted draft; null = none or garbage. A non-string payload
 * (only strings are ever written) is treated as absent, never thrown.
 */
export function readKoraDraft(sessionId: string): string | null {
  const storage = safeLocalStorage();
  if (storage === undefined) return null;
  try {
    const raw = storage.getItem(DRAFT_PREFIX + sessionId);
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

/** Write the draft; true = persisted (the honest «сохранён» beat). */
export function writeKoraDraft(sessionId: string, text: string): boolean {
  const storage = safeLocalStorage();
  if (storage === undefined) return false;
  try {
    if (text.trim().length === 0) {
      storage.removeItem(DRAFT_PREFIX + sessionId);
    } else {
      storage.setItem(DRAFT_PREFIX + sessionId, text.slice(0, DRAFT_LIMIT));
    }
    return true;
  } catch {
    return false;
  }
}

export function clearKoraDraft(sessionId: string): void {
  removeFrameValue(DRAFT_PREFIX + sessionId);
}
