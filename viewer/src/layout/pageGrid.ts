import { cn } from "@/lib/utils";

/**
 * The ONE page grid (ME-072 polish wave A): every Shell page renders its root
 * through this helper, so section H1s share a left edge within a regime.
 * Three density regimes, no new tokens — the classes compose existing
 * Tailwind scale names only:
 *
 * - "showcase" (витринный — Обзор, Память/*): a centered max-w-4xl column.
 *   Reading-first surfaces keep the airy measure regardless of viewport.
 * - "operational" (операционный — Задачи, Агенты, Кора, /system/*): the full
 *   content width; dense tool surfaces use the whole board.
 * - "reading" (читальный — Доки; owner directive 2026-10-21): a centered
 *   max-w-5xl column. Doc text must sit centered in the central field, not
 *   pressed against the sidebar — but the READING MEASURE is pinned: at lg+
 *   the article shares the column with the TOC rail (16rem + gap), which
 *   keeps the text block at today's ~730px instead of narrowing it. Below
 *   the max-width the column is simply full width (narrow screens).
 *
 * Side fields are owned ONCE by the Shell (`main` p-6) and the crumb row
 * (px-4 md:px-8) — neither the regime nor a page adds its own horizontal
 * padding, and the top/bottom fields come from the same main padding, so
 * every page shares them. Within a regime every H1 lands on the same x at
 * any viewport ≥ md (the gate: 1440 measurement).
 *
 * `extra` carries the page's own vertical rhythm (space-y-*) — geometry
 * lives here, rhythm stays with the page.
 */
export type PageDensity = "showcase" | "operational" | "reading";

const PAGE_GRID: Record<PageDensity, string> = {
  showcase: "mx-auto w-full max-w-4xl",
  operational: "w-full",
  reading: "mx-auto w-full max-w-5xl",
};

export function pageGridClass(
  density: PageDensity = "operational",
  extra?: string,
): string {
  return cn(PAGE_GRID[density], extra);
}
