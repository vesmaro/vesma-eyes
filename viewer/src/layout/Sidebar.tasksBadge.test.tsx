// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Sidebar } from "./Sidebar";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import type { TaskInbox } from "@/gateway/boardTypes";

/**
 * UI-30 (owner directive): the «Задачи» domain row carries a LIVE badge =
 * the aggregate of its sections' counters (the inbox counter today). The
 * owner scenario is the whole point: on ANY page (the tasks domain closed),
 * new inbox arrivals are visible BEFORE opening the section — and in BOTH
 * sidebar states (expanded panel + collapsed rail). The aggregate reads the
 * SAME `tasks.inbox` cache entry as the «Входящие» badge: a cache patch
 * (what an SSE bridge handler does) re-renders the badge with NO refetch.
 *
 * Patterns: Sidebar.hygiene.test.tsx (renderToString state pins) +
 * Sidebar.mobile.test.tsx (happy-dom createRoot + vi.waitFor reactivity).
 */

function stubMatchMedia(matches: boolean): void {
  const stub = (query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  (globalThis as { matchMedia: unknown }).matchMedia = stub;
  (window as { matchMedia: unknown }).matchMedia = stub;
}

const mountedRoots: Root[] = [];

/** Warm-cache render (state pins): prefetch the inbox entry, then SSR. */
async function renderSidebarWithInbox(options: {
  path?: string;
  collapsed?: boolean;
  lang?: "ru" | "en";
  inbox: Pick<TaskInbox, "count"> & Partial<Pick<TaskInbox, "items" | "refreshed_at">>;
}): Promise<string> {
  const adapter = new MockAdapter({ latency: false });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData<TaskInbox>(keys.tasks.inbox(), {
    items: [],
    refreshed_at: "2026-09-27T00:00:00Z",
    ...options.inbox,
  });
  return renderToString(
    <GatewayContext.Provider value={adapter}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider initialLang={options.lang ?? "ru"}>
          <MemoryRouter initialEntries={[options.path ?? "/memory"]}>
            <Sidebar
              collapsed={options.collapsed ?? false}
              onToggle={() => undefined}
            />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>,
  );
}

/** Reactive mount (live-update pin): a real MockAdapter so the inbox query
 * resolves, wrapped in a spy to prove a cache patch triggers NO refetch. */
async function mountLiveSidebar(
  options: {
    path?: string;
    collapsed?: boolean;
    lang?: "ru" | "en";
  } = {},
): Promise<{
  container: HTMLElement;
  queryClient: QueryClient;
  inboxSpy: ReturnType<typeof vi.spyOn>;
}> {
  const adapter = new MockAdapter({ latency: false });
  const inboxSpy = vi.spyOn(adapter, "inbox");
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <GatewayContext.Provider value={adapter}>
        <QueryClientProvider client={queryClient}>
          <I18nProvider initialLang={options.lang ?? "ru"}>
            <MemoryRouter initialEntries={[options.path ?? "/memory"]}>
              <Sidebar
                collapsed={options.collapsed ?? false}
                onToggle={() => undefined}
              />
            </MemoryRouter>
          </I18nProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return { container, queryClient, inboxSpy };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) {
    await act(async () => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
});

describe("Tasks domain aggregate badge (UI-30)", () => {
  it("shows the aggregate on the domain row while the tasks domain is CLOSED (>0)", async () => {
    const html = await renderSidebarWithInbox({
      path: "/memory", // sections of /tasks are not rendered at all here
      inbox: { count: 3 },
    });
    // The badge rides the «Задачи» row and names the live sum.
    expect(html).toContain('aria-label="Задачи"');
    expect(html).toContain("новых: 3");
  });

  it("hides at zero (honest absence, no dead «0»)", async () => {
    const html = await renderSidebarWithInbox({
      inbox: { count: 0 },
    });
    expect(html).toContain('aria-label="Задачи"');
    expect(html).not.toContain("новых:");
  });

  it("hides while the source is unknown (pending — SSR cold cache)", () => {
    const adapter = new MockAdapter({ latency: false });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { enabled: false, retry: false } },
    });
    const html = renderToString(
      <GatewayContext.Provider value={adapter}>
        <QueryClientProvider client={queryClient}>
          <I18nProvider initialLang="ru">
            <MemoryRouter initialEntries={["/memory"]}>
              <Sidebar collapsed={false} onToggle={() => undefined} />
            </MemoryRouter>
          </I18nProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
    expect(html).toContain('aria-label="Задачи"');
    expect(html).not.toContain("новых:");
  });

  it("expanded panel: the badge is the «Входящие» pill (same tokens, ml-auto)", async () => {
    const html = await renderSidebarWithInbox({ inbox: { count: 3 } });
    const match = html.match(
      /<span title="новых: 3"[^>]*class="([^"]+)"[^>]*>3<\/span>/,
    );
    expect(match).not.toBeNull();
    const classes = match![1];
    // Identical token set to the InboxCount pill — zero new colours.
    expect(classes).toContain("ml-auto");
    expect(classes).toContain("rounded-full");
    expect(classes).toContain("bg-iris-tint");
    expect(classes).toContain("font-mono");
    expect(classes).toContain("text-xs");
    expect(classes).toContain("text-iris-bright");
    expect(classes).toContain("shrink-0");
  });

  it("collapsed rail: a compact corner pill INSIDE the row (UI-19 — no overflow)", async () => {
    const html = await renderSidebarWithInbox({
      collapsed: true,
      inbox: { count: 3 },
    });
    // The rail variant is pinned to the row (relative) and width-bounded.
    expect(html).toMatch(/aria-label="Задачи"[^>]*class="[^"]*\brelative\b/);
    expect(html).toContain("absolute right-1 top-1");
    expect(html).toContain("новых: 3");
    // The rail never shows the wide ml-auto pill.
    expect(html).not.toContain("ml-auto inline-flex");
  });

  it("rail caps three-digit sums at 99+ (bounded width); expanded shows the raw count", async () => {
    const rail = await renderSidebarWithInbox({
      collapsed: true,
      inbox: { count: 150 },
    });
    expect(rail).toContain("новых: 150"); // accessible name keeps the truth
    expect(rail).toContain(">99+</span>");
    const expanded = await renderSidebarWithInbox({
      inbox: { count: 150 },
    });
    expect(expanded).toContain(">150</span>");
  });

  it("en parity: the badge tooltip/name translates", async () => {
    const en = await renderSidebarWithInbox({
      lang: "en",
      inbox: { count: 3 },
    });
    expect(en).toContain("new: 3");
    expect(en).not.toContain("новых: 3");
  });

  it("live update: a cache patch (the SSE-bridge write) changes the badge with NO refetch", async () => {
    stubMatchMedia(true);
    const { container, queryClient, inboxSpy } = await mountLiveSidebar({
      path: "/memory", // owner scenario: tasks domain closed
    });
    await vi.waitFor(() => {
      expect(container.innerHTML).toContain("новых: 3");
    });
    expect(inboxSpy).toHaveBeenCalledTimes(1); // the one initial read

    // Exactly what an SSE inbox event handler does: patch the shared key.
    act(() => {
      queryClient.setQueryData<TaskInbox>(keys.tasks.inbox(), (prev) =>
        prev ? { ...prev, count: 5 } : prev,
      );
    });
    await vi.waitFor(() => {
      expect(container.innerHTML).toContain("новых: 5");
    });
    // No refetch happened — the badge lives off the cache, not the wire.
    expect(inboxSpy).toHaveBeenCalledTimes(1);
  });

  it("live update hides the badge when the patch drops the sum to zero", async () => {
    stubMatchMedia(true);
    const { container, queryClient } = await mountLiveSidebar();
    await vi.waitFor(() => {
      expect(container.innerHTML).toContain("новых: 3");
    });
    act(() => {
      queryClient.setQueryData<TaskInbox>(keys.tasks.inbox(), (prev) =>
        prev ? { ...prev, count: 0 } : prev,
      );
    });
    await vi.waitFor(() => {
      expect(container.innerHTML).not.toContain("новых:");
    });
  });
});
