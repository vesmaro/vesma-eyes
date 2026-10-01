import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TopBar } from "./TopBar";
import { LanguageToggle } from "./LanguageToggle";
import { ThemeProvider } from "@/components/theme-provider";
import { DensityProvider } from "@/components/density-provider";
import { HotkeysProvider } from "@/layout/Hotkeys";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { GatewayContext } from "@/gateway/GatewayContext";
import { MockAdapter } from "@/gateway/MockAdapter";
import { I18nProvider, type Lang } from "@/i18n";

/**
 * TopBar i18n regression (union И1, stand 03 §4): the RU|EN pill, the
 * density and theme toggles, the brand link and the GLOBAL SEARCH FIELD —
 * rendered copy pinned per language via snapshots (renderToString keeps
 * this DOM-free, project pattern).
 *
 * Node env ⇒ ThemeProvider falls back to the system default "dark", so the
 * theme toggle label is deterministically the "switch to light" branch. The
 * search <input> is hidden below md in CSS but ALWAYS in the markup —
 * renderToString pins the server frame (the desktop chrome).
 */
function renderTopBar(lang: Lang): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  return renderToString(
    <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider adapterMode="mock" endpoint="/api">
            <I18nProvider initialLang={lang}>
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
}

describe("TopBar i18n (ru default, en switch)", () => {
  it("renders Russian copy with RU pressed by default", () => {
    const html = renderTopBar("ru");
    expect(html).toContain("Язык интерфейса");
    expect(html).toContain('aria-label="Переключить на светлую тему"');
    expect(html).toContain("Переключить плотность на компактную");
    // Union И1: the global search is a REAL input (stand 03 §4) — a labelled
    // search box with the `/` hint, not the palette-trigger oval.
    expect(html).toContain('aria-label="Глобальный поиск по памяти и задачам"');
    expect(html).toContain('placeholder="Поиск по памяти и задачам…"');
    expect(html).toContain('id="global-search-input"');
    // The brand rides the bar now (03 §2) — mark + wordmark link to the root.
    expect(html).toContain('href="/"');
    expect(html).toContain("vesma-eyes");
    // Segmented control: RU is the pressed segment, EN is not.
    expect(html).toMatch(/aria-pressed="true"[^>]*>ru</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>en</);
    expect(html).toMatchSnapshot();
  });

  it("renders English copy with EN pressed when switched", () => {
    const html = renderTopBar("en");
    expect(html).toContain("Interface language");
    expect(html).toContain('aria-label="Switch to light theme"');
    expect(html).toContain('aria-label="Global search across memory and tasks"');
    expect(html).toContain('placeholder="Search memory and tasks…"');
    expect(html).toContain("Switch density to compact");
    expect(html).toMatch(/aria-pressed="false"[^>]*>ru</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>en</);
    expect(html).toMatchSnapshot();
  });

  it("language toggle exposes a labelled group with focusable segments", () => {
    const html = renderToString(
      <I18nProvider initialLang="ru">
        <LanguageToggle />
      </I18nProvider>,
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Язык интерфейса"');
    expect(html).toContain("focus-visible:outline-focus"); // Phase 1 ring unification
    // Both segments are real buttons (keyboard reachable, no roving tabindex).
    expect(html.match(/<button /g)?.length).toBe(2);
  });
});
