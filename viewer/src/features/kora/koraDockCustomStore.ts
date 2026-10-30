import { useSyncExternalStore } from "react";
import {
  readKoraAlias,
  readKoraDockHidden,
  readKoraDockPins,
  writeKoraAlias,
  writeKoraDockHidden,
  writeKoraDockPins,
} from "./koraFrameStorage";

/**
 * The dock CUSTOMIZATION store (В4; kora-ide contract §3.1/§7 В4): the
 * pin-section's session ids, the LOCAL aliases and the LOCAL hiding — the
 * three client-side overlays the dock renders with their honest marks.
 * A tiny module-level store kept in sync between the surfaces that read
 * and write it (the dock's rows write, the dock's sections and the
 * composer's /pin command read), exactly like the specialist annotation
 * store (koraSpecialistStore) keeps one choice honest across readers.
 *
 * HONESTY CONTRACT (07a §1 + the contract's risk table):
 * - everything is LOCAL. The pin order, the aliases and the hidden set
 *   persist in the frame-storage keys (vesmaro.koraDockPins /
 *   vesmaro.koraDockHidden / vesmaro.koraAlias:{sessionId}) and NEVER
 *   pretend to be server facts: an aliased row wears the «локально» badge
 *   and keeps the server name as its tooltip; a hidden session reads in
 *   the K-DOCK-HIDDEN line «скрыты локально: N — показать». No server
 *   archive/rename exists in the frozen contract — none is invented here.
 * - K-INV-5 perimeter: a local key holds a NAME the user typed. Nothing
 *   in this store reads a transcript to pre-fill an alias; the server
 *   name and the previews it shadows stay the registry's own redacted
 *   words.
 * - K-PERSIST-FAIL (the В1 dock pattern): a refused write raises the
 *   store's honest bit instead of swallowing the boolean — the UI says
 *   «не сохранилось» and the choice still works this visit. A later
 *   successful write clears the bit.
 *
 * Snapshots are replaced (never mutated) on every write, so
 * useSyncExternalStore sees a new reference exactly when the state
 * changes; reads seed themselves from storage once per module load (a
 * reload restores the customization, the same discipline as the
 * specialist annotations).
 */

let pins: readonly string[] = readKoraDockPins() ?? [];
/** The alias map is MUTATED in place by reads (the lazy per-session seed)
 * and REPLACED only by writes — a useSyncExternalStore getSnapshot must
 * return a stable reference between writes, or the store's read-side
 * seeding would read as a change and loop the renderer. */
let aliases: Map<string, string> = new Map();
let hidden: ReadonlySet<string> = new Set(readKoraDockHidden() ?? []);
/** Any dock-customization write the storage refused (the honest
 * K-PERSIST-FAIL bit; cleared by the next successful write). */
let persistFail = false;
const listeners = new Set<() => void>();

/** Aliases seed lazily per session id (the same one-seed discipline as
 * the specialist store — a session's key is read at most once). The seed
 * mutates the CURRENT map in place: a read never replaces the snapshot. */
function seedAlias(sessionId: string): void {
  if (aliases.has(sessionId)) return;
  const persisted = readKoraAlias(sessionId);
  aliases.set(sessionId, persisted ?? "");
}

function notify(): void {
  for (const fn of [...listeners]) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The pin order (the pin-section's render order). */
export const getKoraDockPins = (): readonly string[] => pins;

/** Pin/unpin one session (null toggles). Returns the NEW pinned state so
 * the caller can announce what happened. The in-memory order always
 * reflects the call; a refused write keeps the visit-local state and
 * raises the store's K-PERSIST-FAIL bit. */
export function setKoraDockPinned(sessionId: string, pinned: boolean | null = null): boolean {
  const current = pins.includes(sessionId);
  const next = pinned === null ? !current : pinned;
  if (next === current) return next;
  pins = next ? [...pins, sessionId] : pins.filter((id) => id !== sessionId);
  if (writeKoraDockPins(pins)) persistFail = false;
  else persistFail = true;
  notify();
  return next;
}

/** The alias map of the seeded sessions (a replaced snapshot — stable
 * between writes). */
export function getKoraDockAliases(): ReadonlyMap<string, string> {
  return aliases;
}

/** The effective alias of one session (null = none). Seeds the session's
 * own key on first read; the seeded-absent value is the empty string, and
 * an empty string IS «no alias» — the badge never renders for it. */
export function getKoraDockAlias(sessionId: string): string | null {
  seedAlias(sessionId);
  const value = aliases.get(sessionId) ?? "";
  return value.length > 0 ? value : null;
}

/** Set/clear the local alias (null or a blank name clears). The alias is
 * a NAME typed by the user — the store never invents one and never reads
 * one from a transcript (K-INV-5). */
export function setKoraDockAlias(sessionId: string, name: string | null): void {
  seedAlias(sessionId);
  const value = name === null || name.trim().length === 0 ? null : name.slice(0, 200);
  const next = new Map(aliases);
  if (value === null) next.delete(sessionId);
  else next.set(sessionId, value);
  aliases = next;
  if (writeKoraAlias(sessionId, value ?? "")) persistFail = false;
  else persistFail = true;
  notify();
}

/** The locally hidden ids (a replaced snapshot; the K-DOCK-HIDDEN count
 * intersects this with the LOADED slice — a stale id counts nothing). */
export const getKoraDockHidden = (): ReadonlySet<string> => hidden;

/** Hide/unhide one session (null toggles). */
export function setKoraDockHidden(sessionId: string, isHidden: boolean | null = null): void {
  const current = hidden.has(sessionId);
  const next = isHidden === null ? !current : isHidden;
  if (next === current) return;
  const nextSet = new Set(hidden);
  if (next) nextSet.add(sessionId);
  else nextSet.delete(sessionId);
  hidden = nextSet;
  if (writeKoraDockHidden([...hidden])) persistFail = false;
  else persistFail = true;
  notify();
}

/** «Показать» — clear the WHOLE hidden set (the K-DOCK-HIDDEN way out;
 * stale ids go with it — there is no reason to keep them). */
export function clearKoraDockHidden(): void {
  if (hidden.size === 0) return;
  hidden = new Set();
  if (writeKoraDockHidden([])) persistFail = false;
  else persistFail = true;
  notify();
}

/** The honest K-PERSIST-FAIL bit: the LAST customization write did not
 * reach storage — the overlays still work this visit, a reload will lose
 * them, and the dock says so instead of pretending. */
export const getKoraDockCustomPersistFailure = (): boolean => persistFail;

/** Tests only: module state by design (one customization domain per app). */
export function resetKoraDockCustomForTests(): void {
  pins = readKoraDockPins() ?? [];
  aliases = new Map();
  hidden = new Set(readKoraDockHidden() ?? []);
  persistFail = false;
  listeners.clear();
}

/** React binding: the pin order, live across readers. */
export function useKoraDockPins(): readonly string[] {
  return useSyncExternalStore(subscribe, getKoraDockPins, getKoraDockPins);
}

/** React binding: the alias map, live across readers (the dock rows and
 * the composer's # mentions read the same fact). */
export function useKoraDockAliases(): ReadonlyMap<string, string> {
  return useSyncExternalStore(subscribe, getKoraDockAliases, getKoraDockAliases);
}

/** React binding: one session's alias (seeded + live). */
export function useKoraDockAlias(sessionId: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => getKoraDockAlias(sessionId),
    () => getKoraDockAlias(sessionId),
  );
}

/** React binding: the hidden set, live across readers. */
export function useKoraDockHidden(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getKoraDockHidden, getKoraDockHidden);
}

/** React binding: the store's K-PERSIST-FAIL bit, live across readers. */
export function useKoraDockCustomPersistFailure(): boolean {
  return useSyncExternalStore(
    subscribe,
    getKoraDockCustomPersistFailure,
    getKoraDockCustomPersistFailure,
  );
}

/** Plain subscription (tests / non-React readers); mirrors the specialist
 * store's subscribe shape. */
export function subscribeKoraDockCustom(fn: () => void): () => void {
  return subscribe(fn);
}
