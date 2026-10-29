import { useSyncExternalStore } from "react";
import { readKoraSpecialist, writeKoraSpecialist } from "./koraFrameStorage";

/**
 * The specialist ANNOTATION store (В2; kora-ide contract §3.2's selector
 * row + §2.2's context bar): a tiny module-level store — session id → the
 * chosen specialist NAME — kept in sync between the two surfaces that
 * read it (the composer's selector writes, the center's context bar
 * displays), exactly like the Эфир ring (koraEtherStore) keeps one mount
 * honest across readers.
 *
 * HONESTY CONTRACT (07a §1, the local-overlay discipline): the annotation
 * is a LOCAL choice — it persists per session in
 * `vesmaro.koraSpecialist:{sessionId}` (localStorage, the frame-storage
 * guards) and it does NOT pretend to bind anything: the frozen contract
 * carries no specialist field on POST messages, so until the relay line
 * wires specialists, both surfaces mark the choice «локально» (the
 * dropdown footer and the honest aria text say so). A failed write keeps
 * the in-memory choice for the visit — the same non-fatal degradation as
 * every frame-storage key.
 *
 * Values come ONLY from the real roster (the composer validates before
 * calling setSpecialist) — the store never invents a specialist.
 */

const annotations = new Map<string, string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of [...listeners]) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * The store snapshot for one session (the useSyncExternalStore get). The
 * cache seeds itself from storage once per session id — a reload restores
 * the annotation, a session switch reads its own key.
 */
export function getSpecialistAnnotation(sessionId: string): string | null {
  if (!annotations.has(sessionId)) {
    const persisted = readKoraSpecialist(sessionId);
    if (persisted !== null) annotations.set(sessionId, persisted);
    else annotations.set(sessionId, "");
  }
  const value = annotations.get(sessionId) ?? "";
  return value.length > 0 ? value : null;
}

/**
 * Set/clear the annotation (null clears). Persists honestly; the
 * in-memory value always reflects the call so the surfaces stay in sync
 * even when storage refuses (private mode — the honest local bit lives
 * with the write, the choice still works this visit).
 */
export function setSpecialistAnnotation(
  sessionId: string,
  name: string | null,
): void {
  if (name === null || name.trim().length === 0) {
    annotations.set(sessionId, "");
    writeKoraSpecialist(sessionId, "");
  } else {
    annotations.set(sessionId, name);
    writeKoraSpecialist(sessionId, name);
  }
  notify();
}

/** Tests only: module state by design (one annotation domain per app). */
export function resetSpecialistAnnotationsForTests(): void {
  annotations.clear();
  listeners.clear();
}

/** React binding: the annotation of one session, live across readers.
 * The store is a SYNCHRONOUS client module (guarded storage reads), so
 * the server snapshot reads the same fact — SSR renders the annotation
 * instead of a hydration-flash null. */
export function useKoraSpecialistAnnotation(sessionId: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => getSpecialistAnnotation(sessionId),
    () => getSpecialistAnnotation(sessionId),
  );
}

/** Plain subscription (tests / future non-React readers); mirrors the
 * Эфир ring's subscribe shape. */
export function subscribeSpecialist(fn: () => void): () => void {
  return subscribe(fn);
}
