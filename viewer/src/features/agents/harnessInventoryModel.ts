import type { HarnessInventoryEnvironment } from "@/gateway/boardTypes";

/**
 * ME-064 pure projections over the `harness_inventory` snapshot
 * (agents-ui-spec §3.1/§3.2): the four dropdown categories, their FULL
 * counters and the honest overflow line. The payload is AGENT-reported
 * (advisory mirror, never authority) — every field is narrowed
 * defensively: a buggy agent degrades to honest smaller facts, never to
 * a crash or a fabricated number.
 */

/** The four inventory categories (spec §3.2; the caps live server-side). */
export type InventoryCategoryKey =
  "specialists" | "skills" | "plugins" | "instructions";

export interface InventoryCategory {
  readonly key: InventoryCategoryKey;
  /** Server-capped name list (50/50/30/30) — may be shorter than `count`. */
  readonly names: readonly string[];
  /** The FULL counter (always the agent's own honest report). */
  readonly count: number;
  /** `count - names.length` — the «…и ещё N» overflow, ≥ 0 by construction. */
  readonly overflow: number;
}

/** String-coerce a wire list: non-strings drop, survivors stay verbatim. */
function narrowNames(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((name): name is string => typeof name === "string");
}

/**
 * Counter precedence: the explicit `<key>_count` when it is a finite
 * non-negative number, else the (possibly capped) name list length —
 * a count can never invent names the agent did not send.
 */
function narrowCount(value: unknown, names: readonly string[]): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : names.length;
}

function categoryOf(
  capabilities: Readonly<Record<string, unknown>>,
  key: InventoryCategoryKey,
): InventoryCategory {
  const names = narrowNames(capabilities[key]);
  const count = Math.max(
    narrowCount(capabilities[`${key}_count`], names),
    names.length,
  );
  return { key, names, count, overflow: count - names.length };
}

/**
 * The four categories of ONE environment, always in the fixed order —
 * the spec's «специалисты · скиллы · плагины · инструкции» reading order.
 */
export function inventoryCategories(
  env: HarnessInventoryEnvironment,
): readonly InventoryCategory[] {
  const capabilities = env.capabilities;
  if (capabilities === undefined || capabilities === null) {
    return (
      [
        ["specialists", []],
        ["skills", []],
        ["plugins", []],
        ["instructions", []],
      ] as const
    ).map(([key, names]) => ({
      key,
      names,
      count: 0,
      overflow: 0,
    }));
  }
  return (["specialists", "skills", "plugins", "instructions"] as const).map((key) =>
    categoryOf(capabilities, key),
  );
}

/**
 * The gcw-* share of the specialists counter (spec §3.2:
 * «специалисты +счётчик +доля gcw-*»). null when the agent sent no
 * `gcw_specialists_count` — an honest absence, never a derived guess.
 */
export function gcwSpecialistsCount(env: HarnessInventoryEnvironment): number | null {
  const value = env.capabilities?.gcw_specialists_count;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}
