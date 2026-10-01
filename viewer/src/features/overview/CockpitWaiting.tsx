import { Link } from "react-router";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { useT } from "@/i18n";
import { useWaitingSummary } from "./useWaitingSummary";

/**
 * «Что ждёт меня» — the cockpit's waiting block (UX-overhaul §3 + persona
 * round 1, Ф2): ONE summary number-action — how much is waiting in total
 * (inbox + tasks sitting in «на проверке» + queued runs) — whose click
 * leads to the MOST URGENT list (inbox → review → queue), with the quiet
 * per-source rows as links under it (each figure leads to its list, §9.1).
 * The owner's language: «на проверке», never the internal «validating».
 *
 * The counts live in useWaitingSummary (blueprint §6.6) — shared with the
 * hero's waiting chip so both read the same numbers from the same cache.
 *
 * Anti-dashboard rules: the block renders only when the total is non-zero;
 * empty sources contribute nothing; a first-load renders a same-height
 * skeleton; an error renders an HonestLine with a retry — never a silent
 * disappearance. The block needs BOTH capabilities (task + agents): with
 * fewer, the honest state is absence (the real adapter matrix always has
 * both or neither).
 *
 * Review P3-2/P3-5 (conscious spec deviation, report to the spec): a source
 * error renders the WHOLE block as one HonestLine — no §9.1-style partial
 * rendering. A partial sum here would be a SILENT UNDERCOUNT (the owner
 * sees "waiting: 2" while the wire just failed to say 5), which is exactly
 * the dishonesty the cockpit exists to prevent; the error line with a
 * retry is the honest state instead.
 */
export function CockpitWaiting() {
  const t = useT();
  const waiting = useWaitingSummary();

  if (!waiting.capable) return null;

  if (waiting.isPending) {
    return (
      <section aria-labelledby="overview-waiting-title" className="space-y-3">
        <h2 id="overview-waiting-title" className="text-lg font-semibold text-foreground">
          {t("cockpit.waitingTitle")}
        </h2>
        <div role="status" aria-label={t("cockpit.waitingTitle")}>
          <Skeleton className="h-8 w-full max-w-xs" />
        </div>
      </section>
    );
  }

  if (waiting.isError) {
    return (
      <section aria-labelledby="overview-waiting-title" className="space-y-3">
        <h2 id="overview-waiting-title" className="text-lg font-semibold text-foreground">
          {t("cockpit.waitingTitle")}
        </h2>
        <HonestLine
          tone="warning"
          action={
            <button
              type="button"
              onClick={waiting.retry}
              className="inline-flex min-h-6 items-center gap-1 text-sm font-medium text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              {t("cockpit.retry")}
            </button>
          }
        >
          {t("cockpit.waitingError")}
        </HonestLine>
      </section>
    );
  }

  // Anti-dashboard: nothing waits — nothing renders.
  if (waiting.total === 0) return null;

  return (
    <section aria-labelledby="overview-waiting-title" className="space-y-3">
      <h2 id="overview-waiting-title" className="text-lg font-semibold text-foreground">
        {t("cockpit.waitingTitle")}
      </h2>
      <Link
        to={waiting.urgentTo}
        title={t("cockpit.waitingSummaryTitle")}
        className="inline-flex min-h-row-airy items-center gap-2 rounded-md border border-border-subtle bg-well px-4 shadow-well transition-colors duration-instant hover:border-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span className="font-mono text-2xl font-semibold text-iris-bright">
          {waiting.total}
        </span>
        <span className="text-sm font-medium text-foreground">
          {t("cockpit.waitingSummary", { count: waiting.total })}
        </span>
        <ArrowRight className="size-4 text-foreground-secondary" aria-hidden="true" />
      </Link>
      {/* Quiet per-source rows — each figure leads to its own list (§9.1);
       * a zero source renders no row (no counters for the sake of it). */}
      <ul className="flex flex-col gap-1 text-sm">
        {waiting.inboxCount > 0 ? (
          <li>
            <QuietRowLink to="/tasks/inbox">
              {t("cockpit.waitingInbox", { count: waiting.inboxCount })}
            </QuietRowLink>
          </li>
        ) : null}
        {waiting.reviewCount > 0 ? (
          <li>
            <QuietRowLink to="/tasks">
              {t("cockpit.waitingReview", { count: waiting.reviewCount })}
            </QuietRowLink>
          </li>
        ) : null}
        {waiting.queuedCount > 0 ? (
          <li>
            <QuietRowLink to="/agents/execution">
              {t("cockpit.waitingQueued", { count: waiting.queuedCount })}
            </QuietRowLink>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function QuietRowLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-6 items-center gap-1 text-foreground-secondary transition-colors duration-instant hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {children}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}
