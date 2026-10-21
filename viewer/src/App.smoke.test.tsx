import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { buildRoutes } from "@/app/routes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { DensityProvider } from "@/components/density-provider";
import { HotkeysProvider } from "@/layout/Hotkeys";
import { I18nProvider } from "@/i18n";

/**
 * Ф1 smoke: the converged route tree (the very same buildRoutes() the
 * production data router mounts) renders against the MockAdapter (`latency:
 * false`, queries suppressed — renderToString runs no effects) and emits the
 * domain sidebar (Обзор + 5 domains incl. honest "soon" slots), the top-bar
 * global search, and the eager search page under the memory domain.
 *
 * Test-env note: the project runs vitest in the node environment and adds no
 * DOM/testing-library dependencies, so mounting uses `renderToString` with a
 * memory DATA router (ScrollRestoration requires one).
 */
function renderAppAt(path: string): string {
  const gateway = new MockAdapter({ latency: false });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  const router = createMemoryRouter(buildRoutes(), { initialEntries: [path] });
  return renderToString(
    <GatewayContext.Provider value={gateway}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          {/* English copy via initialLang — the smoke test pins English. */}
          <I18nProvider initialLang="en">
            <DensityProvider initialDensity="comfortable">
              <HotkeysProvider>
                <AuthProvider adapterMode="mock" endpoint="/api">
                  <RouterProvider router={router} />
                </AuthProvider>
              </HotkeysProvider>
            </DensityProvider>
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>,
  );
}

describe("App (smoke)", () => {
  it("is defined and is a function component", () => {
    expect(buildRoutes).toBeDefined();
    expect(typeof buildRoutes).toBe("function");
  });

  it("mounts the domain sidebar: live domains only, no placeholder rows (D8)", () => {
    const html = renderAppAt("/");
    // Brand + every live domain of the IA (D8 2026-10-21: the /stores slot
    // and the Sessions/Traces placeholder rows left the daily navigation).
    for (const label of [
      "vesma-eyes",
      "Overview",
      "Memory",
      "Tasks",
      "Agents",
      "System",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('href="/tasks"');
    // Placeholder surfaces have no nav row at all: no slot badges, no rows.
    expect(html).not.toContain("Stores");
    expect(html).not.toContain(">soon<");
    expect(html).not.toContain('href="/stores"');
    expect(html).not.toContain('href="/system/sessions"');
    expect(html).not.toContain('href="/system/traces"');
  });

  it("mounts the global search entry in the top bar (every route)", () => {
    const html = renderAppAt("/");
    // Union И1 (stand 03 §4): the topbar carries a REAL search input (Enter
    // → /memory/search, `/` focuses) plus the mobile palette icon button.
    expect(html).toContain('aria-label="Global search across memory"');
    expect(html).toContain('id="global-search-input"');
    expect(html).toContain('placeholder="Search memory…"');
    // The `/` key hint rides the field (the hotkey exists — Hotkeys.test.ts).
    expect(html).toContain("<kbd");
    expect(html).toContain('aria-label="Open search"'); // mobile palette icon
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it("serves the eager search page under the memory domain", () => {
    const html = renderAppAt("/memory/search");
    // §8.1 hero moved with its route: /memory/search (re-parented Ф1).
    expect(html).toContain("a gaze into oneself");
    expect(html).toContain('placeholder="Search the well…"');
    expect(html).toContain('role="search"');
  });

  it("renders top-bar status indicator, density and theme toggles", () => {
    const html = renderAppAt("/");
    expect(html).toContain("status: ");
    expect(html).toContain('aria-label="Switch density to compact"');
    expect(html).toContain('aria-label="Switch to light theme"');
  });

  it("renders the ONE not-found pattern for unknown paths (ME-072 A: explain + action)", () => {
    const html = renderAppAt("/definitely-not-a-route");
    expect(html).toContain("Page not found"); // en dictionary title — a human line, not a bare code
    expect(html).toContain('role="alert"');
    expect(html).toContain('href="/"'); // the way home
  });
});
