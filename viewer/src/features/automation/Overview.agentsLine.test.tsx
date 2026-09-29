import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OverviewPage } from "@/features/overview/OverviewPage";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";

/**
 * Overview auto-launches counter (SCHED-1-UI, ADR 0013 §8): the line renders
 * ONLY when the server's own counter says launches happened
 * (anti-dashification — a zero-count block does not render at all).
 * UX-overhaul §3 (Ф2): the solo «Агенты» block is gone — the counter now
 * lives INSIDE the live busy block («Кто занят»), so the cockpit's own
 * sources must be in the cache for the line to render at all.
 */

async function renderOverview(dailyUsed: number): Promise<string> {
  const gateway = new MockAdapter({ latency: false });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The busy block's sources (the counter's Ф2 home) — without them the
  // block stays in its loading state and no counter line exists.
  await client.prefetchQuery({
    queryKey: keys.agents.executors.list(),
    queryFn: () => gateway.listExecutors(),
  });
  await client.prefetchQuery({
    queryKey: keys.agents.assignments.list({}),
    queryFn: () => gateway.listAssignments({}),
  });
  await client.prefetchQuery({
    queryKey: keys.automation.status(),
    queryFn: () => gateway.automationStatus(),
  });
  // Override the server's own counter (the seed): the honest hook reads
  // status.daily_used, whatever the server says.
  const status = client.getQueryData(keys.automation.status()) as Record<string, unknown>;
  client.setQueryData(keys.automation.status(), { ...status, daily_used: dailyUsed });
  return renderToString(
    <GatewayContext.Provider value={gateway}>
      <QueryClientProvider client={client}>
        <I18nProvider initialLang="en">
          <MemoryRouter>
            <OverviewPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>,
  );
}

describe("Overview auto-launches counter (N>0 only, inside «Кто занят» since Ф2)", () => {
  it("renders the line with the count when launches happened today", async () => {
    const html = await renderOverview(3);
    expect(html).toContain("auto-launches today: 3");
    // The counter's home is the live busy block, not a solo section.
    expect(html).toContain("Who is busy");
    expect(html).toContain("/agents/execution"); // the block's action link
    expect(html).not.toContain('id="overview-agents"'); // the solo block is gone
  });

  it("renders NOTHING when the count is zero (no counters for the sake of it)", async () => {
    const html = await renderOverview(0);
    expect(html).not.toContain("auto-launches today");
    expect(html).not.toContain('id="overview-agents"'); // the whole block is absent
  });
});
