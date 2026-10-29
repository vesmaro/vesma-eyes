// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { KoraWorkspace } from "./KoraWorkspace";
import { KoraMockAdapter } from "./KoraMockAdapter";
import { KoraGatewayContext } from "./koraGatewayContext";
import { koraKeys } from "./useKora";
import {
  KORA_FIXTURE_COVERAGE,
  KORA_FIXTURE_HERMES_STATUS,
  KORA_FIXTURE_SESSIONS,
} from "./koraFixtures";
import { setSpecialistAnnotation, resetSpecialistAnnotationsForTests } from "./koraSpecialistStore";
import type { ExecutorsPage } from "@/gateway/boardTypes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";

/**
 * The CENTER context bar (kora-ide contract §2.2, the В2 full line):
 * «хост · харнес · модель · специалист · режим» — with the honest
 * omission rule («пустой слот не рисуем»):
 * - a LOCAL session reports no models → NO model segment (never a
 *   placeholder, never an invented value);
 * - the hermes cluster shows the roster's server default (real data from
 *   /status; no status → the segment omits);
 * - the specialist segment appears ONLY for the session's LOCAL
 *   annotation (koraSpecialistStore) — nothing chosen, nothing drawn.
 */

const PAGE_SIZE = 50;
const ZCODE = "exec-zcode-main:sess_7f3a91";

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
  ];
}

function renderBar(options: {
  sessionId: string | null;
  cluster?: boolean;
  hermesStatus?: typeof KORA_FIXTURE_HERMES_STATUS | null;
  sessions?: readonly unknown[];
}): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rows = (options.sessions ??
    KORA_FIXTURE_SESSIONS) as typeof KORA_FIXTURE_SESSIONS;
  queryClient.setQueryData(koraKeys.sessionsPaged(PAGE_SIZE), {
    pages: [
      {
        ok: true as const,
        count: rows.length,
        items: rows,
        coverage: KORA_FIXTURE_COVERAGE,
        meta: { generated_at: "2026-09-24T11:45:00Z" },
      },
    ],
    pageParams: [0],
  });
  queryClient.setQueryData(keys.agents.executors.list(), {
    ok: true,
    count: 1,
    items: executorsPage(),
    meta: {
      presence: { online_max_age_s: 120, stale_max_age_s: 600 },
      sweeper_interval_s: 60,
    },
  } as ExecutorsPage);
  if (options.hermesStatus !== undefined && options.hermesStatus !== null) {
    queryClient.setQueryData(koraKeys.hermesStatus(), options.hermesStatus);
  }
  return renderToString(
    <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
      <KoraGatewayContext.Provider value={new KoraMockAdapter({ latency: false })}>
        <QueryClientProvider client={queryClient}>
          <I18nProvider initialLang="ru">
            <MemoryRouter initialEntries={["/kora"]}>
              <KoraWorkspace
                sessionId={options.sessionId}
                cluster={options.cluster ?? false}
              />
            </MemoryRouter>
          </I18nProvider>
        </QueryClientProvider>
      </KoraGatewayContext.Provider>
    </GatewayContext.Provider>,
  );
}

/** The context bar is the mono line inside the center column header. */
function contextLine(html: string): string | null {
  const match = html.match(
    /<p class="truncate font-mono text-xs text-foreground-secondary">([\s\S]*?)<\/p>/,
  );
  return match?.[1] ?? null;
}

describe("KoraWorkspace context bar (В2 full line, honest omission)", () => {
  it("local session: host · harness · режим, NO model segment (no invented value)", () => {
    resetSpecialistAnnotationsForTests();
    localStorage.clear();
    const html = renderBar({ sessionId: ZCODE });
    const line = contextLine(html);
    expect(line).not.toBeNull();
    expect(line).toContain("abyss-laptop"); // the registry owner host
    expect(line).toContain("zcode");
    expect(line).toContain("транскрипт");
    // K-TREE-MODEL-UNKNOWN: no roster → the segment OMITS (the composer's
    // own slot carries the honest wording, the bar does not draw a value).
    expect(line).not.toContain("hermes-4.5");
    expect(line).not.toContain("модели");
  });

  it("specialist segment appears only with the session's local annotation", () => {
    localStorage.clear();
    resetSpecialistAnnotationsForTests();
    const bare = renderBar({ sessionId: ZCODE });
    expect(contextLine(bare)).not.toContain("@GCW");
    setSpecialistAnnotation(ZCODE, "@GCW: Tech Lead");
    const annotated = renderBar({ sessionId: ZCODE });
    expect(contextLine(annotated)).toContain("@GCW: Tech Lead");
    // Another session's annotation does not leak into this bar.
    const other = renderBar({ sessionId: "exec-pi-edge:pi-2209-04" });
    expect(contextLine(other)).not.toContain("@GCW");
    resetSpecialistAnnotationsForTests();
  });

  it("hermes cluster: the model segment rides the REAL roster default from /status", () => {
    localStorage.clear();
    resetSpecialistAnnotationsForTests();
    const html = renderBar({
      sessionId: null,
      cluster: true,
      hermesStatus: KORA_FIXTURE_HERMES_STATUS,
    });
    const line = contextLine(html);
    expect(line).toContain("hermes");
    expect(line).toContain("hermes-4.5-405b"); // the server's default_model
    expect(line).toContain("чат");
  });

  it("no status yet → the model segment omits honestly (no placeholder)", () => {
    localStorage.clear();
    resetSpecialistAnnotationsForTests();
    const html = renderBar({
      sessionId: null,
      cluster: true,
      hermesStatus: null, // not prefilled — the query stays pending in SSR
    });
    const line = contextLine(html);
    expect(line).toContain("hermes");
    expect(line).not.toContain("hermes-4.5");
    expect(line).not.toContain("модели");
  });
});
