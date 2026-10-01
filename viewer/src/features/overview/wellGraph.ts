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
export const TOP_MARGIN = 0.16 * WELL_VIEW_H;
const BOTTOM_MARGIN = 0.06 * WELL_VIEW_H;
const X_MARGIN = 0.04 * WELL_VIEW_W;

/** Hard caps: the hero is a composition, not the whole list wire. */
export const WELL_NODE_CAP = 42;
export const WELL_EDGE_CAP = 30;

/** Substrate caps (W1b blueprint): the fabric is a fixed-size deterministic
 * texture — never scaled by, or coloured from, the data layer. */
export const WELL_SUBSTRATE_CAP = 96;
export const WELL_SUBSTRATE_STRAND_CAP = 110;
export const WELL_SUBSTRATE_DEGREE_CAP = 3;
export const WELL_SUBSTRATE_STRAND_RADIUS = 0.2 * WELL_VIEW_W;

export interface WellNode {
  readonly id: string;
  /** Honest readout label source: null when the wire carries no title. */
  readonly title: string | null;
  /** `YYYY-MM-DD` slice of `created_at`; null when the wire has no date. */
  readonly date: string | null;
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
    title?: string | null;
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

export interface SubstratePoint {
  readonly x: number;
  readonly y: number;
}

export interface SubstrateStrand {
  readonly a: SubstratePoint;
  readonly b: SubstratePoint;
}

export interface Substrate {
  readonly points: readonly SubstratePoint[];
  readonly strands: readonly SubstrateStrand[];
}

const SUBSTRATE_SALT = 0x57e11;
const SUBSTRATE_COLONIES = 5;
const COLONY_Y_MIN = 0.45 * WELL_VIEW_H;
const COLONY_Y_MAX = 0.75 * WELL_VIEW_H;
const COLONY_SPREAD = 150;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), hi);

/**
 * The deterministic tissue of the well (W1b): ~96 points in 4–5 colonies
 * below the water mirror, monochrome myelin. Pure function of NOTHING —
 * fixed seed, zero data input — so the first frame is textured before the
 * wire answers and the fabric never implies data (anti-fake §14.6.1).
 * Colony cores pack dense via the pow(u, 0.65) radial spread; the top 16%
 * (water mirror) stays free; strands join each point to 1–2 nearest
 * neighbours within WELL_SUBSTRATE_STRAND_RADIUS, degree ≤3, ≤110 strands.
 */
export function buildSubstrate(): Substrate {
  const points: SubstratePoint[] = [];
  const perColony = Math.floor(WELL_SUBSTRATE_CAP / SUBSTRATE_COLONIES);
  const remainder = WELL_SUBSTRATE_CAP % SUBSTRATE_COLONIES;
  const usableW = WELL_VIEW_W - 2 * X_MARGIN;
  for (let c = 0; c < SUBSTRATE_COLONIES; c += 1) {
    const cy =
      COLONY_Y_MIN +
      stableUnit(`colony-y-${c}`, SUBSTRATE_SALT) *
        (COLONY_Y_MAX - COLONY_Y_MIN);
    // Even horizontal coverage with a small deterministic wobble.
    const cx =
      X_MARGIN +
      ((c + 0.5) / SUBSTRATE_COLONIES) * usableW +
      (stableUnit(`colony-x-${c}`, SUBSTRATE_SALT) - 0.5) * 60;
    const count = perColony + (c < remainder ? 1 : 0);
    for (let i = 0; i < count; i += 1) {
      const rad = COLONY_SPREAD * stableUnit(`r-${c}-${i}`, SUBSTRATE_SALT) ** 0.65;
      const ang = stableUnit(`a-${c}-${i}`, SUBSTRATE_SALT) * Math.PI * 2;
      points.push({
        x: clamp(cx + Math.cos(ang) * rad, X_MARGIN, WELL_VIEW_W - X_MARGIN),
        y: clamp(cy + Math.sin(ang) * rad, TOP_MARGIN, WELL_VIEW_H - BOTTOM_MARGIN),
      });
    }
  }

  // Strands: each point ↔ its 1–2 nearest neighbours inside the radius cap;
  // both endpoints honour the degree cap; the pair set is deduplicated.
  const strands: SubstrateStrand[] = [];
  const seen = new Set<string>();
  const degree = new Array<number>(points.length).fill(0);
  for (let i = 0; i < points.length && strands.length < WELL_SUBSTRATE_STRAND_CAP; i += 1) {
    const neighbours: { j: number; d2: number }[] = [];
    for (let j = 0; j < points.length; j += 1) {
      if (j === i) continue;
      const dx = points[j].x - points[i].x;
      const dy = points[j].y - points[i].y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= WELL_SUBSTRATE_STRAND_RADIUS * WELL_SUBSTRATE_STRAND_RADIUS) {
        neighbours.push({ j, d2 });
      }
    }
    // Total order on (distance, index) — the tiebreak keeps the build
    // deterministic regardless of input order stability.
    neighbours.sort((p, q) => p.d2 - q.d2 || p.j - q.j);
    let made = 0;
    for (const { j } of neighbours) {
      if (made >= 2) break;
      if (degree[i] >= WELL_SUBSTRATE_DEGREE_CAP) break;
      if (degree[j] >= WELL_SUBSTRATE_DEGREE_CAP) continue;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      strands.push({ a: points[i], b: points[j] });
      degree[i] += 1;
      degree[j] += 1;
      made += 1;
    }
  }
  return { points, strands };
}

/** Honest readout fields: trimmed non-empty title or null; the ISO date
 * prefix or null. Computed here so the lazy organ renders text, not logic. */
function readoutFields(
  title: string | null | undefined,
  createdAt: string,
): { title: string | null; date: string | null } {
  const cleanTitle =
    typeof title === "string" && title.trim() !== "" ? title.trim() : null;
  const date = /^\d{4}-\d{2}-\d{2}/.exec(createdAt)?.[0] ?? null;
  return { title: cleanTitle, date };
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
    // The jitter multiplies the span, so the raw x can leave the margins —
    // clamped to [X_MARGIN, W - X_MARGIN] (review P3-3: rare nodes must not
    // clip past the viewBox edge).
    const jitter = (stableUnit(memory.id, 7) - 0.5) * 0.06;
    const column = stableUnit(memory.id, 13);
    const rawX = X_MARGIN + column * (WELL_VIEW_W - 2 * X_MARGIN) * (1 + jitter);
    const x = Math.min(Math.max(rawX, X_MARGIN), WELL_VIEW_W - X_MARGIN);
    return {
      id: memory.id,
      ...readoutFields(memory.title, memory.created_at),
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
