import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { KoraPage } from "./KoraPage";
import { KoraMockAdapter } from "./KoraMockAdapter";
import { KoraGatewayContext } from "./koraGatewayContext";
import { koraKeys } from "./useKora";
import { KORA_FIXTURE_COVERAGE, KORA_FIXTURE_SESSIONS } from "./koraFixtures";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider, type Lang } from "@/i18n";

/**
 * Slice-2 UI snapshots (ADR 0019 rev.2): pin the «Кора» list screen —
 * slice-2 demo plate, coverage panel «что вижу / чего нет» (zcode full:
 * lists + read-only transcripts), onboarding card (3 cases) and the
 * session rows. The list reads through the P4-7 paged hook — the
 * infinite-query cache is prefilled from the fixtures so the data branch
 * renders synchronously and byte-deterministically (DOM-free
 * renderToString per the project pattern). Three fixtures < one page of
 * 50 ⇒ the «Показать ещё» button is honestly absent here.
 */

const PAGE_SIZE = 50;

async function renderKoraPage(lang: Lang, path = "/kora"): Promise<string> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Infinite-query prefill: ONE short page (count < pageSize ⇒ no
  // further pages) renders the whole fixture registry synchronously.
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
  // The §9.3 branching reads the executor registry — prefill it so the
  // synchronous data branch stays byte-deterministic (the MockAdapter's
  // REAL registry page, one seed for every render below).
  await queryClient.prefetchQuery({
    queryKey: keys.agents.executors.list(),
    queryFn: async () => new MockAdapter({ latency: false }).listExecutors(),
  });
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

describe("Kora slice-2 list screen snapshots", () => {
  it("pins the Russian screen (session list first, meta folded + rows)", async () => {
    const html = await renderKoraPage("ru");
    // UX-overhaul §5 (Ф1, П2/П4): the registry is the FIRST screen, the
    // demo chip says «Демо-данные» (no internal slices), the meta block
    // (coverage/onboarding) folds below the data, the rows promise their
    // action («Открыть →»).
    expect(html).toContain("Демо-данные");
    expect(html).not.toContain("Кора · срез 2");
    expect(html).not.toContain("контракт-мок");
    expect(html).toContain("Демо-данные");
    expect(html).toContain("Сессии"); // the list title leads
    // П2: the LIST comes BEFORE the folded meta block in the DOM.
    expect(html.indexOf("Демо-данные")).toBeLessThan(
      html.indexOf("Что такое Кора и чего в ней пока нет"),
    );
    expect(html.indexOf('href="/kora/exec')).toBeLessThan(
      html.indexOf("Что такое Кора и чего в ней пока нет"),
    );
    expect(html).toContain("Что такое Кора и чего в ней пока нет"); // folded meta
    expect(html).toContain("Открыть"); // the row affordance
    expect(html).toMatchSnapshot();
  });

  it("pins the English screen", async () => {
    const html = await renderKoraPage("en");
    expect(html).toContain("Demo data");
    expect(html).not.toContain("Kora · slice 2");
    expect(html).toMatchSnapshot();
  });

  it("marks the relay row steerable and the local rows read-only", async () => {
    const html = await renderKoraPage("ru");
    expect(html).toContain("можно рулить"); // relay-origin row badge
    expect(html).toContain("реле");
    expect(html).toContain("локальная");
    expect(html).toContain("процесс мёртв"); // dead pi row, honest state
  });

  it("links each row into the transcript mock route", async () => {
    const html = await renderKoraPage("ru");
    expect(html).toContain('href="/kora/exec-zcode-main%3Asess_7f3a91"');
  });

  it("shows the full-page load-more button only when a page is full", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // A FULL page (count === pageSize) ⇒ «Показать ещё» must render.
    queryClient.setQueryData(koraKeys.sessionsPaged(PAGE_SIZE), {
      pages: [
        {
          ok: true as const,
          count: PAGE_SIZE,
          items: Array.from({ length: PAGE_SIZE }, (_, i) => ({
            ...KORA_FIXTURE_SESSIONS[0],
            id: `exec-x:sess_${i}`,
            native_id: `sess_${i}`,
          })),
          coverage: KORA_FIXTURE_COVERAGE,
          meta: { generated_at: "2026-09-24T11:45:00Z" },
        },
      ],
      pageParams: [0],
    });
    await queryClient.prefetchQuery({
      queryKey: keys.agents.executors.list(),
      queryFn: () => Promise.resolve(new MockAdapter({ latency: false }).listExecutors()),
    });
    const html = renderToString(
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
    expect(html).toContain("Показать ещё");
  });
});
