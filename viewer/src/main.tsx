import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/lib/queryClient";
import { GatewayContext } from "@/gateway/GatewayContext";
import { createGateway } from "@/gateway/adapterConfig";
import { initAuthSession } from "@/features/ui-token/authSession";
import { ThemeProvider } from "@/components/theme-provider";
import { DensityProvider } from "@/components/density-provider";
import { HotkeysProvider } from "@/layout/Hotkeys";
import { I18nProvider } from "@/i18n";
import App from "@/App";

import "@/styles/fonts.css";
import "@/styles/tokens.css";
import "@/styles/global.css";

/**
 * Bootstrap (architecture.md §5): the gateway is created once and injected
 * via context; the base URL stays same-origin "/api" so the Vite dev-proxy
 * (and the production reverse proxy) route requests without CORS.
 *
 * Adapter selection lives in gateway/adapterConfig.ts (`VITE_ADAPTER`):
 * "board" (production default — the read-only merge-API, no auth wall),
 * "mock" (in-memory fixtures, dev default) and "vesma" (HttpAdapter against
 * the vesma API, via VITE_ADAPTER=vesma).
 *
 * The router mounts under the Vite base ("/app" in production, root in dev)
 * so the deployed `/app` deep links resolve client-side (ADR 0011 §2 Ф0a:
 * server history-fallback serves index.html for `/app/{path}`).
 */
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Bootstrap failed: #root element not found in index.html");
}

/**
 * ME-024 (entry hygiene): createGateway is async — the mock adapter and its
 * fixture corpus live in a lazy chunk that only mock-mode builds (dev, smoke)
 * ever fetch. Production resolves on the next microtask with the board
 * adapter, so first paint is unaffected there; mock builds pay one chunk
 * fetch before the tree mounts.
 */
void createGateway()
  .then((gateway) => {
    // Gates v6 (ME-043, 07k §5.1): settle the auth session BEFORE the first
    // render — the ME-028 boot probe (GET /api/auth/ui-token) leaves with the
    // gateway, so the first paint of a gated route already knows the verdict
    // and closed content can never flash. Idempotent per gateway: the
    // UiTokenProvider joins this same promise (no second request).
    initAuthSession(gateway);
    createRoot(rootElement).render(
      <StrictMode>
        <GatewayContext.Provider value={gateway}>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              {/* i18n (owner feedback 1.4.0): ru default, persisted choice in
               * localStorage "vesmaro.lang", mirrored into <html lang>. */}
              <I18nProvider>
                {/* Density (Ф1, concept §3.3): [data-density] on <html> drives
                 * the --row-h/--list-gap operational tokens; persisted
                 * "vesmaro.density". */}
                <DensityProvider>
                  {/* Hotkeys (Ф1): `/` search focus + `?` cheatsheet with the
                   * inInput guard; the dialog renders from here, above routes.
                   * App brings its own data router (createBrowserRouter). */}
                  <HotkeysProvider>
                    <App />
                  </HotkeysProvider>
                </DensityProvider>
              </I18nProvider>
            </ThemeProvider>
          </QueryClientProvider>
        </GatewayContext.Provider>
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    // A bootstrap refusal (e.g. the adapter pin, ME-043 P3-4) must be LOUD,
    // never a silently degraded app: state the reason on the page and keep
    // the rejection visible in the console.
    rootElement.replaceChildren();
    rootElement.textContent =
      error instanceof Error ? error.message : String(error);
    throw error;
  });
