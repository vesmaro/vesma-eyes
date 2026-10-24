import { Link } from "react-router";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/TextEngine/core/constants";

/**
 * The ONE docs card grammar (blueprint-hubs-nav-intro §2/§3): DATA cards,
 * not decorative tiles — icon (level-owned) + title (line-clamp-2) +
 * description (line-clamp-2; honest absence when empty, D-CARD-NO-DESC) +
 * mono tabular meta counters + the level footer («вы здесь» with
 * aria-current for the current object, D-CARD-CURRENT, the CTA otherwise).
 * The whole card is the route — click anywhere navigates. The анти-слоп
 * verdict stays in force as the DATA duty: every card carries its counters;
 * nothing renders a tile without content.
 */

/** The section frame of a card strip: caps label over the hairline + grid. */
export function DocCardGrid({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={label}>
      <p className="border-b border-border-subtle pb-2 text-xs font-medium text-foreground-secondary">
        {label}
      </p>
      {/* The section's 72ch reading column (docsField, owner directive
       * 2026-10-22 — one reading measure on every docs surface): a 4-card
       * DATA row cannot survive ~590px (measured — the hub-card comment),
       * so the scale here is 1/2. The blueprint's xl:grid-cols-4 belongs to
       * the pre-docsField uncapped hub; re-widening the field is a width-
       * token decision outside this wave's boundary. */}
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export interface DocCardProps {
  /** The route the whole card opens. */
  to: string;
  /** Level-owned icon (project/category glyph, FileText for pages). */
  icon: LucideIcon;
  title: string;
  /** line-clamp-2 + title attr; empty/undefined → honest absence. */
  description?: string;
  /** Mono tabular meta lines — the counters ARE the card's data (spec §2). */
  meta: React.ReactNode;
  /** D-CARD-CURRENT: aria-current=page + «вы здесь» instead of the CTA. */
  current?: boolean;
  /** Book cards keep the airier v12 well-card height. */
  tall?: boolean;
  labels: {
    /** Visible «вы здесь» for the current card. */
    here: string;
    /** Visible CTA for the other cards (aria-hidden — the link name is the
     * card's own content, the CTA row is a visual affordance only). */
    open: string;
  };
}

export function DocCard({
  to,
  icon: Icon,
  title,
  description,
  meta,
  current = false,
  tall = false,
  labels,
}: DocCardProps) {
  return (
    <Link
      to={to}
      aria-current={current ? "page" : undefined}
      className={cn(
        "group flex flex-col gap-3 rounded-lg border bg-well p-5 shadow-well transition-colors duration-instant",
        tall && "min-h-60",
        current ? "border-iris" : "border-border-subtle hover:border-border",
        FOCUS_RING,
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Icon
          className="mt-0.5 size-5 shrink-0 text-foreground-secondary"
          aria-hidden="true"
        />
        <h3
          className={cn(
            "min-w-0 line-clamp-2 text-base font-semibold text-foreground",
            // The featured «слово»: the current object's title is the one
            // Lora display on the strip (the v12 hub-card canon).
            current && "font-scroll text-lg",
          )}
          title={title}
        >
          {title}
        </h3>
      </div>
      <hr className="border-border-subtle" />
      {description ? (
        <p
          className="line-clamp-2 text-sm leading-relaxed text-foreground-secondary"
          title={description}
        >
          {description}
        </p>
      ) : null}
      <div className="grid gap-1 font-mono text-xs tabular-nums text-foreground-secondary">
        {meta}
      </div>
      {current ? (
        <p className="mt-auto text-xs text-foreground-muted">{labels.here}</p>
      ) : (
        <span
          aria-hidden="true"
          className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-foreground-secondary transition-colors duration-instant group-hover:text-iris-bright"
        >
          {labels.open}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </span>
      )}
    </Link>
  );
}
