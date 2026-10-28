// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { KoraPage } from "./KoraPage";
import { KoraMockAdapter } from "./KoraMockAdapter";
import { KoraGatewayContext } from "./koraGatewayContext";
import { KORA_FRAME_QUERY } from "./koraViewport";
import { koraKeys } from "./useKora";
import {
  KORA_FIXTURE_COVERAGE,
  KORA_FIXTURE_SESSIONS,
} from "./koraFixtures";
import type { ExecutorsPage } from "@/gateway/boardTypes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The KW4 route grammar at the PAGE level (gate §9.3, states-kw4 §1):
 * /kora/host/:host (+?agent=) is deep-linkable; the retired header filter's
 * `/kora?host=X` deep link replace-redirects into the field route
 * (K-CTX-COMPAT — ONE compat wave); a session deep link that happens to
 * carry ?host= keeps its SESSION semantics (the redirect is only for the
 * bare /kora path); an unknown host lands on the honest empty.
 */

const PAGE_SIZE = 50;

function stubWideFrame(): void {
  window.matchMedia = ((query: string) => ({
    matches: query === KORA_FRAME_QUERY,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

function executorsPage(): ExecutorsPage["items"] {
  const row = (
    id: string,
    name: string,
    harness: string,
    host: string,
  ): ExecutorsPage["items"][number] => ({
    id,
    name,
    harness,
    host,
    transport: "local-poll",
    capabilities: [],
    version: "1.0.0",
    enabled: true,
    state: "approved",
    last_seen: "2026-09-24T11:00:00Z",
    presence: "online",
    registered_via: "",
    registered_at: "2026-09-20T09:00:00Z",
    updated_at: "2026-09-24T11:00:00Z",
  });
  return [
    row("exec-zcode-main", "zcode@abyss-laptop", "zcode", "abyss-laptop"),
    row("exec-vscode-lab", "vscode@abyss-laptop", "vscode", "abyss-laptop"),
    row("exec-pi-edge", "pi@pi-edge", "pi", "pi-edge"),
  ];
}

function mountKoraPageAt(path: string): { container: HTMLElement; root: Root } {
  stubWideFrame();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(koraKeys.sessionsPaged(PAGE_SIZE), {
    pages: [
      {
        ok: true as const,
        count: KORA_FIXTURE_SESSIONS.length,
        items: KORA_FIXTURE_SESSIONS,
        coverage: KORA_FIXTURE_COVERAGE,
        meta: { generated_at: "2026-09-24T11:45:00Z" },
      },
    ],
    pageParams: [0],
  });
  queryClient.setQueryData(keys.agents.executors.list(), {
    ok: true,
    count: 3,
    items: executorsPage(),
    meta: {
      presence: { online_max_age_s: 120, stale_max_age_s: 600 },
      sweeper_interval_s: 60,
    },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
        <KoraGatewayContext.Provider value={new KoraMockAdapter({ latency: false })}>
          <QueryClientProvider client={queryClient}>
            <I18nProvider initialLang="ru">
              <MemoryRouter initialEntries={[path]}>
                <Routes>
                  <Route path="/kora" element={<KoraPage />} />
                  <Route path="/kora/hermes" element={<KoraPage />} />
                  <Route path="/kora/host/:host?" element={<KoraPage />} />
                  <Route path="/kora/:sessionId" element={<KoraPage />} />
                </Routes>
              </MemoryRouter>
            </I18nProvider>
          </QueryClientProvider>
        </KoraGatewayContext.Provider>
      </GatewayContext.Provider>,
    );
  });
  return { container, root };
}

afterEach(async () => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("KoraPage routes (gate §9.3, states-kw4 K-CTX-COMPAT)", () => {
  // The field's own headline: scoped to the field section — the В1 dock
  // renders the page's FIRST h2 («Сессии») before the center (kora-ide
  // contract §2).
  const fieldH2 = (container: HTMLElement): string | null | undefined =>
    [...container.querySelectorAll("section")]
      .find((el) => el.getAttribute("aria-label") === "Поле хоста")
      ?.querySelector("h2")?.textContent;

  it("K-CTX-COMPAT: /kora?host=X replace-redirects into the field route", () => {
    const { container } = mountKoraPageAt("/kora?host=abyss-laptop");
    // The redirect LANDED: the field headline is on stage, not the
    // invitation (a Navigate rides the layout effect — act flushes it).
    expect(fieldH2(container)).toBe("abyss-laptop");
    expect(
      [...container.querySelectorAll("section")].some(
        (el) => el.getAttribute("aria-label") === "Поле хоста",
      ),
    ).toBe(true);
    expect(container.textContent).not.toContain(
      "Выберите сессию — здесь откроется её ход",
    );
  });

  it("a session deep link carrying ?host= keeps its session semantics", () => {
    const { container } = mountKoraPageAt(
      "/kora/exec-zcode-main:sess_7f3a91?host=abyss-laptop",
    );
    // NOT the field: the session mode is on stage (the breadcrumb rides
    // above it; the redirect is only for the bare /kora path).
    expect(
      [...container.querySelectorAll("section")].some(
        (el) => el.getAttribute("aria-label") === "Поле хоста",
      ),
    ).toBe(false);
    expect(
      [...container.querySelectorAll("a")].some((el) =>
        el.textContent?.startsWith("←"),
      ),
    ).toBe(true);
  });

  it("/kora/host/:host is deep-linkable; ?agent= selects the chip", () => {
    const { container } = mountKoraPageAt(
      "/kora/host/abyss-laptop?agent=exec-vscode-lab",
    );
    expect(fieldH2(container)).toBe("abyss-laptop");
    const pressed = [
      ...container.querySelectorAll("button[aria-pressed='true']"),
    ];
    expect(
      pressed.some((el) => el.textContent?.includes("vscode@abyss-laptop")),
    ).toBe(true);
  });

  it("an unknown host deep link lands on the honest empty, not a fabrication", () => {
    const { container } = mountKoraPageAt("/kora/host/nowhere");
    expect(container.textContent).toContain("Такого хоста нет в реестре");
    expect(container.querySelector('a[href="/kora"]')).not.toBeNull();
  });
});
