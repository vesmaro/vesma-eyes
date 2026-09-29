import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  authSessionProbe,
  initAuthSession,
  readAuthSessionStatus,
  subscribeAuthSession,
} from "./authSession";
import { BoardAdapter } from "@/gateway/BoardAdapter";
import { HttpAdapter } from "@/gateway/HttpAdapter";
import { MockAdapter } from "@/gateway/MockAdapter";
import { clearUiToken, UI_TOKEN_STORAGE_KEY } from "@/gateway/uiToken";

/**
 * Boot auth-session store (ME-043, gates v6 — 07k §5.1): the paint-time
 * verdict of the ME-028 boot probe. Every case pins one rule of the
 * contract: the store only READS state — a session is claimed on
 * server-verified evidence (a stored server-verified token or the probe's
 * 204), never on a client-side guess.
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
  clearUiToken();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A board adapter whose probe answers `status` — the ME-028 wire. */
function boardWithProbe(status: number, calls?: { count: number }): BoardAdapter {
  return new BoardAdapter({
    baseUrl: "/api",
    fetchImpl: (async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/auth/ui-token")) {
        if (calls) calls.count += 1;
        return status === 204 ? new Response(null, { status: 204 }) : jsonResponse({ live: false }, status);
      }
      return jsonResponse({});
    }) as never,
  });
}

describe("boot verdict per probe answer (ME-028 verdict set)", () => {
  it("204 (a live vesmaro_ui cookie) settles user", async () => {
    const gateway = boardWithProbe(204);
    initAuthSession(gateway);
    expect(readAuthSessionStatus(gateway)).toBe("pending");
    await authSessionProbe(gateway);
    expect(readAuthSessionStatus(gateway)).toBe("user");
  });

  it("200 {live:false} — the honest anonymous none-answer — settles anonymous, NOT an error", async () => {
    const gateway = boardWithProbe(200);
    initAuthSession(gateway);
    await authSessionProbe(gateway);
    expect(readAuthSessionStatus(gateway)).toBe("anonymous");
  });

  it("503 (server unavailable) fails SOFT to anonymous: no confirmation, no session claimed", async () => {
    const gateway = boardWithProbe(503);
    initAuthSession(gateway);
    await authSessionProbe(gateway);
    expect(readAuthSessionStatus(gateway)).toBe("anonymous");
  });

  it("a transport failure (throwing fetch) also fails soft to anonymous", async () => {
    const gateway = new BoardAdapter({
      baseUrl: "/api",
      fetchImpl: (async () => {
        throw new TypeError("network down");
      }) as never,
    });
    initAuthSession(gateway);
    await authSessionProbe(gateway);
    expect(readAuthSessionStatus(gateway)).toBe("anonymous");
  });
});

describe("synchronous verdict (pre-paint, no probe round-trip needed)", () => {
  it("a stored ui token answers user IMMEDIATELY — the first render never waits", () => {
    const gateway = boardWithProbe(200);
    sessionStorage.setItem(UI_TOKEN_STORAGE_KEY, "ui-live");
    initAuthSession(gateway);
    expect(readAuthSessionStatus(gateway)).toBe("user");
  });

  it("a stored token is NEVER downgraded by a later cookie-less probe (its validity is the server's call on use)", async () => {
    const gateway = boardWithProbe(200);
    sessionStorage.setItem(UI_TOKEN_STORAGE_KEY, "ui-live");
    initAuthSession(gateway);
    await authSessionProbe(gateway);
    expect(readAuthSessionStatus(gateway)).toBe("user");
  });

  it("mock playground: user with no probe at all (no auth wall by design)", () => {
    const gateway = new MockAdapter({ latency: false });
    expect(readAuthSessionStatus(gateway)).toBe("user");
    expect(authSessionProbe(gateway)).toBeNull();
  });

  it("mnemos L1 adapter: anonymous with no probe (no owner-session wire there)", () => {
    const gateway = new HttpAdapter("/api");
    expect(readAuthSessionStatus(gateway)).toBe("anonymous");
    expect(authSessionProbe(gateway)).toBeNull();
  });
});

describe("one probe per gateway, idempotent init", () => {
  it("init + read + provider-style joins fire the wire exactly once", async () => {
    const calls = { count: 0 };
    const gateway = boardWithProbe(204, calls);
    initAuthSession(gateway);
    initAuthSession(gateway);
    readAuthSessionStatus(gateway);
    const probe = authSessionProbe(gateway);
    expect(probe).not.toBeNull();
    await probe;
    await authSessionProbe(gateway); // settled — null, no re-fire
    expect(authSessionProbe(gateway)).toBeNull();
    expect(calls.count).toBe(1);
  });

  it("a lazy read (harness that never called init) initializes the store itself", async () => {
    const calls = { count: 0 };
    const gateway = boardWithProbe(200, calls);
    expect(readAuthSessionStatus(gateway)).toBe("pending");
    await authSessionProbe(gateway);
    expect(readAuthSessionStatus(gateway)).toBe("anonymous");
    expect(calls.count).toBe(1);
  });
});

describe("listener notification", () => {
  it("settling a pending boot notifies the subscribers exactly once", async () => {
    const gateway = boardWithProbe(204);
    initAuthSession(gateway);
    const seen: string[] = [];
    const unsubscribe = subscribeAuthSession(gateway, () =>
      seen.push(readAuthSessionStatus(gateway)),
    );
    await authSessionProbe(gateway);
    expect(seen).toEqual(["user"]);
    unsubscribe();
  });
});
