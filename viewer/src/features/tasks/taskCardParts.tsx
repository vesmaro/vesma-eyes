import { useT } from "@/i18n";
import type { BoardTask } from "@/gateway/boardTypes";
import { useActiveAssignment, useTerminalAssignment } from "@/features/agents/useAgents";
import {
  isValidationOverdue,
  validationElapsed,
} from "./taskStatus";
import { blockedReasonOf } from "./blockedReason";
import { useValidationNow } from "./useValidationClock";

/**
 * Shared primitives of the board card (CV-5): the dense (grouped) and the
 * classic card SKINS of TaskBoardCard render the SAME validation clock and
 * title highlight — one implementation, no visual drift between the styles.
 */

/**
 * The WF-1 validation clock line: «в валидации Xч Yм». Reads the SHARED 1 Hz
 * ticker (useValidationClock) — no per-card interval; renders nothing while
 * the ticker is inactive (SSR) or the stamp is absent/unparsable. The caller
 * passes the skin's top margin through `className`; the element itself is the
 * line (a `p`), not a wrapper — one node in both card skins.
 */
export function ValidatingClock({
  since,
  className = "",
}: {
  since: string | null | undefined;
  /** Skin spacing (e.g. the classic/dense top margin), prepended verbatim. */
  className?: string;
}) {
  const t = useT();
  const now = useValidationNow();
  if (now === 0) return null;
  const elapsed = validationElapsed(since, now);
  if (!elapsed) return null;
  const overdue = isValidationOverdue(since, now);
  return (
    <p
      className={
        className +
        "font-mono text-xs " +
        (overdue ? "text-error" : "text-foreground-muted")
      }
      title={overdue ? t("tasks.board.validatingOverdueTitle") : undefined}
    >
      {t("tasks.board.validatingFor", {
        hours: elapsed.hours,
        minutes: elapsed.minutes,
      })}
    </p>
  );
}

/**
 * U3 blocked-reason line (SPEC-2026-10-07 «заново — blocked-кромка с
 * причиной»; 15-WOW §3.4 п.4): the visible human reason under the title of a
 * blocked card/row — the colour edge (TaskBoardCard's error accent) is never
 * the only carrier: the ⟂ marker + THIS text duplicate it (WCAG 1.4.1), and
 * the server's exact note rides as the tooltip when it adds context (the v12
 * stand's title=blockedNote pattern). Reason derived from data the client
 * already holds (blockedReason.ts — never invented); renders NOTHING unless
 * the task actually sits in the blocked lane — a resolved task with a stale
 * failed attempt does not resurrect the reason.
 */
export function BlockedReasonLine({
  task,
  className = "",
}: {
  task: BoardTask;
  /** Skin spacing from the caller, prepended verbatim (the card/list rhythm). */
  className?: string;
}) {
  const t = useT();
  // Hook-order discipline: both reads run on every render; the render gate
  // below decides visibility. Both observe the ONE shared assignments cache
  // entry (no extra wire call beyond what ActiveAssignmentBadge already pays).
  const active = useActiveAssignment(task.id).data;
  const terminal = useTerminalAssignment(task.id).data;
  if (task.col !== "blocked") return null;
  const reason = blockedReasonOf(
    task,
    terminal,
    active?.state === "queued" && active.routing?.reason === "unmatched",
    t,
  );
  return (
    <p
      title={reason.note}
      className={
        className +
        "flex items-start gap-1 text-xs leading-snug text-error"
      }
    >
      <span aria-hidden="true" className="font-mono">
        ⟂
      </span>
      <span className="min-w-0 break-words">{reason.text}</span>
    </p>
  );
}

/** Title with the active `q` match highlighted (`<mark>`, semantic boost). */
export function HighlightedTitle({ title, query }: { title: string; query: string }) {
  const needle = query.trim();
  if (needle.length === 0) return <>{title}</>;
  const index = title.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return <>{title}</>;
  return (
    <>
      {title.slice(0, index)}
      <mark className="rounded-sm bg-iris/20 px-0.5 text-foreground">
        {title.slice(index, index + needle.length)}
      </mark>
      {title.slice(index + needle.length)}
    </>
  );
}
