import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardAdapter } from "./BoardAdapter";
import { MockAdapter } from "./MockAdapter";
import {
  bucketActivityRows,
  filterActivityRows,
  pageActivityRows,
} from "./activityQuery";
import { buildMockActivityCorpus } from "./boardFixtures";
import type { ActivityItem } from "./boardTypes";

/**
 * UI-28 mock-parity (week-0 convention) + wire mapping. The HTTP adapter is
 * driven by a fetch double that answers `GET /activity` through the SHARED
 * reference semantics (activityQuery.ts) over the SAME corpus the mock
 * seeds — both adapters must then answer identical scenarios identically,
 * proving the mock exercises the same contract the wire speaks. The mapping
 * test additionally pins the query-string the viewer puts on the wire.
 */

const NOW = Date.parse("2026-09-19T09:00:00+00:00");
const ISO = new Date(NOW).toISOString();

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Corpus + reference-semantics fetch double for `GET /api/activity`. */
function parityAdapter(): { adapter: BoardAdapter; calls: string[] } {
  const corpus: ActivityItem[] = buildMockActivityCorpus(NOW);
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    const full = String(url instanceof Request ? url.url : url);
    calls.push(full);
    const query = new URL(full, "http://localhost").searchParams;
    if (query.get("bucket") !== null) {
      const filtered = filterActivityRows(corpus, {
        type: query.get("type") ?? undefined,
        task_id: query.get("task_id") ?? undefined,
        agent: query.get("agent") ?? undefined,
        host: query.get("host") ?? undefined,
      });
      return jsonResponse(
        bucketActivityRows(filtered, { bucket: "hour", hours: Number(query.get("hours") ?? 24) }, NOW),
      );
    }
    const limitParam = query.get("limit");
    const limit = limitParam !== null ? Number(limitParam) : undefined;
    if (limit !== undefined && limit <= 0) {
      return jsonResponse({ detail: "limit must be a positive integer" }, 422);
    }
    const page = pageActivityRows(
      filterActivityRows(corpus, {
        type: query.get("type") ?? undefined,
        task_id: query.get("task_id") ?? undefined,
        agent: query.get("agent") ?? undefined,
        host: query.get("host") ?? undefined,
      }),
      {
        before_id: query.get("before_id") ?? undefined,
        limit,
      },
    );
    return jsonResponse(page);
  });
  const adapter = new BoardAdapter({
    baseUrl: "/api",
    fetchImpl: fetchMock as unknown as typeof fetch,
  });
  return { adapter, calls };
}

/** The mock twin, frozen at the same corpus point. */
function mockAdapter(): MockAdapter {
  return new MockAdapter({ latency: false, now: () => NOW });
}

/** The scenarios the parity must survive (spec §3.2/§8.4–8.8). */
const SCENARIOS: readonly { name: string; params: Record<string, string | number | undefined> }[] = [
  { name: "first page", params: { limit: 7 } },
  { name: "cursor page", params: { limit: 7, before_id: "720" } },
  { name: "family csv", params: { type: "task,report", limit: 50 } },
  { name: "exact kind", params: { type: "assignment.claimed", limit: 50 } },
  { name: "task filter", params: { task_id: "TB-1", limit: 50 } },
  { name: "unknown task — empty page", params: { task_id: "NOPE-1", limit: 50 } },
  { name: "agent grammar", params: { agent: "exec-laptop-zcode", limit: 50 } },
  { name: "host", params: { host: "mesh-2", limit: 50 } },
];

describe("GET /api/activity — mock ↔ http parity (week-0 convention)", () => {
  it("every scenario answers identically on both adapters", async () => {
    const http = parityAdapter();
    const mock = mockAdapter();
    for (const scenario of SCENARIOS) {
      const fromWire = await http.adapter.activity(scenario.params);
      const fromMock = await mock.activity(scenario.params);
      expect(fromWire, scenario.name).toEqual(fromMock);
    }
  });

  it("the bucket view answers identically too (Ф2)", async () => {
    const http = parityAdapter();
    const mock = mockAdapter();
    expect(await http.adapter.activityBuckets({ bucket: "hour", hours: 24 })).toEqual(
      await mock.activityBuckets({ bucket: "hour", hours: 24 }),
    );
    expect(
      await http.adapter.activityBuckets({ bucket: "hour", hours: 24, type: "report" }),
    ).toEqual(await mock.activityBuckets({ bucket: "hour", hours: 24, type: "report" }));
  });
});

describe("GET /api/activity — wire mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps before_id/limit/type/task_id/agent/host onto the query string", async () => {
    const http = parityAdapter();
    await http.adapter.activity({
      before_id: "731",
      limit: 25,
      type: "task,report",
      task_id: "TB-1",
      agent: "exec-mesh-qa",
      host: "laptop",
    });
    expect(http.calls[0]).toBe(
      "/api/activity?before_id=731&limit=25&type=task%2Creport&task_id=TB-1&agent=exec-mesh-qa&host=laptop",
    );
  });

  it("maps the bucket view to ?bucket=hour&hours=24", async () => {
    const http = parityAdapter();
    await http.adapter.activityBuckets({ bucket: "hour", hours: 24 });
    expect(http.calls[0]).toBe("/api/activity?bucket=hour&hours=24");
  });

  it("propagates a wire 422 (garbage type) as ApiError — honest error state", async () => {
    const corpus: ActivityItem[] = buildMockActivityCorpus(NOW);
    void corpus;
    const fetchMock = vi.fn(async () =>
      jsonResponse({ detail: "invalid type" }, 422),
    );
    const adapter = new BoardAdapter({
      baseUrl: "/api",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(adapter.activity({ type: "nonsense" })).rejects.toMatchObject({
      status: 422,
    });
  });

  it("the corpus point travels in the wire stamp (sanity)", () => {
    expect(ISO).toBe("2026-09-19T09:00:00.000Z");
  });
});
