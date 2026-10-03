// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  initPasswordSession,
  readPasswordSession,
  resetPasswordSessionForTests,
  setPasswordUser,
  subscribePasswordSession,
} from "./passwordSession";
import { BoardAdapter } from "@/gateway/BoardAdapter";
import { MockAdapter } from "@/gateway/MockAdapter";

/**
 * The password-session store (ME-080): the one module-level mirror of the
 * HttpOnly `vesmaro_auth` session. Pinned:
 * - a harness that never calls init reads a SETTLED anonymous store and
 *   fires no network (tests, SSR — the zero-noise contract);
 * - the boot whoami fires for board gateways only (the mock playground and
 *   the vesma adapter never see the request) and is idempotent per boot;
 * - the always-200 whoami hydrates the person or the honest anonymous;
 * - transport failures fail soft to anonymous;
 * - login/logout write through with an immutable snapshot (useSyncExternalStore
 *   would never re-render a mutated-in-place object).
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  resetPasswordSessionForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("passwordSession store (ME-080)", () => {
  it("reads a settled anonymous store with no init — and fires no network", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    expect(readPasswordSession()).toEqual({ user: null, pending: false });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("the boot whoami skips gateways without the session wire (the mock playground)", () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    // Structural capability guard: the MockAdapter has no ui-token session
    // wire at all, so the whoami never leaves (the dev playground has no
    // auth wall; the vesma HttpAdapter is excluded by the same guard).
    initPasswordSession(new MockAdapter({ latency: false }));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readPasswordSession().pending).toBe(false);
  });

  it("hydrates the confirmed person from the always-200 whoami (board gateway)", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/api/auth/me")
        ? jsonResponse({ authenticated: true, username: "abyss", role: "owner" })
        : jsonResponse({ live: false }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const gateway = new BoardAdapter({ baseUrl: "/api", fetchImpl: fetchImpl as never });
    initPasswordSession(gateway);
    expect(readPasswordSession().pending).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(readPasswordSession()).toEqual({
      user: { username: "abyss", role: "owner" },
      pending: false,
    });
    // Idempotent per boot: a second call fires no second request.
    initPasswordSession(gateway);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("the anonymous whoami answer keeps the store honestly empty", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ authenticated: false }));
    vi.stubGlobal("fetch", fetchImpl);
    initPasswordSession(new BoardAdapter({ baseUrl: "/api", fetchImpl: fetchImpl as never }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(readPasswordSession()).toEqual({ user: null, pending: false });
  });

  it("a transport failure fails soft to anonymous (never throws, never stays pending)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("network down");
    });
    vi.stubGlobal("fetch", fetchImpl);
    initPasswordSession(new BoardAdapter({ baseUrl: "/api", fetchImpl: fetchImpl as never }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(readPasswordSession()).toEqual({ user: null, pending: false });
  });

  it("login/logout writes flip the snapshot and notify subscribers (immutable objects)", () => {
    const seen: ReturnType<typeof readPasswordSession>[] = [];
    const unsubscribe = subscribePasswordSession(() => seen.push(readPasswordSession()));
    setPasswordUser({ username: "abyss", role: "owner" });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.user).toEqual({ username: "abyss", role: "owner" });
    setPasswordUser({ username: "abyss", role: "owner" }); // same value — no notify
    expect(seen).toHaveLength(1);
    // resetPasswordSessionForTests is the logout-shaped reset (the wire
    // path itself is pinned in AuthProvider.password.test.tsx).
    resetPasswordSessionForTests();
    expect(readPasswordSession().user).toBeNull();
    unsubscribe();
  });
});
