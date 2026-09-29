// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

import { GatedOutlet } from "./GatedOutlet";
import { UiTokenProvider } from "./UiTokenProvider";
import { BoardAdapter } from "@/gateway/BoardAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { ToastViewport } from "@/components/Toast/ToastViewport";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/i18n";
import { clearUiToken, UI_TOKEN_STORAGE_KEY } from "@/gateway/uiToken";

/**
 * Cascade P2 (ME-043): a 401 on a READ rebuilds the session verdict — the
 * exact hole the auditors named. A stale/foreign sessionStorage token boots
 * as "user" (the boot verdict cannot know better), the gated page mounts,
 * its query 401s — and instead of the ETERNAL raw error state the verdict
 * must flip: the gated components unmount behind the honest gate screen.
 * The cookie-leg recovery (the rotation case) re-flies the fallen reads,
 * and a post-recovery 401 lands anonymous without looping.
 *
 * Real UiTokenProvider + real gate + real TanStack cache — no context
 * stubs: the seam under test IS the provider's cache subscription.
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const mountedRoots: Root[] = [];

async function mountTree(options: {
  probeStatus: number;
  boardAnswer: (headers: Record<string, string>) => Response;
  path?: string;
}): Promise<{
  container: HTMLDivElement;
  queryClient: QueryClient;
}> {
  const { probeStatus, boardAnswer, path = "/memory" } = options;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/auth/ui-token")) {
      if (method === "GET") {
        return probeStatus === 204
          ? new Response(null, { status: 204 })
          : jsonResponse({ live: false }, probeStatus);
      }
      return jsonResponse({ ok: true, token_class: "ui" });
    }
    if (url.endsWith("/api/board")) {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      return boardAnswer(headers);
    }
    return jsonResponse({});
  });
  const gateway = new BoardAdapter({ baseUrl: "/api", fetchImpl: fetchImpl as never });
  // The stale/foreign token the boot verdict has no choice but to trust.
  sessionStorage.setItem(UI_TOKEN_STORAGE_KEY, "ui-stale-or-foreign");

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  function BoardReader() {
    // A REAL read over the wire — its 401 lands in the query cache, which
    // is the seam the provider subscribes to.
    const board = useQuery({
      queryKey: ["cascade", "board"],
      queryFn: (context: { signal: AbortSignal }) => gateway.board(undefined, context.signal),
    });
    return (
      <div data-testid="gated-child">
        {board.isError ? "READ ERROR STATE" : board.data ? "BOARD CONTENT" : "loading"}
      </div>
    );
  }

  await act(async () => {
    root.render(
      <I18nProvider initialLang="en">
        <GatewayContext.Provider value={gateway}>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <ToastProvider>
                <UiTokenProvider>
                  <MemoryRouter>
                    <GatedOutlet pathname={path} search="">
                      <BoardReader />
                    </GatedOutlet>
                    <ToastViewport />
                  </MemoryRouter>
                </UiTokenProvider>
              </ToastProvider>
            </ThemeProvider>
          </QueryClientProvider>
        </GatewayContext.Provider>
      </I18nProvider>,
    );
  });
  // Let the query + the rebuild (probe round-trip) settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  return { container, queryClient };
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", new MemoryStorage());
  vi.stubGlobal("localStorage", new MemoryStorage());
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearUiToken();
});

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) {
    await act(async () => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
});

describe("read-401 → session verdict rebuild (cascade P2)", () => {
  it("a stale token boots as user, the read 401s, the verdict flips — gate screen, gated content UNMOUNTS", { timeout: 20000 }, async () => {
    const { container } = await mountTree({
      probeStatus: 200, // the anonymous none-answer
      boardAnswer: () => jsonResponse({ error: "unauthorized" }, 401),
    });
    // The verdict flipped: the honest gate screen owns the slot, the gated
    // components (and their eternal error state) are gone.
    expect(container.querySelector('[data-testid="gate-screen"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="gated-child"]')).toBeNull();
    expect(container.textContent).not.toContain("READ ERROR STATE");
    expect(container.textContent).toContain(
      "The “Memory” section opens after you sign in",
    );
    // The beat is announced (the provider's tokenRejected toast).
    expect(container.textContent).toContain("Token rejected");
  });

  it("the cookie leg still live (rotation case): the header token is dropped, the reads RE-FLY and recover", { timeout: 20000 }, async () => {
    const { container } = await mountTree({
      probeStatus: 204, // a live cookie beside the stale header token
      boardAnswer: (headers) =>
        headers.Authorization ? jsonResponse({ error: "unauthorized" }, 401) : jsonResponse({
          tasks: [],
          counts: { open: 0, doing: 0, blocked: 0, review: 0, done: 0 },
          columns: ["open", "doing", "blocked", "review", "done"],
        }),
    });
    // No gate: the session rides the cookie leg and the invalidated read
    // re-flew headerless — the page recovered in place.
    expect(container.querySelector('[data-testid="gate-screen"]')).toBeNull();
    expect(container.querySelector('[data-testid="gated-child"]')).not.toBeNull();
    expect(container.textContent).toContain("BOARD CONTENT");
    expect(container.textContent).not.toContain("READ ERROR STATE");
  });

  it("a 401 AFTER the cookie recovery lands anonymous without a probe loop (one recovery per gate)", { timeout: 20000 }, async () => {
    const { container } = await mountTree({
      probeStatus: 204, // the cookie "always" answers 204 (server contradiction)
      boardAnswer: () => jsonResponse({ error: "unauthorized" }, 401),
    });
    // First burst: recovery (probe 204, header dropped, invalidate); the
    // re-flown read 401s again → the second burst goes straight anonymous.
    expect(container.querySelector('[data-testid="gate-screen"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="gated-child"]')).toBeNull();
    expect(container.textContent).not.toContain("READ ERROR STATE");
  });
});
