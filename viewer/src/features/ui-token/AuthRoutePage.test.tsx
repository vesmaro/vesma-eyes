// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthRoutePage } from "./AuthRoutePage";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { initPasswordSession, resetPasswordSessionForTests, setPasswordUser } from "@/features/auth/passwordSession";
import { UiTokenProvider } from "./UiTokenProvider";
import { BoardAdapter } from "@/gateway/BoardAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { ToastViewport } from "@/components/Toast/ToastViewport";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/i18n";
import { clearUiToken, UI_TOKEN_STORAGE_KEY } from "@/gateway/uiToken";

/**
 * The /auth route through the REAL providers (no context stubs — the route
 * must drive the same state machines as the login window and the password
 * wire). ME-080: the route hosts the «Вход | Регистрация» tab pair (07k
 * §4.1); the ui-token form survives as the SECONDARY admin view (?tab=token).
 *
 * Pinned walks:
 * - returnTo: password sign-in AND the token view both land back on the
 *   DEEP LINK, query intact (ME-026); a foreign return falls back to Обзор;
 * - tabs: URL-first (?tab=register), aria-wired tablist, hidden panels;
 * - sign-in outcomes: success → toast + redirect; 401 → the inline human
 *   verdict with focus on the name field (never a toast, never a reload);
 *   429 → the honest «too many attempts» line;
 * - registration outcomes: success → toast + redirect (registration IS a
 *   sign-in); 409 taken name / 403 closed → human verdicts; client-side
 *   confirm-mismatch never leaves the browser;
 * - «already signed in»: a live ui token OR a confirmed password person
 *   redirects with the honest toast;
 * - the admin token view: the ONE token form with its hints, refusals
 *   inline, and a stale refusal never paints a fresh form.
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

async function mountAuth(options: {
  initialUrl: string;
  probeStatus?: number;
  verifyStatus?: number;
  loginStatus?: number;
  loginBody?: unknown;
  registerStatus?: number;
  registerBody?: unknown;
  meAuthenticated?: boolean;
  storedToken?: string;
  storedPasswordUser?: boolean;
  /** fix/recovery-ux: the token leg of POST /api/auth/password — a full
   * Response escape hatch (429 needs its Retry-After header). */
  passwordResponse?: Response;
  /** Shorthand when only a status (and optional JSON detail) is needed. */
  passwordStatus?: number;
  passwordDetail?: string;
}): Promise<{ router: ReturnType<typeof createMemoryRouter>; container: HTMLDivElement; fetchCalls: { url: string; method: string; body?: unknown }[] }> {
  const {
    initialUrl,
    probeStatus = 200,
    verifyStatus = 200,
    loginStatus = 200,
    loginBody,
    registerStatus = 201,
    registerBody,
    meAuthenticated = false,
    storedToken,
    storedPasswordUser = false,
    passwordResponse,
    passwordStatus = 204,
    passwordDetail,
  } = options;
  const fetchCalls: { url: string; method: string; body?: unknown }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    let body: unknown;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : undefined;
    } catch {
      body = undefined;
    }
    fetchCalls.push({ url, method, body });
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
    if (url.endsWith("/api/auth/me")) {
      return jsonResponse(
        meAuthenticated
          ? { authenticated: true, username: "abyss", role: "owner" }
          : { authenticated: false },
      );
    }
    if (url.endsWith("/api/auth/login")) {
      if (loginBody) return loginBody as Response;
      return jsonResponse({ ok: true, username: "abyss", role: "owner" }, loginStatus);
    }
    if (url.endsWith("/api/auth/register")) {
      if (registerBody) return registerBody as Response;
      return jsonResponse({ username: "abyss", role: "owner" }, registerStatus);
    }
    if (url.endsWith("/api/auth/password")) {
      // fix/recovery-ux: the token leg — 204 by default, a crafted Response
      // (429 + Retry-After) or a JSON detail when the test needs a refusal.
      if (passwordResponse) return passwordResponse;
      if (passwordDetail !== undefined) {
        return jsonResponse({ detail: passwordDetail }, passwordStatus);
      }
      return new Response(null, { status: passwordStatus });
    }
    return jsonResponse({});
  });
  vi.stubGlobal("fetch", fetchImpl);
  if (storedToken) sessionStorage.setItem(UI_TOKEN_STORAGE_KEY, storedToken);
  if (storedPasswordUser) setPasswordUser({ username: "abyss", role: "owner" });
  const gateway = new BoardAdapter({ baseUrl: "/api", fetchImpl: fetchImpl as never });
  // main.tsx's pre-paint slot: the boot whoami leaves BEFORE the first render.
  initPasswordSession(gateway);

  const router = createMemoryRouter(
    [
      // The visible toast region rides inside the router (same placement as
      // the Shell) — the success beats assert through it.
      { path: "/auth", element: <><AuthRoutePage /><ToastViewport /></> },
      {
        path: "/memory/search",
        element: <><p data-testid="landing">DEEP LINK LANDING</p><ToastViewport /></>,
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
        {/* Same provider order as App.tsx: Auth above Toast above UiToken. */}
        <GatewayContext.Provider value={gateway}>
          <QueryClientProvider client={new QueryClient()}>
            <ThemeProvider>
              <AuthProvider adapterMode="board" endpoint="/api">
                <ToastProvider>
                  <UiTokenProvider>
                    <RouterProvider router={router} />
                  </UiTokenProvider>
                </ToastProvider>
              </AuthProvider>
            </ThemeProvider>
          </QueryClientProvider>
        </GatewayContext.Provider>
      </I18nProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return { router, container, fetchCalls };
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", new MemoryStorage());
  vi.stubGlobal("localStorage", new MemoryStorage());
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearUiToken();
  resetPasswordSessionForTests();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const root of mountedRoots.splice(0)) {
    await act(async () => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
});

async function submitPasswordForm(fields: { username?: string; password?: string }): Promise<void> {
  const username = document.querySelector('[data-testid="auth-username"]') as HTMLInputElement | null;
  const password = document.querySelector('[data-testid="auth-password"]') as HTMLInputElement | null;
  if (!username || !password) throw new Error("the sign-in form is not mounted");
  const { username: usernameValue, password: passwordValue } = fields;
  if (usernameValue !== undefined) {
    await act(async () => setInputValue(username, usernameValue));
  }
  if (passwordValue !== undefined) {
    await act(async () => setInputValue(password, passwordValue));
  }
  await act(async () => {
    (username.closest("form") as HTMLFormElement).requestSubmit();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function submitRegisterForm(fields: { username: string; password: string; confirm: string }): Promise<void> {
  const username = document.querySelector('[data-testid="auth-reg-username"]') as HTMLInputElement;
  const password = document.querySelector('[data-testid="auth-reg-password"]') as HTMLInputElement;
  const confirm = document.querySelector('[data-testid="auth-reg-confirm"]') as HTMLInputElement;
  for (const [input, value] of [[username, fields.username], [password, fields.password], [confirm, fields.confirm]] as const) {
    await act(async () => setInputValue(input, value));
  }
  await act(async () => {
    (username.closest("form") as HTMLFormElement).requestSubmit();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

// --- fix/recovery-ux walk helpers -------------------------------------------

async function clickRecoveryLink(): Promise<void> {
  const link = document.querySelector('[data-testid="auth-recovery-link"]') as HTMLButtonElement | null;
  if (!link) throw new Error("the recovery link is not rendered");
  await act(async () => {
    link.click();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function submitRecoveryToken(value: string): Promise<void> {
  const token = document.querySelector('[data-testid="login-token-value"]') as HTMLInputElement | null;
  if (!token) throw new Error("the recovery token form is not mounted");
  await act(async () => setInputValue(token, value));
  await act(async () => {
    (token.closest("form") as HTMLFormElement).requestSubmit();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

async function submitRecoveryPassword(fields: { username: string; password: string; confirm: string }): Promise<void> {
  const username = document.querySelector('[data-testid="auth-recovery-username"]') as HTMLInputElement | null;
  const password = document.querySelector('[data-testid="auth-recovery-password"]') as HTMLInputElement | null;
  const confirm = document.querySelector('[data-testid="auth-recovery-confirm"]') as HTMLInputElement | null;
  if (!username || !password || !confirm) throw new Error("the recovery set-password form is not mounted");
  for (const [input, value] of [[username, fields.username], [password, fields.password], [confirm, fields.confirm]] as const) {
    await act(async () => setInputValue(input, value));
  }
  await act(async () => {
    (username.closest("form") as HTMLFormElement).requestSubmit();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

/** The «← Back to sign-in» secondary of the step-1 token form (the outline
 * button — the submit and the eye toggle carry other marks). */
function recoveryBackButton(): HTMLButtonElement {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-testid="auth-recovery-token"] button'),
  );
  const back = buttons.find((button) => button.textContent?.includes("Back to sign-in"));
  if (!back) throw new Error("the «Back to sign-in» button is not rendered");
  return back;
}

describe("returnTo round trip (07k §4.2 + UI-18 transport, ME-026)", () => {
  it("password sign-in → back to the DEEP LINK with the query intact", { timeout: 20000 }, async () => {
    const { router, container, fetchCalls } = await mountAuth({
      initialUrl: "/auth?return=%2Fmemory%2Fsearch%3Fq%3Dproject%3Agcw",
    });
    await submitPasswordForm({ username: "abyss", password: "parol-nadezhnyy-123" });
    // Landed on the deep link — path AND search (project:gcw survived).
    expect(router.state.location.pathname).toBe("/memory/search");
    expect(router.state.location.search).toBe("?q=project:gcw");
    expect(container.textContent).toContain("DEEP LINK LANDING");
    // The wire saw the password form's shape (no token anywhere near it).
    const login = fetchCalls.find((call) => call.url.endsWith("/api/auth/login"));
    expect(login).toBeDefined();
    expect(login?.body).toEqual({ username: "abyss", password: "parol-nadezhnyy-123" });
    // The route left no stale form behind.
    expect(document.querySelector('[data-testid="auth-username"]')).toBeNull();
  });

  it("a rejected / foreign return shape falls back to the public Обзор", { timeout: 20000 }, async () => {
    // https://evil.example cannot pass resolveReturnTarget (no scheme, no //).
    const { router } = await mountAuth({
      initialUrl: "/auth?return=" + encodeURIComponent("https://evil.example/x"),
    });
    await submitPasswordForm({ username: "abyss", password: "parol-nadezhnyy-123" });
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("the «Sign in | Register» tab pair (07k §4.1)", () => {
  it("the default tab is the password sign-in — the token field is NOT the front door", { timeout: 20000 }, async () => {
    const { container } = await mountAuth({ initialUrl: "/auth" });
    expect(document.querySelector('[data-testid="auth-username"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="auth-password"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="login-token-value"]')).toBeNull();
    // The tablist is a real one: two tabs, the sign-in selected, panels wired.
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("false");
    // The register panel is hidden while the sign-in panel shows.
    const panels = container.querySelectorAll('[role="tabpanel"]');
    expect(panels).toHaveLength(2);
    expect(panels[0]?.hasAttribute("hidden")).toBe(false);
    expect(panels[1]?.hasAttribute("hidden")).toBe(true);
    // The legacy admin entry is the quiet link under the card.
    expect(document.querySelector('[data-testid="auth-token-mode-link"]')?.textContent).toContain(
      "Token sign-in (admin)",
    );
  });

  it("?tab=register (the gate/TopBar links) opens Регистрация — owner note, confirm field", { timeout: 20000 }, async () => {
    const { container } = await mountAuth({ initialUrl: "/auth?tab=register&return=%2Ftasks" });
    expect(container.querySelector('[data-testid="auth-route-signup-note"]')?.textContent).toContain(
      "The first account created becomes the owner of the board.",
    );
    expect(document.querySelector('[data-testid="auth-reg-username"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="auth-reg-confirm"]')).not.toBeNull();
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[1]?.getAttribute("tabindex")).toBe("0");
  });

  it("clicking the register tab switches panels URL-first and keeps the return", { timeout: 20000 }, async () => {
    const { router } = await mountAuth({ initialUrl: "/auth?return=%2Ftasks" });
    const registerTab = document.querySelector('[data-testid="auth-tab-register"]') as HTMLButtonElement;
    await act(async () => {
      registerTab.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(router.state.location.search).toContain("tab=register");
    expect(router.state.location.search).toContain("return=%2Ftasks");
    expect(document.querySelector('[data-testid="auth-reg-confirm"]')).not.toBeNull();
  });
});

describe("password sign-in outcomes (07k §4.2)", () => {
  it("success → the toast rides to the landing spot", { timeout: 20000 }, async () => {
    const { container } = await mountAuth({ initialUrl: "/auth?return=%2Fmemory%2Fsearch" });
    await submitPasswordForm({ username: "abyss", password: "parol-nadezhnyy-123" });
    expect(container.textContent).toContain("DEEP LINK LANDING");
    expect(container.textContent).toContain("You are signed in: abyss");
  });

  it("a refused password (401) → the inline human verdict, focus on the name field, no navigation", { timeout: 20000 }, async () => {
    const { router, container } = await mountAuth({
      initialUrl: "/auth?return=%2Ftasks",
      loginStatus: 401,
    });
    await submitPasswordForm({ username: "abyss", password: "wrong-password-1" });
    expect(router.state.location.pathname).toBe("/auth"); // no navigation
    expect(container.textContent).toContain("Wrong name or password.");
    expect(container.textContent).toContain("What to check: the RU/EN layout, letter case, Caps Lock.");
    // Focus moved to the offending field (07k §4.2).
    const username = document.querySelector('[data-testid="auth-username"]') as HTMLInputElement;
    expect(document.activeElement).toBe(username);
  });

  it("an empty submit never leaves the browser — required issues, zero network", { timeout: 20000 }, async () => {
    const { fetchCalls } = await mountAuth({ initialUrl: "/auth" });
    await submitPasswordForm({ username: "", password: "" });
    expect(document.querySelector('[data-testid="auth-username-issue"]')?.textContent).toContain("Enter the name.");
    expect(fetchCalls.some((call) => call.url.endsWith("/api/auth/login"))).toBe(false);
  });

  it("429 → the honest «too many attempts» line", { timeout: 20000 }, async () => {
    const { container } = await mountAuth({ initialUrl: "/auth", loginStatus: 429 });
    await submitPasswordForm({ username: "abyss", password: "parol-nadezhnyy-123" });
    expect(container.textContent).toContain("Too many attempts — wait a minute and try again.");
  });
});

describe("password registration outcomes (07k §4.2)", () => {
  it("success → the toast + redirect (registration IS a sign-in)", { timeout: 20000 }, async () => {
    const { router, container, fetchCalls } = await mountAuth({
      initialUrl: "/auth?tab=register&return=%2Fmemory%2Fsearch",
    });
    await submitRegisterForm({ username: "abyss", password: "parol-nadezhnyy-123", confirm: "parol-nadezhnyy-123" });
    const register = fetchCalls.find((call) => call.url.endsWith("/api/auth/register"));
    expect(register?.body).toEqual({ username: "abyss", password: "parol-nadezhnyy-123" });
    expect(router.state.location.pathname).toBe("/memory/search");
    expect(container.textContent).toContain("The account is created. You are signed in: abyss");
  });

  it("a taken name (409) → «That name is taken», focus on the name field", { timeout: 20000 }, async () => {
    const { router, container } = await mountAuth({
      initialUrl: "/auth?tab=register",
      registerStatus: 409,
    });
    await submitRegisterForm({ username: "abyss", password: "parol-nadezhnyy-123", confirm: "parol-nadezhnyy-123" });
    expect(router.state.location.pathname).toBe("/auth");
    expect(container.textContent).toContain("That name is taken. Pick another one.");
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="auth-reg-username"]'),
    );
  });

  it("closed registration (403) → the honest owner-policy verdict + the server detail as an expandable tech line", { timeout: 20000 }, async () => {
    // The board's real closed-registration answer (owner complaint on prod
    // 1.63.0: the verdict must name the cause AND the way out).
    const serverDetail =
      "registration is closed: the board already has its owner account (set VESMARO_ALLOW_REGISTRATION=1 to open it)";
    const { container } = await mountAuth({
      initialUrl: "/auth?tab=register",
      registerBody: jsonResponse({ detail: serverDetail }, 403),
    });
    await submitRegisterForm({ username: "abyss", password: "parol-nadezhnyy-123", confirm: "parol-nadezhnyy-123" });
    // The human verdict: cause + who opens access + the flag name.
    expect(container.textContent).toContain(
      "Registration is closed — the board already has its owner. The owner opens access for new members in the server settings (the VESMARO_ALLOW_REGISTRATION flag).",
    );
    // The raw server words stay reachable: an expandable tech line, the
    // full text on the summary's title tooltip (hover diagnostics).
    const detail = container.querySelector('[data-testid="auth-verdict-detail"]');
    expect(detail).not.toBeNull();
    expect(detail?.querySelector("summary")?.getAttribute("title")).toBe(serverDetail);
    expect(detail?.textContent).toContain(serverDetail);
  });

  it("a confirm mismatch never leaves the browser — field issue, zero network", { timeout: 20000 }, async () => {
    const { fetchCalls, container } = await mountAuth({ initialUrl: "/auth?tab=register" });
    await submitRegisterForm({ username: "abyss", password: "parol-nadezhnyy-123", confirm: "parol-drugoy-12345" });
    expect(document.querySelector('[data-testid="auth-reg-confirm-issue"]')?.textContent).toContain(
      "The passwords do not match — check the second field.",
    );
    expect(fetchCalls.some((call) => call.url.endsWith("/api/auth/register"))).toBe(false);
    expect(container.querySelector('[data-testid="auth-verdict"]')?.textContent).toBe("");
  });
});

describe("«already signed in» (07k §4.2)", () => {
  it("arriving with a live ui token redirects to the return target with the honest toast", { timeout: 20000 }, async () => {
    const { router, container } = await mountAuth({
      initialUrl: "/auth?return=%2Fmemory%2Fsearch%3Fq%3Dx",
      storedToken: "ui-live",
    });
    expect(router.state.location.pathname).toBe("/memory/search");
    expect(router.state.location.search).toBe("?q=x");
    expect(container.textContent).toContain("You are already signed in");
  });

  it("arriving with a confirmed password person redirects with the NAMED toast", { timeout: 20000 }, async () => {
    const { router, container } = await mountAuth({
      initialUrl: "/auth?return=%2Fmemory%2Fsearch",
      storedPasswordUser: true,
    });
    expect(router.state.location.pathname).toBe("/memory/search");
    expect(container.textContent).toContain("You are already signed in: abyss");
  });
});

describe("the token admin view (?tab=token, legacy/machines)", () => {
  it("hosts the ONE token form with its hints — the admin copy lives HERE only", { timeout: 20000 }, async () => {
    const { container } = await mountAuth({ initialUrl: "/auth?tab=token" });
    expect(document.querySelector('[data-testid="login-token-value"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="auth-username"]')).toBeNull();
    // The kubectl hint (the fixed legacy text) rides inside the admin view.
    expect(container.textContent).toContain("Command for the administrator (kubectl)");
    // The way back to the human tabs is the quiet link.
    expect(document.querySelector('[data-testid="auth-token-mode-link"]')?.textContent).toContain(
      "Back to the username and password sign-in",
    );
  });

  it("a refused token (verify 401) shows the inline error, and the route stays put", { timeout: 20000 }, async () => {
    const { router, container } = await mountAuth({
      initialUrl: "/auth?tab=token&return=%2Ftasks",
      verifyStatus: 401,
    });
    const tokenInput = document.querySelector('[data-testid="login-token-value"]') as HTMLInputElement;
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
      initialUrl: "/auth?tab=token",
      verifyStatus: 401,
    });
    const tokenInput = document.querySelector('[data-testid="login-token-value"]') as HTMLInputElement;
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
    const second = await mountAuth({ initialUrl: "/auth?tab=token", verifyStatus: 200 });
    expect(second.container.querySelector('[role="alert"]')).toBeNull();
    expect(second.container.querySelector('[data-testid="auth-route"]')).not.toBeNull();
  });
});

describe("password recovery walk (fix/recovery-ux)", () => {
  it("«Forgot your password?» opens the walk: the tab pair hides, step 1 reuses the token form; «Back to sign-in» returns", { timeout: 20000 }, async () => {
    const { container, router } = await mountAuth({ initialUrl: "/auth" });
    await clickRecoveryLink();
    // Page state, not a route: the URL stays put.
    expect(router.state.location.pathname).toBe("/auth");
    // The tab pair is GONE while the walk runs (not merely inert), the card
    // hosts the token form with the honest lead line, and the admin quiet
    // link hides (its switchTab would drop the walk).
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(0);
    expect(document.querySelector('[data-testid="auth-recovery-token"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="login-token-value"]')).not.toBeNull();
    expect(container.textContent).toContain("Sign in with the token");
    expect(document.querySelector('[data-testid="auth-token-mode-link"]')).toBeNull();
    // «← Back to sign-in» leaves the walk: the ordinary tab pair is back.
    await act(async () => {
      recoveryBackButton().click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(document.querySelector('[data-testid="auth-recovery-token"]')).toBeNull();
    expect(document.querySelector('[data-testid="auth-recovery-link"]')).not.toBeNull();
  });

  it("step 1 → step 2: the token sign-in lands on «Set a new password» — no redirect, no «already signed in»", { timeout: 20000 }, async () => {
    const { container, router, fetchCalls } = await mountAuth({
      initialUrl: "/auth?return=%2Ftasks",
    });
    await clickRecoveryLink();
    await submitRecoveryToken("ui-live-recovery");
    // The verify went through the door (the ONE token wire).
    expect(fetchCalls.some((call) => call.url.endsWith("/api/auth/ui-token") && call.method === "POST")).toBe(true);
    // Step 2 is the set-password form: empty name, human placeholder, NO
    // current-password field anywhere.
    expect(document.querySelector('[data-testid="auth-recovery-set"]')).not.toBeNull();
    const username = document.querySelector('[data-testid="auth-recovery-username"]') as HTMLInputElement;
    expect(username.value).toBe("");
    expect(username.placeholder).toBe("for example, abyss");
    expect(document.querySelector('[data-testid="auth-recovery-password"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="auth-recovery-confirm"]')).not.toBeNull();
    // The honest «уже вошёл» redirect stayed fenced: still on /auth, the
    // walk owns the card, the already-signed-in status never paints.
    expect(router.state.location.pathname).toBe("/auth");
    expect(container.textContent).not.toContain("You are already signed in");
    expect(router.state.location.search).toBe("?return=%2Ftasks");
  });

  it("step 2 success: the token-leg shape on the wire (no current_password), teardown, and back to the Вход tab", { timeout: 20000 }, async () => {
    const { container, router, fetchCalls } = await mountAuth({ initialUrl: "/auth" });
    await clickRecoveryLink();
    await submitRecoveryToken("ui-live-recovery");
    await submitRecoveryPassword({
      username: "abyss",
      password: "parol-nadezhnyy-123",
      confirm: "parol-nadezhnyy-123",
    });
    // The token leg of POST /auth/password: name + new password ONLY — the
    // current one does not exist on this leg.
    const password = fetchCalls.find((call) => call.url.endsWith("/api/auth/password"));
    expect(password).toBeDefined();
    expect(password?.method).toBe("POST");
    expect(password?.body).toEqual({
      username: "abyss",
      new_password: "parol-nadezhnyy-123",
    });
    // The token session is torn down server-side (the cookie leg).
    expect(fetchCalls.some((call) => call.url.endsWith("/api/auth/ui-token") && call.method === "DELETE")).toBe(true);
    // The walk exits to the Вход tab: the fresh password awaits its first
    // sign-in, the toast says exactly that, no redirect happened.
    expect(router.state.location.pathname).toBe("/auth");
    expect(document.querySelector('[data-testid="auth-username"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="auth-recovery-set"]')).toBeNull();
    expect(container.textContent).toContain("The password is set — now sign in");
  });

  it("403 on the set step: the owner-only verdict, focus on the name, the walk stays put", { timeout: 20000 }, async () => {
    const { container, router } = await mountAuth({
      initialUrl: "/auth",
      passwordResponse: jsonResponse(
        { detail: "password recovery is owner-only" },
        403,
      ),
    });
    await clickRecoveryLink();
    await submitRecoveryToken("ui-live-recovery");
    await submitRecoveryPassword({
      username: "who-is-this",
      password: "parol-nadezhnyy-123",
      confirm: "parol-nadezhnyy-123",
    });
    expect(router.state.location.pathname).toBe("/auth");
    expect(container.textContent).toContain(
      "Not allowed — password recovery is available to the board's owner.",
    );
    // The offending field gets the caret (07k §4.2).
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="auth-recovery-username"]'),
    );
    // The walk did NOT exit: the form (and its verdict) stay on screen.
    expect(document.querySelector('[data-testid="auth-recovery-set"]')).not.toBeNull();
  });

  it("429 on the set step: the verdict counts the server's Retry-After seconds", { timeout: 20000 }, async () => {
    const { container } = await mountAuth({
      initialUrl: "/auth",
      passwordResponse: new Response(null, {
        status: 429,
        headers: { "Retry-After": "30" },
      }),
    });
    await clickRecoveryLink();
    await submitRecoveryToken("ui-live-recovery");
    await submitRecoveryPassword({
      username: "abyss",
      password: "parol-nadezhnyy-123",
      confirm: "parol-nadezhnyy-123",
    });
    expect(container.textContent).toContain(
      "Too many attempts — wait 30 s and try again.",
    );
  });

  it("422 on the set step: the honest failure line + the server detail on the expandable tech line", { timeout: 20000 }, async () => {
    const { container, fetchCalls } = await mountAuth({
      initialUrl: "/auth",
      passwordStatus: 422,
      passwordDetail: "password is too long (max 512)",
    });
    await clickRecoveryLink();
    await submitRecoveryToken("ui-live-recovery");
    // A VALID input (the client checks pass) — the wire stays the
    // authority, the 422 is the server's own word.
    await submitRecoveryPassword({
      username: "abyss",
      password: "parol-nadezhnyy-123",
      confirm: "parol-nadezhnyy-123",
    });
    expect(fetchCalls.some((call) => call.url.endsWith("/api/auth/password"))).toBe(true);
    expect(container.textContent).toContain("Could not set the password.");
    const detail = container.querySelector('[data-testid="auth-verdict-detail"]');
    expect(detail?.textContent).toContain("password is too long (max 512)");
  });

  it("a client-side mismatch on the set step never leaves the browser", { timeout: 20000 }, async () => {
    const { fetchCalls } = await mountAuth({ initialUrl: "/auth" });
    await clickRecoveryLink();
    await submitRecoveryToken("ui-live-recovery");
    await submitRecoveryPassword({
      username: "abyss",
      password: "parol-nadezhnyy-123",
      confirm: "parol-drugoy-12345",
    });
    expect(document.querySelector('[data-testid="auth-recovery-confirm-issue"]')?.textContent).toContain(
      "The passwords do not match",
    );
    expect(fetchCalls.some((call) => call.url.endsWith("/api/auth/password"))).toBe(false);
  });
});
