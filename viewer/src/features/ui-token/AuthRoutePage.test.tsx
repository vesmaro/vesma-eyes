// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthRoutePage } from "./AuthRoutePage";
import { UiTokenProvider } from "./UiTokenProvider";
import { BoardAdapter } from "@/gateway/BoardAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { ToastViewport } from "@/components/Toast/ToastViewport";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/i18n";
import { clearUiToken, UI_TOKEN_STORAGE_KEY } from "@/gateway/uiToken";

/**
 * The /auth route (ME-043, 07k §4 as a React route): the returnTo contract
 * and the honest outcomes, through the REAL UiTokenProvider + gate (no
 * context stubs — the route must drive the same state machine as the
 * login window, one implementation per concept).
 *
 * Pinned walks:
 * - gate → /auth?return=<path+query> → sign in → back to the DEEP LINK,
 *   query intact (ME-026: the query must survive the round trip);
 * - the register tab shows the owner-policy stub, never a fake form;
 * - arriving already signed in redirects with the honest «already signed
 *   in» toast (07k §4.2);
 * - a refused token shows the inline verdict on the route itself.
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

function setInputValue(input: HTMLInputElement, value: string): void {
  const proto = Object.getPrototypeOf(input) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const mountedRoots: Root[] = [];

function probePageText(): string {
  return "DEEP LINK LANDING";
}

async function mountAuth(options: {
  initialUrl: string;
  probeStatus?: number;
  verifyStatus?: number;
  storedToken?: string;
}): Promise<{ router: ReturnType<typeof createMemoryRouter>; container: HTMLDivElement }> {
  const { initialUrl, probeStatus = 200, verifyStatus = 200, storedToken } = options;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/auth/ui-token")) {
      if (method === "GET") {
        return probeStatus === 204
          ? new Response(null, { status: 204 })
          : jsonResponse({ live: false }, probeStatus);
      }
      if (method === "POST") {
        return verifyStatus === 200
          ? jsonResponse({ ok: true, token_class: "ui" })
          : jsonResponse({ error: "not accepted" }, 401);
      }
      return new Response(null, { status: 204 }); // DELETE logout
    }
    return jsonResponse({});
  });
  if (storedToken) sessionStorage.setItem(UI_TOKEN_STORAGE_KEY, storedToken);
  const gateway = new BoardAdapter({ baseUrl: "/api", fetchImpl: fetchImpl as never });

  const router = createMemoryRouter(
    [
      // The visible toast region rides inside the router (same placement as
      // the Shell) — the «already signed in» beat asserts through it.
      { path: "/auth", element: <><AuthRoutePage /><ToastViewport /></> },
      {
        path: "/memory/search",
        element: <><p data-testid="landing">{probePageText()}</p><ToastViewport /></>,
      },
      {
        path: "/",
        element: <><p data-testid="landing">OVERVIEW</p><ToastViewport /></>,
      },
    ],
    { initialEntries: [initialUrl] },
  );

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <I18nProvider initialLang="en">
        <GatewayContext.Provider value={gateway}>
          <QueryClientProvider client={new QueryClient()}>
            <ThemeProvider>
              <ToastProvider>
                <UiTokenProvider>
                  <RouterProvider router={router} />
                </UiTokenProvider>
              </ToastProvider>
            </ThemeProvider>
          </QueryClientProvider>
        </GatewayContext.Provider>
      </I18nProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return { router, container };
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

describe("returnTo round trip (07k §4.2 + UI-18 transport, ME-026)", () => {
  it("gate → sign in → back to the DEEP LINK with the query intact", { timeout: 20000 }, async () => {
    // The gate screen would link here carrying the WHOLE pathname+search:
    const { router, container } = await mountAuth({
      initialUrl: "/auth?return=%2Fmemory%2Fsearch%3Fq%3Dproject%3Agcw",
    });
    const tokenInput = document.getElementById("login-token-value") as HTMLInputElement;
    expect(tokenInput).not.toBeNull();
    await act(async () => {
      setInputValue(tokenInput, "ui-route-secret");
      (tokenInput.closest("form") as HTMLFormElement).requestSubmit();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    // Landed on the deep link — path AND search (project:gcw survived).
    expect(router.state.location.pathname).toBe("/memory/search");
    expect(router.state.location.search).toBe("?q=project:gcw");
    expect(container.textContent).toContain("DEEP LINK LANDING");
    // The route left no stale form behind.
    expect(document.getElementById("login-token-value")).toBeNull();
  });

  it("a rejected / foreign return shape falls back to the public Обзор", { timeout: 20000 }, async () => {
    // https://evil.example cannot pass resolveReturnTarget (no scheme, no //).
    const { router } = await mountAuth({
      initialUrl: "/auth?return=" + encodeURIComponent("https://evil.example/x"),
    });
    const tokenInput = document.getElementById("login-token-value") as HTMLInputElement;
    await act(async () => {
      setInputValue(tokenInput, "ui-route-secret");
      (tokenInput.closest("form") as HTMLFormElement).requestSubmit();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("the register tab (honest stub, owner policy)", () => {
  it("?tab=register states the policy — no fake creation form, the ONE token field stays the surface", { timeout: 20000 }, async () => {
    const { container } = await mountAuth({
      initialUrl: "/auth?tab=register&return=%2Ftasks",
    });
    expect(container.querySelector('[data-testid="auth-route-signup-note"]')).not.toBeNull();
    expect(container.textContent).toContain(
      "Accounts are created by the board owner. The first account created becomes the owner.",
    );
    // Exactly one field — the ui token input; no username/password pair
    // pretending a registration flow exists.
    const inputs = container.querySelectorAll("input");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.id).toBe("login-token-value");
    // The honest back control rides in the form.
    expect(container.textContent).toContain("← Back to the board");
  });

  it("the plain tab carries no policy note", { timeout: 20000 }, async () => {
    const { container } = await mountAuth({ initialUrl: "/auth" });
    expect(container.querySelector('[data-testid="auth-route-signup-note"]')).toBeNull();
  });
});

describe("«already signed in» (07k §4.2)", () => {
  it("arriving with a live session redirects to the return target with the honest toast", { timeout: 20000 }, async () => {
    const { router, container } = await mountAuth({
      initialUrl: "/auth?return=%2Fmemory%2Fsearch%3Fq%3Dx",
      storedToken: "ui-live",
    });
    expect(router.state.location.pathname).toBe("/memory/search");
    expect(router.state.location.search).toBe("?q=x");
    expect(container.textContent).toContain("You are already signed in");
  });
});

describe("inline verdicts on the route itself", () => {
  it("a refused token (verify 401) shows the inline error, and the route stays put", { timeout: 20000 }, async () => {
    const { router, container } = await mountAuth({
      initialUrl: "/auth?return=%2Ftasks",
      verifyStatus: 401,
    });
    const tokenInput = document.getElementById("login-token-value") as HTMLInputElement;
    await act(async () => {
      setInputValue(tokenInput, "ui-bad");
      (tokenInput.closest("form") as HTMLFormElement).requestSubmit();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(router.state.location.pathname).toBe("/auth"); // no navigation
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      "The server did not accept the token — check the value and try again.",
    );
  });

  it("a stale refusal that predates the mount does NOT paint a fake error (fresh form)", { timeout: 20000 }, async () => {
    // First visit: a refused submit (verdict recorded in the gate)…
    const first = await mountAuth({
      initialUrl: "/auth",
      verifyStatus: 401,
    });
    const tokenInput = document.getElementById("login-token-value") as HTMLInputElement;
    await act(async () => {
      setInputValue(tokenInput, "ui-bad");
      (tokenInput.closest("form") as HTMLFormElement).requestSubmit();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(first.container.querySelector('[role="alert"]')).not.toBeNull();
    // …then a FRESH mount of the route (the gate still carries the beat):
    // the new form must render clean — the route keys its display on its
    // own submit, not on history.
    const second = await mountAuth({ initialUrl: "/auth", verifyStatus: 200 });
    expect(second.container.querySelector('[role="alert"]')).toBeNull();
    expect(second.container.querySelector('[data-testid="auth-route"]')).not.toBeNull();
  });
});
