import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Sidebar } from "./Sidebar";
import { authSessionProbe, initAuthSession } from "@/features/ui-token/authSession";
import { BoardAdapter } from "@/gateway/BoardAdapter";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { HotkeysProvider } from "@/layout/Hotkeys";
import { I18nProvider } from "@/i18n";
import { keys } from "@/lib/queryKeys";
import { clearUiToken, UI_TOKEN_STORAGE_KEY } from "@/gateway/uiToken";

/**
 * Sidebar locks (ME-043, gates v6 — 07k §2.2): an anonymous board visitor
 * sees the honest lock on every GATED domain (the lock replaces the
 * counter — numbers are content), with the worded reason in the tooltip;
 * public domains stay lock-free; users see no locks; a pending boot shows
 * none either (only a CONFIRMED anonymous verdict locks). The rows stay
 * navigable — URL-first, the click goes to the real route (the gate
 * screen), never a fake redirect.
 */

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", new MemoryStorage());
  vi.stubGlobal("localStorage", new MemoryStorage());
  clearUiToken();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A board adapter whose boot probe answers `probeStatus` (200 = the
 * honest ME-028 anonymous none-answer; 204 = a live cookie) and whose
 * inbox read answers ONE queued record (the counter leak-probe). */
function boardGateway(probeStatus: number): BoardAdapter {
  return new BoardAdapter({
    baseUrl: "/api",
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/auth/ui-token") && (init?.method ?? "GET") === "GET") {
        return probeStatus === 204
          ? new Response(null, { status: 204 })
          : jsonResponse({ live: false }, probeStatus);
      }
      if (url.endsWith("/api/tasks/inbox")) {
        return jsonResponse({ items: [], count: 1, refreshed_at: "2026-09-29T00:00:00Z" });
      }
      return jsonResponse({});
    }) as never,
  });
}

/** Seed the inbox cache so the counter WOULD render (the leak-probe case). */
async function seedInbox(gateway: BoardAdapter): Promise<QueryClient> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  await queryClient.prefetchQuery({
    queryKey: keys.tasks.inbox({}),
    queryFn: () => gateway.inbox(),
  });
  return queryClient;
}

function renderSidebar(
  gateway: BoardAdapter | MockAdapter,
  queryClient: QueryClient,
  collapsed = false,
): string {
  return renderToString(
    <GatewayContext.Provider value={gateway}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider initialLang="en">
          <HotkeysProvider>
            <MemoryRouter initialEntries={["/memory"]}>
              <Sidebar collapsed={collapsed} onToggle={() => undefined} />
            </MemoryRouter>
          </HotkeysProvider>
        </I18nProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>,
  );
}

describe("locks for an anonymous board visitor (probe settled {live:false})", () => {
  it("gated domains carry the lock with the WORDED reason; the row stays navigable (URL-first)", async () => {
    const gateway = boardGateway(200);
    initAuthSession(gateway);
    await authSessionProbe(gateway);
    const html = renderSidebar(gateway, await seedInbox(gateway));
    // Five locks — one per gated domain (Memory, Tasks, Agents, Kora, System).
    expect(html.match(/data-testid="domain-lock"/g)).toHaveLength(5);
    // The reason is words, not a bare icon (07a: why-closed in words).
    expect(html).toContain("Memory — opens after you sign in");
    expect(html).toContain("Kora — opens after you sign in");
    // URL-first: the locked domains still render real links to their routes.
    expect(html).toMatch(/<a[^>]*href="\/memory"[^>]*>/);
    expect(html).toMatch(/<a[^>]*href="\/kora"[^>]*>/);
  });

  it("public domains (Обзор, Документы) stay lock-free", async () => {
    const gateway = boardGateway(200);
    initAuthSession(gateway);
    await authSessionProbe(gateway);
    const html = renderSidebar(gateway, await seedInbox(gateway));
    expect(html).not.toContain("Overview — opens after you sign in");
    expect(html).not.toContain("Docs — opens after you sign in");
  });

  it("the lock REPLACES the counter: a seeded inbox count never renders for the anonymous", async () => {
    const gateway = boardGateway(200);
    initAuthSession(gateway);
    await authSessionProbe(gateway);
    const queryClient = await seedInbox(gateway);
    const html = renderSidebar(gateway, queryClient);
    // The seeded cache holds one queued record (the user case below proves
    // the badge renders from it); the anonymous sidebar must NOT display
    // the number — neither the section badge nor the domain aggregate.
    expect(html).not.toContain('aria-label="new: 1"');
    expect(html).not.toContain(">new: 1<");
  });

  it("the rail keeps the lock visible under the domain icon (07k §2.2)", async () => {
    const gateway = boardGateway(200);
    initAuthSession(gateway);
    await authSessionProbe(gateway);
    const html = renderSidebar(gateway, await seedInbox(gateway), true);
    // Collapsed rail: locks render (the icon column variant), labels do not.
    expect(html).toMatch(/data-testid="domain-lock"/);
    expect(html).not.toContain(">Memory</span>");
  });
});

describe("no locks outside a confirmed anonymous verdict", () => {
  it("a user (stored token) sees no locks — and the inbox counter is back", async () => {
    const gateway = boardGateway(200);
    sessionStorage.setItem(UI_TOKEN_STORAGE_KEY, "ui-live");
    initAuthSession(gateway);
    await authSessionProbe(gateway);
    const queryClient = await seedInbox(gateway);
    const html = renderSidebar(gateway, queryClient);
    expect(html).not.toContain('data-testid="domain-lock"');
    expect(html).not.toContain("opens after you sign in");
    // Positive control for the leak-probe case: the SAME seeded cache
    // renders the badge for the user — the anonymous hiding is real.
    expect(html).toContain('aria-label="new: 1"');
  });

  it("a pending boot (probe in flight) locks NOTHING — only a verdict locks", () => {
    const gateway = new BoardAdapter({
      baseUrl: "/api",
      fetchImpl: (() => new Promise(() => undefined)) as never,
    });
    initAuthSession(gateway);
    const html = renderSidebar(
      gateway,
      new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } }),
    );
    expect(html).not.toContain('data-testid="domain-lock"');
  });

  it("the mock playground renders no locks — the deployment has no auth wall", () => {
    const html = renderSidebar(
      new MockAdapter({ latency: false }),
      new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } }),
    );
    expect(html).not.toContain('data-testid="domain-lock"');
  });
});
