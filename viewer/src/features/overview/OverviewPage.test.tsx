import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OverviewPage } from "./OverviewPage";
import { MockAdapter } from "@/gateway/MockAdapter";
import { HttpAdapter } from "@/gateway/HttpAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";

/**
 * Ф2 Overview gates (UX-overhaul §3): with the mock gateway the cockpit
 * blocks read the live cache — «Кто занят» aggregate, «Что ждёт меня»
 * summary, «Что в памяти» stores+pulse — and every figure LEADS somewhere.
 * With a gateway that lacks the board-native capabilities (vesma
 * HttpAdapter) the live blocks do not render at all — no fake widgets. The
 * Ф2 removals hold: no quick-links trio, no solo agents line.
 */
async function renderOverview(
  gateway: InstanceType<typeof MockAdapter> | InstanceType<typeof HttpAdapter>,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (gateway instanceof MockAdapter) {
    // Prefetch the exact keys the page reads so renderToString sees data
    // (no effects run server-side).
    await queryClient.prefetchQuery({
      queryKey: keys.pulse.feed({ scope: "all", limit: 5 }),
      queryFn: () => gateway.pulse({ scope: "all", limit: 5 }),
    });
    await queryClient.prefetchQuery({
      queryKey: keys.status.boardHealth(),
      queryFn: () => gateway.boardHealth(),
    });
    await queryClient.prefetchQuery({
      queryKey: keys.agents.executors.list(),
      queryFn: () => gateway.listExecutors(),
    });
    await queryClient.prefetchQuery({
      queryKey: keys.agents.assignments.list({}),
      queryFn: () => gateway.listAssignments({}),
    });
    await queryClient.prefetchQuery({
      queryKey: keys.tasks.board(),
      queryFn: () => gateway.board(),
    });
    await queryClient.prefetchQuery({
      queryKey: keys.tasks.inbox({}),
      queryFn: () => gateway.inbox({}),
    });
  }
  return renderToString(
    <GatewayContext.Provider value={gateway}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider initialLang="en">
          <MemoryRouter>
            <OverviewPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>,
  );
}

describe("OverviewPage (mock gateway — capable)", () => {
  it("renders the memory block with store health cards and the fresh-pulse strip", async () => {
    const html = await renderOverview(new MockAdapter({ latency: false }));
    // Ф2: the two memory halves live under ONE cockpit title.
    expect(html).toContain("In memory");
    expect(html).toContain("mock-store");
    expect(html).toContain("healthy");
    expect(html).toContain("ms probe");
    // The paused mock store says so in words — colour never alone (1.4.1).
    expect(html).toContain("disabled");
    expect(html).toContain("Fresh pulse");
    expect(html).toContain('href="/memory/pulse"');
    expect(html).toContain('href="/memory/');
    expect(html).toContain("mock-store");
  });

  it("renders the busy block from live executors+assignments, leading to the surfaces", async () => {
    const html = await renderOverview(new MockAdapter({ latency: false }));
    // «Кто занят»: 2 of 4 approved executors online (fixtures), 2 claimed/
    // running assignments, 4 queued — every figure is a LINK to its list.
    expect(html).toContain("Who is busy");
    expect(html).toContain("executors connected: 2 of 4");
    expect(html).toContain("tasks in progress: 2");
    expect(html).toContain("queued: 4");
    expect(html).toContain('href="/agents/hosts"');
    expect(html).toContain('href="/agents/execution"');
    expect(html).toContain('href="/tasks"');
    // The SCHED-1-UI auto-launch counter renders only when non-zero.
    expect(html).not.toContain("auto-launches today");
  });

  it("renders the waiting summary with the most-urgent click target and source rows", async () => {
    const html = await renderOverview(new MockAdapter({ latency: false }));
    // «Что ждёт меня»: one summary number-action; the fixtures have inbox
    // items — the urgent target is the inbox; the source rows are links.
    expect(html).toContain("Waiting for you");
    // ME-072 C: the cockpit chip = numeral + label (no repeated count);
    // the hero chip carries the «waiting in total» wording.
    expect(html).toContain("waiting for you");
    expect(html).not.toContain("waiting for you:");
    expect(html).toContain("Waiting in total:");
    expect(html).toContain('href="/tasks/inbox"');
    expect(html).toContain("In review:"); // «на проверке», never "validating"
    expect(html).not.toContain("validating");
  });

  it("hides the removed Ф1 surfaces: no quick-links trio, no solo agents line", async () => {
    const html = await renderOverview(new MockAdapter({ latency: false }));
    // Memory lives in «In memory» + the palette now; the agents domain is
    // represented by the busy block (not the auto-launch solo line).
    expect(html).not.toContain('href="/memory/search"');
    expect(html).not.toContain('href="/memory/tags"');
    expect(html).not.toContain("Quick links");
    // The honesty line names the not-yet-live surfaces in one sentence.
    expect(html).toContain(
      "Stores and metrics are in the works; sessions and traces are coming later",
    );
    // Mock adapter: control is available (no auth wall) — the ACTIVE mode
    // line, never the read-only one (fix/login-feedback).
    expect(html).toContain("session active");
    expect(html).not.toContain("read-only");
  });
});

describe("OverviewPage (vesma gateway — capabilities absent)", () => {
  it("hides the live cockpit blocks instead of faking them", async () => {
    const html = await renderOverview(new HttpAdapter("/api"));
    // The STORE half and the pulse strip are hidden on incapable gateways;
    // the whole memory section frame goes with them (no empty block).
    expect(html).not.toContain('id="overview-memory"');
    expect(html).not.toContain("Fresh pulse");
    // No agents/tasks capabilities — the busy and waiting blocks stay out.
    expect(html).not.toContain("Who is busy");
    expect(html).not.toContain("Waiting for you");
    // The honesty line still NAMES the stores domain honestly (it says the
    // registry is still in the works — that is true on every gateway).
    expect(html).toContain(
      "Stores and metrics are in the works; sessions and traces are coming later",
    );
    // The vesma adapter has no mutation surface — the read-only mode line
    // is the honest contract there, even with an mnk_ session (L1 reads).
    expect(html).toContain("read-only");
  });
});
