/**
 * Pure overflow decision of the table scroll wrapper (docs-tables-width
 * §3 rules 4–5) — zero-dep module so tests and the component share ONE
 * deterministic implementation without a layout engine (and without the
 * react-refresh only-export-components warning a mixed export would carry).
 */

export interface TableOverflowState {
  /** The table is wider than its wrapper — scroll (and sticky) live. */
  overflow: boolean;
  /** Unread content remains to the right — the edge affordance shows. */
  remainder: boolean;
}

export function tableOverflowState(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): TableOverflowState {
  const overflow = scrollWidth > clientWidth;
  // 1px tolerance: integer scroll metrics flicker by a pixel at rest.
  const remainder = overflow && scrollLeft < scrollWidth - clientWidth - 1;
  return { overflow, remainder };
}
