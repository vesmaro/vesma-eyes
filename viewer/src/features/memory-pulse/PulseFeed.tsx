import { Link } from "react-router";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TagBadge } from "@/components/TagBadge/TagBadge";
import { TextEngine } from "@/components/TextEngine";
import {
  formatTimestamp,
  memoryHumanFace,
} from "@/components/memory/memoryDisplay";
import { statusBadgeVariant, statusLabelKey } from "@/components/memory/memoryBadges";
import type { MemoryPulseItem, MemoryPulseServerNote } from "@/gateway/boardTypes";
import { useT } from "@/i18n";
import { withReturn } from "@/lib/returnParams";
import { cn } from "@/lib/utils";

/**
 * Pulse feed rows (redesign concept §4.2 "Live-лента"): recency order, the
 * store badge first (provenance — a merge-feed row is meaningless without
 * its origin), status + tags inline, timestamp right. Airy by design
 * (§3.3): rows consume --row-h-airy and never shrink with the density
 * toggle — the pulse is a contemplative surface.
 *
 * When the server carries a content fragment, it renders under the title
 * through TextEngine (UI-27) — untrusted author text, never a raw
 * interpolation; absent fragment = honest absence (no placeholder). A row
 * with a fragment is a two-block row, so it top-aligns (badge/status/time
 * hang from the title line); fragment-less rows keep the centered single
 * line. Both keep the airy min height.
 */
export interface PulseFeedProps {
  items: readonly MemoryPulseItem[];
  perServer?: readonly MemoryPulseServerNote[];
  /** Compact cut for the Overview block (no tags, fewer hints). */
  compact?: boolean;
  className?: string;
  /**
   * UI-18 pair 10: source list location (pathname + search) for the
   * `return=` param on row links. Absent (the Overview block) — canonical
   * bare `/memory/:id` links, unchanged (spec §2.2 rule 6).
   */
  returnSource?: { pathname: string; search: string };
}

/**
 * ME-072 C: raw memories often carry the title as their body's first line —
 * the card then read the title twice. If the body STARTS with the exact
 * title (case- and whitespace-normalized), the prefix goes; anything else
 * passes through verbatim. No smarter heuristics: a partial or paraphrased
 * overlap stays as-is (the honest cut is the provable one).
 */
function withoutDuplicatedTitle(title: string, content: string): string {
  if (!title.trim() || !content) return content;
  const pattern = title
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return content.replace(new RegExp(`^${pattern}\\s*`, "i"), "");
}

/**
 * ME-072 C: the two lifecycle words a feed reader actually stumbles on get
 * a human explanation (title/aria on the badge); the rest keep the bare
 * word — an unexplained badge beats a guessed explanation.
 */
function statusHintKey(status: string): "memstatus.processedHint" | "memstatus.publishedHint" | null {
  switch (status) {
    case "processed":
      return "memstatus.processedHint";
    case "published":
      return "memstatus.publishedHint";
    default:
      return null;
  }
}

/** The row's status badge: word + (for processed/published) the human
 * explanation riding title/aria-label (ME-072 C — no legend block). */
function PulseStatusBadge({ status }: { status: string }) {
  const t = useT();
  const hintKey = statusHintKey(status);
  const label = t(statusLabelKey(status));
  return (
    <Badge
      variant={statusBadgeVariant(status)}
      className="shrink-0"
      title={hintKey ? t(hintKey) : undefined}
      aria-label={hintKey ? `${label}: ${t(hintKey)}` : undefined}
    >
      {label}
    </Badge>
  );
}

export function PulseFeed({
  items,
  perServer,
  compact = false,
  className,
  returnSource,
}: PulseFeedProps) {
  const t = useT();
  const degraded = (perServer ?? []).filter((note) => !note.ok);
  return (
    <div className={cn("space-y-2", className)}>
      {degraded.length > 0 ? (
        // W-A (D2): the alarm is no longer a dead end — it names the exit.
        // The whole strip stays the status announcement; the link inside
        // leads to /system/status#stores (the same health wire this feed's
        // per-server notes come from), where each store's state is laid out.
        <p
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-warning-tint bg-warning-tint p-3 text-xs text-foreground-secondary"
          role="status"
        >
          <TriangleAlert
            className="size-3.5 shrink-0 text-warning"
            aria-hidden="true"
          />
          <span className="min-w-0">
            {t("pulse.degradedStores", {
              servers: degraded.map((note) => note.server).join(", "),
            })}
          </span>
          <Link
            to="/system/status#stores"
            className="inline-flex min-h-12 md:min-h-6 items-center gap-1 font-medium text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {t("pulse.degradedStoresAction")}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </p>
      ) : null}
      <ul className="list-none space-y-list-gap" aria-label={t("pulse.feedLabel")}>
        {items.map((item, index) => {
          // A fragment turns the row into a title+body block: top-align the
          // chrome so the provenance badge hangs from the title line.
          // ME-072 C: a body that merely repeats the title renders nothing —
          // the honest single-line row, not a doubled heading.
          // D7: a bare "User" speaker title gets the mined human headline
          // and the machine-dump head goes under the fold (same rules as the
          // list/search faces — one headline policy across the domain).
          const face = memoryHumanFace({ title: item.title, content: item.content ?? "" });
          const displayTitle = face ? face.headline : item.title;
          const body = face
            ? (face.preview ?? "")
            : typeof item.content === "string"
              ? withoutDuplicatedTitle(item.title, item.content).trim()
              : "";
          const hasContent = body.length > 0;
          return (
            <li
              key={`${item.server}:${item.id}:${index}`}
              className={cn(
                // D7 responsive: on narrow screens the status badge and the
                // timestamp wrap under the text instead of squeezing the
                // content column to a word-per-line sliver. md keeps the
                // canonical single-line row (flex-basis 0 = the old flex-1).
                "flex min-h-row-airy flex-wrap gap-3 rounded-md border border-border-subtle bg-well px-4 py-2 shadow-well",
                hasContent ? "items-start" : "items-center",
              )}
            >
              {/* Provenance badge — mono, first class citizen (ADR 0004 D4). */}
              <Badge variant="outline" className="shrink-0 font-mono text-xs">
                {item.server}
              </Badge>
              <div className="min-w-0 flex-[1_1_14rem] md:flex-[1_1_0%]">
                <Link
                  to={
                    returnSource
                      ? withReturn(
                          `/memory/${encodeURIComponent(item.id)}`,
                          returnSource.pathname,
                          returnSource.search,
                        )
                      : `/memory/${encodeURIComponent(item.id)}`
                  }
                  className="inline-flex min-h-12 md:min-h-6 items-center font-scroll text-sm font-semibold leading-snug hover:text-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {displayTitle || t("pulse.untitled")}
                </Link>
                {hasContent ? (
                  // UI-27: fragment renders through the TextEngine primitive
                  // (plain passthrough or lazy markdown chunk); `clamp` adds
                  // «показать полностью» only on real measured overflow.
                  <TextEngine
                    text={body}
                    variant="compact"
                    clamp
                    className="mt-1 font-scroll text-sm leading-relaxed text-foreground-secondary"
                  />
                ) : null}
                {!compact && item.tags.length > 0 ? (
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {item.tags.slice(0, 4).map((tag) => (
                      <TagBadge key={tag} tag={tag} />
                    ))}
                  </p>
                ) : null}
              </div>
              {/* ME-072 C: the status word carries its human explanation in
               * title/aria-label — a permanent legend block was deliberately
               * NOT added (the caveat asked for context, not chrome). */}
              <PulseStatusBadge status={item.status} />
              <time
                dateTime={item.created_at || undefined}
                className="shrink-0 text-xs text-foreground-secondary"
              >
                {formatTimestamp(item.created_at || undefined)}
              </time>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Loading skeleton for the pulse surfaces (same airy row rhythm). */
export function PulseSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-list-gap" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex min-h-row-airy items-center gap-3 rounded-md border border-border-subtle bg-well px-4 py-2"
        >
          <Skeleton className="h-5 w-20 shrink-0" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}
