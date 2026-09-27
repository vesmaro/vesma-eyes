import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { KoraPage } from "./KoraPage";
import { KoraMockAdapter } from "./KoraMockAdapter";
import { KoraGatewayContext } from "./koraGatewayContext";
import { koraKeys } from "./useKora";
import { KORA_FIXTURE_COVERAGE, KORA_FIXTURE_SESSIONS } from "./koraFixtures";
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

function renderKoraPage(lang: Lang, path = "/kora"): string {
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
  return renderToString(
    <KoraGatewayContext.Provider value={new KoraMockAdapter({ latency: false })}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider initialLang={lang}>
          <MemoryRouter initialEntries={[path]}>
            <KoraPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </KoraGatewayContext.Provider>,
  );
}

describe("Kora slice-2 list screen snapshots", () => {
  it("pins the Russian screen (coverage + onboarding + rows)", () => {
    const html = renderKoraPage("ru");
    // The honest slice plate is part of the contract.
    expect(html).toContain("Кора · срез 2");
    expect(html).toContain("Что вижу / чего нет");
    expect(html).toContain("Зачем Кора");
    expect(html).toMatchSnapshot();
  });

  it("pins the English screen", () => {
    const html = renderKoraPage("en");
    expect(html).toContain("Kora · slice 2");
    expect(html).toMatchSnapshot();
  });

  it("marks the relay row steerable and the local rows read-only", () => {
    const html = renderKoraPage("ru");
    expect(html).toContain("можно рулить"); // relay-origin row badge
    expect(html).toContain("реле");
    expect(html).toContain("локальная");
    expect(html).toContain("процесс мёртв"); // dead pi row, honest state
  });

  it("links each row into the transcript mock route", () => {
    const html = renderKoraPage("ru");
    expect(html).toContain('href="/kora/exec-zcode-main%3Asess_7f3a91"');
  });

  it("shows the full-page load-more button only when a page is full", () => {
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
    const html = renderToString(
      <KoraGatewayContext.Provider value={new KoraMockAdapter({ latency: false })}>
        <QueryClientProvider client={queryClient}>
          <I18nProvider initialLang="ru">
            <MemoryRouter initialEntries={["/kora"]}>
              <KoraPage />
            </MemoryRouter>
          </I18nProvider>
        </QueryClientProvider>
      </KoraGatewayContext.Provider>,
    );
    expect(html).toContain("Показать ещё");
  });
});
