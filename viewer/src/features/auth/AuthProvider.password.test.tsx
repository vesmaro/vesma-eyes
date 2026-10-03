// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./AuthContext";
import {
  readPasswordSession,
  resetPasswordSessionForTests,
} from "./passwordSession";
import { I18nProvider } from "@/i18n";

/**
 * The AuthProvider password-session surface (ME-080): loginWithPassword /
 * registerAccount / logoutPassword against the REAL PasswordAuthClient wire
 * (a fetch mock — no context stubs). Pinned:
 * - success writes the confirmed person into the module store (the same
 *   store useAuthSession and the TopBar chip read) and resolves with it;
 * - the wire error propagates to the caller (the form owns the verdict) —
 *   a wrong password NEVER opens the mnk_ overlay (the shared 401 flag is
 *   not this client's business);
 * - logout tears the session down server-side (the POST fires) and resets
 *   the mirror even when the wire fails.
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

function capture(): { current: ReturnType<typeof useAuth> | null } {
  const box = { current: null as ReturnType<typeof useAuth> | null };
  const Probe = (): null => {
    box.current = useAuth();
    return null;
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  void act(() => {
    root.render(
      <I18nProvider initialLang="en">
        <QueryClientProvider client={new QueryClient()}>
          <AuthProvider adapterMode="board" endpoint="/api">
            <Probe />
          </AuthProvider>
        </QueryClientProvider>
      </I18nProvider>,
    );
  });
  return box;
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", new MemoryStorage());
  vi.stubGlobal("localStorage", new MemoryStorage());
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

describe("AuthProvider password surface (ME-080)", () => {
  it("loginWithPassword resolves with the person and writes the store", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/auth/login")) {
        expect(String(init?.body)).toContain("abyss");
        return jsonResponse({ ok: true, username: "abyss", role: "owner" });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchImpl);
    const box = capture();
    let user: { username: string; role: string } | null = null;
    await act(async () => {
      user = await box.current!.loginWithPassword("abyss", "parol-nadezhnyy-123");
    });
    expect(user).toEqual({ username: "abyss", role: "owner" });
    expect(readPasswordSession().user).toEqual({ username: "abyss", role: "owner" });
    expect(fetchImpl.mock.calls.some(([u]) => String(u).endsWith("/api/auth/login"))).toBe(true);
  });

  it("a wrong password propagates the wire error and writes NOTHING into the store", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/api/auth/login")
        ? jsonResponse({ detail: "invalid username or password" }, 401)
        : jsonResponse({}),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const box = capture();
    await act(async () => {
      await expect(
        box.current!.loginWithPassword("abyss", "wrong-password-1"),
      ).rejects.toMatchObject({ status: 401 });
    });
    expect(readPasswordSession().user).toBeNull();
  });

  it("registerAccount opens the session the response brought (cookie leg)", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/api/auth/register")
        ? jsonResponse({ username: "newbie", role: "member" }, 201)
        : jsonResponse({}),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const box = capture();
    await act(async () => {
      await expect(
        box.current!.registerAccount("newbie", "parol-nadezhnyy-123"),
      ).resolves.toEqual({ username: "newbie", role: "member" });
    });
    expect(readPasswordSession().user).toEqual({ username: "newbie", role: "member" });
  });

  it("logoutPassword POSTs the teardown first, then resets the mirror", async () => {
    const order: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/logout")) {
        order.push("logout-wire");
        return new Response(null, { status: 204 });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchImpl);
    const box = capture();
    await act(async () => {
      await box.current!.registerAccount("newbie", "parol-nadezhnyy-123");
    });
    expect(readPasswordSession().user).not.toBeNull();
    await act(async () => {
      await box.current!.logoutPassword();
    });
    order.push("mirror-reset");
    expect(order).toEqual(["logout-wire", "mirror-reset"]);
    expect(readPasswordSession().user).toBeNull();
  });

  it("logoutPassword resets the mirror even when the wire failed (the next boot whoami re-states the truth)", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/api/auth/logout")
        ? Promise.reject(new TypeError("network down"))
        : jsonResponse({ username: "newbie", role: "member" }, 201),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const box = capture();
    await act(async () => {
      await box.current!.registerAccount("newbie", "parol-nadezhnyy-123");
    });
    await act(async () => {
      // The wire error propagates (the caller may toast it) — but the
      // mirror reset happens regardless.
      await expect(box.current!.logoutPassword()).rejects.toMatchObject({ status: 0 });
    });
    expect(readPasswordSession().user).toBeNull();
  });
});
