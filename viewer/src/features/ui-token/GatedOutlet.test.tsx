import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { GatedOutlet } from "./GatedOutlet";
import { authSessionProbe, initAuthSession } from "./authSession";
import { UiTokenContext } from "./UiTokenContext";
import { BoardAdapter } from "@/gateway/BoardAdapter";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { I18nProvider } from "@/i18n";

/**
 * The Shell content gate (ME-043, 07k §2.2/§3): ONE interception point —
 * anonymous board visitors get the gate screen instead of the page (the
 * gated component never mounts, so closed content cannot even flash);
 * users, pending boots and non-board deployments render the outlet
 * untouched. The verdict rules pinned here mirror useAuthSession exactly.
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
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A board adapter whose boot probe answers `probeStatus`. */
function boardGateway(probeStatus: number): BoardAdapter {
  return new BoardAdapter({
    baseUrl: "/api",
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/auth/ui-token") && (init?.method ?? "GET") === "GET") {
        return probeStatus === 204
          ? new Response(null, { status: 204 })
          : jsonResponse({ live: false }, probeStatus);
      }
      return jsonResponse({});
    }) as never,
  });
}

/** Render GatedOutlet at `path` with the given live token mirror. */
function renderGate(
  path: string,
  gateway: BoardAdapter | MockAdapter,
  tokenPresent: boolean,
  search = "",
): string {
  return renderToString(
    <GatewayContext.Provider value={gateway}>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { enabled: false, retry: false } },
          })
        }
      >
        <I18nProvider initialLang="en">
          <UiTokenContext.Provider
            value={{
              tokenPresent,
              openLogin: () => undefined,
              runAuthorized: () => undefined,
              logout: () => undefined,
              submitToken: () => undefined,
              verifyPending: false,
            }}
          >
            <MemoryRouter>
              <GatedOutlet pathname={path} search={search}>
                <p data-testid="gated-child">SECRET PAGE CONTENT</p>
              </GatedOutlet>
            </MemoryRouter>
          </UiTokenContext.Provider>
        </I18nProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>,
  );
}

describe("anonymous board visitor (probe settled {live:false})", () => {
  it("a gated route renders the GATE SCREEN, never the page content", async () => {
    const gateway = boardGateway(200);
    initAuthSession(gateway);
    await authSessionProbe(gateway);
    const html = renderGate("/memory", gateway, false);
    expect(html).toContain('data-testid="gate-screen"');
    expect(html).not.toContain("SECRET PAGE CONTENT");
    expect(html).toContain("The “Memory” section opens after you sign in");
  });

  it("kora deep links are gated too — the gate owns the whole domain", async () => {
    const gateway = boardGateway(200);
    initAuthSession(gateway);
    await authSessionProbe(gateway);
    const html = renderGate("/kora/s-2026", gateway, false);
    expect(html).toContain('data-testid="gate-screen"');
    expect(html).not.toContain("SECRET PAGE CONTENT");
  });

  it("public routes render the outlet: / and /docs", async () => {
    const gateway = boardGateway(200);
    initAuthSession(gateway);
    await authSessionProbe(gateway);
    expect(renderGate("/", gateway, false)).toContain("SECRET PAGE CONTENT");
    expect(renderGate("/docs/vesmaro-eyes", gateway, false)).toContain(
      "SECRET PAGE CONTENT",
    );
  });
});

describe("user (the live tokenPresent mirror)", () => {
  it("a signed-in board visitor sees the page, not the gate", async () => {
    const gateway = boardGateway(200);
    initAuthSession(gateway);
    await authSessionProbe(gateway);
    const html = renderGate("/memory", gateway, true);
    expect(html).toContain("SECRET PAGE CONTENT");
    expect(html).not.toContain('data-testid="gate-screen"');
  });

  it("a cookie-hydrated boot (probe 204) with the mirror flipped also renders the page", async () => {
    const gateway = boardGateway(204);
    initAuthSession(gateway);
    await authSessionProbe(gateway);
    const html = renderGate("/kora", gateway, true);
    expect(html).toContain("SECRET PAGE CONTENT");
  });
});

describe("pending boot (the probe still in flight)", () => {
  it("HOLDS the slot: neither the closed content nor the gate screen paints", () => {
    // A never-resolving probe keeps the boot verdict pending — exactly the
    // window between main.tsx firing the probe and its answer (bounded by
    // the probe's own 10s abort).
    const gateway = new BoardAdapter({
      baseUrl: "/api",
      fetchImpl: (() => new Promise(() => undefined)) as never,
    });
    initAuthSession(gateway);
    const html = renderGate("/memory", gateway, false);
    expect(html).not.toContain("SECRET PAGE CONTENT");
    expect(html).not.toContain('data-testid="gate-screen"');
    // Cascade P3-5: the hold is VISIBLE — a sighted user staring at a hung
    // probe gets the honest «checking session» line, not an empty main
    // (role=status keeps it polite for AT, 4.1.3).
    expect(html).toContain('data-testid="gate-pending"');
    expect(html).toContain("Checking your session");
    expect(html).not.toContain("sr-only"); // the line is on screen, not sr-only
  });
});

describe("gates inactive (non-board deployments)", () => {
  it("the mock playground renders the outlet untouched — a lock would lie there", () => {
    const html = renderGate("/memory", new MockAdapter({ latency: false }), false);
    expect(html).toContain("SECRET PAGE CONTENT");
    expect(html).not.toContain('data-testid="gate-screen"');
  });
});
