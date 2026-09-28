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
        "flex flex-wrap items-center gap-2 rounded-md border bg-well px-3 py-2 text-sm shadow-well",
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
        <span className="flex shrink-0 items-center gap-2">{action}</span>
      ) : null}
    </div>
  );
}
