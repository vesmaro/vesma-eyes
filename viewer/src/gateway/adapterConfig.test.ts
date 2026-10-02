import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_STORAGE_KEY, clearToken } from "./auth";

/** Minimal Storage stand-in (vitest node env has none). */
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
  keys(): string[] {
    return [...this.store.keys()];
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("sessionStorage", new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  clearToken();
});

describe("resolveAdapterKind", () => {
  it("accepts every documented VITE_ADAPTER value", async () => {
    const { resolveAdapterKind } = await import("./adapterConfig");
    expect(resolveAdapterKind("mock")).toBe("mock");
    expect(resolveAdapterKind("vesma")).toBe("vesma");
    expect(resolveAdapterKind("board")).toBe("board");
  });

  it("falls back to the environment-aware default and honours the legacy mock knob", async () => {
    const { resolveAdapterKind } = await import("./adapterConfig");
    expect(resolveAdapterKind(undefined, undefined, "board")).toBe("board");
    expect(resolveAdapterKind(undefined, undefined, "mock")).toBe("mock");
    expect(resolveAdapterKind("", "http", "board")).toBe("board");
    expect(resolveAdapterKind(undefined, "mock", "board")).toBe("mock");
  });

  it("VITE_ADAPTER wins over the legacy knob; unknown values fail safe to the fallback", async () => {
    const { resolveAdapterKind } = await import("./adapterConfig");
    expect(resolveAdapterKind("board", "mock")).toBe("board");
    expect(resolveAdapterKind("vesma", "mock")).toBe("vesma");
    expect(resolveAdapterKind("garbage", "mock", "board")).toBe("board");
    expect(resolveAdapterKind("garbage", undefined, "mock")).toBe("mock");
  });
});

describe("adapter default (owner feedback 1.4.0)", () => {
  // After vi.resetModules() the dynamic import re-evaluates the module graph,
  // so adapter classes must come from the same re-import for instanceof.
  async function importFresh() {
    const config = await import("./adapterConfig");
    const board = await import("./BoardAdapter");
    const http = await import("./HttpAdapter");
    const mock = await import("./MockAdapter");
    return { config, board, http, mock };
  }

  it("a production build with no knobs boots the BoardAdapter", async () => {
    vi.resetModules();
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_ADAPTER", "");
    vi.stubEnv("VITE_MNEMOS_ADAPTER", "");
    const {
      config: { ADAPTER, createGateway },
      board: { BoardAdapter: FreshBoardAdapter },
    } = await importFresh();
    expect(ADAPTER).toBe("board");
    expect(await createGateway()).toBeInstanceOf(FreshBoardAdapter);
  });

  it("dev/test with no knobs boots the MockAdapter (fixtures, no backend)", async () => {
    vi.resetModules();
    vi.stubEnv("PROD", false);
    vi.stubEnv("VITE_ADAPTER", "");
    vi.stubEnv("VITE_MNEMOS_ADAPTER", "");
    const {
      config: { ADAPTER, createGateway },
      mock: { MockAdapter: FreshMockAdapter },
    } = await importFresh();
    expect(ADAPTER).toBe("mock");
    expect(await createGateway()).toBeInstanceOf(FreshMockAdapter);
  });

  it("VITE_ADAPTER=vesma still opts a production build into the vesma mode", async () => {
    vi.resetModules();
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_ADAPTER", "vesma");
    const {
      config: { ADAPTER, createGateway },
      http: { HttpAdapter: FreshHttpAdapter },
    } = await importFresh();
    expect(ADAPTER).toBe("vesma");
    expect(await createGateway()).toBeInstanceOf(FreshHttpAdapter);
  });
});

describe("createGateway", () => {
  // After vi.resetModules() the dynamic import re-evaluates the module graph,
  // so adapter classes must come from the same re-import as createGateway
  // for instanceof to hold.
  async function importFresh() {
    const config = await import("./adapterConfig");
    const board = await import("./BoardAdapter");
    const http = await import("./HttpAdapter");
    const mock = await import("./MockAdapter");
    return { config, board, http, mock };
  }

  it("builds the HttpAdapter when VITE_ADAPTER=vesma is set explicitly", async () => {
    vi.resetModules();
    vi.stubEnv("PROD", true); // explicit knob beats the prod board default
    vi.stubEnv("VITE_ADAPTER", "vesma");
    const {
      config: { createGateway },
      http: { HttpAdapter: FreshHttpAdapter },
    } = await importFresh();
    expect(await createGateway()).toBeInstanceOf(FreshHttpAdapter);
  });

  it("builds the MockAdapter via the legacy dev knob", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_ADAPTER", "");
    vi.stubEnv("VITE_MNEMOS_ADAPTER", "mock");
    const {
      config: { createGateway },
      mock: { MockAdapter: FreshMockAdapter },
    } = await importFresh();
    expect(await createGateway()).toBeInstanceOf(FreshMockAdapter);
  });

  it("builds the BoardAdapter with the board base URL", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_ADAPTER", "board");
    vi.stubEnv("VITE_BOARD_API_URL", "https://board.example/api");
    const {
      config: { createGateway, BOARD_BASE_URL },
      board: { BoardAdapter: FreshBoardAdapter },
    } = await importFresh();
    expect(BOARD_BASE_URL).toBe("https://board.example/api");
    expect(await createGateway()).toBeInstanceOf(FreshBoardAdapter);
  });

  it("board mode purges a legacy stored vesma token at bootstrap", async () => {
    // Simulate a leftover mnemos-mode session carrying an mnk_ token.
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ token: "mnk_purged_at_bootstrap" }),
    );
    vi.resetModules();
    vi.stubEnv("VITE_ADAPTER", "board");

    const { createGateway } = await import("./adapterConfig");
    await createGateway();

    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it("in board mode no mnk_-bearing key appears in browser storage", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_ADAPTER", "board");

    const { createGateway } = await import("./adapterConfig");
    await createGateway();

    const allKeys = [...localStorage.keys(), ...sessionStorage.keys()];
    expect(allKeys).toEqual([]);
    const storedValues = allKeys
      .map((key) => localStorage.getItem(key) ?? sessionStorage.getItem(key) ?? "")
      .join(" ");
    expect(storedValues).not.toContain("mnk_");
  });
});

/**
 * Cascade P3-4 (ME-043): the adapter pin. The mock playground has no auth
 * wall and the gates-v6 public surface is inactive there BY DESIGN — a
 * production build booted with VITE_ADAPTER=mock would silently ship
 * without the gates, so createGateway must refuse the combo LOUDLY. The
 * single opt-in is the render-smoke harness's own dist-smoke build
 * (VITE_SMOKE_ALLOW_MOCK=1), never a deployment.
 */
describe("adapter pin: prod + mock is forbidden (ME-043 P3-4)", () => {
  async function importFresh() {
    const config = await import("./adapterConfig");
    return config;
  }

  it("the pure predicate bars exactly prod+mock without the smoke opt-in", async () => {
    const { isForbiddenAdapterCombo } = await importFresh();
    expect(isForbiddenAdapterCombo(true, "mock", false)).toBe(true);
    expect(isForbiddenAdapterCombo(false, "mock", false)).toBe(false);
    expect(isForbiddenAdapterCombo(true, "board", false)).toBe(false);
    expect(isForbiddenAdapterCombo(true, "vesma", false)).toBe(false);
    expect(isForbiddenAdapterCombo(true, "mock", true)).toBe(false); // smoke opt-in
  });

  it("createGateway REJECTS a production boot with VITE_ADAPTER=mock (loud, not silent)", async () => {
    vi.resetModules();
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_ADAPTER", "mock");
    vi.stubEnv("VITE_SMOKE_ALLOW_MOCK", "");
    const { createGateway } = await importFresh();
    await expect(createGateway()).rejects.toThrow(/VITE_ADAPTER=mock cannot boot/);
  });

  it("the smoke-harness opt-in releases the combo for the dist-smoke build only", async () => {
    vi.resetModules();
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_ADAPTER", "mock");
    vi.stubEnv("VITE_SMOKE_ALLOW_MOCK", "1");
    const {
      config: { createGateway },
      mock: { MockAdapter: FreshMockAdapter },
    } = await (async () => {
      const config = await import("./adapterConfig");
      const mock = await import("./MockAdapter");
      return { config, mock };
    })();
    expect(await createGateway()).toBeInstanceOf(FreshMockAdapter);
  });
});

describe("routerBasename", () => {
  it("follows the runtime location: /app pages keep the prefix, root pages mount at /", async () => {
    // node-env (no window): root mount
    const { routerBasename } = await import("./adapterConfig");
    expect(routerBasename("/app/")).toBeUndefined();
    expect(routerBasename("/")).toBeUndefined();
    // stubbed browser location under /app: prefixed mount
    const originalWindow = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = {
      location: { pathname: "/app/tasks" },
    };
    try {
      vi.resetModules();
      const fresh = await import("./adapterConfig");
      expect(fresh.routerBasename("/app/")).toBe("/app");
      expect(fresh.routerBasename("/")).toBe("/app");
    } finally {
      if (originalWindow === undefined) delete (globalThis as Record<string, unknown>).window;
      else (globalThis as Record<string, unknown>).window = originalWindow;
      vi.resetModules();
    }
  });
});
