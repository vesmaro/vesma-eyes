import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * HonestLine (UX-overhaul spec §7.1) — honest incompleteness as ONE line,
 * not a screen (П1): quiet text + an optional action slot. 501 / soon /
 * partially-available states render this instead of a fullscreen EmptyState.
 *
 * - `status` (default): neutral incompleteness («Метрики появятся позже»).
 * - `warning`: something live but not everything (metrics broken while
 *   health is fine) — the existing warning token, no new colours.
 *
 * Semantics: `role="status"` (a state announcement, never an alert —
 * incompleteness is not an error). Tokens only: `text-sm`,
 * `text-foreground-secondary`, `rounded-md` (--radius-md),
 * `border-border-subtle`; the action slot carries the caller's own
 * focus-ring discipline.
 *
 * ME-072 №3: the row aligns by FIRST BASELINE (`items-baseline`) — when the
 * line wraps in a narrow panel, the info icon stays on the first text line
 * instead of floating mid-block. The action slot always takes its OWN
 * right-aligned row: inline after a wrapped text it landed mid-phrase.
 */
export interface HonestLineProps {
  tone?: "status" | "warning";
  /** The one-line honest statement (dictionary copy, owner language). */
  children: React.ReactNode;
  /** Optional action slot — a Link or compact Button row. */
  action?: React.ReactNode;
  className?: string;
}

export function HonestLine({
  tone = "status",
  children,
  action,
  className,
}: HonestLineProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-baseline gap-2 rounded-md border bg-well px-3 py-2 text-sm shadow-well",
        tone === "warning" ? "border-warning/40" : "border-border-subtle",
        className,
      )}
    >
      <Info
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0",
          tone === "warning"
            ? "text-warning"
            : "text-foreground-muted",
        )}
      />
      <span className="min-w-0 flex-1 text-foreground-secondary">{children}</span>
      {action ? (
        // ME-072 №3: the action takes its OWN row (right-aligned) — on a
        // wrapped line it used to land mid-phrase, reading as part of the
        // sentence. `w-full` forces the wrap deterministically at every
        // width; `justify-end` keeps the row-end grammar of the slot.
        <span className="flex w-full shrink-0 justify-end items-center gap-2">
          {action}
        </span>
      ) : null}
    </div>
  );
}
