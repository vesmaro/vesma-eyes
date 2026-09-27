// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { HostsRosterPage } from "./HostsRosterPage";
import { buildRoutes } from "@/app/routes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { DensityProvider } from "@/components/density-provider";
import { HotkeysProvider } from "@/layout/Hotkeys";
import type { AssignmentItem, ExecutorItem, ExecutorsPage } from "@/gateway/boardTypes";
import { actFlush, actUnmount, actWaitUntil } from "@/test/actTools";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * `/agents/hosts` — the ME-014 agent roster: the host grouping over the
 * LIVE executors page, the ticking presence age off the server meta TTLs,
 * the disabled badge riding OVER the (green) presence dot, the active-
 * assignment chip (client join) or the honest «idle», the one-click
 * drill-down into the EXISTING AssignmentDrawer / ExecutorSheet, and the
 * roster's ZERO-mutation surface. The default-redirect case drives the REAL
 * route table (/agents must land here).
 *
 * Fixtures are built against a per-mount base (real clock); the tick test
 * fakes ONLY Date (real timers stay) so the shared 1 Hz ticker re-renders
 * from a controlled clock.
 */

const ago = (base: number, seconds: number): string =>
  new Date(base - seconds * 1000).toISOString();

function executor(
  base: number,
  overrides: Partial<ExecutorItem> & { id: string },
): ExecutorItem {
  return {
    name: overrides.id,
    harness: "zcode",
    host: "laptop",
    transport: "local-poll",
    capabilities: [],
    version: "1.0.0",
    enabled: true,
    state: "approved",
    last_seen: ago(base, 30),
    presence: "online",
    registered_via: "",
    registered_at: "",
    updated_at: "",
    ...overrides,
  };
}

function assignment(base: number, overrides: Partial<AssignmentItem>): AssignmentItem {
  return {
    id: 1,
    task_id: "TB-1",
    specialist: "SFE",
    harness: "zcode",
    state: "queued",
    created_by: "owner",
    claimed_by: null,
    note: "",
    spec_hash: "",
    executor_id: "",
    claimed_by_executor: "",
    created_at: ago(base, 60),
    claimed_at: null,
    started_at: null,
    heartbeat_at: null,
    finished_at: null,
    topics: [],
    routing: null,
    ...overrides,
  };
}

/** The verdict's grouping fixture: 3 executors across 2 hosts. */
function rosterExecutors(base: number): ExecutorItem[] {
  return [
    executor(base, { id: "ex-1", name: "zcode@laptop" }),
    // Online BUT disabled — the badge must ride over the green dot.
    executor(base, { id: "ex-2", name: "hermes@laptop", enabled: false }),
    executor(base, {
      id: "ex-3",
      name: "zcode@mesh-2",
      host: "mesh-2",
      last_seen: ago(base, 300), // stale (120–600 s)
      presence: "stale",
    }),
  ];
}

function rosterAssignments(base: number): AssignmentItem[] {
  return [
    // ex-1's active work: TB-1 claimed (the corpus title is asserted).
    assignment(base, {
      id: 11,
      task_id: "TB-1",
      state: "claimed",
      claimed_by_executor: "ex-1",
      claimed_at: ago(base, 30),
    }),
    // ex-3's pre-claim pin: TB-5 queued for it, not claimed yet.
    assignment(base, {
      id: 12,
      task_id: "TB-5",
      state: "queued",
      executor_id: "ex-3",
      created_at: ago(base, 45),
    }),
  ];
}

function executorsPage(items: ExecutorItem[]): ExecutorsPage {
  return {
    ok: true,
    count: items.length,
    items,
    meta: {
      presence: { online_max_age_s: 120, stale_max_age_s: 600 },
      sweeper_interval_s: 60,
    },
  };
}

interface MountOptions {
  executors?: (base: number) => ExecutorItem[];
  assignments?: (base: number) => AssignmentItem[];
  path?: string;
  /** Freeze the clock at the fixture base (fake Date, REAL timers). */
  freezeClock?: boolean;
}

async function mountPage(options: MountOptions = {}): Promise<{
  root: Root;
  container: HTMLElement;
  client: QueryClient;
}> {
  const {
    executors = rosterExecutors,
    assignments = rosterAssignments,
    path = "/agents/hosts",
  } = options;
  const base = Date.now();
  if (options.freezeClock) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(base);
  }
  const gateway = new MockAdapter({ latency: false });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await client.prefetchQuery({
    queryKey: keys.tasks.board(),
    queryFn: () => gateway.board(),
  });
  client.setQueryData(keys.agents.executors.list(), executorsPage(executors(base)));
  client.setQueryData(keys.agents.assignments.list({}), {
    ok: true,
    count: assignments(base).length,
    items: assignments(base),
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <GatewayContext.Provider value={gateway}>
        <QueryClientProvider client={client}>
          <ToastProvider>
            <UiTokenProvider>
              <I18nProvider initialLang="en">
                <MemoryRouter initialEntries={[path]}>
                  <HostsRosterPage />
                </MemoryRouter>
              </I18nProvider>
            </UiTokenProvider>
          </ToastProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return { root, container, client };
}

/** Unmount + restore the (possibly faked) clock. */
async function teardown(root: Root): Promise<void> {
  await actUnmount(root);
  vi.useRealTimers();
}

const group = (container: HTMLElement, label: string): HTMLElement | null =>
  container.querySelector<HTMLElement>(`section[aria-label="${label}"]`);

const rowOf = (container: HTMLElement, host: string, name: string): HTMLButtonElement =>
  [...group(container, host)!.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(name),
  )!;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("host grouping (the client-side projection)", () => {
  it("lands 3 executors into 2 host groups with live «N/M online» counters", async () => {
    const { root, container } = await mountPage();
    const sections = [
      ...container.querySelectorAll<HTMLElement>("section[aria-label]"),
    ].map((section) => section.getAttribute("aria-label"));
    expect(sections).toEqual(["laptop", "mesh-2"]);
    // Laptop: both members report online; mesh-2: the stale member does not.
    expect(group(container, "laptop")!.textContent).toContain("2/2 online");
    expect(group(container, "mesh-2")!.textContent).toContain("0/1 online");
    // Every agent appears exactly once, grouped under its host.
    expect(group(container, "laptop")!.textContent).toContain("zcode@laptop");
    expect(group(container, "laptop")!.textContent).toContain("hermes@laptop");
    expect(group(container, "mesh-2")!.textContent).toContain("zcode@mesh-2");
    await actUnmount(root);
  });

  it("renders the honest empty state pointing at the registry (no bands)", async () => {
    const { root, container } = await mountPage({
      executors: () => [],
      assignments: () => [],
    });
    expect(container.textContent).toContain("No agents yet");
    expect(container.querySelector('a[href="/agents/harnesses"]')).not.toBeNull();
    expect(group(container, "laptop")).toBeNull();
    await actUnmount(root);
  });
});

describe("presence age ticks from the server meta TTLs", () => {
  it("classifies by the meta bounds and re-renders the age as the clock ticks", async () => {
    const { root, container } = await mountPage({
      executors: (base) => [
        executor(base, { id: "ex-1", host: "laptop", last_seen: ago(base, 59) }),
      ],
      assignments: () => [],
      freezeClock: true,
    });
    // The module-level ticker may hold a snapshot from an earlier test —
    // one real tick aligns it with the frozen clock.
    await actFlush(1100);
    // 59 s ≤ 120 s (meta.presence.online_max_age_s) → online, age «0min».
    const dot = container.querySelector("button span.size-2");
    expect(dot?.className).toContain("bg-iris-bright");
    expect(container.textContent).toContain("last seen: 0min");
    expect(container.textContent).toContain("1/1 online");
    // Tick the CLIENT clock past the online bound (59 + 65 = 124 s > 120 s
    // online, ≤ 600 s stale): the same server TTL contract reclassifies the
    // dot and the age ticks up — no refetch, the ticker alone.
    vi.setSystemTime(Date.now() + 65_000);
    await actFlush(1300); // one real 1 Hz tick
    expect(dot?.className).toContain("bg-warning");
    expect(container.textContent).toContain("last seen: 2min");
    expect(container.textContent).toContain("0/1 online");
    await teardown(root);
  });
});

describe("the disabled badge rides OVER the presence dot", () => {
  it("a disabled agent stays green-dotted AND visibly undispatchable", async () => {
    const { root, container } = await mountPage();
    const row = rowOf(container, "laptop", "hermes@laptop");
    // Presence honesty (two-clock rule): the dot stays online-green...
    const dot = row.querySelector("span.size-2");
    expect(dot?.className).toContain("bg-iris-bright");
    // ...while the badge carries the routing refusal with the full why.
    const badge = [...row.querySelectorAll("span[title]")].find((span) =>
      span.getAttribute("title")?.includes("routing off"),
    );
    expect(badge).toBeDefined();
    expect(badge!.textContent).toBe("disabled");
    await actUnmount(root);
  });
});

describe("the active-assignment chip (the client join)", () => {
  it("shows task title + state for active work and the honest idle otherwise", async () => {
    const { root, container } = await mountPage();
    // The claimed assignment: the corpus task title + the state badge.
    const ex1 = rowOf(container, "laptop", "zcode@laptop");
    expect(ex1.textContent).toContain("борд v0.3");
    expect(ex1.textContent).toContain("claimed");
    // The pre-claim pin shows the queued work it is already slated for.
    const ex3 = rowOf(container, "mesh-2", "zcode@mesh-2");
    expect(ex3.textContent).toContain("SSE-слой");
    expect(ex3.textContent).toContain("queued");
    // No active work → «idle», never a recycled row.
    const ex2 = rowOf(container, "laptop", "hermes@laptop");
    expect(ex2.textContent).toContain("idle");
    await actUnmount(root);
  });
});

describe("the drill-down reuses the existing surfaces", () => {
  it("an agent WITH active work opens the AssignmentDrawer and the live-feed link", async () => {
    const { root, container } = await mountPage();
    await act(async () => {
      rowOf(container, "laptop", "zcode@laptop").click();
    });
    // Radix portals the drawer into the body.
    await actWaitUntil(() => {
      expect(document.body.textContent).toContain("Phase timeline");
    });
    // The «сессия» transition: the link into the task's live execution feed
    // carries the roster as the return target (UI-18 back-link).
    const feedLink = document.body.querySelector<HTMLAnchorElement>(
      'a[href*="/tasks/TB-1"]',
    );
    expect(feedLink).not.toBeNull();
    expect(feedLink!.getAttribute("href")).toContain("tab=execution");
    expect(feedLink!.getAttribute("href")).toContain(
      `return=${encodeURIComponent("/agents/hosts")}`,
    );
    await actUnmount(root);
  });

  it("an idle agent opens the ExecutorSheet (the registry card as-is)", async () => {
    const { root, container } = await mountPage();
    await act(async () => {
      rowOf(container, "laptop", "hermes@laptop").click();
    });
    await actWaitUntil(() => {
      expect(document.body.textContent).toContain("Executor card");
    });
    await actUnmount(root);
  });
});

describe("the roster surface is mutation-free", () => {
  it("renders NO registry buttons and NO context-menu triggers", async () => {
    const { root, container } = await mountPage();
    const text = container.textContent ?? "";
    for (const forbidden of [
      "Approve",
      "Revoke",
      "Enable",
      "Disable",
      "Delete",
      "Save",
    ]) {
      expect(text).not.toContain(forbidden);
    }
    // The registry rows' ⋯ menu trigger never appears on the roster.
    expect(
      container.querySelector('button[aria-label^="Actions for executor"]'),
    ).toBeNull();
    expect(container.querySelectorAll("[role='menuitem']")).toHaveLength(0);
    await actUnmount(root);
  });
});

describe("the /agents default landing", () => {
  it("the REAL route table redirects /agents to the roster", async () => {
    const base = Date.now();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(base);
    const gateway = new MockAdapter({ latency: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await client.prefetchQuery({
      queryKey: keys.tasks.board(),
      queryFn: () => gateway.board(),
    });
    client.setQueryData(
      keys.agents.executors.list(),
      executorsPage(rosterExecutors(base)),
    );
    client.setQueryData(keys.agents.assignments.list({}), {
      ok: true,
      count: 0,
      items: [],
    });
    const router = createMemoryRouter(buildRoutes(), { initialEntries: ["/agents"] });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <GatewayContext.Provider value={gateway}>
          <QueryClientProvider client={client}>
            <AuthProvider adapterMode="board" endpoint="test">
              <ThemeProvider>
                <I18nProvider initialLang="en">
                  <DensityProvider initialDensity="comfortable">
                    <HotkeysProvider>
                      <ToastProvider>
                        <UiTokenProvider>
                          <RouterProvider router={router} />
                        </UiTokenProvider>
                      </ToastProvider>
                    </HotkeysProvider>
                  </DensityProvider>
                </I18nProvider>
              </ThemeProvider>
            </AuthProvider>
          </QueryClientProvider>
        </GatewayContext.Provider>,
      );
    });
    // The redirect resolved into the ROSTER (the host groups), not the
    // execution view — and the router now sits on /agents/hosts.
    await actWaitUntil(() => {
      expect(router.state.location.pathname).toBe("/agents/hosts");
      expect(group(container, "laptop")).not.toBeNull();
    });
    // The execution view did NOT render as the landing.
    expect(container.querySelector('[aria-label="Executors"]')).toBeNull();
    await actUnmount(root);
    vi.useRealTimers();
  });
});
