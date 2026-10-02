// @vitest-environment happy-dom
import { describe, expect, it, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CockpitBusy } from "./CockpitBusy";
import { CockpitWaiting } from "./CockpitWaiting";
import { MockAdapter } from "@/gateway/MockAdapter";
import { HttpAdapter } from "@/gateway/HttpAdapter";
import {
  MOCK_BOARD,
  MOCK_EXECUTORS_META,
  MOCK_INBOX,
} from "@/gateway/boardFixtures";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";

/**
 * Cockpit state-matrix gates (UX-overhaul §3/§9.1, Ф2) — renderToString with
 * the exact cache entries prefetched (no effects server-side, project
 * pattern). Fixture arithmetic (boardFixtures): 4 approved executors, 2
 * online; assignments 4 queued + 1 claimed + 1 running; inbox 3 not-adopted
 * records; 2 tasks in the validating column.
 */

type Gateway = InstanceType<typeof MockAdapter> | InstanceType<typeof HttpAdapter>;

// --- DOM harness (the error state needs a real fetch lifecycle) ---------------

let domRoot: Root | null = null;
let domContainer: HTMLDivElement | null = null;

async function mountCockpitDom(gateway: Gateway): Promise<void> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  domContainer = document.createElement("div");
  document.body.appendChild(domContainer);
  domRoot = createRoot(domContainer);
  await act(async () => {
    domRoot!.render(
      <GatewayContext.Provider value={gateway}>
        <QueryClientProvider client={queryClient}>
          <I18nProvider initialLang="en">
            <MemoryRouter>
              <CockpitBusy />
              <CockpitWaiting />
            </MemoryRouter>
          </I18nProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
}

async function waitForDom(
  what: string,
  probe: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (probe()) return;
    if (Date.now() > deadline) {
      throw new Error(
        `waitForDom(${what}) timed out; body text: ${document.body.textContent?.slice(0, 300)}`,
      );
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

afterEach(async () => {
  await act(async () => {
    domRoot?.unmount();
  });
  domContainer?.remove();
  domRoot = null;
  domContainer = null;
});

/** The honest-empty twin of the mock: every cockpit source answers ZERO. */
class EmptyCockpitAdapter extends MockAdapter {
  override listExecutors() {
    return Promise.resolve({
      ok: true,
      count: 0,
      items: [],
      meta: MOCK_EXECUTORS_META,
    });
  }
  override listAssignments() {
    return Promise.resolve({ ok: true, count: 0, items: [] });
  }
  override board() {
    return Promise.resolve({ ...MOCK_BOARD, tasks: [], counts: {} });
  }
  override inbox() {
    return Promise.resolve({ ...MOCK_INBOX, items: [], count: 0 });
  }
}

async function renderCockpit(
  gateway: Gateway,
  seed: (client: QueryClient, adapter: MockAdapter) => Promise<void> = async () => {},
): Promise<string> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (gateway instanceof MockAdapter) {
    await seed(queryClient, gateway);
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
            <CockpitBusy />
            <CockpitWaiting />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>,
  );
}

describe("CockpitBusy (§9.1 matrix)", () => {
  it("default: the aggregate line reads executors presence + the work counts, every figure leads", async () => {
    const html = await renderCockpit(new MockAdapter({ latency: false }));
    expect(html).toContain("Who is busy");
    expect(html).toContain("executors connected: 2 of 4");
    expect(html).toContain("tasks in progress: 2");
    expect(html).toContain("queued: 4");
    // The block leads — the roster, the execution feed and the tasks board.
    expect(html).toContain('href="/agents/hosts"');
    expect(html).toContain('href="/agents/execution"');
    expect(html).toContain('href="/tasks"');
    expect(html).toContain("All agents");
    // Zero daily_used ⇒ the auto-launch line stays out (anti-dashboard).
    expect(html).not.toContain("auto-launches today");
  });

  it("empty/zero: 0 approved agents → the honest connect line, no aggregate", async () => {
    const html = await renderCockpit(new EmptyCockpitAdapter());
    expect(html).toContain("No agents yet — connect the first one");
    expect(html).toContain('href="/agents/harnesses"');
    expect(html).not.toContain("executors connected");
  });

  it("pending (bare cache): skeleton rows only — no numbers, no links", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const html = renderToString(
      <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
        <QueryClientProvider client={queryClient}>
          <I18nProvider initialLang="en">
            <MemoryRouter>
              <CockpitBusy />
              <CockpitWaiting />
            </MemoryRouter>
          </I18nProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
    expect(html).toContain("Who is busy");
    // Static skeletons (blueprint §6.3 slop-pass): no pulse on mounts.
    expect(html).toContain("bg-elevated");
    expect(html).not.toContain("executors connected");
    expect(html).not.toContain("waiting for you:");
  });

  it("error: the HonestLine with a retry — the block never disappears silently", async () => {
    // SSR cannot show a query error (the mounted observer optimistically
    // reports pending/fetching) — this state runs on the real DOM, where
    // the rejecting adapter's failure actually lands.
    class RejectingAgents extends MockAdapter {
      override listExecutors(): Promise<never> {
        return Promise.reject(new Error("boom"));
      }
      override listAssignments(): Promise<never> {
        return Promise.reject(new Error("boom"));
      }
    }
    await mountCockpitDom(new RejectingAgents());
    await waitForDom(
      "the honest error line",
      () => document.body.textContent?.includes("Could not load who is busy") === true,
    );
    expect(document.body.textContent).toContain("Retry");
    // The failed block did NOT vanish: the section heading is still there.
    expect(document.body.textContent).toContain("Who is busy");
  });

  it("partial (§10.12): executors ok + assignments error — live half renders, the failed half is an HonestLine", async () => {
    class RejectingQueue extends MockAdapter {
      override listAssignments(): Promise<never> {
        return Promise.reject(new Error("boom"));
      }
    }
    await mountCockpitDom(new RejectingQueue());
    await waitForDom(
      "the partial error line",
      () => document.body.textContent?.includes("Could not load who is busy") === true,
    );
    // The LIVE half still speaks (the registry side of the aggregate).
    expect(document.body.textContent).toContain("executors connected: 2 of 4");
    // The failed half is the honest line with a retry — not a silent gap.
    expect(document.body.textContent).toContain("Retry");
  });

  it("zero agents + failed queue (review P3-3): the error line wins over the connect line", async () => {
    class EmptyRegistryRejectingQueue extends MockAdapter {
      override listExecutors() {
        return Promise.resolve({
          ok: true,
          count: 0,
          items: [],
          meta: MOCK_EXECUTORS_META,
        });
      }
      override listAssignments(): Promise<never> {
        return Promise.reject(new Error("boom"));
      }
    }
    await mountCockpitDom(new EmptyRegistryRejectingQueue());
    await waitForDom(
      "the queue error line",
      () => document.body.textContent?.includes("Could not load who is busy") === true,
    );
    // The empty-registry line claims an emptiness we cannot prove while the
    // queue is down — the error is the honest render, «Агентов пока нет» stays out.
    expect(document.body.textContent).not.toContain("No agents yet");
  });

  it("capability absence (vesma adapter): nothing renders at all", async () => {
    const html = await renderCockpit(new HttpAdapter("/api"));
    expect(html).not.toContain("Who is busy");
    expect(html).not.toContain("No agents yet");
  });
});

describe("CockpitWaiting (§3.1 + persona round 1)", () => {
  it("default: ONE summary number-action leading to the most urgent list; owner language", async () => {
    const html = await renderCockpit(new MockAdapter({ latency: false }));
    expect(html).toContain("Waiting for you");
    // 3 inbox + 2 in-review + 4 queued = 9 waiting (fixtures). ME-072 C:
    // the numeral IS the count — the label no longer repeats the number.
    expect(html).toContain(">9</span>");
    expect(html).toContain("waiting for you</span>");
    expect(html).not.toContain("waiting for you: 9");
    // The summary's click target is the MOST URGENT list — the inbox first.
    expect(html).toContain('href="/tasks/inbox"');
    // The source rows are quiet links with the owner's wording.
    expect(html).toContain("Inbox: 3");
    expect(html).toContain("In review: 2");
    expect(html).toContain("Queued: 4");
    // «на проверке», never the internal "validating" (persona round 1).
    expect(html).not.toContain("validating");
  });

  it("zero: nothing waits — the block does not render (anti-dashboard)", async () => {
    const html = await renderCockpit(new EmptyCockpitAdapter());
    expect(html).not.toContain("Waiting for you");
    expect(html).not.toContain("waiting for you");
  });

  it("source error (§10.12): the WHOLE block becomes one HonestLine — no partial sum (review P3-2/P3-5)", async () => {
    class RejectingInbox extends MockAdapter {
      override inbox(): Promise<never> {
        return Promise.reject(new Error("boom"));
      }
    }
    await mountCockpitDom(new RejectingInbox());
    await waitForDom(
      "the waiting error line",
      () =>
        document.body.textContent?.includes("Could not count what is waiting") ===
        true,
    );
    // No partial sum beside the error: the honest state replaces the count
    // (a partial "waiting: N" would silently undercount).
    expect(document.body.textContent).not.toContain("waiting for you");
    expect(document.body.textContent).not.toContain("Inbox:");
    expect(document.body.textContent).toContain("Retry");
  });

  it("capability absence (vesma adapter): nothing renders at all", async () => {
    const html = await renderCockpit(new HttpAdapter("/api"));
    expect(html).not.toContain("Waiting for you");
  });
});
