import { cn } from "@/lib/utils";
import { pageGridClass } from "@/layout/pageGrid";

/**
 * The ONE docs field (owner directive 2026-10-22, extended to the whole
 * «Документация» section; group-centered revision of the same day): EVERY
 * /docs/* surface shares the same geometry —
 *
 *   [ article 80ch | gap 32-64px | TOC 256px ]   ← the GROUP is centered
 *
 * The [article + TOC] group is centered in the field between the sidebar
 * and the window edge (the industry convention — Stripe/MDN/Next.js:
 * «On this page» sits NEXT to the content, the slack becomes equal OUTER
 * margins). At 2000px: ~335px outer fields each side; at 1280 the group
 * fills the field exactly (the article compresses, gap-8 keeps today's
 * density); below lg the field is the centered max-w-6xl reading column.
 *
 * The article measure is `--measure-docs: 80ch` (docs-tables-width W2,
 * blueprint §4 — the wider measure lets reference tables fit without
 * scroll more often; `--measure-scroll` stays 72ch for Kora/Memory).
 *
 * docs-a4-field (owner directive 2026-10-24, blueprint §4 amendment —
 * «поле информационное чуть расширить … до базового формата А4»): the
 * article SLOT grows to `min(1123px, field − rail − gap)` — the
 * A4-landscape ceiling `--docs-field-max` (global.css, viewer-only layout
 * arithmetic) mapped as `max-w-docs-field`; flexbox supplies the minus-
 * rail half (the article is a shrappable `min-w-0` flex item — no shell
 * arithmetic, no breakpoint table). PROSE stays at the 80ch measure via
 * the ONE `.docs-article` clamp rule in global.css; tables (TableScroll),
 * mermaid diagrams and wide code blocks take the full slot — the wide
 * zone the ceiling exists for. Rail-less surfaces keep the centered 80ch
 * column: prose reads at the same measure on every docs surface, and
 * they carry no wide blocks.
 *
 * Rail-less surfaces (hubs, category lists, not-found) center the same
 * 80ch column in the field — one reading measure everywhere, no
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
 *
 * NO `items-start` here (regression fix, prod 1.83.0 acceptance): flex
 * default `stretch` is LOAD-BEARING — it pulls the rail's aside to the
 * full row (= article) height, and the aside's inner `sticky top-28`
 * block then has a range covering the whole article. With items-start the
 * aside shrank to its content (~600-870px), the sticky range ended after
 * the first screenful and the «На этой странице» rail scrolled away for
 * the rest of a 20k-px page (measured: sticky top −4055 at scrollY 4167).
 * Stretch does not stretch the visible sticky block — only its scroll
 * range.
 */
export const DOCS_GROUP_ROW =
  "lg:flex lg:justify-center lg:gap-8 2xl:gap-16";

/** The centered reading column — the docs measure (--measure-docs, 80ch),
 *  the same measure on every surface. */
export const DOCS_COLUMN = "mx-auto w-full max-w-docs";

/**
 * The article slot of the group row (docs-a4-field): a shrappable flex
 * ITEM that grows to the A4-landscape ceiling (`max-w-docs-field` =
 * var(--docs-field-max), 1123px) and below it fills the field minus rail
 * minus gap — flex shrink with `min-w-0` IS the «minus rail» clause, so
 * the degradation under the cap is the algorithm's default (already
 * battle-tested at 1280). `w-full` pins the flex basis so the slot never
 * collapse-sizes to table max-content. The `docs-article` class arms the
 * global.css prose clamp (prose → --measure-docs; wide blocks inherit the
 * full slot). NO mx-auto (same reason as before: auto margins would
 * absorb the group's slack and defeat justify-center — measured, 1.83.0).
 * Below lg the row is a block and the slot fills the field (the ceiling
 * never binds under 1024px viewports).
 */
export const DOCS_ARTICLE = "docs-article min-w-0 w-full max-w-docs-field";

/** The TOC rail slot (w-64 shrink-0 — the rail components carry the same
 *  classes; a rail-less page simply renders no slot at all). */
export const DOCS_RAIL_SLOT = "hidden w-64 shrink-0 lg:block";
