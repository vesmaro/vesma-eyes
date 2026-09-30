import type { TaskSessionFact } from "@/gateway/boardTypes";

/**
 * ME-063 pure projections over the session-facts wire (agents-ui-spec §2.1):
 * liveness derivation, the mono duration format and the deep-link target.
 * No React, no i18n — the panel composes these with dictionary phrases.
 */

/**
 * Session liveness from the fact's own clocks (the Kora listing's
 * live/idle/dead vocabulary stays on ITS surface — the task card has only
 * the two fact-derivable states): an empty `ended_at` means the child has
 * not exited yet → `live`; a stamped `ended_at` → `idle` (the process is
 * done; the transcript stays deep-linkable either way).
 */
export type SessionLiveness = "live" | "idle";

export function sessionLiveness(fact: TaskSessionFact): SessionLiveness {
  return fact.ended_at === "" ? "live" : "idle";
}

/**
 * Worked duration as a language-neutral mono stamp (`M:SS`, `H:MM:SS`
 * past the hour, `0:SS` under a minute) — the mono-age convention of the
 * tab's rows, so no plural forms are needed. `duration_s <= 0` (a live
 * child or an unmeasured report) answers "" — an honest absence, never a
 * fake `0:00`.
 */
export function formatDuration(durationS: number): string {
  if (!Number.isFinite(durationS) || durationS <= 0) return "";
  const total = Math.floor(durationS);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

/**
 * The deep-link target into the read-only transcript viewer (slice 2):
 * `/kora/{session_id}` where `session_id` is the wire's
 * `'{executor_id}:{native_id}'` glue — no translation (spec §2.1).
 * `encodeURIComponent` keeps odd executor ids one path segment.
 */
export function sessionTranscriptHref(fact: TaskSessionFact): string {
  return `/kora/${encodeURIComponent(fact.session_id)}`;
}

/**
 * The row's primary label: the spawned specialist when the spawn registry
 * knew the role, else the native session id (mono) — the spec marks
 * `specialist` best-effort, and a bare native id is still an honest
 * identity, never «unknown».
 */
export function sessionLabel(fact: TaskSessionFact): string {
  return fact.specialist !== "" ? fact.specialist : fact.native_id;
}
