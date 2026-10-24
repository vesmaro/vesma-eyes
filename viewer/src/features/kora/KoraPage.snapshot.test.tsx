import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { KoraPage } from "./KoraPage";
import { KoraMockAdapter } from "./KoraMockAdapter";
import { KoraGatewayContext } from "./koraGatewayContext";
import { koraKeys } from "./useKora";
import { KORA_FIXTURE_COVERAGE, KORA_FIXTURE_SESSIONS } from "./koraFixtures";
import type { KoraSession } from "./koraTypes";
import type { ExecutorsPage } from "@/gateway/boardTypes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider, type Lang } from "@/i18n";

/**
 * KW4 workspace snapshots (blueprint-kw4 §2/§3): pin the TWO-zone frame —
 * the header (H1 + derived summary; the retired select-filter is GONE —
 * the page context IS the route), the invitation scene, the right panel
 * «Дерево и мета» (the v2 tree — pin + search + hosts→agents, depth 2, NO
 * session leaves — then the KW3 meta blocks, ONE panel scroll) and the ONE
 * seam (--kora-right-w; the LEFT zone and its seam are retired, gate §9.1).
 * DOM-free renderToString per the project pattern (the SSR snapshot renders
 * the FRAME — the documented default, koraViewport); the paged registry +
 * the executors registry are prefilled so the data branches render
 * synchronously and byte-deterministically.
 *
 * The executor fixtures here MATCH the kora session executor ids (the mock
 * corpus drifts by design) so the tree tells the real story — hosts with
 * agents; the registry-miss grouping has its own unit tests
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
  // T004 slice 2: hermes rows enter the registry ONLY on a live pull — the
  // snapshot pins the pre-pull truth the adapter's listSessions serves.
  const prePull = KORA_FIXTURE_SESSIONS.filter(
    (session: KoraSession) => session.harness !== "hermes",
  );
  queryClient.setQueryData(koraKeys.sessionsPaged(PAGE_SIZE), {
    pages: [
      {
        ok: true as const,
        count: prePull.length,
        items: prePull,
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

describe("Kora workspace snapshots (KW4 «Поле хоста + правая панель»)", () => {
  it("pins the two-zone frame: header + invitation + «Дерево и мета» panel, ONE seam (ru)", async () => {
    const html = await renderKoraPage("ru");
    // The header: H1 with the name explanation in the tooltip, the DERIVED
    // summary numbers. The retired select-filter is GONE (blueprint-kw4 §2).
    // The badge is hidden — no inbox prefill ⇒ the counter is unknown.
    expect(html).toContain("Кора · сессии хостов");
    expect(html).toContain('title="Кора — журнал сессий всех хостов');
    expect(html).toContain("хостов: 2");
    expect(html).toContain("идёт сессий: 1");
    expect(html).toContain("за 24 ч: 2"); // 8940 s + 64920 s, the 47 h one is out
    expect(html).not.toContain("Входящие:");
    expect(html).not.toContain("Все хосты");
    // The KW4 panel landmark: the tree AND the meta share ONE aside.
    expect(html).toContain('aria-label="Дерево и мета"');
    // The v2 tree rides the panel: the pin FIRST (→ /kora/hermes), then the
    // search, then the hosts (depth 2 — NO session leaves in the tree).
    expect(html).toContain("Хосты и агенты");
    expect(html).toContain('href="/kora/hermes"');
    expect(html).toContain("Чат с кластером");
    expect(html).toContain('aria-label="Поиск по хостам и агентам"');
    expect(html).toContain("abyss-laptop");
    expect(html).toContain("pi-edge");
    expect(html).toContain('href="/kora/host/abyss-laptop"');
    // Gate §9.4: the tree has no leaf-session links (sessions live in the
    // field, grouped).
    expect(html).not.toContain('href="/kora/exec-zcode-main%3Asess_7f3a91"');
    // The LEFT zone is retired: no nav panel, no nav seam, no nav session
    // list, no nav quick filters (gate §9.1).
    expect(html).not.toContain('aria-label="Навигация"');
    expect(html).not.toContain("Сессии · все хосты");
    expect(html).not.toContain("Ширина панели навигации");
    // The scene invitation; the Эфир card lives in the meta panel.
    expect(html).toContain("Выберите сессию — здесь откроется её ход");
    // The meta defaults (states.md §5): О СЕССИИ collapsed with the honest
    // line, ЭФИР expanded (the ring's ONE mount; a silent bus = the honest
    // empty), ДАЙДЖЕСТ + ПОКРЫТИЕ folded.
    expect(html).toContain("О сессии");
    expect(html).toContain("Сессия не выбрана — свойства появятся здесь");
    expect(html).toContain("Дайджест");
    expect(html).not.toContain("Выберите сессию — её разбор появится здесь");
    expect(html).toContain("Эфир");
    expect(html).toContain("Событий пока нет");
    expect(html).toContain("Что мы видим с ваших машин");
    // The Пульт is dissolved: no strip, no expand button, no tabs.
    expect(html).not.toContain("Пульт");
    expect(html).not.toContain("Развернуть");
    expect(html).not.toContain('role="tab"');
    // The ONE seam (07l §3, KW4): the right panel width — an honest
    // separator with the full aria geometry. The LEFT seam is gone.
    expect(html).toContain('role="separator"');
    expect(html).toContain("Ширина мета-панели");
    // The mock-era furniture is gone: no demo chip, no chat panel.
    expect(html).not.toContain("Демо-данные");
    expect(html).not.toContain("PIN");
    // The panel's ONE scroll: the tree precedes the meta legend (П2).
    expect(html.indexOf("Чат с кластером")).toBeLessThan(
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
    expect(html).not.toContain("All hosts"); // the retired filter
    expect(html).toContain("Hosts and agents");
    expect(html).toContain("Chat with the cluster");
    expect(html).toContain('aria-label="Tree and meta"');
    expect(html).toContain('aria-label="Search hosts and agents"');
    expect(html).toContain("Ether");
    expect(html).not.toContain("Demo data");
    expect(html).toMatchSnapshot();
  });

  it("the v2 tree routes hosts and agents (depth 2) — the session deep link lives in the FIELD", async () => {
    const html = await renderKoraPage("ru");
    expect(html).toContain('href="/kora/host/abyss-laptop"');
    expect(html).toContain(
      'href="/kora/host/abyss-laptop?agent=exec-zcode-main"',
    );
    // Gate §9.4: no leaf-session links in the tree.
    expect(html).not.toContain('href="/kora/exec-zcode-main%3Asess_7f3a91"');
  });
});
