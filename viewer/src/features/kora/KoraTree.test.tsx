// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { KoraTreePanel } from "./KoraTree";
import { buildKoraTree, type KoraWorkspaceModel } from "./koraWorkspaceModel";
import type { KoraSession } from "./koraTypes";
import type { ExecutorItem } from "@/gateway/boardTypes";
import { I18nProvider } from "@/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The v2 tree block (blueprint-kw4 §3, gate §9.4, states-kw4 §3; Kora IDE
 * В1 tail): the pin MOVED to the dock (kora-ide contract §2.1) — the tree
 * routes hosts/agents ONLY; depth 2 — NO session leaves (the sessions live
 * in the left dock); the search is client-side with the honest zero-match
 * (K-TREE-SEARCH); every disclosure carries aria-expanded/aria-controls
 * (07j §6.1); the unknown-host group stays a mono executor id and does NOT
 * route (K-TREE-UNKNOWN).
 */

function executor(id: string, harness: string, host: string): ExecutorItem {
  return {
    id,
    name: `${harness}@${host}`,
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
  };
}

function session(
  partial: Partial<KoraSession> &
    Pick<KoraSession, "id" | "executor_id" | "state" | "harness">,
): KoraSession {
  return {
    native_id: partial.id,
    origin: "local",
    steerable: false,
    project: null,
    cwd: null,
    started_at: null,
    last_activity_at: null,
    age_seconds: 0,
    last_line_preview: null,
    ...partial,
  };
}

const EXECUTORS = [
  executor("exec-zcode-main", "zcode", "abyss-laptop"),
  executor("exec-pi-edge", "pi", "pi-edge"),
];

const SESSIONS: readonly KoraSession[] = [
  session({
    id: "exec-zcode-main:sess_7f3a91",
    executor_id: "exec-zcode-main",
    state: "live",
    harness: "zcode",
    project: "mnemos-mesh",
    cwd: "/home/a/mnemos-mesh",
    age_seconds: 60,
  }),
  session({
    id: "exec-pi-edge:pi-2209-04",
    executor_id: "exec-pi-edge",
    state: "dead",
    harness: "pi",
    age_seconds: 169_200,
  }),
  // The registry miss: an executor the executors registry never named —
  // its group is the unknown-host bucket.
  session({
    id: "exec-ghost:s1",
    executor_id: "exec-ghost",
    state: "idle",
    harness: "zcode",
    age_seconds: 600,
  }),
];

function buildModel(): KoraWorkspaceModel {
  return buildKoraTree(SESSIONS, EXECUTORS);
}

/** The panel in its providers, as an element — mount and rerender share the
 * SAME wrapper shape so a rerender reconciles (state survives). */
function renderTree(props: Partial<Parameters<typeof KoraTreePanel>[0]> = {}) {
  return (
    <I18nProvider initialLang="ru">
      <MemoryRouter initialEntries={["/kora"]}>
        <KoraTreePanel
          model={buildModel()}
          treeReady={true}
          activeHost=""
          activeAgentId={null}
          {...props}
        />
      </MemoryRouter>
    </I18nProvider>
  );
}

function mountTree(
  props: Partial<Parameters<typeof KoraTreePanel>[0]> = {},
): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(renderTree(props));
  });
  return { container, root };
}

/** The disclosure button of ONE host's branch, found by its host link
 * (the exact href matches the host row only — agent rows carry ?agent=). */
function hostDisclosure(
  container: HTMLElement,
  host: string,
): HTMLButtonElement | null {
  return (
    [...container.querySelectorAll("li")]
      .find((li) => li.querySelector(`a[href="/kora/host/${host}"]`))
      ?.querySelector("button[aria-expanded]") ?? null
  );
}

const setInputValue = (input: HTMLInputElement, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

afterEach(async () => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

describe("KoraTreePanel v2 (KW4, gate §9.4 / states-kw4 §3)", () => {
  it("Kora IDE В1: the pin is GONE from the tree — «Чат с кластером» lives in the dock now", () => {
    const { container } = mountTree();
    // The reserved /kora/hermes route is served by the dock's pin section
    // (kora-ide contract §2.1); the tree carries NO hermes link at all.
    const hrefs = [...container.querySelectorAll("a")].map((el) =>
      el.getAttribute("href"),
    );
    expect(hrefs).not.toContain("/kora/hermes");
    expect(container.textContent).not.toContain("Чат с кластером");
  });

  it("depth 2: NO session leaves — the tree routes hosts and agents only", () => {
    const { container } = mountTree();
    const hrefs = [...container.querySelectorAll("a")].map((el) =>
      el.getAttribute("href"),
    );
    // Host rows + agent rows only; no /kora/:sessionId links anywhere.
    const sessionLinks = hrefs.filter(
      (href) => href !== null && /^\/kora\/(?!host\/|hermes)./.test(href),
    );
    expect(sessionLinks).toEqual([]);
    expect(hrefs).not.toContain("/kora/exec-zcode-main:sess_7f3a91");
  });

  it("host rows route /kora/host/:host; agent leaves carry ?agent=", () => {
    const { container } = mountTree();
    const hostLink = container.querySelector<HTMLAnchorElement>(
      'a[href="/kora/host/abyss-laptop"]',
    );
    expect(hostLink).not.toBeNull();
    // A deep link must show its selection: the route's host auto-opens.
    const agentLink = container.querySelector<HTMLAnchorElement>(
      'a[href="/kora/host/abyss-laptop?agent=exec-zcode-main"]',
    );
    expect(agentLink).not.toBeNull();
    // JOIN-PATH (strengthened, cascade W2): even a PREFILLED closed
    // open-set must not keep the route's host folded — the join overrides
    // the persisted seed on a direct mount, not only on a prop change.
    sessionStorage.setItem("vesmaro.koraTree", JSON.stringify({ open: [] }));
    const routed = mountTree({ activeHost: "abyss-laptop" });
    expect(
      hostDisclosure(routed.container, "abyss-laptop")?.getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("a DIRECT deep link (fresh tab) joins a dead host's branch on mount", () => {
    // The cascade-W2 QA pin: /kora/host/pi-edge opened by URL in a NEW
    // tab or a shared link — sessionStorage EMPTY, so the live-seed
    // default cannot open pi-edge (its only session is dead). The join
    // must fire ON MOUNT (the first render is a change from nothing ""),
    // not only on a later activeHost prop change — else the deep link
    // shows a closed branch: the regression the canon fix 37c27e2
    // introduced by initializing joinedHost to activeHost.
    sessionStorage.clear();
    const { container } = mountTree({ activeHost: "pi-edge" });
    const disclosure = hostDisclosure(container, "pi-edge");
    expect(disclosure).not.toBeNull();
    // The deep link shows its selection: the branch is open…
    expect(disclosure?.getAttribute("aria-expanded")).toBe("true");
    // …its agent leaf is visible without a disclosure click…
    expect(
      container.querySelector('a[href="/kora/host/pi-edge?agent=exec-pi-edge"]'),
    ).not.toBeNull();
    // …and the join persists for the rest of the browser session.
    const stored = JSON.parse(sessionStorage.getItem("vesmaro.koraTree") ?? "{}") as {
      open?: string[];
    };
    expect(stored.open).toContain("pi-edge");
  });

  it("every disclosure carries aria-expanded + aria-controls to a real id", () => {
    const { container } = mountTree();
    const toggles = [
      ...container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"),
    ];
    expect(toggles.length).toBeGreaterThan(0);
    for (const toggle of toggles) {
      const controls = toggle.getAttribute("aria-controls");
      expect(controls).not.toBeNull();
      // An expanded branch's controlled list IS in the DOM (a collapsed one
      // renders no list — the id appears with the expansion, as designed).
      if (toggle.getAttribute("aria-expanded") === "true") {
        expect(document.getElementById(controls ?? "")).not.toBeNull();
      }
    }
    // Toggle the first branch: the state flips and persists in the DOM.
    const first = toggles[0]!;
    const before = first.getAttribute("aria-expanded");
    act(() => {
      first.click();
    });
    expect(first.getAttribute("aria-expanded")).not.toBe(before);
  });

  it("K-TREE-SEARCH zero-match: the honest line + the polite counter reads 0", () => {
    const { container } = mountTree();
    const input = container.querySelector<HTMLInputElement>("input[type='search']");
    expect(input).not.toBeNull();
    setInputValue(input!, "такого-нет-нигде");
    expect(container.textContent).toContain("Ничего не найдено");
    const status = container.querySelector("p[role='status']");
    expect(status?.textContent).toContain("найдено: 0");
  });

  it("K-TREE-SEARCH: a match renders the branch EXPANDED without a second click", () => {
    const { container } = mountTree();
    const input = container.querySelector<HTMLInputElement>("input[type='search']");
    setInputValue(input!, "zcode");
    expect(container.textContent).toContain("abyss-laptop");
    // The searching regime expands every visible branch: the agent leaf is
    // already in the DOM (no disclosure click needed).
    expect(
      container.querySelector(
        'a[href="/kora/host/abyss-laptop?agent=exec-zcode-main"]',
      ),
    ).not.toBeNull();
    // Two matches: abyss-laptop (the zcode agent label) AND the unknown
    // exec-ghost group (no executor name — its honest label IS the harness).
    expect(container.textContent).toContain("найдено: 2");
  });

  it("K-TREE-UNKNOWN: the registry miss stays a mono id — no link, no disclosure", () => {
    const { container } = mountTree();
    const unknown = [...container.querySelectorAll("li")].find((el) =>
      el.textContent?.includes("exec-ghost"),
    );
    expect(unknown).not.toBeUndefined();
    expect(unknown?.querySelector("a")).toBeNull();
    expect(unknown?.querySelector("button[aria-expanded]")).toBeNull();
  });

  it("K-PANEL-PENDING: the panel waits with the honest loading status — no fabricated rows", () => {
    const { container } = mountTree({ treeReady: false });
    // The polite loading status names itself; the skeleton, not fake rows.
    const loading = container.querySelector("[role='status'][aria-label]");
    expect(loading?.getAttribute("aria-label")).toBe("Загружаем сессии");
    // Quiet bg-elevated placeholders (skeleton.tsx), not fabricated rows.
    expect(loading?.querySelectorAll("div[aria-hidden='true'].bg-elevated").length).toBe(2);
    // The registry data rides along but renders NO host/agent rows until it
    // is ready — and there is NO pin anymore (it moved to the dock): zero
    // anchors until the tree is ready.
    const hrefs = [...container.querySelectorAll("a")].map((el) =>
      el.getAttribute("href"),
    );
    expect(hrefs).toEqual([]);
    expect(container.querySelector("button[aria-expanded]")).toBeNull();
  });
});

describe("KoraTree open-state machine (cascade W3 pins)", () => {
  it("JOIN-NO-REOPEN: a manual close of the ACTIVE host's branch survives rerenders; only a host CHANGE re-joins", () => {
    // The cascade-W3 QA pin: the join adjust runs only when
    // joinedHost !== activeHost — never on an ordinary rerender. Drop the
    // guard and every rerender re-opens whatever branch the user just
    // folded (the route's host is always «arriving» again).
    sessionStorage.clear();
    // Mount with the route on pi-edge (its only session is dead — the
    // live-seed default never opens it; the JOIN did).
    const { container, root } = mountTree({ activeHost: "pi-edge" });
    const rerender = (activeHost: string) => {
      act(() => {
        root.render(renderTree({ activeHost }));
      });
    };
    const piEdge = () => hostDisclosure(container, "pi-edge");
    expect(piEdge()?.getAttribute("aria-expanded")).toBe("true");

    // Phase 1 — the user folds the ACTIVE host's branch…
    act(() => {
      piEdge()?.click();
    });
    expect(piEdge()?.getAttribute("aria-expanded")).toBe("false");
    // …and it STAYS folded across rerenders with the SAME activeHost:
    // the guard sees joinedHost === activeHost and skips the adjust.
    rerender("pi-edge");
    rerender("pi-edge");
    expect(piEdge()?.getAttribute("aria-expanded")).toBe("false");

    // Phase 2 — a navigation to ANOTHER host joins that host's branch…
    rerender("abyss-laptop");
    expect(
      hostDisclosure(container, "abyss-laptop")?.getAttribute("aria-expanded"),
    ).toBe("true");
    // …and does NOT drag the folded branch back open on its way.
    expect(piEdge()?.getAttribute("aria-expanded")).toBe("false");

    // Phase 3 — returning to pi-edge IS a host change: the branch
    // re-joins (the route must always show its selection).
    rerender("pi-edge");
    expect(piEdge()?.getAttribute("aria-expanded")).toBe("true");
  });

  it("SEED-PRECEDENCE: a stored open-set beats the live default — the default is the no-persistence fallback only", () => {
    // The cascade-W3 QA pin (07j §3.3/§11): the live-only default seeds the
    // open-set ONLY when sessionStorage holds nothing. A stored seed REPLACES
    // the default even where the two disagree — a persisted DEAD host opens,
    // which the live default would never do; a live host left out of the
    // stored set stays folded, so the seed is no union either.
    sessionStorage.setItem(
      "vesmaro.koraTree",
      JSON.stringify({ open: ["pi-edge"] }),
    );
    const stored = mountTree({ activeHost: "" });
    expect(
      hostDisclosure(stored.container, "pi-edge")?.getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      hostDisclosure(stored.container, "abyss-laptop")?.getAttribute("aria-expanded"),
    ).toBe("false");

    // Complementary: with NO persistence the default opens exactly the
    // live hosts — pi-edge stays folded (07j §11).
    sessionStorage.clear();
    const fresh = mountTree({ activeHost: "" });
    expect(
      hostDisclosure(fresh.container, "abyss-laptop")?.getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      hostDisclosure(fresh.container, "pi-edge")?.getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("LISTID-COLLISION: hosts that sanitize to the SAME slug keep distinct ids (the FNV digest)", () => {
    // The cascade-W6 QA pin, the tree-host leg of the closed
    // kora-tree-listid-collision class (the KoraHostField precedent rides
    // the same koraDisclosureListId core): «a.b» and «a_b» both flatten to
    // kora-tree-host-a_b — the bare-slug form duplicated the DOM id and the
    // aria-controls idref resolved to the FIRST list only. The digest
    // suffix keeps the pair apart; both branches open so both lists are in
    // the DOM (the collision is observable exactly then).
    sessionStorage.setItem(
      "vesmaro.koraTree",
      JSON.stringify({ open: ["a.b", "a_b"] }),
    );
    const collideModel = buildKoraTree(
      [
        session({
          id: "exec-dot:s1",
          executor_id: "exec-dot",
          state: "live",
          harness: "zcode",
        }),
        session({
          id: "exec-us:s2",
          executor_id: "exec-us",
          state: "idle",
          harness: "zcode",
        }),
      ],
      [executor("exec-dot", "zcode", "a.b"), executor("exec-us", "zcode", "a_b")],
    );
    const { container } = mountTree({ model: collideModel });

    const buttons = [
      ...container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"),
    ];
    expect(buttons.length).toBe(2);
    const controls = buttons.map((button) => button.getAttribute("aria-controls"));
    // The collision premise itself: both slugs flatten identically…
    for (const id of controls) {
      expect(id).toMatch(/^kora-tree-host-a_b-/);
    }
    // …yet the ids (and the lists they point at) stay DISTINCT, each
    // resolving to EXACTLY ONE list element.
    expect(new Set(controls).size).toBe(2);
    for (const id of controls) {
      const lists = document.querySelectorAll(`ul[id="${id}"]`);
      expect(lists.length).toBe(1);
    }
    // The pairing is honest per branch: each button's aria-controls names
    // the list INSIDE its own branch li, not the neighbour's.
    for (const button of buttons) {
      const own = button.closest("li")?.querySelector(
        `ul[id="${button.getAttribute("aria-controls")}"]`,
      );
      expect(own).not.toBeNull();
    }
  });
});
