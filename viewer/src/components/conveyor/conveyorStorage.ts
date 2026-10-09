/**
 * Conveyor draft persistence (U8 v12-UX-потоки; the koraFrameStorage
 * posture — v12 stand contract «возобновление незавершённой операции»).
 *
 * The ONE storage keeper for multi-step flow drafts: a multi-step conveyor
 * that dies with a reload loses the owner's typed work — v12's wizard kept
 * steps reachable and the kora composer keeps drafts across reloads. This
 * module persists {step, value} per flow under `vesmaro.flow.<name>` and
 * hands the draft back on the next mount, so «перезагрузка» resumes the
 * operation instead of restarting it.
 *
 * Guards (the koraFrameStorage lesson, 07l §5.2): every read/write is
 * try/catch — private mode, disabled storage and SSR all degrade to "no
 * draft" and never throw. A version mismatch (the flow's shape changed)
 * or a failed guard drops the draft: a stale draft must never inject
 * yesterday's shape into today's form (the honest fallback is a fresh
 * start, not a half-migrated one).
 *
 * SECRETS NEVER ENTER A DRAFT: the caller's `value` must already be
 * secret-free (the provision form persists host/port/name/harness/URL and
 * auth KIND, never the key/password/passphrase — the enrollment form has
 * no secrets by construction). The keeper cannot enforce that; the rule
 * lives in each flow's save call and its test.
 */

export const FLOW_KEY_PREFIX = "vesmaro.flow.";

/** One persisted conveyor draft: the step + the flow's draft value. */
export interface ConveyorDraft<T> {
  /** Draft-shape version — a mismatch drops the draft (see module doc). */
  readonly version: number;
  /** 0-based step index the owner reached. */
  readonly step: number;
  /** ISO stamp of the last save (the «черновик от …» honesty line). */
  readonly savedAt: string;
  readonly value: T;
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Read one draft. Absent / garbage / version-mismatched / guard-rejecting
 * drafts all read as null — and a stale-SHAPE draft is DROPPED, not kept
 * (the next save rewrites it cleanly).
 */
export function loadConveyorDraft<T>(
  name: string,
  version: number,
  guard: (value: unknown) => T | null,
): ConveyorDraft<T> | null {
  const storage = safeLocalStorage();
  if (storage === undefined) return null;
  try {
    const raw = storage.getItem(FLOW_KEY_PREFIX + name);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Partial<ConveyorDraft<unknown>>;
    if (
      candidate.version !== version ||
      typeof candidate.step !== "number" ||
      !Number.isInteger(candidate.step) ||
      candidate.step < 0 ||
      typeof candidate.savedAt !== "string"
    ) {
      return null;
    }
    const value = guard(candidate.value);
    if (value === null) return null;
    return { version, step: candidate.step, savedAt: candidate.savedAt, value };
  } catch {
    return null;
  }
}

/** Write one draft. Storage failure is silent — the draft is a courtesy,
 * never a requirement (the flow works without it). */
export function saveConveyorDraft<T>(
  name: string,
  version: number,
  step: number,
  value: T,
): void {
  const storage = safeLocalStorage();
  if (storage === undefined) return;
  const draft: ConveyorDraft<T> = {
    version,
    step,
    savedAt: new Date().toISOString(),
    value,
  };
  try {
    storage.setItem(FLOW_KEY_PREFIX + name, JSON.stringify(draft));
  } catch {
    // Private mode / quota — no draft, no throw.
  }
}

/** Drop the draft (terminal success — the operation is finished). */
export function clearConveyorDraft(name: string): void {
  const storage = safeLocalStorage();
  if (storage === undefined) return;
  try {
    storage.removeItem(FLOW_KEY_PREFIX + name);
  } catch {
    // Nothing to do — a stuck draft only means one extra restore.
  }
}
