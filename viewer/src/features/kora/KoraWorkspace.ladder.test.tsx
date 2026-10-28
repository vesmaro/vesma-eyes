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
 * The responsive ladder (blueprint-kw4 §6, states-kw4 §5; Kora IDE В1 cut),
 * workspace-level: the dock's PLACEMENT is a render fact between the two
 * regimes —
 *
 * - ≥lg (1024+, covering both ≥xl and lg..xl — the frame survives the
 *   narrow half, the dock/panel just ride at their minimum widths): the
 *   THREE-zone 100vh frame — the dock | the center | the «Дерево и мета»
 *   panel; the tree lives INSIDE the panel (ONE scroll); TWO seams.
 * - <lg: the document flow — dock card → center card → tree card → meta
 *   card (kora-ide contract §2.5: док → центр → панель); the seams retire
 *   (CSS-hidden, the DOM keeps the nodes).
 *
 * happy-dom answers every width query false, so each regime pins its
 * matchMedia answers explicitly; exactly ONE KoraTreePanel and ONE dock
 * instance mount in all of them (the aria-controls ids must never double —
 * W2-1).
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

describe("KoraWorkspace ladder (blueprint-kw4 §6, states-kw4 §5; Kora IDE В1)", () => {
  it("≥lg: the three-zone 100vh frame — dock | center | panel, the tree rides INSIDE the panel", () => {
    const { container } = mountLadder("frame");
    // The frame is the 100vh section: no page scroll, every surface scrolls
    // inside itself (07l §1.2 through the KW4 cut).
    const stage = container.querySelector("section[aria-labelledby='kora-title']");
    expect(stage?.className).toContain("lg:h-[var(--kora-frame-h)]");
    expect(stage?.className).toContain("lg:overflow-hidden");
    // The dock is the frame's FIRST column (a flush panel, its own scroll).
    const dock = labelled(container, "Сессии");
    expect(dock).toHaveLength(1);
    expect(dock[0].tagName).toBe("ASIDE");
    expect(dock[0].className).toContain("kora-scroll");
    // ONE panel landmark — the KW4 «Дерево и мета» aside; the tree is
    // inside it, NOT a standalone column.
    const panels = labelled(container, "Дерево и мета");
    expect(panels).toHaveLength(1);
    expect(panels[0].tagName).toBe("ASIDE");
    expect(panels[0].contains(treeHeading(container))).toBe(true);
    // The grid template carries the THREE-zone cut: dock var | center 1fr |
    // right var.
    const grid = container.querySelector<HTMLElement>('[style*="--kora-dock-w"]');
    expect(grid?.className).toContain(
      "lg:grid-cols-[var(--kora-dock-w)_minmax(0,1fr)_var(--kora-right-w)]",
    );
    // TWO seams on stage (the dock's and the panel's).
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(2);
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
    // …and exactly ONE dock instance.
    expect(labelled(container, "Сессии")).toHaveLength(1);
  });

  it("<lg: the document flow — dock card, then the center, then the tree card, then the meta card", () => {
    const { container } = mountLadder("flow");
    // The dock is its own card SECTION first in the flow; the tree follows
    // the center; the meta is the aside (kora-ide contract §2.5).
    const dockCard = labelled(container, "Сессии");
    expect(dockCard).toHaveLength(1);
    expect(dockCard[0].tagName).toBe("SECTION");
    const treeCard = labelled(container, "Дерево и мета");
    expect(treeCard).toHaveLength(1);
    expect(treeCard[0].tagName).toBe("SECTION");
    expect(treeCard[0].contains(treeHeading(container))).toBe(true);
    const meta = labelled(container, "Мета-панель");
    expect(meta).toHaveLength(1);
    expect(meta[0].tagName).toBe("ASIDE");
    // DOM order: dock → center → tree → meta (the flow reads top-down).
    // The center at /kora is the invitation scene («Ход сессии»); a session
    // mode adds the #kora-workzone id — the locator covers both.
    const center = container.querySelector(
      "#kora-workzone, section[aria-label='Ход сессии']",
    );
    expect(center).not.toBeNull();
    expect(
      dockCard[0].compareDocumentPosition(center!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      center!.compareDocumentPosition(treeCard[0]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      treeCard[0].compareDocumentPosition(meta[0]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      meta[0].compareDocumentPosition(dockCard[0]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeFalsy();
    // The seam handles retire from the flow — CSS-hidden, the DOM keeps
    // the nodes (happy-dom applies no styles, so the test pins the classes).
    const seams = container.querySelectorAll<HTMLElement>('[role="separator"]');
    expect(seams).toHaveLength(2);
    for (const seam of seams) {
      expect(seam.className).toContain("hidden");
      expect(seam.className).toContain("lg:flex");
    }
  });

  it("<lg: exactly ONE tree instance and ONE dock instance mount (no doubled ids)", () => {
    const { container } = mountLadder("flow");
    expect(treeTitleCount(container)).toBe(1);
    expect(labelled(container, "Сессии")).toHaveLength(1);
  });
});
