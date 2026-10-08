import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { KoraSessionPage } from "./KoraSessionPage";
import { KoraMockAdapter } from "./KoraMockAdapter";
import { KoraGatewayContext } from "./koraGatewayContext";
import { koraKeys } from "./useKora";
import {
  KORA_FIXTURE_COVERAGE,
  KORA_FIXTURE_SESSIONS,
  KORA_FIXTURE_TRANSCRIPT,
} from "./koraFixtures";
import type { ExecutorsPage } from "@/gateway/boardTypes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider, type Lang } from "@/i18n";

/**
 * Union И1 session screen snapshots: the SAME workspace frame with the
 * session selected — the transcript scroll canon (Lora measure, mono tnum
 * times, the redaction mark) in the center, the composer (07j §4.6 honest
 * cut: the field is real, the send is disabled with a VISIBLE reason) and
 * NO relay-era furniture (the mock chat panel with its PIN step-up and
 * delivery lines is retired; «в очереди»/«доставлено» are forbidden —
 * 07a §1 no fake delivery).
 */

const PAGE_SIZE = 50;
const RELAY = "exec-zcode-main:sess_7f3a91"; // live, steerable, full coverage
const DEAD = "exec-pi-edge:pi-2209-04"; // dead process, empty transcript

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

function renderKoraSessionPage(sessionId: string, lang: Lang = "ru"): string {
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
  queryClient.setQueryData(keys.agents.executors.list(), koraExecutorsPage());
  const transcript = KORA_FIXTURE_TRANSCRIPT[sessionId] ?? [];
  queryClient.setQueryData(koraKeys.transcriptPaged(sessionId, PAGE_SIZE), {
    pages: [
      {
        session_id: sessionId,
        items: transcript,
        next_after_seq: transcript.at(-1)?.seq ?? 0,
        has_more: false,
      },
    ],
    pageParams: [0],
  });
  return renderToString(
    <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
      <KoraGatewayContext.Provider value={new KoraMockAdapter({ latency: false })}>
        <QueryClientProvider client={queryClient}>
          <I18nProvider initialLang={lang}>
            {/* useParams needs the real route pattern, not just the entry. */}
            <MemoryRouter initialEntries={[`/kora/${encodeURIComponent(sessionId)}`]}>
              <Routes>
                <Route path="/kora/:sessionId" element={<KoraSessionPage />} />
              </Routes>
            </MemoryRouter>
          </I18nProvider>
        </QueryClientProvider>
      </KoraGatewayContext.Provider>
    </GatewayContext.Provider>,
  );
}

describe("Kora session screen snapshots (union И1)", () => {
  it("pins the live session: transcript canon + the honest composer", () => {
    const html = renderKoraSessionPage(RELAY);
    // The session header: the registry name (project), the live pill with
    // the derived age, the coverage wording (07j §3.5).
    expect(html).toContain("mnemos-mesh");
    expect(html).toContain("идёт · 2 ч"); // age_seconds 8940 → 2 h
    expect(html).toContain("Покрытие этой сессии");
    expect(html).toContain("полный ход"); // zcode → full
    // Reading tools in the work zone toolbar.
    expect(html).toContain("Следить за хвостом");
    expect(html).toContain("Найти в сессии…");
    // The transcript: mono tnum times, the redaction mark on the masked
    // entry (UTC HH:MM — the formatTimestamp discipline).
    expect(html).toContain("09:12");
    expect(html).toContain("маскировано");
    expect(html).toContain("11:41");
    // The composer: sr-only label + placeholder + the VISIBLE deferred-send
    // service line; the send button itself is absent for an EMPTY draft.
    expect(html).toContain("Написать агенту в эту сессию");
    expect(html).toContain('placeholder="Написать агенту…"');
    expect(html).toContain(
      "Отправка сообщений агенту появится позже — пока Кора показывает ход сессий. Черновик сохраняется на этой машине и переживёт перезагрузку страницы.",
    );
    expect(html).not.toMatch(/>Отправить</);
    // FORBIDDEN (07a §1): no fake delivery chips, no fake relay statuses.
    expect(html).not.toContain("в очереди");
    expect(html).not.toContain("доставлено");
    expect(html).not.toContain("Доставлено");
    // The retired mock-era chat panel is gone.
    expect(html).not.toContain("Чат");
    expect(html).not.toContain("PIN");
    expect(html).not.toContain("рулени");
    expect(html).toMatchSnapshot();
  });

  it("pins the dead session: the field itself is disabled with the interrupted note", () => {
    const html = renderKoraSessionPage(DEAD);
    expect(html).toContain("Сессия прервана — агент здесь уже не слушает");
    // The dead field: disabled with the note as its description.
    expect(html).toMatch(/<textarea[^>]*disabled/);
    expect(html).toContain('aria-describedby="kora-composer-note"');
    // No deferred-send chip on a dead session (there is no one to write to).
    expect(html).not.toContain("Отправка появится позже");
    expect(html).not.toMatch(/>Отправить</);
    // The empty transcript keeps its honest message.
    expect(html).toContain("Сессия в реестре, но записей в сторе нет");
    expect(html).toMatchSnapshot();
  });

  it("pins the English session screen", () => {
    const html = renderKoraSessionPage(RELAY, "en");
    expect(html).toContain("running · 2 h");
    expect(html).toContain("full run");
    expect(html).toContain("Write to the agent…");
    expect(html).toContain(
      "Sending messages to the agent will arrive later — for now Kora shows how sessions run. The draft is kept on this machine and survives a page reload.",
    );
    expect(html).toMatchSnapshot();
  });

  it("shows the honest not-found state for an unknown session", () => {
    const html = renderKoraSessionPage("nope:unknown");
    expect(html).toContain("Сессия не найдена");
    expect(html).toContain("Сессии «nope:unknown» нет в реестре Коры.");
  });
});
