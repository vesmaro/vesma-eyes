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
 * Kora IDE В1 workspace snapshots (kora-ide contract §2): pin the
 * THREE-zone frame — the header (H1 + derived summary), the LEFT dock
 * «Сессии» (the pin + the view switcher + the session deep links — K-INV-2),
 * the invitation scene with the context bar in the center, the right panel
 * «Дерево и мета» (the v2 tree — search + hosts→agents, depth 2, NO session
 * leaves — then the KW3 meta blocks, ONE panel scroll) and the TWO seams
 * (--kora-dock-w + --kora-right-w; the dead koraLeftW stays unread).
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

describe("Kora workspace snapshots (Kora IDE В1 «док + чат + правая панель»)", () => {
  it("pins the three-zone frame: header + dock + invitation + «Дерево и мета» panel, TWO seams (ru)", async () => {
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
    // The В1 DOCK landmark: the sessions dock is the frame's first column.
    expect(html).toContain('aria-label="Сессии"');
    // The dock owns the pin now (contract §2.1): the FIRST dock row leads
    // to the reserved /kora/hermes.
    expect(html).toContain('href="/kora/hermes"');
    expect(html).toContain("Чат с кластером");
    // The dock's view switcher (По работе / По хосту / Таймлайн).
    expect(html).toContain("По работе");
    expect(html).toContain("По хосту");
    expect(html).toContain("Таймлайн");
    expect(html).toContain('aria-label="Поиск по сессиям"');
    // The dock rows CARRY the session deep links (K-INV-2) — the tree does
    // not (its own no-leaves pin lives in KoraTree.test.tsx).
    expect(html).toContain('href="/kora/exec-zcode-main%3Asess_7f3a91"');
    // The KW4 panel landmark: the tree AND the meta share ONE aside.
    expect(html).toContain('aria-label="Дерево и мета"');
    // The v2 tree rides the panel: the search, then the hosts (depth 2 —
    // NO session leaves in the tree; the pin moved to the dock).
    expect(html).toContain("Хосты и агенты");
    expect(html).toContain('aria-label="Поиск по хостам и агентам"');
    expect(html).toContain("abyss-laptop");
    expect(html).toContain("pi-edge");
    expect(html).toContain('href="/kora/host/abyss-laptop"');
    // The dock's honest empties don't fire on a populated registry; the
    // invitation scene carries the center's context bar («без сессии»).
    expect(html).toContain("без сессии");
    // The LEFT zone is retired under its KW1 name: no «Навигация» region,
    // no nav seam label, no KW4 field title over the dock.
    expect(html).not.toContain('aria-label="Навигация"');
    expect(html).not.toContain("Ширина панели навигации");
    expect(html).not.toContain("--kora-left-w");
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
    // The TWO seams (07l §3; kora-ide contract §2): the dock's and the
    // panel's — honest separators with the full aria geometry. The dead
    // nav seam label is gone.
    expect(html.match(/role="separator"/g)?.length).toBe(2);
    expect(html).toContain("Ширина панели сессий");
    expect(html).toContain("Ширина мета-панели");
    // The mock-era furniture is gone: no demo chip, no chat panel.
    expect(html).not.toContain("Демо-данные");
    expect(html).not.toContain("PIN");
    // The dock precedes the panel's meta legend (the pin-first dock).
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
    expect(html).toContain('aria-label="Sessions"');
    expect(html).toContain("Chat with the cluster");
    expect(html).toContain("By work");
    expect(html).toContain("Timeline");
    expect(html).toContain('aria-label="Tree and meta"');
    expect(html).toContain('aria-label="Search hosts and agents"');
    expect(html).toContain("Ether");
    expect(html).not.toContain("Demo data");
    expect(html).toMatchSnapshot();
  });

  it("the v2 tree routes hosts (depth 2) — the session deep links live in the DOCK", async () => {
    const html = await renderKoraPage("ru");
    expect(html).toContain('href="/kora/host/abyss-laptop"');
    expect(html).toContain('href="/kora/host/pi-edge"');
    // The agent ?agent= rows render EXPANDED only (the open-set seeds in a
    // client effect — SSR renders the collapsed frame); the interaction pin
    // lives in KoraTree.test.tsx («agent leaves carry ?agent=»).
    expect(html).not.toContain("?agent=");
    // Gate §9.4 narrowed, В1: the session deep links ride the DOCK rows
    // (the frozen /kora/:sessionId grammar), never the tree.
    expect(html).toContain('href="/kora/exec-zcode-main%3Asess_7f3a91"');
  });
});
