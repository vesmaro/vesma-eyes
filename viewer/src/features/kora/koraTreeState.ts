/**
 * Kora Блок 1 branch persistence (07j §3.3: «состояние веток персистентно в
 * сессии браузера»). sessionStorage, not localStorage — the v7 storage
 * contract (07l §5.2) reserves `vesmaro.kora*` in localStorage for the И3
 * frame hardware (resize heights, storageVersion migration); a session-scoped
 * key cannot rot across schema changes the way the v4 localStorage tree did.
 *
 * Guards: every read/write is try/catch — private mode, disabled storage and
 * SSR (renderToString tests) all degrade to the in-memory default (07l §5.2:
 * «init не зависит от успеха записи»). Garbage values reset, never throw.
 */

const KEY = "vesmaro.koraTree";

export interface KoraTreeState {
  /** Open node keys: host names + executor ids. */
  readonly open: readonly string[];
}

function safeSessionStorage(): Storage | undefined {
  try {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

/** Read the persisted open-set; null when absent or garbage. */
export function readKoraTreeState(): KoraTreeState | null {
  const storage = safeSessionStorage();
  if (storage === undefined) return null;
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as KoraTreeState).open) &&
      (parsed as KoraTreeState).open.every((key) => typeof key === "string")
    ) {
      return { open: (parsed as KoraTreeState).open };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the open-set; storage failures are non-fatal by design. */
export function writeKoraTreeState(state: KoraTreeState): void {
  const storage = safeSessionStorage();
  if (storage === undefined) return;
  try {
    storage.setItem(KEY, JSON.stringify({ open: [...state.open] }));
  } catch {
    // Private mode / quota — the in-memory state still works this session.
  }
}
