// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { KoraWorkspace } from "./KoraWorkspace";
import { KoraMockAdapter } from "./KoraMockAdapter";
import { KoraGatewayContext } from "./koraGatewayContext";
import { KORA_FRAME_QUERY } from "./koraViewport";
import { koraKeys } from "./useKora";
import { KORA_FIXTURE_COVERAGE, KORA_FIXTURE_SESSIONS } from "./koraFixtures";
import type { ExecutorsPage } from "@/gateway/boardTypes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The responsive ladder (blueprint-kw4 §6, states-kw4 §5), workspace-level:
 * KW4 collapsed the ladder to TWO regimes and the tree's PLACEMENT is a
 * render fact between them —
 *
 * - ≥lg (1024+, covering both ≥xl and lg..xl — the frame survives the
 *   narrow half, the panel just rides at its minimum width): the TWO-zone
 *   100vh frame — the field | the «Дерево и мета» panel; the tree lives
 *   INSIDE the panel (ONE scroll); ONE seam.
 * - <lg: the document flow — tree card → center card → meta card; the
 *   seam retires (CSS-hidden, the DOM keeps the node).
 *
 * happy-dom answers every width query false, so each regime pins its
 * matchMedia answers explicitly; exactly ONE KoraTreePanel instance mounts
 * in all of them (the tree's aria-controls ids must never double — W2-1).
 */

const PAGE_SIZE = 50;

type LadderMode = "frame" | "flow";

function stubLadder(mode: LadderMode): void {
  window.matchMedia = ((query: string) => ({
    matches: mode === "frame" ? query === KORA_FRAME_QUERY : false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

function executorsPage(): ExecutorsPage["items"] {
  return [
    {
      id: "exec-zcode-main",
      name: "zcode@abyss-laptop",
      harness: "zcode",
      host: "abyss-laptop",
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
    },
  ];
}

function mountLadder(mode: LadderMode): { container: HTMLElement; root: Root } {
  stubLadder(mode);
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
  queryClient.setQueryData(keys.agents.executors.list(), {
    ok: true,
    count: 1,
    items: executorsPage(),
    meta: {
      presence: { online_max_age_s: 120, stale_max_age_s: 600 },
      sweeper_interval_s: 60,
    },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
        <KoraGatewayContext.Provider value={new KoraMockAdapter({ latency: false })}>
          <QueryClientProvider client={queryClient}>
            <I18nProvider initialLang="ru">
              <MemoryRouter initialEntries={["/kora"]}>
                <KoraWorkspace />
              </MemoryRouter>
            </I18nProvider>
          </QueryClientProvider>
        </KoraGatewayContext.Provider>
      </GatewayContext.Provider>,
    );
  });
  return { container, root };
}

const labelled = (container: HTMLElement, label: string): HTMLElement[] =>
  [...container.querySelectorAll<HTMLElement>("[aria-label]")].filter(
    (el) => el.getAttribute("aria-label") === label,
  );

const treeHeading = (container: HTMLElement): HTMLElement | null =>
  [...container.querySelectorAll("h2")].find(
    (el) => el.textContent === "Хосты и агенты",
  ) ?? null;

const treeTitleCount = (container: HTMLElement): number =>
  [...container.querySelectorAll("h2")].filter(
    (el) => el.textContent === "Хосты и агенты",
  ).length;

afterEach(async () => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("KoraWorkspace ladder (blueprint-kw4 §6, states-kw4 §5)", () => {
  it("≥lg: the two-zone 100vh frame — the panel owns the right column, the tree rides INSIDE it", () => {
    const { container } = mountLadder("frame");
    // The frame is the 100vh section: no page scroll, every surface scrolls
    // inside itself (07l §1.2 through the KW4 cut).
    const stage = container.querySelector("section[aria-labelledby='kora-title']");
    expect(stage?.className).toContain("lg:h-[var(--kora-frame-h)]");
    expect(stage?.className).toContain("lg:overflow-hidden");
    // ONE panel landmark — the KW4 «Дерево и мета» aside; the tree is
    // inside it (the rehoused left zone), NOT a standalone column.
    const panels = labelled(container, "Дерево и мета");
    expect(panels).toHaveLength(1);
    expect(panels[0].tagName).toBe("ASIDE");
    expect(panels[0].contains(treeHeading(container))).toBe(true);
    // The grid template carries the TWO-zone cut: center 1fr + the seam var.
    const grid = container.querySelector<HTMLElement>('[style*="--kora-right-w"]');
    expect(grid?.className).toContain(
      "lg:grid-cols-[minmax(0,1fr)_var(--kora-right-w)]",
    );
    // ONE seam on stage (the right panel's; the left one retired, §9.1).
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(1);
  });

  it("≥lg: the panel scrolls ONCE — the tree and the meta share the aside (lg..xl keeps the frame)", () => {
    const { container } = mountLadder("frame");
    const panel = labelled(container, "Дерево и мета")[0];
    // The meta blocks live in the SAME aside — ONE panel scroll, tree first
    // (states-kw4 §3: navigation first; the KW3 lg..xl rung's rule kept).
    expect(panel.textContent).toContain("Эфир");
    expect(
      panel.contains(treeHeading(container)) && panel.textContent!.indexOf("Хосты и агенты") <
        panel.textContent!.indexOf("Эфир"),
    ).toBe(true);
    // Exactly ONE tree instance — a second panel would double the
    // aria-controls ids (W2-1).
    expect(treeTitleCount(container)).toBe(1);
  });

  it("<lg: the document flow — tree card, then the center, then the meta card", () => {
    const { container } = mountLadder("flow");
    // The tree is its own card SECTION in the flow; the meta is the aside.
    const treeCard = labelled(container, "Дерево и мета");
    expect(treeCard).toHaveLength(1);
    expect(treeCard[0].tagName).toBe("SECTION");
    expect(treeCard[0].contains(treeHeading(container))).toBe(true);
    const meta = labelled(container, "Мета-панель");
    expect(meta).toHaveLength(1);
    expect(meta[0].tagName).toBe("ASIDE");
    // DOM order: tree → center → meta (the flow reads top-down). The
    // center at /kora is the invitation scene («Ход сессии»); a session
    // mode adds the #kora-workzone id — the locator covers both.
    const center = container.querySelector(
      "#kora-workzone, section[aria-label='Ход сессии']",
    );
    expect(center).not.toBeNull();
    expect(
      treeCard[0].compareDocumentPosition(center!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      center!.compareDocumentPosition(meta[0]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      meta[0].compareDocumentPosition(treeCard[0]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeFalsy();
    // The seam handle is retired from the flow — CSS-hidden, the DOM keeps
    // the node (happy-dom applies no styles, so the test pins the classes).
    const seam = container.querySelector<HTMLElement>('[role="separator"]');
    expect(seam?.className).toContain("hidden");
    expect(seam?.className).toContain("lg:flex");
  });

  it("<lg: exactly ONE tree instance mounts (no doubled tree ids)", () => {
    const { container } = mountLadder("flow");
    expect(treeTitleCount(container)).toBe(1);
  });
});
