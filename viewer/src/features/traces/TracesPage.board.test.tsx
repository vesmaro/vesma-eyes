import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TracesPage } from "./TracesPage";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { GatewayContext } from "@/gateway/GatewayContext";
import { MockAdapter } from "@/gateway/MockAdapter";
import { ApiError } from "@/lib/errors";
import { keys } from "@/lib/queryKeys";

/**
 * Board-mode honesty for /traces (owner feedback 1.4.0): the BoardAdapter
 * declares /traces unsupported (501) — the page shows the calm localized
 * "not available in board mode" empty state (role="status"), not an error.
 * The 501 is seeded into the query cache so renderToString hits the error
 * branch synchronously; ru copy is the no-provider default.
 */
function renderTraces(
  adapterMode: "board" | "vesma",
  error: ApiError | null,
  taskLabel?: string,
): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const queryKey = keys.traces.list({ task_label: taskLabel, limit: 50 });
  const query = queryClient
    .getQueryCache()
    .build(queryClient, { queryKey, queryFn: () => Promise.resolve([]) });
  if (error) {
    query.setState({ status: "error", fetchStatus: "idle", error });
    // Keep the observer's optimistic result on the seeded error (see the
    // sessions board test for the retryOnMount rationale).
    queryClient.setQueryDefaults(queryKey, { retryOnMount: false, retry: false });
  } else {
    // ME-072 C case: a SETTLED empty listing (the honest zero, not pending).
    query.setState({ status: "success", fetchStatus: "idle", data: [] });
  }

  return renderToString(
    <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider adapterMode={adapterMode} endpoint="/api">
          <MemoryRouter
            initialEntries={[
              taskLabel ? `/traces?task_label=${taskLabel}` : "/traces",
            ]}
          >
            <TracesPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>,
  );
}

describe("traces board-mode 501", () => {
  it("shows the honest board-mode empty state, not an error alert", () => {
    const html = renderTraces(
      "board",
      new ApiError(
        501,
        "BoardAdapter.listTraces: the board merge-API does not expose the vesma /traces view (ADR 0011 §6).",
      ),
    );
    // UX-overhaul §6 (Ф1, П1): the 501 is ONE HonestLine matching the nav
    // disabled slot — the filter input stays, the dead-end screen is gone.
    expect(html).toContain("Трассировки появятся позже");
    expect(html).not.toContain("Трассировки недоступны в board-режиме");
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    // П4: the raw 501 wire text is gone from open copy.
    expect(html).not.toContain("501");
  });

  it("keeps the plain error state on the vesma adapter (501 there is an anomaly)", () => {
    const html = renderTraces("vesma", new ApiError(501, "HttpAdapter: 501"));
    expect(html).not.toContain("Трассировки недоступны в board-режиме");
    expect(html).toContain('role="alert"'); // generic error branch
    expect(html).toContain("Не удалось загрузить трассировки");
  });

  // ME-072 C: a filtered EMPTY page carries the one-click way out — the
  // reset action renders ONLY with an active label (the plain empty state
  // stays action-free), and the placeholder reads in the tasks home style.
  it("filtered empty state carries the reset-filter action (ME-072 C)", () => {
    const filtered = renderTraces("vesma", null, "zzz-nope");
    expect(filtered).toContain("Нет трассировок с меткой");
    expect(filtered).toContain("Сбросить фильтр");
    const plain = renderTraces("vesma", null);
    expect(plain).toContain("Конвейер ещё не записал");
    expect(plain).not.toContain("Сбросить фильтр");
  });
});
