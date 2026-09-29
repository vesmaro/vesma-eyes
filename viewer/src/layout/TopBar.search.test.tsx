// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TopBar } from "./TopBar";
import { ThemeProvider } from "@/components/theme-provider";
import { DensityProvider } from "@/components/density-provider";
import { HotkeysProvider } from "@/layout/Hotkeys";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { GatewayContext } from "@/gateway/GatewayContext";
import { MockAdapter } from "@/gateway/MockAdapter";
import { I18nProvider } from "@/i18n";

/**
 * Union И1 (stand 03 §4): the TopBar global search is a REAL field — Enter
 * carries the query to /memory/search (?q=, encoded), an empty Enter goes
 * to the bare search page, Esc blurs (focus handling), and the form never
 * reloads the document (preventDefault).
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;
/** Router observer: the CURRENT path lands here from an effect (never
 * during render — the react-hooks purity rule). */
const locationLog: { path: string } = { path: "/" };

function Probe() {
  const location = useLocation();
  useEffect(() => {
    locationLog.path = location.pathname + location.search;
  }, [location.pathname, location.search]);
  return null;
}

async function mountTopBar(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
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
                    <MemoryRouter initialEntries={["/"]}>
                      <Probe />
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
}

function field(): HTMLInputElement {
  const input = document.getElementById(
    "global-search-input",
  ) as HTMLInputElement | null;
  if (!input) throw new Error("global search field not found");
  return input;
}

function submit(): void {
  act(() => {
    field()
      .closest("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  locationLog.path = "/";
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

describe("TopBar global search (union И1, stand 03 §4)", () => {
  it("Enter carries the trimmed query to /memory/search (?q= encoded)", async () => {
    await mountTopBar();
    await act(async () => {
      field().value = "  проводник UI-10  ";
    });
    submit();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(locationLog.path).toBe(
      `/memory/search?q=${encodeURIComponent("проводник UI-10")}`,
    );
  });

  it("an empty query lands on the bare search page (no dead ?q=)", async () => {
    await mountTopBar();
    await act(async () => {
      field().value = "   ";
    });
    submit();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(locationLog.path).toBe("/memory/search");
  });

  it("Esc blurs the field (stand 03 §4 «Esc — снять»)", async () => {
    await mountTopBar();
    field().focus();
    expect(document.activeElement).toBe(field());
    act(() => {
      field().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(document.activeElement).not.toBe(field());
  });
});
