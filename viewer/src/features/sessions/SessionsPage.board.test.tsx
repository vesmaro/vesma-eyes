import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SessionsPage } from "./SessionsPage";
import { AuthProvider } from "@/features/auth/AuthProvider";
import type { AdapterKind } from "@/gateway/adapterConfig";
import { GatewayContext } from "@/gateway/GatewayContext";
import { MockAdapter } from "@/gateway/MockAdapter";
import { ApiError } from "@/lib/errors";
import { keys } from "@/lib/queryKeys";

/**
 * Board-mode honesty (owner feedback 1.4.0): /sessions is declared
 * unsupported (501) by the BoardAdapter — the page must show a calm
 * "not available in board mode" empty state (role="status"), never a
 * role="alert" error. On the mnemos adapter the same 501 keeps the mnemos
 * 4.1 explanation (no list endpoint there).
 *
 * DOM-free per the project pattern: the 501 is seeded straight into the
 * query cache, so renderToString renders the error branch synchronously.
 * Russian copy is the default language — no provider means ru.
 */
function renderSeeded(
  ui: React.ReactElement,
  adapterMode: AdapterKind,
  queryKey: readonly unknown[],
  error: ApiError,
): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const query = queryClient
    .getQueryCache()
    .build(queryClient, { queryKey, queryFn: () => Promise.resolve(null) });
  query.setState({ status: "error", fetchStatus: "idle", error });
  // Keep the observer's optimistic result on the seeded error: without
  // retryOnMount:false TanStack flips a data-less errored query back to
  // "pending" for the mount fetch, and the skeleton would win the render.
  queryClient.setQueryDefaults(queryKey, { retryOnMount: false, retry: false });

  return renderToString(
    <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider adapterMode={adapterMode} endpoint="/api">
          <MemoryRouter initialEntries={["/sessions"]}>{ui}</MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>,
  );
}

describe("board mode honest 501 states (sessions)", () => {
  it("shows 'not available in board mode' as an empty state, not an error alert", () => {
    const html = renderSeeded(
      <SessionsPage />,
      "board",
      keys.sessions.list(),
      new ApiError(
        501,
        "BoardAdapter.listSessions: the board merge-API does not expose the mnemos /v1/sessions view (ADR 0011 §6).",
      ),
    );
    // UX-overhaul §6 (Ф1, П1): the 501 is ONE HonestLine matching the nav
    // disabled slot — no fullscreen dead-end, no internal "board-mode"
    // vocabulary in the primary copy.
    expect(html).toContain("Сессии появятся позже");
    expect(html).not.toContain("board-native");
    expect(html).not.toContain("Сессии недоступны в board-режиме");
    // HonestLine semantics: status, not alert — the page is fine.
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    // The raw wire reason is GONE from open copy (П4) — it does not render
    // anywhere on this line.
    expect(html).not.toContain("501");
  });

  it("keeps the mnemos 4.1 explanation on the mnemos adapter", () => {
    const html = renderSeeded(
      <SessionsPage />,
      "mnemos",
      keys.sessions.list(),
      new ApiError(501, "HttpAdapter: GET /v1/sessions → 501"),
    );
    expect(html).toContain("Список сессий недоступен в vesma 4.1");
    expect(html).not.toContain("Сессии недоступны в board-режиме");
  });
});
