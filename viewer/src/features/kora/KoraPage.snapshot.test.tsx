import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { KoraPage } from "./KoraPage";
import { KoraMockAdapter } from "./KoraMockAdapter";
import { KoraGatewayContext } from "./koraGatewayContext";
import { koraKeys } from "./useKora";
import { KORA_FIXTURE_COVERAGE, KORA_FIXTURE_SESSIONS } from "./koraFixtures";
import type { ExecutorsPage } from "@/gateway/boardTypes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider, type Lang } from "@/i18n";

/**
 * Union И1 workspace snapshots (i1-dressing-map §1.2): pin the v7
 * composition — the header (H1 + derived summary + the ONE host filter),
 * the work zone invitation, the Блок 1 tree (host → agent → sessions over
 * the real registries), Блок 2 with state pills, the coverage legend and
 * the COLLAPSED Пульт strip with its honest tab labels. DOM-free
 * renderToString per the project pattern; the paged registry + the
 * executors registry are prefilled so the data branches render
 * synchronously and byte-deterministically.
 *
 * The executor fixtures here MATCH the kora session executor ids (the mock
 * corpus drifts by design) so the tree tells the real story — hosts with
 * agents and sessions; the registry-miss grouping has its own unit tests
 * (koraWorkspaceModel.test.ts).
 */

const PAGE_SIZE = 50;

/** Executors that own the kora fixture sessions: two hosts, three agents. */
function koraExecutorsPage(): ExecutorsPage {
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
  return {
    ok: true,
    count: 3,
    items: [
      row("exec-zcode-main", "zcode@abyss-laptop", "zcode", "abyss-laptop"),
      row("exec-vscode-lab", "vscode@abyss-laptop", "vscode", "abyss-laptop"),
      row("exec-pi-edge", "pi@pi-edge", "pi", "pi-edge"),
    ],
    meta: {
      presence: { online_max_age_s: 120, stale_max_age_s: 600 },
      sweeper_interval_s: 60,
    },
  };
}

function seedWorkspaceCache(queryClient: QueryClient): void {
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
  queryClient.setQueryData(keys.agents.executors.list(), koraExecutorsPage());
}

async function renderKoraPage(lang: Lang, path = "/kora"): Promise<string> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  seedWorkspaceCache(queryClient);
  return renderToString(
    <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
      <KoraGatewayContext.Provider value={new KoraMockAdapter({ latency: false })}>
        <QueryClientProvider client={queryClient}>
          <I18nProvider initialLang={lang}>
            <MemoryRouter initialEntries={[path]}>
              <KoraPage />
            </MemoryRouter>
          </I18nProvider>
        </QueryClientProvider>
      </KoraGatewayContext.Provider>
    </GatewayContext.Provider>,
  );
}

describe("Kora workspace snapshots (union И1)", () => {
  it("pins the frame: header + summary + tree + Блок 2 + collapsed Пульт (ru)", async () => {
    const html = await renderKoraPage("ru");
    // The header: H1 with the name explanation in the tooltip, the
    // DERIVED summary numbers, the one host filter.
    expect(html).toContain("Кора · сессии хостов");
    expect(html).toContain('title="Кора — журнал сессий всех хостов');
    expect(html).toContain("хостов: 2");
    expect(html).toContain("идёт сессий: 1");
    expect(html).toContain("за 24 ч: 2"); // 8940 s + 64920 s, the 47 h one is out
    expect(html).toContain("Все хосты");
    // The tree: hosts from the executors registry, agents, live-first.
    expect(html).toContain("Хосты и агенты");
    expect(html).toContain("abyss-laptop");
    expect(html).toContain("pi-edge");
    // Блок 2 in the «все» context with state pills (dot + text, never
    // colour alone) and the steerable relay badge.
    expect(html).toContain("Сессии · все хосты");
    expect(html).toContain("идущие");
    expect(html).toContain("за 24 ч"); // the quick filter chip
    expect(html).toContain("можно рулить");
    expect(html).toContain("реле");
    expect(html).toContain("процесс мёртв"); // the dead pi row, honest state
    // The coverage legend, folded at the bottom of the panel.
    expect(html).toContain("Что мы видим с ваших машин");
    // The work zone invitation (no Эфир — no source in И1).
    expect(html).toContain("Выберите сессию — здесь откроется её ход");
    // The Пульт strip: collapsed by default, honest tab labels, the hint.
    expect(html).toContain("Пульт");
    expect(html).toContain("Дайджест");
    expect(html).toContain("Эфир");
    expect(html).toContain("Выберите сессию — её разбор появится здесь");
    expect(html).toContain("Развернуть");
    // Collapsed ⇒ no tab content leaked into the strip.
    expect(html).not.toContain("Разбор сессии собирается автоматически");
    // The mock-era furniture is gone: no demo chip, no chat panel.
    expect(html).not.toContain("Демо-данные");
    expect(html).not.toContain("Чат");
    expect(html).not.toContain("PIN");
    // Data before the folded legend (П2).
    expect(html.indexOf("Сессии · все хосты")).toBeLessThan(
      html.indexOf("Что мы видим с ваших машин"),
    );
    expect(html).toMatchSnapshot();
  });

  it("pins the English frame", async () => {
    const html = await renderKoraPage("en");
    expect(html).toContain("Kora · host sessions");
    expect(html).toContain("hosts: 2");
    expect(html).toContain("running sessions: 1");
    expect(html).toContain("in 24h: 2");
    expect(html).toContain("Hosts and agents");
    expect(html).toContain("Sessions · all hosts");
    expect(html).toContain("Console");
    expect(html).not.toContain("Demo data");
    expect(html).toMatchSnapshot();
  });

  it("links the tree leaves and Блок 2 rows into the session route", async () => {
    const html = await renderKoraPage("ru");
    expect(html).toContain('href="/kora/exec-zcode-main%3Asess_7f3a91"');
  });
});
