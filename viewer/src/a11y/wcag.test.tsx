import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import {
  MemoryRouter,
  Route,
  Routes,
  createMemoryRouter,
  RouterProvider,
} from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { buildRoutes } from "@/app/routes";
import { Badge } from "@/components/ui/badge";
import { TraceRow } from "@/components/TraceRow/TraceRow";
import { MemoryCard } from "@/components/MemoryCard/MemoryCard";
import { MOCK_MEMORIES, MOCK_TRACES } from "@/gateway/fixtures";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { ThemeProvider } from "@/components/theme-provider";
import { DensityProvider } from "@/components/density-provider";
import { HotkeysProvider } from "@/layout/Hotkeys";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { I18nProvider } from "@/i18n";
import { keys } from "@/lib/queryKeys";
import { KoraSessionPage } from "@/features/kora/KoraSessionPage";
import { KoraMockAdapter } from "@/features/kora/KoraMockAdapter";
import { KoraGatewayContext } from "@/features/kora/koraGatewayContext";
import { koraKeys } from "@/features/kora/useKora";
import {
  KORA_FIXTURE_COVERAGE,
  KORA_FIXTURE_SESSIONS,
  KORA_FIXTURE_TRANSCRIPT,
} from "@/features/kora/koraFixtures";

/**
 * T7 a11y regression guards (WCAG 2.2 AA fixes). renderToString keeps these
 * DOM-free (node vitest env, project pattern): they assert that the accessible
 * semantics — landmarks, headings, skip link, live regions, AA badge tints,
 * ≥24px link targets — are present in the real component markup.
 */
function renderTree(_ui: React.ReactElement | null, path = "/"): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  // The full route tree through a memory DATA router — ScrollRestoration
  // inside the Shell requires one, and the shell markup is what we assert.
  const router = createMemoryRouter(buildRoutes(), { initialEntries: [path] });
  return renderToString(
    <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider adapterMode="mock" endpoint="/api">
            {/* English copy via initialLang — the a11y assertions pin English
             * labels; semantics under test are language-independent. */}
            <I18nProvider initialLang="en">
              <DensityProvider initialDensity="comfortable">
                <HotkeysProvider>
                  <RouterProvider router={router} />
                </HotkeysProvider>
              </DensityProvider>
            </I18nProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>,
  );
}

describe("Shell landmarks and keyboard bypass (WCAG 2.4.1 / 1.3.1)", () => {
  it("renders a skip-to-content link ahead of the navigation", () => {
    const html = renderTree(null, "/memory");
    expect(html).toContain("Skip to content");
    expect(html).toContain('href="#main"');
    // The skip link precedes the primary nav in DOM (tab) order.
    expect(html.indexOf('href="#main"')).toBeLessThan(
      html.indexOf('aria-label="Primary"'),
    );
  });

  it("exposes the landmark structure: header, nav, main", () => {
    const html = renderTree(null, "/memory");
    expect(html).toContain('<main id="main"');
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain("<header");
    expect(html).toContain("<aside");
  });

  it("does not use a heading for the top-bar route label (pages own the h1)", () => {
    const html = renderTree(null, "/memory");
    expect(html).not.toContain("<h2");
  });
});

describe("Page headings (WCAG 1.3.1)", () => {
  it("search page carries an h1 even on the hero (imagery + form) branch", () => {
    // /memory/search — the eager route; the sr-only h1 keeps the outline
    // intact while the hero is imagery + form.
    const html = renderTree(null, "/memory/search");
    expect(html).toContain('<h1 class="sr-only">Search</h1>');
  });

  it("memory cards use h2 under the page h1 and give links a ≥24px target", () => {
    const html = renderToString(
      <MemoryRouter>
        <MemoryCard memory={MOCK_MEMORIES[0]} />
      </MemoryRouter>,
    );
    expect(html).toContain("<h2");
    expect(html).not.toContain("<h3");
    expect(html).toContain("min-h-6"); // 24px minimum interactive target (2.5.8)
  });
});

describe("Badge variants (WCAG 1.4.3 — AA tint composition)", () => {
  it("iris and confidence badges use the 15% tint + bright-text combination", () => {
    const iris = renderToString(<Badge variant="iris">hybrid</Badge>);
    expect(iris).toContain("bg-iris-tint");
    expect(iris).toContain("text-iris-bright");
    const confidence = renderToString(<Badge variant="confidence">semantic</Badge>);
    expect(confidence).toContain("bg-confidence-tint");
    expect(confidence).toContain("text-confidence");
  });
});

describe("Trace row (WCAG 2.5.8 / 1.4.3)", () => {
  it("gives the Raw JSON disclosure a ≥24px target and an AA text token", () => {
    const html = renderToString(<TraceRow trace={MOCK_TRACES[0]} />);
    expect(html).toMatch(/<summary[^>]*min-h-6/);
    expect(html).toMatch(/<summary[^>]*text-iris-bright/);
  });
});

describe("Kora workspace (union И1 — 07j §6 / 07l §7)", () => {
  // The workspace frame with the live fixture session: prefilled cache so
  // the data branches render synchronously (same discipline as the kora
  // snapshot suites), English copy — semantics are language-independent.
  function renderKoraSession(): string {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const sessions = {
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
    };
    queryClient.setQueryData(koraKeys.sessionsPaged(50), sessions);
    // Executors that own the fixture sessions — the tree's hosts.
    const executorRow = (id: string, name: string, harness: string, host: string) => ({
      id,
      name,
      harness,
      host,
      transport: "local-poll" as const,
      capabilities: [],
      version: "1.0.0",
      enabled: true,
      state: "approved" as const,
      last_seen: "2026-09-24T11:00:00Z",
      presence: "online" as const,
      registered_via: "",
      registered_at: "2026-09-20T09:00:00Z",
      updated_at: "2026-09-24T11:00:00Z",
    });
    queryClient.setQueryData(keys.agents.executors.list(), {
      ok: true,
      count: 3,
      items: [
        executorRow("exec-zcode-main", "zcode@abyss-laptop", "zcode", "abyss-laptop"),
        executorRow("exec-vscode-lab", "vscode@abyss-laptop", "vscode", "abyss-laptop"),
        executorRow("exec-pi-edge", "pi@pi-edge", "pi", "pi-edge"),
      ],
      meta: {
        presence: { online_max_age_s: 120, stale_max_age_s: 600 },
        sweeper_interval_s: 60,
      },
    });
    const transcript = KORA_FIXTURE_TRANSCRIPT["exec-zcode-main:sess_7f3a91"] ?? [];
    queryClient.setQueryData(
      koraKeys.transcriptPaged("exec-zcode-main:sess_7f3a91", 50),
      {
        pages: [
          {
            session_id: "exec-zcode-main:sess_7f3a91",
            items: transcript,
            next_after_seq: transcript.at(-1)?.seq ?? 0,
            has_more: false,
          },
        ],
        pageParams: [0],
      },
    );
    return renderToString(
      <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
        <KoraGatewayContext.Provider value={new KoraMockAdapter({ latency: false })}>
          <QueryClientProvider client={queryClient}>
            <I18nProvider initialLang="en">
              <MemoryRouter initialEntries={["/kora/exec-zcode-main%3Asess_7f3a91"]}>
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

  it("exposes the named regions: work zone, side panel, console (1.3.1)", () => {
    const html = renderKoraSession();
    expect(html).toContain('aria-label="Session run"');
    expect(html).toContain('aria-label="Hosts and sessions"');
    expect(html).toContain('aria-label="Console"');
    expect(html).toContain('aria-label="Hosts and agents"');
  });

  it("tree disclosures carry aria-expanded/aria-controls; rows keep ≥24px targets (4.1.2 / 2.5.8)", () => {
    const html = renderKoraSession();
    expect(html).toMatch(/aria-expanded="(true|false)"/);
    expect(html).toMatch(/aria-controls="kora-tree-/);
    // The tree leaves and Блок 2 rows are ≥24px link targets.
    expect(html).toMatch(/<a[^>]*min-h-6/);
  });

  it("the console exposes its seams as separators and its toggle as a disclosure (4.1.2)", () => {
    // U5: the tabs are superseded by the two wings (15-WOW §3.2) — the
    // console's a11y contract is now the resize seams (honest separators)
    // + the expand disclosure.
    const html = renderKoraSession();
    expect(html).not.toContain('role="tablist"');
    expect(html).toMatch(/role="separator"[^>]*aria-valuenow/);
    expect(html).toMatch(/aria-expanded="(true|false)"/);
    expect(html).toContain('aria-controls="kora-pult-body"');
  });

  it("session state is dot + text, never colour alone (1.4.1)", () => {
    const html = renderKoraSession();
    expect(html).toContain("running ·"); // the live pill text rides the dot
    expect(html).toContain("process dead"); // the dead row names its state
  });

  it("the composer labels its field and ties the reason to it (4.1.2 / 2.5.3)", () => {
    const html = renderKoraSession();
    expect(html).toContain('for="kora-composer-input"'); // the sr-only label
    expect(html).toContain('aria-describedby="kora-composer-note"');
    expect(html).toContain('aria-live="polite"'); // the acknowledged Enter intent
  });
});
