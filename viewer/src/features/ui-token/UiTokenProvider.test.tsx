import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { UiTokenProvider } from "./UiTokenProvider";
import { UiTokenSlot } from "./UiTokenSlot";
import { UiTokenContext } from "./UiTokenContext";
import {
  resetPasswordSessionForTests,
  setPasswordUser,
} from "@/features/auth/passwordSession";
import { AuthContext } from "@/features/auth/AuthContext";
import type { AuthContextValue } from "@/features/auth/AuthContext";
import { GatewayContext } from "@/gateway/GatewayContext";
import { HttpAdapter } from "@/gateway/HttpAdapter";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { I18nProvider } from "@/i18n";

/**
 * Provider SSR smoke (the behavioural flow — defer/retry/401/logout — lives
 * in uiTokenGate.test.ts; the open dialog itself needs a real DOM, which the
 * node-environment runner does not provide — Radix portals into document.body,
 * so only the closed state is asserted here. The full interactive login flow
 * — window + queue resume + create-button regression — lives in
 * LoginDialog.flow.test.tsx under the happy-dom environment).
 */

describe("UiTokenProvider (SSR smoke)", () => {
  it("renders children with the login window closed (gate boots closed)", () => {
    const html = renderToString(
      <GatewayContext.Provider value={new HttpAdapter("/api")}>
        <QueryClientProvider client={new QueryClient()}>
          <I18nProvider initialLang="en">
            {/* Same order as App.tsx: the provider pushes login toasts, so
             * the toast layer must sit above it (useToast throws bare). */}
            <ToastProvider>
              <UiTokenProvider>
                <p>read-only content stays browsable</p>
              </UiTokenProvider>
            </ToastProvider>
          </I18nProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
    expect(html).toContain("read-only content stays browsable");
    expect(html).not.toContain("Sign in with a ui token");
  });

  it("renders children with the window closed while a password person is confirmed (ME-081 wiring)", () => {
    // The provider injects hasPasswordSession from the module store; the
    // SSR smoke proves the wiring mounts cleanly with a confirmed person
    // (the interactive beats live in LoginDialog.flow.test.tsx).
    setPasswordUser({ username: "abyss", role: "owner" });
    try {
      const html = renderToString(
        <GatewayContext.Provider value={new HttpAdapter("/api")}>
          <QueryClientProvider client={new QueryClient()}>
            <I18nProvider initialLang="en">
              <ToastProvider>
                <UiTokenProvider>
                  <p>read-only content stays browsable</p>
                </UiTokenProvider>
              </ToastProvider>
            </I18nProvider>
          </QueryClientProvider>
        </GatewayContext.Provider>,
      );
      expect(html).toContain("read-only content stays browsable");
      expect(html).not.toContain("Sign in with a ui token");
    } finally {
      resetPasswordSessionForTests(); // the store is module-global
    }
  });
});

describe("UiTokenSlot (TopBar board-mode sign-in pair)", () => {
  const contextBase = {
    openLogin: () => undefined,
    runAuthorized: () => undefined,
    logout: () => undefined,
    submitToken: () => undefined,
    verifyPending: false,
  };

  it("renders the ACCENT Sign in button plus the honest Sign up stub while no token is stored", () => {
    // The «Регистрация» stub navigates (a Link to /auth) — router context
    // required, same as every Link the slot grows.
    const html = renderToString(
      <I18nProvider initialLang="en">
        <UiTokenContext.Provider value={{ ...contextBase, tokenPresent: false }}>
          <MemoryRouter initialEntries={["/memory"]}>
            <UiTokenSlot />
          </MemoryRouter>
        </UiTokenContext.Provider>
      </I18nProvider>,
    );
    expect(html).toContain("Sign in");
    // Accent (default) variant — the entry must be findable in the bar.
    expect(html).toContain("bg-iris-strong");
    // Gates v6 (07k §2.3): the ghost «Регистрация» rides beside «Войти»,
    // carrying the CURRENT location as return (a sign-in returns the user
    // where they stood, ME-026: the query must survive).
    expect(html).toContain("Create an account");
    expect(html).toMatch(/href="\/auth\?tab=register&amp;return=%2Fmemory"/);
  });

  it("renders Sign out while a token is stored (shared-machine scrub)", () => {
    const html = renderToString(
      <I18nProvider initialLang="en">
        <UiTokenContext.Provider value={{ ...contextBase, tokenPresent: true }}>
          <MemoryRouter initialEntries={["/"]}>
            <UiTokenSlot />
          </MemoryRouter>
        </UiTokenContext.Provider>
      </I18nProvider>,
    );
    expect(html).toContain("Sign out");
    expect(html).toContain('aria-label="End the server session (all tabs of this browser)"');
    expect(html).not.toContain("bg-iris-strong");
    // No user chip in И1 (no name in the token model) — no register stub
    // for the signed-in state either.
    expect(html).not.toContain("Create an account");
  });
});

describe("UiTokenSlot: the password-session person (ME-080)", () => {
  const uiTokenBase = {
    openLogin: () => undefined,
    runAuthorized: () => undefined,
    logout: () => undefined,
    submitToken: () => undefined,
    verifyPending: false,
  };
  /** A minimal AuthContextValue — the slot reads only passwordUser +
   * logoutPassword; bare harnesses (above) prove the fail-soft null path. */
  const authBase: AuthContextValue = {
    state: {
      phase: "anonymous",
      challengeId: null,
      error: null,
      overlayOpen: false,
      sessionExpired: false,
    },
    adapterMode: "board",
    endpoint: "/api",
    login: vi.fn(async () => undefined),
    verify: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    loginWithPassword: vi.fn(async () => ({ username: "abyss", role: "owner" as const })),
    registerAccount: vi.fn(async () => ({ username: "abyss", role: "owner" as const })),
    logoutPassword: vi.fn(async () => undefined),
    setPassword: vi.fn(async () => undefined),
    passwordUser: null,
    openOverlay: vi.fn(),
    closeOverlay: vi.fn(),
  };

  it("renders the user chip (username + role badge) with «Sign out» instead of the sign-in pair", () => {
    const html = renderToString(
      <I18nProvider initialLang="en">
        <AuthContext.Provider
          value={{ ...authBase, passwordUser: { username: "abyss", role: "owner" } }}
        >
          <UiTokenContext.Provider value={{ ...uiTokenBase, tokenPresent: false }}>
            <MemoryRouter initialEntries={["/"]}>
              <UiTokenSlot />
            </MemoryRouter>
          </UiTokenContext.Provider>
        </AuthContext.Provider>,
      </I18nProvider>,
    );
    expect(html).toContain("abyss");
    expect(html).toContain("owner"); // the role badge (member → «member»)
    expect(html).toContain("Sign out");
    // The anonymous pair is gone: no accent sign-in, no register stub.
    expect(html).not.toContain("bg-iris-strong");
    expect(html).not.toContain("Create an account");
  });

  it("a member role renders the plain badge (not the iris owner accent)", () => {
    const html = renderToString(
      <I18nProvider initialLang="en">
        <AuthContext.Provider
          value={{ ...authBase, passwordUser: { username: "vv", role: "member" } }}
        >
          <UiTokenContext.Provider value={{ ...uiTokenBase, tokenPresent: false }}>
            <MemoryRouter initialEntries={["/"]}>
              <UiTokenSlot />
            </MemoryRouter>
          </UiTokenContext.Provider>
        </AuthContext.Provider>,
      </I18nProvider>,
    );
    expect(html).toContain("member");
    expect(html).not.toContain(">owner<");
  });

  it("the anonymous pair leads to the /auth route (login+password is the front door)", () => {
    const html = renderToString(
      <I18nProvider initialLang="en">
        <AuthContext.Provider value={authBase}>
          <UiTokenContext.Provider value={{ ...uiTokenBase, tokenPresent: false }}>
            <MemoryRouter initialEntries={["/memory"]}>
              <UiTokenSlot />
            </MemoryRouter>
          </UiTokenContext.Provider>
        </AuthContext.Provider>,
      </I18nProvider>,
    );
    // The accent «Sign in» now LINKS to /auth carrying the current location.
    expect(html).toMatch(/href="\/auth\?return=%2Fmemory"/);
  });
});
