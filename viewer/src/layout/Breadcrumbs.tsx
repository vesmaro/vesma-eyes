import { useMemo } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { openPalette } from "@/lib/paletteState";
import { resolveReturnTarget } from "@/lib/returnParams";
import { crumbsFor, routeTitle, type Crumb } from "./navItems";

/**
 * Breadcrumbs (union И1, stand 03 §5 over the main patterns): the 40px crumb
 * row lives on EVERY page — the root («Обзор») shows its single crumb, so
 * the row's right-side ⌘K palette affordance has a home everywhere. The LAST
 * crumb is plain text with aria-current="page", every crumb above it is a
 * link; the separator is the stand's «/» in muted.
 *
 * UI-18 (context back-nav spec §3 — a main pattern, kept): on DETAIL pages
 * the trail is led by the back control — a context link to the `?return=`
 * source (or the master list on direct open), labelled with the target's
 * route title. The trail itself shrinks to «домен › сущность»: the middle
 * section crumb («Список» → /tasks — the confirmed lie, spec §0) loses its
 * job to the control and is dropped here at the render point — navItems.ts
 * owns the list-level mapping and stays untouched.
 *
 * Detail discriminator: a level-3 detail page is the only shape whose
 * crumbsFor trail is 3 crumbs deep (domain › section › entity) — list pages
 * sit at 2, and `/memory/search|pulse|tags`, `/tasks/list|inbox|archive`
 * must never read as details. Docs are excluded: they carry their own
 * prev/next affordance and are out of the spec's scope (§6).
 */

/** A detail page = a 3-crumb trail; docs trails never qualify. */
function isDetailTrail(pathname: string, crumbs: Crumb[]): boolean {
  return crumbs.length >= 3 && !pathname.startsWith("/docs");
}

/** Trail shortened to «domain › entity» on detail pages (spec §3.1). */
function detailTrail(crumbs: Crumb[]): Crumb[] {
  return crumbs.length >= 3 ? [crumbs[0], crumbs[crumbs.length - 1]] : crumbs;
}

/** The root's single crumb (stand 03 §5: the row never disappears). */
const ROOT_CRUMB: Crumb = { key: "nav.overview" };

export function Breadcrumbs({ pathname, search }: { pathname: string; search: string }) {
  const t = useT();
  const full = crumbsFor(pathname);
  if (full.length === 0 && pathname !== "/") return null;
  const detail = isDetailTrail(pathname, full);
  const crumbs = full.length === 0 ? [ROOT_CRUMB] : detail ? detailTrail(full) : full;
  // Direct-open fallback (spec §3.1: /tasks · /memory · /system/sessions):
  // the dropped middle crumb's target IS the master list — the address the
  // control inherits when `return` is absent or invalid.
  const fallback = full[1]?.to ?? full[0]?.to ?? "/";

  return (
    // ME-072 C: the back control and the trail sit on ONE row with a FIXED
    // spacing-token gap (gap-4, was gap-2) — at 8px «‹ Канбан» and the trail's
    // first crumb read as one glued phrase; 16px is the stand's row gap.
    <div className="flex h-crumbs min-w-0 flex-1 items-center gap-4">
      {detail ? <BackControl pathname={pathname} search={search} fallback={fallback} /> : null}
      <nav aria-label={t("breadcrumbs.label")} className="min-w-0">
        <ol className="flex min-w-0 items-center gap-2 text-sm">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <li
                key={`${crumb.key ?? crumb.label}-${index}`}
                className="flex min-w-0 items-center gap-2"
              >
                {index > 0 ? (
                  // The stand's «/» separator (03 §5), muted.
                  <span aria-hidden="true" className="shrink-0 text-foreground-muted">
                    /
                  </span>
                ) : null}
                {crumb.to && crumb.key && !last ? (
                  <Link
                    to={crumb.to}
                    className="inline-flex min-h-6 items-center rounded-sm text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {t(crumb.key)}
                  </Link>
                ) : (
                  <span
                    aria-current="page"
                    className="inline-flex min-h-6 items-center truncate font-medium text-foreground"
                  >
                    {crumb.label ?? (crumb.key ? t(crumb.key) : "")}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <span className="flex-1" aria-hidden="true" />
      {/* The crumbs-row palette affordance (stand 03 §2): kbd + label, the
       * canonical ⌘K/Ctrl+K hint — the same openPalette engine as everywhere. */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => openPalette("button")}
        aria-label={t("cmdk.openAria")}
        aria-haspopup="dialog"
        className="h-7 shrink-0 gap-1.5 px-2 text-xs"
      >
        <kbd className="rounded-sm border border-border-subtle border-b-2 bg-elevated px-1 font-mono text-caps text-foreground-secondary">
          Ctrl
        </kbd>
        <kbd className="rounded-sm border border-border-subtle border-b-2 bg-elevated px-1 font-mono text-caps text-foreground-secondary">
          K
        </kbd>
        <span className="hidden sm:inline">{t("nav.palette")}</span>
      </Button>
    </div>
  );
}

/**
 * The back control (UI-18 spec §3): ALWAYS rendered on detail pages — a Link
 * (never a button) whose target is the validated `?return=` source, else the
 * master list (direct open / bookmark / invalid param — spec §2.3). The
 * accessible name carries the destination («Назад: {place}», WCAG 2.4.4),
 * the visible label hides on narrow screens while the ≥24px icon target
 * stays (2.5.8). Ghost styling = the existing TagDrillView pattern — zero
 * new tokens.
 */
function BackControl({
  pathname,
  search,
  fallback,
}: {
  pathname: string;
  search: string;
  fallback: string;
}) {
  const t = useT();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const target =
    resolveReturnTarget({
      searchParams,
      currentPathname: pathname,
      currentSearch: search,
    }) ?? fallback;
  const queryStart = target.indexOf("?");
  const targetPathname = queryStart === -1 ? target : target.slice(0, queryStart);
  const place = routeTitle(targetPathname, t) ?? t("nav.backFallback");
  return (
    <Link
      to={target}
      aria-label={t("nav.backTo", { place })}
      className="inline-flex min-h-6 min-w-6 shrink-0 items-center gap-1 rounded-sm text-sm text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline">{place}</span>
    </Link>
  );
}
