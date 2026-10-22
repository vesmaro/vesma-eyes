// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { KoraWorkspace } from "./KoraWorkspace";
import { KoraMockAdapter } from "./KoraMockAdapter";
import { KoraGatewayContext } from "./koraGatewayContext";
import { KORA_FRAME_QUERY, KORA_WIDE_QUERY } from "./koraViewport";
import { koraKeys } from "./useKora";
import { KORA_FIXTURE_COVERAGE, KORA_FIXTURE_SESSIONS } from "./koraFixtures";
import type { ExecutorsPage } from "@/gateway/boardTypes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The responsive ladder (kora-rethink states.md §6, KW3 «Узкие и полировка»),
 * workspace-level: the nav panel's PLACEMENT is a render fact per regime —
 *
 * - ≥xl: its own column (the three-column frame, the KW1 geometry);
 * - lg..xl: sections at the TOP of the meta panel — ONE scroll, navigation
 *   first, the center split untouched; the nav seam retires (the panel owns
 *   no width);
 * - <lg: the document flow — nav card → center card → meta card.
 *
 * happy-dom answers every width query false, so each regime pins its
 * matchMedia answers explicitly; exactly ONE KoraNavPanel instance mounts
 * in all of them (the tree's aria-controls ids must never double — W2-1).
 */

const PAGE_SIZE = 50;

type LadderMode = "wide" | "narrow-frame" | "flow";

function stubLadder(mode: LadderMode): void {
  window.matchMedia = ((query: string) => ({
    matches:
      mode === "wide"
        ? query === KORA_WIDE_QUERY || query === KORA_FRAME_QUERY
        : mode === "narrow-frame"
          ? query === KORA_FRAME_QUERY
          : false,
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

afterEach(async () => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("KoraWorkspace ladder (states.md §6, KW3)", () => {
  it("≥xl: the nav panel owns its column — own aside, OUTSIDE the meta panel", () => {
    const { container } = mountLadder("wide");
    const navAsides = labelled(container, "Навигация");
    expect(navAsides).toHaveLength(1);
    expect(navAsides[0].tagName).toBe("ASIDE");
    const meta = labelled(container, "Мета-панель");
    expect(meta).toHaveLength(1);
    // The tree lives in the nav aside, NOT inside the meta panel.
    expect(navAsides[0].contains(treeHeading(container))).toBe(true);
    expect(meta[0].contains(treeHeading(container))).toBe(false);
    // Both seams on stage (the three-column geometry).
    expect(
      labelled(container, "Ширина панели навигации"),
    ).toHaveLength(1);
    expect(labelled(container, "Ширина мета-панели")).toHaveLength(1);
    // The grid carries BOTH width variables.
    const grid = container.querySelector<HTMLElement>('[style*="--kora-right-w"]');
    expect(grid?.getAttribute("style")).toContain("--kora-left-w: 280px");
  });

  it("lg..xl: the nav sections ride at the TOP of the meta panel — one scroll, navigation first", () => {
    const { container } = mountLadder("narrow-frame");
    // No standalone nav ASIDE — the sections moved INTO the meta aside
    // (the nav landmark inside it is the only «Навигация» region left).
    expect(
      labelled(container, "Навигация").filter((el) => el.tagName === "ASIDE"),
    ).toHaveLength(0);
    const meta = labelled(container, "Мета-панель");
    expect(meta).toHaveLength(1);
    const nav = meta[0].querySelector(":scope > nav[aria-label='Навигация']");
    expect(nav).not.toBeNull();
    expect(nav?.contains(treeHeading(container))).toBe(true);
    // Navigation FIRST: the nav block is the aside's first element child.
    expect(meta[0].firstElementChild).toBe(nav);
    // The nav seam's retirement is CSS, not structural (happy-dom applies
    // no styles, so the DOM keeps the node and these tests pin its
    // classes): the handle must read `hidden … xl:flex` — visible ONLY in
    // the three-column frame, retired at lg..xl with the column it ruled.
    const navSeam = labelled(container, "Ширина панели навигации");
    expect(navSeam).toHaveLength(1);
    expect(navSeam[0].className).toContain("hidden");
    expect(navSeam[0].className).toContain("xl:flex");
    expect(navSeam[0].className).not.toContain("lg:flex");
    expect(labelled(container, "Ширина мета-панели")).toHaveLength(1);
  });

  it("lg..xl: exactly ONE KoraNavPanel instance mounts (no doubled tree ids)", () => {
    const { container } = mountLadder("narrow-frame");
    // The «Хосты и агенты» heading — the tree's anchor — appears ONCE: a
    // second panel instance would double it (and every aria-controls id).
    const treeTitles = [...container.querySelectorAll("h2")].filter(
      (el) => el.textContent === "Хосты и агенты",
    );
    expect(treeTitles).toHaveLength(1);
  });

  it("<lg: the document flow — nav card before the center before the meta card", () => {
    const { container } = mountLadder("flow");
    const navAsides = labelled(container, "Навигация");
    expect(navAsides).toHaveLength(1);
    expect(navAsides[0].tagName).toBe("ASIDE");
    const meta = labelled(container, "Мета-панель");
    expect(meta).toHaveLength(1);
    // DOM order: nav → center → meta (the flow reads top-down).
    const center = container.querySelector("#kora-workzone, section[aria-label='Ход сессии']");
    expect(center).not.toBeNull();
    const order =
      navAsides[0].compareDocumentPosition(meta[0]) &
      Node.DOCUMENT_POSITION_FOLLOWING;
    expect(order).toBeTruthy();
    if (center !== null) {
      expect(
        navAsides[0].compareDocumentPosition(center) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        center.compareDocumentPosition(meta[0]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });
});
