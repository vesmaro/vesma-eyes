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
 * ignored leftovers. (Kora IDE contract В1, 2026-10-29: the left zone is
 * BACK as the permanent sessions DOCK — it reads the NEW `vesmaro.koraDockW`
 * key, never the dead `koraLeftW`; the dead key keeps rotting untouched.)
 *
 * KORA-IDE В1 (kora-ide contract §2.5): the dock hardware adds three keys —
 * `vesmaro.koraDockW` (the dock width, 220..380 px, def 300 — the DEAD
 * `vesmaro.koraLeftW` is ignored by the safe getter, the storage version is
 * NOT bumped: the KW4 §5 precedent), `vesmaro.koraDockView` (the dock view
 * switcher) and `vesmaro.koraDockGroups` (the dock group open-set; the
 * KW4 host-field key `vesmaro.koraGroups` stays the FIELD's own — the two
 * surfaces keep separate open-sets). The dock writes return the honest
 * «persisted?» boolean the K-PERSIST-FAIL bit reads.
 *
 * KORA-IDE В4 (kora-ide contract §2.5/§3.1 — the dock CUSTOMIZATION): three
 * more keys — `vesmaro.koraDockPins` (the dock pin-section's session ids, a
 * JSON array, pin order preserved), `vesmaro.koraDockHidden` (the locally
 * hidden session ids, a JSON array) and `vesmaro.koraAlias:{sessionId}`
 * (the LOCAL session alias, one key per session, the same shape as the
 * specialist keys; renaming NEVER touches the server name — the honest
 * «локально» badge is the UI's contract). The contract risk table puts
 * aliases inside the K-INV-5 perimeter: a local key holds a NAME the user
 * typed, never transcript content — nothing here reads a transcript to
 * pre-fill it.
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

// --- the dock hardware (Kora IDE В1; vesmaro.koraDock*) -------------------------

/** v-range of the dock seam (kora-ide contract §2.1: 220–380, default 300).
 * The DEAD KW4 key `vesmaro.koraLeftW` is deliberately NOT read — a stale
 * value there stays a rotting leftover (no version bump, KW4 §5 precedent). */
export const KORA_DOCK_MIN = 220;
export const KORA_DOCK_MAX = 380;
export const KORA_DOCK_DEFAULT = 300;

const DOCK_W_KEY = "vesmaro.koraDockW";
/** The dock view switcher («По работе» / «По хосту» / «Таймлайн»). */
const DOCK_VIEW_KEY = "vesmaro.koraDockView";
/** The dock group open-set (cwd / source / host keys — ONE set for all
 * views; host-view keys carry a `host:`/`harness:` prefix so they can never
 * collide with the cwd-path keys of the «По работе» view). */
const DOCK_GROUPS_KEY = "vesmaro.koraDockGroups";

export const readKoraDockW = (): number =>
  readFrameInt(DOCK_W_KEY, KORA_DOCK_DEFAULT, KORA_DOCK_MIN, KORA_DOCK_MAX);
/** true = persisted; false = storage refused (the honest K-PERSIST-FAIL bit). */
export const writeKoraDockW = (w: number): boolean => {
  const storage = safeLocalStorage();
  if (storage === undefined) return false;
  try {
    storage.setItem(DOCK_W_KEY, String(w));
    return true;
  } catch {
    return false;
  }
};

/** The three dock views (kora-ide contract §3.1); «По работе» is the
 * KW4-inherited default (verdict Q6 §7: преемственность группировок). */
export type KoraDockView = "work" | "host" | "timeline";

const DOCK_VIEWS: readonly KoraDockView[] = ["work", "host", "timeline"];

/** Read the persisted view; null = absent or garbage (the caller renders
 * the default). Any non-member string resets, never throws. */
export function readKoraDockView(): KoraDockView | null {
  const storage = safeLocalStorage();
  if (storage === undefined) return null;
  try {
    const raw = storage.getItem(DOCK_VIEW_KEY);
    return DOCK_VIEWS.find((view) => view === raw) ?? null;
  } catch {
    return null;
  }
}

export function writeKoraDockView(view: KoraDockView): boolean {
  const storage = safeLocalStorage();
  if (storage === undefined) return false;
  try {
    storage.setItem(DOCK_VIEW_KEY, view);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the dock group open-set; null when absent or garbage. Same payload
 * discipline as `readKoraGroups`: a JSON array of strings, anything else
 * resets, never throws.
 */
export function readKoraDockGroups(): readonly string[] | null {
  const storage = safeLocalStorage();
  if (storage === undefined) return null;
  try {
    const raw = storage.getItem(DOCK_GROUPS_KEY);
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

/** Persist the open-set; true = persisted (K-PERSIST-FAIL reads the lie). */
export function writeKoraDockGroups(keys: readonly string[]): boolean {
  const storage = safeLocalStorage();
  if (storage === undefined) return false;
  try {
    storage.setItem(DOCK_GROUPS_KEY, JSON.stringify([...keys]));
    return true;
  } catch {
    return false;
  }
}

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

// --- the specialist annotation (В2: vesmaro.koraSpecialist:{sessionId}) -----
//
// The composer's specialist selector is a LOCAL overlay (kora-ide contract
// §3.1's local-overlay discipline, honestly marked): the choice annotates
// the session's composer + context bar until the relay line carries
// specialists on the wire (the frozen contract has no specialist field on
// POST messages). One key per session, the same shape as the draft keys.

export const SPECIALIST_PREFIX = "vesmaro.koraSpecialist:";
/** A name annotation, not an archive — same quota discipline as drafts. */
const SPECIALIST_LIMIT = 200;

/** Read the persisted annotation; null = none or garbage (never throws). */
export function readKoraSpecialist(sessionId: string): string | null {
  const storage = safeLocalStorage();
  if (storage === undefined) return null;
  try {
    const raw = storage.getItem(SPECIALIST_PREFIX + sessionId);
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

/** Write/clear the annotation; true = persisted (the honest local bit). */
export function writeKoraSpecialist(sessionId: string, name: string): boolean {
  const storage = safeLocalStorage();
  if (storage === undefined) return false;
  try {
    if (name.trim().length === 0) {
      storage.removeItem(SPECIALIST_PREFIX + sessionId);
    } else {
      storage.setItem(SPECIALIST_PREFIX + sessionId, name.slice(0, SPECIALIST_LIMIT));
    }
    return true;
  } catch {
    return false;
  }
}

// --- the dock customization (В4: pins / hidden / local aliases) --------------
//
// kora-ide contract §3.1 + §7 В4: the pin-SECTION of sessions (above the
// views, beside the cluster pin), the LOCAL hiding (instead of a server
// archive — the honest K-DOCK-HIDDEN line names the count and offers the
// way back) and the LOCAL aliases (marked «локально», the server name is
// never rewritten). All three live in the frame-storage guards with the
// honest boolean the K-PERSIST-FAIL bit reads (the W1 discipline).

/** The dock pin-section (ordered session ids — pin order is render order). */
const DOCK_PINS_KEY = "vesmaro.koraDockPins";
/** The locally hidden session ids (the honest K-DOCK-HIDDEN count reads
 * the intersection with the LOADED slice — stale ids count nothing). */
const DOCK_HIDDEN_KEY = "vesmaro.koraDockHidden";
/** The local alias prefix (one key per session, like the draft/specialist
 * keys). */
export const ALIAS_PREFIX = "vesmaro.koraAlias:";
/** A name annotation, not an archive — same quota discipline as the
 * specialist keys. */
const ALIAS_LIMIT = 200;

/** Read a JSON string-array key; null when absent or garbage (never
 * throws) — the same payload discipline as the group open-sets. */
function readStringArrayKey(key: string): readonly string[] | null {
  const storage = safeLocalStorage();
  if (storage === undefined) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Write a JSON string-array key; true = persisted (K-PERSIST-FAIL reads
 * the lie). */
function writeStringArrayKey(key: string, values: readonly string[]): boolean {
  const storage = safeLocalStorage();
  if (storage === undefined) return false;
  try {
    storage.setItem(key, JSON.stringify([...values]));
    return true;
  } catch {
    return false;
  }
}

/** The persisted pin order; null = absent or garbage. */
export const readKoraDockPins = (): readonly string[] | null =>
  readStringArrayKey(DOCK_PINS_KEY);
/** Persist the pin order; true = persisted (the honest local bit). */
export const writeKoraDockPins = (ids: readonly string[]): boolean =>
  writeStringArrayKey(DOCK_PINS_KEY, ids);

/** The persisted hidden ids; null = absent or garbage. */
export const readKoraDockHidden = (): readonly string[] | null =>
  readStringArrayKey(DOCK_HIDDEN_KEY);
/** Persist the hidden set; true = persisted (the honest local bit). */
export const writeKoraDockHidden = (ids: readonly string[]): boolean =>
  writeStringArrayKey(DOCK_HIDDEN_KEY, ids);

/** Read the persisted alias; null = none or garbage (never throws). */
export function readKoraAlias(sessionId: string): string | null {
  const storage = safeLocalStorage();
  if (storage === undefined) return null;
  try {
    const raw = storage.getItem(ALIAS_PREFIX + sessionId);
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

/** Write/clear the alias; true = persisted (the honest local bit). An
 * emptied name removes the key. A name the user typed — NEVER transcript
 * content (K-INV-5: the local key accepts no transcript pre-fill). */
export function writeKoraAlias(sessionId: string, name: string): boolean {
  const storage = safeLocalStorage();
  if (storage === undefined) return false;
  try {
    if (name.trim().length === 0) {
      storage.removeItem(ALIAS_PREFIX + sessionId);
    } else {
      storage.setItem(ALIAS_PREFIX + sessionId, name.slice(0, ALIAS_LIMIT));
    }
    return true;
  } catch {
    return false;
  }
}
