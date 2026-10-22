import { cn } from "@/lib/utils";
import { pageGridClass } from "@/layout/pageGrid";

/**
 * The ONE docs field (owner directive 2026-10-22, extended to the whole
 * «Документация» section; group-centered revision of the same day): EVERY
 * /docs/* surface shares the same geometry —
 *
 *   [ article 72ch | gap 32-64px | TOC 256px ]   ← the GROUP is centered
 *
 * The [article + TOC] group is centered in the field between the sidebar
 * and the window edge (the industry convention — Stripe/MDN/Next.js:
 * «On this page» sits NEXT to the content, the slack becomes equal OUTER
 * margins). At 2000px: ~335px outer fields each side; at 1280 the group
 * fills the field exactly (the article compresses, gap-8 keeps today's
 * density); below lg the field is the centered max-w-5xl reading column.
 *
 * Rail-less surfaces (hubs, category lists, not-found) center the same
 * 72ch column in the field — one reading measure everywhere, no
 * width/axis jump when navigating the section.
 *
 * The class strings are the single source of the geometry. Per page:
 *
 *   <div className={docsFieldClass()}>
 *     <div className={DOCS_GROUP_ROW}>      // article pages: article + rail
 *       <article className={DOCS_COLUMN}>   // rail-less pages: content directly
 *     </div>
 *   </div>
 */

/** The field wrapper: the "reading" regime uncapped at lg+ (the centered
 *  group owns the middle; the slack becomes the outer margins). */
export function docsFieldClass(): string {
  return cn(pageGridClass("reading"), "lg:max-w-none");
}

/**
 * The centered group row (lg+): the article and the rail sit NEXT to each
 * other — gap-8 keeps today's density at 1280, gap-16 (64px, the
 * industry-standard 40-96px band) from 2xl up — and justify-center centers
 * the whole group, so the slack splits into equal outer margins.
 */
export const DOCS_GROUP_ROW =
  "lg:flex lg:items-start lg:justify-center lg:gap-8 2xl:gap-16";

/** The centered reading column — 72ch, the same measure on every surface. */
export const DOCS_COLUMN = "mx-auto w-full max-w-scroll";

/** The TOC rail slot (w-64 shrink-0 — the rail components carry the same
 *  classes; a rail-less page simply renders no slot at all). */
export const DOCS_RAIL_SLOT = "hidden w-64 shrink-0 lg:block";
