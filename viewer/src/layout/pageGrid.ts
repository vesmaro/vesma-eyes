import { cn } from "@/lib/utils";

/**
 * The ONE page grid (ME-072 polish wave A): every Shell page renders its root
 * through this helper, so section H1s share a left edge within a regime.
 * Two density regimes, no new tokens — the classes compose existing
 * Tailwind scale names only:
 *
 * - "showcase" (витринный — Обзор, Память/*): a centered max-w-4xl column.
 *   Reading-first surfaces keep the airy measure regardless of viewport.
 * - "operational" (операционный — Задачи, Агенты, Кора, /system/*, Доки):
 *   the full content width; dense tool surfaces use the whole board.
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
export type PageDensity = "showcase" | "operational";

const PAGE_GRID: Record<PageDensity, string> = {
  showcase: "mx-auto w-full max-w-4xl",
  operational: "w-full",
};

export function pageGridClass(
  density: PageDensity = "operational",
  extra?: string,
): string {
  return cn(PAGE_GRID[density], extra);
}
