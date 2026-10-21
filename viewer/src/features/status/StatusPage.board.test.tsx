import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { StatusPage } from "./StatusPage";
import { AuthProvider } from "@/features/auth/AuthProvider";
import type { AdapterKind } from "@/gateway/adapterConfig";
import { GatewayContext } from "@/gateway/GatewayContext";
import { MockAdapter } from "@/gateway/MockAdapter";
import { ApiError } from "@/lib/errors";
import { keys } from "@/lib/queryKeys";

/**
 * Board-mode honesty for /metrics (owner feedback 1.4.0): the BoardAdapter
 * declares /metrics unsupported (501) while /health works — the status page
 * shows the calm "not available in board mode" empty state instead of the
 * scary "health is fine, metrics are not" error.
 *
 * Both query states are seeded into the cache so renderToString renders the
 * resolved branches synchronously; ru copy is the no-provider default.
 */
function renderStatus(adapterMode: AdapterKind, stores?: unknown): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Health: fresh success (board mode serves /api/health).
  const health = queryClient
    .getQueryCache()
    .build(queryClient, {
      queryKey: keys.status.health(),
      queryFn: () => Promise.resolve(null as unknown),
    });
  health.setState({
    status: "success",
    fetchStatus: "idle",
    data: { status: "ok", service: "vesma-eyes" },
    dataUpdatedAt: Date.now(),
  });
  // Metrics: honest 501 from the BoardAdapter.
  const metrics = queryClient
    .getQueryCache()
    .build(queryClient, {
      queryKey: keys.status.metrics(),
      queryFn: () => Promise.resolve(null),
    });
  metrics.setState({
    status: "error",
    fetchStatus: "idle",
    error: new ApiError(
      501,
      "BoardAdapter.metrics: the board merge-API does not expose the vesma /metrics view (ADR 0011 §6).",
    ),
  });
  // Keep observers on the seeded states (retryOnMount rationale: see the
  // sessions board test).
  queryClient.setQueryDefaults(keys.status.metrics(), {
    retryOnMount: false,
    retry: false,
  });
  queryClient.setQueryDefaults(keys.status.health(), {
    retryOnMount: false,
    retry: false,
  });
  // W-A D2b (+review F5): optionally seed the shared per-store wire
  // (GET /api/health through useBoardHealth) — the same cache the
  // Overview's store cards read.
  if (stores !== undefined) {
    const storesEntry = queryClient
      .getQueryCache()
      .build(queryClient, {
        queryKey: keys.status.boardHealth(),
        queryFn: () => Promise.resolve(null as unknown),
      });
    storesEntry.setState({
      status: "success",
      fetchStatus: "idle",
      data: stores,
      dataUpdatedAt: Date.now(),
    });
    queryClient.setQueryDefaults(keys.status.boardHealth(), {
      retryOnMount: false,
      retry: false,
    });
  }

  return renderToString(
    <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider adapterMode={adapterMode} endpoint="/api">
          <MemoryRouter initialEntries={["/status"]}>
            <StatusPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>,
  );
}

describe("status board-mode 501 (metrics)", () => {
  it("shows the honest board-mode empty state, not an error alert", () => {
    const html = renderStatus("board");
    // UX-overhaul §6 (Ф1): health renders FIRST (the live system never
    // looks broken), the 501 degrades to one HonestLine under the panel.
    expect(html).toContain("Состояние API");
    expect(html).toContain("работает");
    expect(html).toContain("Метрики появятся позже — сейчас доступен статус служб");
    expect(html).not.toContain("Метрики недоступны в board-режиме");
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    // П4: the raw 501 wire text is gone from open copy (techDetail only).
    expect(html).not.toContain("501");
    // The board copy — not the vesma "health fine, metrics broken" error.
    expect(html).not.toContain("Со здоровьем порядок, с метриками — нет");
  });

  it("keeps the vesma error treatment on the vesma adapter", () => {
    const html = renderStatus("vesma");
    expect(html).toContain("Со здоровьем порядок, с метриками — нет");
    expect(html).not.toContain("Метрики недоступны в board-режиме");
  });
});

describe("status stores section (W-A D2b + review F5)", () => {
  it("renders the stores from the same health wire, anchored #stores", () => {
    const html = renderStatus("board", {
      ok: true,
      service: "vesma-eyes",
      servers: [
        {
          name: "cluster",
          group_name: "default",
          enabled: true,
          state: "idle",
          description: "",
          ok: true,
          latency_ms: 12,
          error: null,
          memories_total: 3,
        },
        {
          name: "laptop",
          group_name: "default",
          enabled: true,
          state: "idle",
          description: "",
          ok: false,
          latency_ms: null,
          error: "laptop: unreachable (ConnectError)",
          memories_total: 0,
        },
      ],
    });
    // The anchor the Overview's degraded-stores plaque deep-links to.
    expect(html).toContain('id="stores"');
    expect(html).toContain("Хранилища");
    // The same cards as the Overview: a failed store names its failure —
    // «Состояние API: работает» can no longer contradict the Overview.
    expect(html).toContain("cluster");
    expect(html).toContain("laptop");
    expect(html).toContain("laptop: unreachable (ConnectError)");
  });

  it("renders no stores section when the wire answered empty", () => {
    const html = renderStatus("board", {
      ok: true,
      service: "vesma-eyes",
      servers: [],
    });
    // A block with nothing to say does not render (anti-dashification).
    expect(html).not.toContain('id="stores"');
    expect(html).not.toContain("Хранилища");
  });
});
