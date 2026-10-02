/**
 * Historical note (owner feedback 2026-09-22): the task VIEW preference
 * ("vesmaro.tasksView", kanban vs list) existed here and redirected /tasks
 * to /tasks/list when "list" was stored — overriding explicit navigation.
 * Removed: the route is the contract («Канбан» → kanban, «Список» → list);
 * a stale key in existing browsers is ignored harmlessly. This file keeps
 * only the kanban STYLE preference (CV-5 «Группы | Классика»), which is a
 * rendering variant INSIDE /tasks, not a route choice.
 */

import { WORKFLOW_COLUMNS } from "./taskStatus";

// --- board style (CV-5 — «Группы | Классика») -------------------------------------
//
// The kanban board renders in two styles (owner feedback 1.10.2): "groups"
// (project accordions inside columns — the Ф3 default, EXACT current
// behaviour) and "classic" (flat card flow, the standard kanban canon —
// no accordions, priority→position order, roomier cards). Same route, same
// DnD, same filters — only the column's list rendering switches, so the
// choice persists locally under "vesmaro.boardStyle" instead of living in
// the URL like the kanban/list projection switch above.

export type BoardStyle = "groups" | "classic";

/** localStorage key for the board style (CV-5 owner feedback). */
export const BOARD_STYLE_STORAGE_KEY = "vesmaro.boardStyle";

/** The Ф3 default — the grouped board keeps its exact current behaviour. */
export const DEFAULT_BOARD_STYLE: BoardStyle = "groups";

export function isBoardStyle(value: unknown): value is BoardStyle {
  return value === "groups" || value === "classic";
}

/** Guarded localStorage handle — undefined outside a browser/test stub. */
function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined; // private mode / disabled storage
  }
}

/** Read the persisted board style; corrupt data falls back to "groups". */
export function loadBoardStyle(storage: Storage | undefined = safeStorage()): BoardStyle {
  if (!storage) return DEFAULT_BOARD_STYLE;
  try {
    const stored = storage.getItem(BOARD_STYLE_STORAGE_KEY);
    return isBoardStyle(stored) ? stored : DEFAULT_BOARD_STYLE;
  } catch {
    return DEFAULT_BOARD_STYLE;
  }
}

/** Persist the board style; storage failures are non-fatal. */
export function saveBoardStyle(
  style: BoardStyle,
  storage: Storage | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(BOARD_STYLE_STORAGE_KEY, style);
  } catch {
    // Swallow: the in-memory style still switches for this session.
  }
}

// --- column visibility (ME-077 — «компакт 5 / все 7») ------------------------------
//
// The kanban has 7 wire columns (WF-1); the owner's complaint (ME-077):
// seven lanes do not fit and the pre-validation pairs read as tautology.
// The VIEW mode ("compact" = the 5 workflow columns, "all" = 7) is a pure
// projection choice persisted under "vesmaro.boardColumns" — the wire
// dictionaries (store.COLUMNS / TASK_COLUMNS) stay untouched. In "all"
// mode EMPTY backlog/validating render collapsed by default (page state);
// in "compact" mode hidden-but-non-empty columns surface in an honest
// note row above the board — nothing disappears silently.

export type BoardColumnsMode = "compact" | "all";

/** localStorage key for the column visibility mode (ME-077). */
export const BOARD_COLUMNS_STORAGE_KEY = "vesmaro.boardColumns";

/** ME-077 default — "all 7" with the empty pre-validation lanes folded (the
 * acceptance's «бэклог/валидация сворачиваются по умолчанию если пусты»);
 * compact 5 is the owner's explicit one-click, persisted choice. */
export const DEFAULT_BOARD_COLUMNS_MODE: BoardColumnsMode = "all";

export function isBoardColumnsMode(value: unknown): value is BoardColumnsMode {
  return value === "compact" || value === "all";
}

/** Read the persisted column mode; corrupt data falls back to compact. */
export function loadBoardColumnsMode(
  storage: Storage | undefined = safeStorage(),
): BoardColumnsMode {
  if (!storage) return DEFAULT_BOARD_COLUMNS_MODE;
  try {
    const stored = storage.getItem(BOARD_COLUMNS_STORAGE_KEY);
    return isBoardColumnsMode(stored) ? stored : DEFAULT_BOARD_COLUMNS_MODE;
  } catch {
    return DEFAULT_BOARD_COLUMNS_MODE;
  }
}

/** Persist the column mode; storage failures are non-fatal. */
export function saveBoardColumnsMode(
  mode: BoardColumnsMode,
  storage: Storage | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(BOARD_COLUMNS_STORAGE_KEY, mode);
  } catch {
    // Swallow: the in-memory mode still switches for this session.
  }
}

/**
 * ME-077 projection over the wire column order: "compact" keeps the 5
 * workflow lanes (open → done), "all" keeps the full 7-lane wire order.
 * Pure — the board page consumes it for rendering, tests assert it
 * directly; the wire dictionary itself is never touched.
 */
export function visibleColumnsFor(
  wire: readonly string[],
  mode: BoardColumnsMode,
): string[] {
  return mode === "compact"
    ? wire.filter((column) => (WORKFLOW_COLUMNS as readonly string[]).includes(column))
    : [...wire];
}
