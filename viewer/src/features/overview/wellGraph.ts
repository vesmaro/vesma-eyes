/**
 * Pure layout for the Overview well canvas (blueprint §12.3): nodes are REAL
 * memories, edges are their real derived_from links — «the design is the
 * product demo», data-as-decoration is the only imagery route (§5.4).
 * No React, no DOM, no randomness beyond the stable id hash — everything is
 * unit-testable and every render of the same data draws the same well.
 *
 * Honesty gate («light = data», blueprint §1): with no memories there are no
 * nodes — the hero renders its honest empty state instead of a decorative
 * graph. Positions never imply data that is not on the wire.
 */

/** Canvas viewBox space — the component scales it responsively. */
export const WELL_VIEW_W = 1000;
export const WELL_VIEW_H = 620;

/** The upper band stays sparse — «зеркало воды» (water mirror) per §5. */
const TOP_MARGIN = 0.16 * WELL_VIEW_H;
const BOTTOM_MARGIN = 0.06 * WELL_VIEW_H;
const X_MARGIN = 0.04 * WELL_VIEW_W;

/** Hard caps: the hero is a composition, not the whole list wire. */
export const WELL_NODE_CAP = 42;
export const WELL_EDGE_CAP = 30;

export interface WellNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Depth band 0..8 for the awakening cascade (0 = deepest). */
  readonly band: number;
  /** Hub nodes (≥2 links) read slightly brighter. */
  readonly hub: boolean;
}

export interface WellEdge {
  readonly from: WellNode;
  readonly to: WellNode;
}

export interface WellGraphInput {
  /** Minimal memory projection the layout needs. */
  readonly memories: readonly {
    id: string;
    created_at: string;
    derived_from?: readonly string[] | null;
  }[];
}

/** Deterministic 0..1 hash — the well draws identically for identical data. */
function stableUnit(id: string, salt: number): number {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

/** Depth band for the awakening cascade: 0 = deepest (surfaces first). */
export function depthBand(rank: number, total: number): number {
  if (total <= 1) return 0;
  return Math.min(8, Math.floor((1 - rank) * 9));
}

/**
 * Build the well layout: nodes ordered by recency (newest rides closest to
 * the water mirror, the depth grows dense toward the bottom — §5 of the
 * direction), edges are the real derived_from links between the loaded
 * nodes only.
 */
export function buildWellGraph({ memories }: WellGraphInput): {
  nodes: WellNode[];
  edges: WellEdge[];
} {
  const sorted = [...memories]
    .filter((memory) => typeof memory.id === "string" && memory.id !== "")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, WELL_NODE_CAP);

  if (sorted.length === 0) return { nodes: [], edges: [] };

  const usableH = WELL_VIEW_H - TOP_MARGIN - BOTTOM_MARGIN;
  type NodeDraft = { -readonly [K in keyof WellNode]: WellNode[K] };
  const nodes: NodeDraft[] = sorted.map((memory, index) => {
    const rank = sorted.length === 1 ? 0 : index / (sorted.length - 1);
    // Depth: newer → shallower; the 1.25 exponent packs the bottom.
    const y = TOP_MARGIN + rank ** 1.25 * usableH;
    // Stable x with a mild two-column jitter so rows never read as a grid.
    const jitter = (stableUnit(memory.id, 7) - 0.5) * 0.06;
    const column = stableUnit(memory.id, 13);
    const x = X_MARGIN + column * (WELL_VIEW_W - 2 * X_MARGIN) * (1 + jitter);
    return {
      id: memory.id,
      x,
      y,
      band: depthBand(rank, sorted.length),
      hub: false, // set below once the link counts are known
    };
  });

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const links: { from: WellNode; to: WellNode }[] = [];
  const degree = new Map<WellNode, number>();
  for (const memory of sorted) {
    const target = byId.get(memory.id);
    if (!target) continue;
    for (const originId of memory.derived_from ?? []) {
      const origin = byId.get(originId);
      if (!origin || origin === target) continue;
      if (links.length >= WELL_EDGE_CAP) break;
      if (links.some((edge) => edge.from === origin && edge.to === target)) continue;
      links.push({ from: origin, to: target });
      degree.set(origin, (degree.get(origin) ?? 0) + 1);
      degree.set(target, (degree.get(target) ?? 0) + 1);
    }
  }

  const edges: WellEdge[] = links.map(({ from, to }) => ({ from, to }));
  for (const node of nodes) {
    if ((degree.get(node) ?? 0) >= 2) {
      node.hub = true;
    }
  }

  return { nodes, edges };
}
