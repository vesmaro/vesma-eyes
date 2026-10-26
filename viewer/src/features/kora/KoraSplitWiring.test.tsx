// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { matchRoutes } from "react-router";

import { KoraWorkspace } from "./KoraWorkspace";
import { KoraMockAdapter } from "./KoraMockAdapter";
import { KoraGatewayContext } from "./koraGatewayContext";
import { koraKeys } from "./useKora";
import {
  KORA_FIXTURE_COVERAGE,
  KORA_FIXTURE_SESSIONS,
} from "./koraFixtures";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { I18nProvider } from "@/i18n";
import { buildRoutes } from "@/app/routes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The KW2 wiring gates (kora-rethink blueprint §6/§8, §10.6 + §10.8):
 *
 * - /kora/hermes RESOLVES as the reserved static segment — it never falls
 *   into /kora/:sessionId (matchRoutes against the REAL buildRoutes()
 *   table; a registry id is executor:native and cannot be the bare
 *   "hermes"), and the id-shaped deep link still rides the dynamic route;
 * - ONE messages read per session: the workspace hoists the hermes cursor,
 *   the chat AND the «Все ходы» zone consume the same pages — a pagination
 *   click is EXACTLY ONE network request (the adapter counts).
 */

function matchAt(path: string): string | undefined {
  const matches = matchRoutes(buildRoutes(), path);
  const leaf = matches?.[matches.length - 1];
  return leaf?.route.path;
}

describe("the reserved /kora/hermes segment (blueprint §5)", () => {
  it("resolves as the static segment, ahead of the dynamic session route", () => {
    expect(matchAt("/kora/hermes")).toBe("/kora/hermes");
  });

  it("keeps the executor:native deep links on the dynamic session route", () => {
    expect(matchAt("/kora/hermes:api-server-main")).toBe("/kora/:sessionId");
    expect(matchAt("/kora/exec-zcode-main:sess_7f3a91")).toBe("/kora/:sessionId");
  });
});

interface MountOptions {
  cluster?: boolean;
  sessionId?: string;
}

function mountSplit(
  adapter: KoraMockAdapter,
  options: MountOptions = {},
): { container: HTMLElement; root: Root } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(koraKeys.sessionsPaged(50), {
    pages: [
      {
        ok: true as const,
        count: KORA_FIXTURE_SESSIONS.length,
        items: [...KORA_FIXTURE_SESSIONS],
        coverage: KORA_FIXTURE_COVERAGE,
        meta: { generated_at: "2026-09-24T11:45:00Z" },
      },
    ],
    pageParams: [0],
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
        <KoraGatewayContext.Provider value={adapter}>
          <QueryClientProvider client={queryClient}>
            <I18nProvider initialLang="ru">
              <MemoryRouter
                initialEntries={[
                  options.cluster
                    ? "/kora/hermes"
                    : `/kora/${encodeURIComponent(options.sessionId ?? "hermes:api-server-main")}`,
                ]}
              >
                {options.cluster ? (
                  <KoraWorkspace cluster />
                ) : (
                  <KoraWorkspace sessionId={options.sessionId ?? "hermes:api-server-main"} />
                )}
              </MemoryRouter>
            </I18nProvider>
          </QueryClientProvider>
        </KoraGatewayContext.Provider>
      </GatewayContext.Provider>,
    );
  });
  return { container, root };
}

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Poll (bounded, real timers) until the predicate holds — the query beats
 * ride macrotasks, a microtask-only flush is a race (the suite canon). */
async function waitFor(
  predicate: () => boolean,
  label: string,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return;
    if (Date.now() > deadline) throw new Error(`waitFor timeout: ${label}`);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

afterEach(async () => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("ONE messages read per session (blueprint §6, gate §10.6)", () => {
  it("the hermes session split mounts ONE cursor; a zone load-more is EXACTLY one request", async () => {
    const adapter = new KoraMockAdapter({ latency: false });
    // The honest board: hermes rows enter the registry on a pull — model
    // the pulled state BEFORE the mount so the deep-linked session
    // resolves (the adapter's listSessions serves hermes rows post-pull).
    await adapter.pullHermesSessions();
    const { container } = mountSplit(adapter, {
      sessionId: "hermes:api-server-main",
    });
    await waitFor(
      () => adapter.hermesMessagesCallsBySession["hermes:api-server-main"] === 1,
      "the single hoisted messages read",
    );
    await settle();
    // The chat filters user/assistant out of the SAME pages — the fixture's
    // dialog rows ride the chat while the raw rows stay in the zone.
    expect(container.textContent).toContain("Чат с hermes");
    // Deploy the zone and page once: exactly ONE new request, both
    // surfaces updated from the one cursor.
    const strip = container.querySelector<HTMLButtonElement>(
      'button[aria-controls="kora-moves-body"]',
    );
    await act(async () => {
      strip?.click();
      await Promise.resolve();
    });
    const zone = container.querySelector("#kora-moves-body");
    if (zone === null) throw new Error("moves body not rendered");
    await waitFor(
      () => zone.textContent?.includes("Показать ещё") ?? false,
      "the zone's load-more invite",
    );
    const loadMore = [...zone.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Показать ещё"),
    );
    await act(async () => {
      loadMore?.click();
      await Promise.resolve();
    });
    await waitFor(
      () => adapter.hermesMessagesCallsBySession["hermes:api-server-main"] === 2,
      "exactly one pagination request",
    );
    await settle();
    expect(adapter.hermesMessagesCallsBySession["hermes:api-server-main"]).toBe(2);
  });

  it("the cluster route: the anchor resolves from the pulled registry and reads ONCE", async () => {
    const adapter = new KoraMockAdapter({ latency: false });
    const { container } = mountSplit(adapter, { cluster: true });
    await settle();
    // KW4: the hermes context IS the cluster route — the ONE refresh button
    // rides the right panel directly (the retired header select is gone,
    // blueprint-kw4 §2). The pull fills the registry (the honest pre-pull
    // board has no anchor);
    // the anchor then resolves and its messages read EXACTLY once — the
    // chat and the zone consume the same pages.
    const refresh = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Обновить"),
    );
    expect(refresh).toBeDefined();
    await act(async () => {
      refresh?.click();
      await Promise.resolve();
    });
    await waitFor(
      () =>
        container.textContent?.includes(
          "продолжение сессии hermes:api-server-main",
        ) ?? false,
      "the cluster anchor line",
    );
    await settle();
    expect(
      adapter.hermesMessagesCallsBySession["hermes:api-server-main"],
    ).toBe(1);
  });
});
