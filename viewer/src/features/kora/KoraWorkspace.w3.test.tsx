// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { KoraWorkspace } from "./KoraWorkspace";
import { KoraMockAdapter } from "./KoraMockAdapter";
import { KoraGatewayContext } from "./koraGatewayContext";
import { KORA_FRAME_QUERY } from "./koraViewport";
import { koraKeys } from "./useKora";
import {
  KORA_FIXTURE_COVERAGE,
  KORA_FIXTURE_MODELS,
  KORA_FIXTURE_SESSIONS,
} from "./koraFixtures";
import type { ExecutorsPage } from "@/gateway/boardTypes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The В3 wiring at the WORKSPACE level (kora-ide contract §2.3): a harness
 * click in the tree rides the ROUTE (/kora/host/:host?agent=<id>) and —
 * with ZERO queries beyond the already-loaded registries (acceptance (в),
 * §5.4: the dock and the context bar are pure derivations of the props
 * this component already owns) —
 * - the DOCK narrows to that harness's sessions and names the context;
 * - the CONTEXT BAR names the harness («хост · харнес · …»);
 * - the TREE opens the harness branch on arrival.
 * The hermes roster rides the EXISTING /status read; the mirror rides the
 * ONE В3a read (no polling, no second channel).
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

function mountWorkspace(
  initialEntry: string,
  /** The decoded :host route param (KoraPage's useParams hand-off). */
  host: string | null = null,
): {
  container: HTMLElement;
  root: Root;
} {
  stubWideFrame();
  // The TIMELINE dock view: the context assertions count ROWS — a flat
  // list, no folded group hides one from the DOM.
  localStorage.setItem("vesmaro.koraDockView", "timeline");
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
  queryClient.setQueryData(koraKeys.models(), KORA_FIXTURE_MODELS);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
        <KoraGatewayContext.Provider value={new KoraMockAdapter({ latency: false })}>
          <QueryClientProvider client={queryClient}>
            <I18nProvider initialLang="ru">
              <MemoryRouter initialEntries={[initialEntry]}>
                <KoraWorkspace host={host} />
              </MemoryRouter>
            </I18nProvider>
          </QueryClientProvider>
        </KoraGatewayContext.Provider>
      </GatewayContext.Provider>,
    );
  });
  return { container, root };
}

const dockRows = (container: HTMLElement): string[] => {
  const dock = [...container.querySelectorAll("[aria-label='Сессии']")][0];
  if (dock === undefined) throw new Error("dock not rendered");
  return [...dock.querySelectorAll("a[href^='/kora/']")]
    .map((el) => decodeURIComponent(el.getAttribute("href") ?? ""))
    .filter((href) => !href.startsWith("/kora/host/") && href !== "/kora/hermes");
};

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  sessionStorage.clear();
});

describe("KoraWorkspace В3 — the harness click's route context", () => {
  it("the tree's harness click (?agent=) narrows the dock to that harness and the context bar names host · harness", () => {
    const { container } = mountWorkspace(
      "/kora/host/abyss-laptop?agent=exec-zcode-main",
      "abyss-laptop",
    );
    expect(dockRows(container)).toEqual(["/kora/exec-zcode-main:sess_7f3a91"]);
    expect(container.textContent).toContain("Фильтр: zcode@abyss-laptop");
    // The context bar: host · harness · mode (no model/specialist facts
    // on this route — the absent slots stay absent).
    const bar = container.querySelector("p.truncate.font-mono.text-xs");
    expect(bar?.textContent).toBe("abyss-laptop · zcode · поле");
  });

  it("the host route without ?agent= filters the dock to the host, the bar names the host only", () => {
    const { container } = mountWorkspace("/kora/host/abyss-laptop", "abyss-laptop");
    expect(dockRows(container)).toEqual([
      "/kora/exec-zcode-main:sess_7f3a91",
      "/kora/exec-vscode-lab:a83f1c22",
    ]);
    const bar = container.querySelector("p.truncate.font-mono.text-xs");
    expect(bar?.textContent).toBe("abyss-laptop · поле");
  });

  it("off the field route the dock shows the full slice — a session mode carries no host context", () => {
    const { container } = mountWorkspace("/kora");
    expect(dockRows(container).length).toBe(5);
    expect(container.textContent).not.toContain("Фильтр:");
  });
});
