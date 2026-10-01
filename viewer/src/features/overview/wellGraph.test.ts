import { describe, expect, it } from "vitest";
import {
  buildSubstrate,
  buildWellGraph,
  TOP_MARGIN,
  WELL_EDGE_CAP,
  WELL_NODE_CAP,
  WELL_SUBSTRATE_CAP,
  WELL_SUBSTRATE_DEGREE_CAP,
  WELL_SUBSTRATE_STRAND_CAP,
  WELL_SUBSTRATE_STRAND_RADIUS,
  WELL_VIEW_H,
  WELL_VIEW_W,
} from "./wellGraph";

/**
 * W1b well layout gates: the DATA graph (real memories, caps 42/30, depth
 * bands, hubs, honest readout fields) and the SUBSTRATE — a deterministic
 * zero-input fabric that must never depend on, or be reshaped by, the data.
 */

const X_MARGIN = 0.04 * WELL_VIEW_W;
const BOTTOM_MARGIN = 0.06 * WELL_VIEW_H;

function mem(id: string, created_at: string, derived_from: string[] = []) {
  return { id, created_at, title: null, derived_from };
}

describe("buildWellGraph — data layer caps and geometry", () => {
  it("caps the composition at 42 nodes / 30 edges", () => {
    const many = Array.from({ length: 100 }, (_, i) =>
      mem(`m${i}`, `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`),
    );
    for (let i = 42; i < 100; i += 1) many[i].derived_from = [`m${i - 1}`];
    const graph = buildWellGraph({ memories: many });
    expect(graph.nodes).toHaveLength(WELL_NODE_CAP);
    expect(graph.edges.length).toBeLessThanOrEqual(WELL_EDGE_CAP);
  });

  it("keeps every node out of the water mirror (TOP_MARGIN) and inside the fields", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      mem(`m${i}`, `2026-02-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`),
    );
    for (const node of buildWellGraph({ memories: many }).nodes) {
      expect(node.y).toBeGreaterThanOrEqual(TOP_MARGIN);
      expect(node.y).toBeLessThanOrEqual(WELL_VIEW_H - BOTTOM_MARGIN);
      expect(node.x).toBeGreaterThanOrEqual(X_MARGIN);
      expect(node.x).toBeLessThanOrEqual(WELL_VIEW_W - X_MARGIN);
    }
  });

  it("bands are monotone with recency: newest carries the highest band index", () => {
    const graph = buildWellGraph({
      memories: Array.from({ length: 9 }, (_, i) =>
        mem(`m${i}`, `2026-03-0${i + 1}T00:00:00Z`),
      ),
    });
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    let prev = 9;
    for (let i = 8; i >= 0; i -= 1) {
      // newest (m8) first: bands never INCREASE toward older memories
      // (band 0 = deepest/oldest, surfaces first in the awakening cascade)
      const band = byId.get(`m${i}`)!.band;
      expect(band).toBeLessThanOrEqual(prev);
      prev = band;
    }
    expect(byId.get("m8")!.band).toBe(8);
    expect(byId.get("m0")!.band).toBe(0);
  });

  it("marks hubs at degree ≥2 and only there", () => {
    const graph = buildWellGraph({
      memories: [
        mem("hub", "2026-01-01T00:00:00Z"),
        mem("a", "2026-01-02T00:00:00Z", ["hub"]),
        mem("b", "2026-01-03T00:00:00Z", ["hub"]),
        mem("lonely", "2026-01-04T00:00:00Z", ["a"]),
      ],
    });
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    expect(byId.get("hub")!.hub).toBe(true);
    expect(byId.get("a")!.hub).toBe(true);
    expect(byId.get("lonely")!.hub).toBe(false);
  });

  it("carries the honest readout fields: trimmed title, ISO date slice, nulls", () => {
    const graph = buildWellGraph({
      memories: [
        { id: "t1", created_at: "2026-01-02T03:04:05Z", title: "  Net gift  " },
        { id: "t2", created_at: "2026-01-03T03:04:05Z" },
        { id: "t3", created_at: "garbage", title: "x" },
      ],
    });
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    expect(byId.get("t1")!.title).toBe("Net gift");
    expect(byId.get("t1")!.date).toBe("2026-01-02");
    expect(byId.get("t2")!.title).toBeNull();
    expect(byId.get("t2")!.date).toBe("2026-01-03");
    expect(byId.get("t3")!.date).toBeNull();
  });
});

describe("buildSubstrate — the deterministic fabric (zero data input)", () => {
  it("is deterministic: two calls draw the identical fabric", () => {
    expect(buildSubstrate()).toEqual(buildSubstrate());
  });

  it("is independent of the data layer: graph builds leave it untouched", () => {
    const before = buildSubstrate();
    buildWellGraph({
      memories: Array.from({ length: 42 }, (_, i) =>
        mem(`m${i}`, `2026-04-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`),
      ),
    });
    expect(buildSubstrate()).toEqual(before);
  });

  it("has a fixed size: 96 points, ≤110 strands", () => {
    const { points, strands } = buildSubstrate();
    expect(points).toHaveLength(WELL_SUBSTRATE_CAP);
    expect(strands.length).toBeLessThanOrEqual(WELL_SUBSTRATE_STRAND_CAP);
  });

  it("never crosses the water mirror: every point sits below TOP_MARGIN", () => {
    for (const p of buildSubstrate().points) {
      expect(p.y).toBeGreaterThanOrEqual(TOP_MARGIN);
    }
  });

  it("every point is clamped inside the canvas fields", () => {
    for (const p of buildSubstrate().points) {
      expect(p.x).toBeGreaterThanOrEqual(X_MARGIN);
      expect(p.x).toBeLessThanOrEqual(WELL_VIEW_W - X_MARGIN);
      expect(p.y).toBeLessThanOrEqual(WELL_VIEW_H - BOTTOM_MARGIN);
    }
  });

  it("strands are short (≤0.2W), degrees ≤3, pairs unique", () => {
    const { points, strands } = buildSubstrate();
    // Strand endpoints are the SAME objects as the points array entries.
    const index = new Map(points.map((p, i) => [p, i] as const));
    const degree = new Array<number>(points.length).fill(0);
    const seen = new Set<string>();
    for (const s of strands) {
      const dx = s.b.x - s.a.x;
      const dy = s.b.y - s.a.y;
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(WELL_SUBSTRATE_STRAND_RADIUS + 1e-9);
      const i = index.get(s.a)!;
      const j = index.get(s.b)!;
      degree[i] += 1;
      degree[j] += 1;
      seen.add(i < j ? `${i}:${j}` : `${j}:${i}`);
    }
    for (const d of degree) expect(d).toBeLessThanOrEqual(WELL_SUBSTRATE_DEGREE_CAP);
    expect(seen.size).toBe(strands.length);
  });
});
