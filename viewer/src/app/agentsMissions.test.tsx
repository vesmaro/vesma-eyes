// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { buildRoutes } from "@/app/routes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { MOCK_EXECUTORS_PAGE } from "@/gateway/boardFixtures";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { DensityProvider } from "@/components/density-provider";
import { HotkeysProvider } from "@/layout/Hotkeys";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import { actWaitUntil } from "@/test/actTools";

/**
 * agents-redesign C1: the ROUTE MISSIONS — every path a bookmark or an old
 * card could carry, and where it MUST land. /agents/harnesses keeps its
 * route (the U8 conveyor; the entry is contextual now, not a nav row).
 */
describe("routes — the agents path missions (C1)", () => {
  async function land(path: string): Promise<{ pathname: string; container: HTMLElement }> {
    const gateway = new MockAdapter({ latency: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    await client.prefetchQuery({
      queryKey: keys.tasks.board(),
      queryFn: () => gateway.board(),
    });
    client.setQueryData(keys.agents.executors.list(), MOCK_EXECUTORS_PAGE);
    const router = createMemoryRouter(buildRoutes(), { initialEntries: [path] });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <GatewayContext.Provider value={gateway}>
          <QueryClientProvider client={client}>
            <AuthProvider adapterMode="board" endpoint="test">
              <ThemeProvider>
                <I18nProvider initialLang="en">
                  <DensityProvider initialDensity="comfortable">
                    <HotkeysProvider>
                      <ToastProvider>
                        <UiTokenProvider>
                          <RouterProvider router={router} />
                        </UiTokenProvider>
                      </ToastProvider>
                    </HotkeysProvider>
                  </DensityProvider>
                </I18nProvider>
              </ThemeProvider>
            </AuthProvider>
          </QueryClientProvider>
        </GatewayContext.Provider>,
      );
    });
    return {
      get pathname() {
        return router.state.location.pathname;
      },
      container,
    };
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("mission: the alias /agents lands on the hosts workbench's first host", async () => {
    const landed = await land("/agents");
    await actWaitUntil(() => {
      expect(landed.pathname).toBe("/agents/hosts/laptop");
    });
  });

  it("mission: /agents/hosts redirects into the frame (the first host)", async () => {
    const landed = await land("/agents/hosts");
    await actWaitUntil(() => {
      expect(landed.pathname.startsWith("/agents/hosts/")).toBe(true);
    });
  });

  it("mission: /agents/harnesses STAYS live — the conveyor renders (contextual entry)", async () => {
    const landed = await land("/agents/harnesses");
    expect(landed.pathname).toBe("/agents/harnesses");
    // The registry/conveyor page mounted (its loading/loaded content, not
    // the hosts frame, not a redirect): the loaded band label or the
    // mount-time loading line.
    await actWaitUntil(() => {
      expect(
        (document.body.textContent ?? "").includes("Awaiting approval") ||
          document.querySelector('[aria-label="Loading the executor registry"]') !== null,
      ).toBe(true);
    });
  });

  it("mission: /agents/execution stays live", async () => {
    const landed = await land("/agents/execution");
    expect(landed.pathname).toBe("/agents/execution");
  });

  it("mission: an unknown host deep link lands on the honest not-found", async () => {
    const landed = await land("/agents/hosts/ghost-host");
    await actWaitUntil(() => {
      expect(document.body.textContent).toContain("Host not found");
    });
    expect(landed.pathname).toBe("/agents/hosts/ghost-host");
  });
});

