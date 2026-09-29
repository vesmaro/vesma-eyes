// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { KoraPage } from "./KoraPage";
import { KoraMockAdapter } from "./KoraMockAdapter";
import { KoraGatewayContext } from "./koraGatewayContext";
import { koraKeys } from "./useKora";
import type { ExecutorsPage } from "@/gateway/boardTypes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { actUnmount } from "@/test/actTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The honest EMPTY state of `/kora` (UX-overhaul §5/§9.3, Ф1): the branch is
 * driven by the executor registry — the OLD copy («подключите исполнителя —
 * сессии появятся сами») lied when executors existed but the host scanner
 * had simply never run.
 *
 * Variant A (0 executors): «Подключите агента» + the connect CTA.
 * Variant B (executors exist, no sessions): the line names the actual wait
 * («сканер хостов») + a status link — and NEVER promises that sessions
 * «appear on their own».
 */

const mountedRoots: Root[] = [];

async function mountEmptyKora(
  executorsPage: ExecutorsPage,
): Promise<{ root: Root; container: HTMLElement }> {
  // staleTime: Infinity — the seeded EMPTY registry must stay authoritative:
  // with the default staleTime a mount refetch would race the assertions
  // and could land the mock adapter's fixture sessions mid-test (the
  // workspace mounts more resolving queries — the Пульт inbox — than the
  // old page did, which re-orders the act drain).
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  // The EMPTY session list — the paged hook's first (only) page.
  queryClient.setQueryData(koraKeys.sessionsPaged(50), {
    pages: [
      {
        ok: true as const,
        count: 0,
        items: [],
        coverage: { harnesses: [], gaps: [] },
        meta: { generated_at: "2026-09-27T10:00:00Z" },
      },
    ],
    pageParams: [0],
  });
  // The executor registry read the §9.3 branch depends on (no new API —
  // the existing /api/executors page, seeded straight into the cache).
  queryClient.setQueryData(keys.agents.executors.list(), executorsPage);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
        <KoraGatewayContext.Provider value={new KoraMockAdapter({ latency: false })}>
          <QueryClientProvider client={queryClient}>
            <I18nProvider initialLang="ru">
              <MemoryRouter initialEntries={["/kora"]}>
                <KoraPage />
              </MemoryRouter>
            </I18nProvider>
          </QueryClientProvider>
        </KoraGatewayContext.Provider>
      </GatewayContext.Provider>,
    );
  });
  return { root, container };
}

function executorsPage(count: number): ExecutorsPage {
  return {
    ok: true,
    count,
    items: Array.from({ length: count }, (_, i) => ({
      id: `exec-${i}`,
      name: `agent-${i}`,
      harness: "zcode",
      host: "laptop",
      transport: "local-poll" as const,
      capabilities: [],
      version: "1.0.0",
      enabled: true,
      state: "approved" as const,
      last_seen: "2026-09-27T10:00:00Z",
      presence: "online" as const,
      registered_via: "",
      registered_at: "2026-09-27T09:00:00Z",
      updated_at: "2026-09-27T10:00:00Z",
    })),
    meta: {
      presence: { online_max_age_s: 120, stale_max_age_s: 600 },
      sweeper_interval_s: 60,
    },
  };
}

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop()!;
    await actUnmount(root);
  }
  document.body.innerHTML = "";
});

describe("kora honest empty (UX-overhaul §9.3)", () => {
  it("variant A — zero executors: the connect CTA, never a scanner promise", async () => {
    const { root, container } = await mountEmptyKora(executorsPage(0));
    const html = container.textContent ?? "";
    expect(html).toContain("Подключите агента — его сессии появятся здесь");
    expect(html).toContain("Подключить агента");
    expect(container.querySelector('a[href="/agents/harnesses"]')).not.toBeNull();
    // The OLD lying copy is gone — no «появятся сами» anywhere.
    expect(html).not.toContain("появятся сами");
    await actUnmount(root);
  });

  it("variant B — executors exist, no sessions: the line names the scanner + links to status", async () => {
    const { root, container } = await mountEmptyKora(executorsPage(2));
    const html = container.textContent ?? "";
    expect(html).toContain("Сессии появятся, когда сканер хостов начнёт работу");
    expect(container.querySelector('a[href="/system/status"]')).not.toBeNull();
    // No false «connect an executor» call — the registry is NOT empty.
    expect(html).not.toContain("Подключите агента — его сессии появятся здесь");
    expect(html).not.toContain("появятся сами");
    await actUnmount(root);
  });

  it("both variants keep data before the folded legend (data first, П2)", async () => {
    for (const count of [0, 2]) {
      const { root, container } = await mountEmptyKora(executorsPage(count));
      const html = container.innerHTML;
      expect(html.indexOf("Сессии")).toBeGreaterThanOrEqual(0);
      // The honest empty line (work zone + Блок 2) precedes the folded
      // coverage legend at the bottom of the panel (union И1 composition).
      expect(html.indexOf("Здесь откроется её ход")).toBeLessThan(
        html.indexOf("Что мы видим с ваших машин"),
      );
      await actUnmount(root);
    }
  });
});
