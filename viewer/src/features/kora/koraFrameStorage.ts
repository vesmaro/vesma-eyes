/**
 * Kora v7 frame storage (U5; 07l §3/§5.2 via the v12 stand contract): the
 * `vesmaro.kora*` localStorage keys the frame hardware owns. koraTreeState
 * reserved this namespace («localStorage … for the И3 frame hardware») —
 * this module IS that hardware's key keeper:
 *
 * - `vesmaro.koraRightW`  — the meta panel width, 240..420 px (def 320);
 * - `vesmaro.koraLeftW`   — the navigation panel width, 220..380 px
 *   (def 280; kora-rethink blueprint §4 — KW1 «Три колонки»);
 * - `vesmaro.koraDraft:{sessionId}` — the composer draft, one key per
 *   session (the v9-аддендум key naming), survives reloads.
 *
 * RETIRED IN KW2 (the Пульт is dissolved by KW1 — kora-rethink blueprint
 * §6): `vesmaro.koraPultH` (the height mechanics move to the «Все ходы»
 * zone, which persists `vesmaro.koraMovesH`) and `vesmaro.koraEtherW` (the
 * Эфир wing column is gone — Эфир lives in the meta panel). Nothing in the
 * frame reads or writes them anymore; the readers/writers stay exported
 * until KW2 lands the zone and the keys are dropped for real.
 *
 * Guards (07l §5.2 «безопасные геттеры»): every read/write is try/catch —
 * private mode, disabled storage and SSR all degrade to the in-memory
 * default. Garbage values reset to the default, out-of-range numbers clamp
 * — storage never throws, the frame never falls (the v4 P0 lesson).
 */

const RIGHT_W_KEY = "vesmaro.koraRightW";
const LEFT_W_KEY = "vesmaro.koraLeftW";
/** retired in KW2 (see the module doc) — kept until the zone lands. */
const PULT_H_KEY = "vesmaro.koraPultH";
/** retired in KW2 (see the module doc) — kept until the zone lands. */
const ETHER_W_KEY = "vesmaro.koraEtherW";
export const DRAFT_PREFIX = "vesmaro.koraDraft:";

/** v7 §3.1 ranges: the two panel widths. */
export const KORA_SIDE_MIN = 240;
export const KORA_SIDE_MAX = 420;
export const KORA_SIDE_DEFAULT = 320;
/** kora-rethink blueprint §4: nav panel 220–380, default 280. */
export const KORA_NAV_MIN = 220;
export const KORA_NAV_MAX = 380;
export const KORA_NAV_DEFAULT = 280;
/** The band hardware ranges (07l §3.1) — the height mechanics live in
 * useKoraBandHeight and land on the «Все ходы» zone in KW2. */
export const KORA_BAND_MIN = 160;
export const KORA_BAND_MAX = 420;
/** Drag/keyboard below this line means «свернуть» (07l §3.2 гистерезис). */
export const KORA_BAND_COLLAPSE_AT = 120;
/** The auto mode's content ceiling (07l §3.2: авто по контенту ≤280). */
export const KORA_BAND_AUTO_MAX = 280;
// retired in KW2 — the Пульт-era names of the band constants above.
export const KORA_PULT_MIN = KORA_BAND_MIN;
export const KORA_PULT_MAX = KORA_BAND_MAX;
export const KORA_PULT_COLLAPSE_AT = KORA_BAND_COLLAPSE_AT;
export const KORA_ETHER_MIN = 280;
export const KORA_ETHER_MAX = 480;
export const KORA_ETHER_DEFAULT = 320;

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

/** The nav panel width (kora-rethink blueprint §4, KW1). */
export const readKoraLeftW = (): number =>
  readFrameInt(LEFT_W_KEY, KORA_NAV_DEFAULT, KORA_NAV_MIN, KORA_NAV_MAX);
export const writeKoraLeftW = (w: number): void =>
  writeFrameValue(LEFT_W_KEY, String(w));

// retired in KW2 — the Пульт-era key keepers; nothing mounts them (KW1),
// the band hook takes its readers as parameters so KW2 wires koraMovesH.

/** The Пульт fixed height; 0 = auto mode (the key stays absent, v7 §3.2). */
export const readKoraPultH = (): number =>
  readFrameInt(PULT_H_KEY, 0, KORA_PULT_MIN, KORA_PULT_MAX);
export const writeKoraPultH = (h: number): void =>
  writeFrameValue(PULT_H_KEY, String(h));
export const clearKoraPultH = (): void => removeFrameValue(PULT_H_KEY);

export const readKoraEtherW = (): number =>
  readFrameInt(ETHER_W_KEY, KORA_ETHER_DEFAULT, KORA_ETHER_MIN, KORA_ETHER_MAX);
export const writeKoraEtherW = (w: number): void =>
  writeFrameValue(ETHER_W_KEY, String(w));

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
