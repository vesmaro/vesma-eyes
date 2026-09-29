// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { GatedOutlet } from "./GatedOutlet";
import { authSessionProbe, initAuthSession } from "./authSession";
import { BoardAdapter } from "@/gateway/BoardAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { I18nProvider } from "@/i18n";

/**
 * Cascade P2-arch (ME-043): a gate-domain CHANGE must RESTART the gate
 * screen — key={domain.prefix} remounts it, so the H1 focus effect fires
 * again and the entrance animation replays. Without the key the component
 * instance is reused: the heading text swaps silently and SR/keyboard
 * users lose the "you arrived somewhere new" beat (07k §8 focus
 * discipline). Pinned here with a real DOM focus check.
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
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

/** A board gateway whose boot probe settles the honest anonymous verdict. */
async function anonymousBoard(): Promise<BoardAdapter> {
  const gateway = new BoardAdapter({
    baseUrl: "/api",
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/auth/ui-token") && (init?.method ?? "GET") === "GET") {
        return new Response(JSON.stringify({ live: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } });
    }) as never,
  });
  initAuthSession(gateway);
  await authSessionProbe(gateway);
  return gateway;
}

describe("gate-domain change restarts the screen (key={domain.prefix})", () => {
  it("the H1 focus and the heading RESTART on /memory → /tasks — not a silent text swap", { timeout: 20000 }, async () => {
    const gateway = await anonymousBoard();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const renderAt = (path: string) =>
      act(async () => {
        root.render(
          <I18nProvider initialLang="en">
            <GatewayContext.Provider value={gateway}>
              <MemoryRouter>
                <GatedOutlet pathname={path} search="">
                  <p data-testid="gated-child">SECRET PAGE CONTENT</p>
                </GatedOutlet>
              </MemoryRouter>
            </GatewayContext.Provider>
          </I18nProvider>,
        );
      });

    await renderAt("/memory");
    const firstHeading = document.querySelector('[data-testid="gate-screen"] h1');
    expect(firstHeading?.textContent).toContain("The “Memory” section");
    // The gate screen moved focus to its H1 on mount (07k §3).
    expect(document.activeElement).toBe(firstHeading);

    // Same outlet, NEW gate domain: the screen must REMOUNT — a fresh H1
    // element receives focus again (a silent text swap would leave the
    // focus on a detached node and the SR user uninformed).
    await renderAt("/tasks");
    const secondHeading = document.querySelector('[data-testid="gate-screen"] h1');
    expect(secondHeading).not.toBe(firstHeading); // remounted, not reused
    expect(secondHeading?.textContent).toContain("The “Tasks” section");
    expect(document.activeElement).toBe(secondHeading);
    expect(container.textContent).not.toContain("SECRET PAGE CONTENT");

    await act(async () => {
      root.unmount();
    });
  });
});
