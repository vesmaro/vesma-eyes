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
import type { KoraSession } from "./koraTypes";
import type { ExecutorsPage } from "@/gateway/boardTypes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The KW4 host FIELD at the WORKSPACE level (gate §9.8 + states-kw4 §4):
 * on /kora/host/:host the center is the journal field — NO composer, NO
 * chat (Кора = журнал; operations live on /agents/hosts), while the frozen
 * session modes KEEP theirs, with the states-kw4 breadcrumb above the head:
 * «← <хост> · поле» (a registry-miss host reads «← Кора» — no invented
 * name). The session mode itself is byte-for-byte canon — only the breadcrumb
 * strip rides ABOVE KoraWorkzone (blueprint-kw4 §5).
 */

const PAGE_SIZE = 50;

const GHOST_SESSION: KoraSession = {
  id: "exec-ghost:s1",
  executor_id: "exec-ghost",
  native_id: "s1",
  harness: "zcode",
  project: null,
  cwd: null,
  state: "idle",
  origin: "local",
  steerable: false,
  started_at: null,
  last_activity_at: null,
  age_seconds: 600,
  last_line_preview: null,
};

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

function mountWorkspaceAt(
  path: string,
  options: { sessions?: readonly KoraSession[] } = {},
): { container: HTMLElement; root: Root } {
  stubWideFrame();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const items = options.sessions ?? KORA_FIXTURE_SESSIONS;
  queryClient.setQueryData(koraKeys.sessionsPaged(PAGE_SIZE), {
    pages: [
      {
        ok: true as const,
        count: items.length,
        items,
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
  // The transcript leg stays pending on purpose: the breadcrumb is
  // registry-derived and renders above the (skeleton) work zone.
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
                {/* The REAL route grammar (routes.tsx): the params KoraPage
                 * reads (host/sessionId) come from the matched patterns. */}
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

describe("KoraWorkspace host field (gate §9.8, states-kw4 §4)", () => {
  it("§9.8: on /kora/host/:host the center is the FIELD — no composer, no chat anywhere", () => {
    const { container } = mountWorkspaceAt("/kora/host/abyss-laptop");
    // The field region is on stage with its honest headline.
    expect(
      [...container.querySelectorAll("section")].some(
        (el) => el.getAttribute("aria-label") === "Поле хоста",
      ),
    ).toBe(true);
    expect(container.querySelector("h2")?.textContent).toBe("abyss-laptop");
    // THE GUARD: a journal — no write surface, no chat furniture (the
    // composer's sr-only label, the reading tools, the moves zone's chat).
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).not.toContain("Написать агенту");
    expect(container.textContent).not.toContain("Следить за хвостом");
    expect(container.querySelectorAll("[role='textbox']")).toHaveLength(0);
    // …and the session rows deep-link the frozen /kora/:sessionId.
    expect(
      container.querySelector('a[href="/kora/exec-zcode-main%3Asess_7f3a91"]'),
    ).not.toBeNull();
  });

  it("states-kw4 §4: the session breadcrumb reads «← <хост> · поле» and links the field route", () => {
    const { container } = mountWorkspaceAt(
      "/kora/exec-zcode-main:sess_7f3a91",
    );
    // The tree's host row shares the href — the breadcrumb is the «←» one.
    const crumb = [...container.querySelectorAll<HTMLAnchorElement>("a")].find(
      (el) =>
        el.getAttribute("href") === "/kora/host/abyss-laptop" &&
        el.textContent?.startsWith("←"),
    );
    expect(crumb?.textContent).toBe("← abyss-laptop · поле");
  });

  it("states-kw4 §4: an unknown host reads «← Кора» — no invented name", () => {
    const { container } = mountWorkspaceAt("/kora/exec-ghost:s1", {
      sessions: [...KORA_FIXTURE_SESSIONS, GHOST_SESSION],
    });
    const crumb = container.querySelector<HTMLAnchorElement>('a[href="/kora"]');
    expect(crumb?.textContent).toBe("← Кора");
    // The ONLY breadcrumb-shaped link is «← Кора» — no host name invented.
    const crumbs = [...container.querySelectorAll<HTMLAnchorElement>("a")].filter(
      (el) => el.textContent?.startsWith("←"),
    );
    expect(crumbs).toHaveLength(1);
  });
});
