import type { SearchResult } from "@/gateway/types";
import type { ExecutorItem } from "@/gateway/boardTypes";
import type { BoardTask } from "@/gateway/boardTypes";
import { UNREPORTED_HOST_ID } from "@/features/agents/rosterModel";

/**
 * Pure model of the command palette (UX-overhaul §7.3, Ф2): item records,
 * the honest section order (Память → Задачи → Агенты → Переход — memory
 * keeps the old `/` promise), client-side filtering for the LOCAL indexes
 * (board tasks, executor registry, navigation routes) and the flattened
 * selection math for the ↑/↓ keyboard walk. No React, no DOM — everything
 * here is exhaustively unit-testable in the node env; the dialog wiring
 * lives in CommandPalette.tsx.
 *
 * Ranking honesty (spec self-review §12c): a client-side substring index —
 * no server-side ranking is promised, the sections stay labelled and honest.
 */

/** The four honest result sections, in render order (memory first — the
 * «/» hotkey's original promise was memory search). */
export const PALETTE_GROUPS = ["memory", "tasks", "agents", "nav"] as const;

export type PaletteGroupId = (typeof PALETTE_GROUPS)[number];

/** One selectable palette row. `to` is a navigate target, built WITH the
 * `return=` context where the destination is a detail page (UI-18). */
export interface PaletteItem {
  /** Stable id for the aria-activedescendant wiring (`{group}:{key}`). */
  readonly id: string;
  readonly group: PaletteGroupId;
  /** Primary label (task title, executor name, route name). */
  readonly label: string;
  /** Secondary line: provenance («где лежит»), route hint, executor host. */
  readonly hint?: string;
  /** Navigate target (react-router `to`). */
  readonly to: string;
}

// --- local indexes ------------------------------------------------------------

/** Case-insensitive substring match over a lowercase haystack ("" matches all). */
function matches(query: string, haystack: string): boolean {
  if (query === "") return true;
  return haystack.toLowerCase().includes(query);
}

/** Board tasks filtered by id+title; capped (the wire is small, the cap keeps
 * the palette one screen tall). Empty query = no task rows (the palette opens
 * on navigation, not on a task dump). */
export function filterTaskItems(
  tasks: readonly BoardTask[],
  query: string,
  buildTo: (taskId: string) => string,
  cap = 6,
): PaletteItem[] {
  if (query === "") return [];
  const q = query.toLowerCase();
  return tasks
    .filter((task) => matches(q, `${task.id} ${task.title}`))
    .slice(0, cap)
    .map((task) => ({
      id: `tasks:${task.id}`,
      group: "tasks" as const,
      label: task.title || task.id,
      hint: task.id,
      to: buildTo(task.id),
    }));
}

/** Executor registry filtered by name/host/id/harness — APPROVED rows only
 * (pending/revoked are not agents yet; the roster is the palette's promise).
 * Empty query = no rows, same rule as tasks. */
export function filterExecutorItems(
  executors: readonly ExecutorItem[],
  query: string,
  cap = 6,
): PaletteItem[] {
  if (query === "") return [];
  const q = query.toLowerCase();
  return executors
    .filter((executor) => executor.state === "approved")
    .filter((executor) =>
      matches(q, `${executor.id} ${executor.name} ${executor.host} ${executor.harness}`),
    )
    .slice(0, cap)
    .map((executor) => ({
      id: `agents:${executor.id}`,
      group: "agents" as const,
      label: executor.name || executor.id,
      hint: executor.host,
      // agents-redesign B1: the executor lives on its HOST's page (the
      // field workbench); the unreported bucket rides the sentinel id.
      to: `/agents/hosts/${encodeURIComponent(
        executor.host === "" ? UNREPORTED_HOST_ID : executor.host,
      )}`,
    }));
}

/** Memory hits from the existing search endpoint, capped; the hint carries
 * the PROVENANCE — which store the hit lives in (rendered only when the
 * wire named it, honest absence otherwise). */
export function memoryHitItems(
  hits: readonly SearchResult[],
  buildTo: (memoryId: string) => string,
  cap = 5,
): PaletteItem[] {
  return hits.slice(0, cap).map((hit) => ({
    id: `memory:${hit.id}`,
    group: "memory" as const,
    label: hit.title || hit.id,
    hint: hit.server,
    to: buildTo(hit.id),
  }));
}

/**
 * agents-redesign C2: the HOST commands («хост <имя>» in the palette) — one
 * row per host group, opening the field workbench directly. The caller
 * passes the localized label template («Хост {{host}}») — this module stays
 * i18n-free; the interpolation is the plain {{var}} replace.
 */
export interface HostPaletteHost {
  /** The route id (rosterModel.hostRouteId — the __unreported__ sentinel). */
  readonly id: string;
  readonly host: string;
  readonly online: number;
  readonly total: number;
}

export function hostPaletteItems(
  hosts: readonly HostPaletteHost[],
  query: string,
  labelTemplate: string,
  cap = 6,
): PaletteItem[] {
  if (query === "") return [];
  const q = query.toLowerCase();
  return hosts
    .map((host) => ({
      id: `agents:host:${host.id}`,
      group: "agents" as const,
      label: labelTemplate.replace("{{host}}", host.host),
      hint: `${host.online}/${host.total}`,
      to: `/agents/hosts/${encodeURIComponent(host.id)}`,
    }))
    .filter((item) => matches(q, `${item.label} ${item.to}`))
    .slice(0, cap);
}

// --- selection walk -----------------------------------------------------------

export interface PaletteGroup {
  readonly group: PaletteGroupId;
  readonly items: PaletteItem[];
}

/**
 * Order the rows into the honest section order, dropping empty sections
 * (a section that has nothing to say does not render — the anti-dashboard
 * rule applies to the palette too). Within a group the data order stays.
 */
export function groupItems(items: readonly PaletteItem[]): PaletteGroup[] {
  return PALETTE_GROUPS.flatMap((group) => {
    const groupItems = items.filter((item) => item.group === group);
    return groupItems.length > 0 ? [{ group, items: groupItems }] : [];
  });
}

/** The flattened keyboard-walk order: section order, then data order. */
export function flattenGroups(items: readonly PaletteItem[]): PaletteItem[] {
  return groupItems(items).flatMap((entry) => entry.items);
}

/**
 * Move the active index by delta with WRAP-AROUND (the palette is a ring:
 * down from the last row lands on the first). Empty list → 0 (no selection).
 */
export function moveSelection(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  const next = (index + delta) % length;
  return next < 0 ? next + length : next;
}

/** Clamp an active index after the list shrinks/grows under the cursor
 * (query typing) — keeps aria-activedescendant in bounds. */
export function clampSelection(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(index, length - 1);
}
