// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TopBar } from "./TopBar";
import { ThemeProvider } from "@/components/theme-provider";
import { DensityProvider } from "@/components/density-provider";
import { HotkeysProvider } from "@/layout/Hotkeys";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { GatewayContext } from "@/gateway/GatewayContext";
import { I18nProvider } from "@/i18n";
import type { MemoryGateway } from "@/gateway/MemoryGateway";
import { actWaitUntil } from "@/test/actTools";

/**
 * The anonymous TopBar (07k §2.3/§0): the global search field is a
 * GATE-ACTION — it reads memory contents — so for a settled anonymous
 * verdict on a gates-active deployment the field is GONE (the slot belongs
 * to the «Войти» pair), while the command palette (navigation, 07k §2.2)
 * and the LIVE-class status zone stay. A non-session deployment (mock, vesma
 * L1) and a pending boot keep the field: a hidden search would lie about a
 * genuinely open surface, and a signed-in visitor must never see it flash.
 */

/** A minimal session-wire gateway: capability true, the probe answers
 * «not live» immediately (the settled anonymous verdict). */
function sessionGateway(): MemoryGateway {
  return {
    hasUiToken: () => false,
    probeUiSession: () => Promise.resolve(false),
    verifyUiToken: () => Promise.reject(new Error("not used here")),
    logoutUiToken: () => Promise.resolve(),
  } as unknown as MemoryGateway;
}

const mounted: (() => void)[] = [];

async function mount(gateway: MemoryGateway): Promise<void> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <GatewayContext.Provider value={gateway}>
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: { queries: { enabled: false, retry: false } },
            })
          }
        >
          <ThemeProvider>
            <AuthProvider adapterMode="mock" endpoint="/api">
              <I18nProvider initialLang="ru">
                <DensityProvider initialDensity="comfortable">
                  <HotkeysProvider>
                    <MemoryRouter>
                      <TopBar />
                    </MemoryRouter>
                  </HotkeysProvider>
                </DensityProvider>
              </I18nProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  mounted.push(() =>
    act(() => {
      root.unmount();
      container.remove();
    }),
  );

}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  document.body.innerHTML = "";
  try {
    sessionStorage.clear();
    localStorage.clear();
  } catch {
    /* no storage in this env */
  }
});

afterEach(() => {
  for (const unmount of mounted.splice(0).reverse()) unmount();
});

describe("TopBar anonymous search (07k §2.3)", () => {
  it("settled anonymous on a gates-active deployment: the search field is gone", async () => {
    await mount(sessionGateway());
    // The boot probe settles in a microtask — the field disappears with it.
    await actWaitUntil(() => {
      expect(document.querySelector("#global-search-input")).toBeNull();
    });
    // The palette affordance (navigation) stays, and so does the sign-in CTA.
    expect(document.querySelector('button[aria-haspopup="dialog"]')).not.toBeNull();
  });

  it("no session wire (mock playground): the field stays — the surface is genuinely open", async () => {
    const bare = {} as MemoryGateway; // no probeUiSession ⇒ capability false
    await mount(bare);
    expect(document.querySelector("#global-search-input")).not.toBeNull();
  });
});
