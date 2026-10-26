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
 * The v2 tree block (blueprint-kw4 §3, gate §9.4, states-kw4 §3): the pin
 * FIRST and only it leads to /kora/hermes; depth 2 — NO session leaves (the
 * sessions live in the field); the search is client-side with the honest
 * zero-match (K-TREE-SEARCH); every disclosure carries aria-expanded/
 * aria-controls (07j §6.1); the unknown-host group stays a mono executor id
 * and does NOT route (K-TREE-UNKNOWN).
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

function mountTree(
  props: Partial<Parameters<typeof KoraTreePanel>[0]> = {},
): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <I18nProvider initialLang="ru">
        <MemoryRouter initialEntries={["/kora"]}>
          <KoraTreePanel
            model={buildModel()}
            treeReady={true}
            activeHost=""
            activeAgentId={null}
            clusterActive={false}
            {...props}
          />
        </MemoryRouter>
      </I18nProvider>,
    );
  });
  return { container, root };
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
  it("K-TREE-PIN: the FIRST row is «Чат с кластером» → /kora/hermes; current on the cluster route", () => {
    const { container } = mountTree();
    const links = [...container.querySelectorAll("a")];
    const pin = links[0];
    expect(pin?.getAttribute("href")).toBe("/kora/hermes");
    expect(pin?.textContent).toContain("Чат с кластером");
    expect(pin?.getAttribute("aria-current")).toBeNull();

    const onCluster = mountTree({ clusterActive: true });
    const clusterPin = onCluster.container.querySelector("a");
    expect(clusterPin?.getAttribute("href")).toBe("/kora/hermes");
    expect(clusterPin?.getAttribute("aria-current")).toBe("page");
  });

  it("depth 2: NO session leaves — the only non-host link is the pin", () => {
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
    // is ready — the only anchor is the always-on cluster pin (K-TREE-PIN).
    const hrefs = [...container.querySelectorAll("a")].map((el) =>
      el.getAttribute("href"),
    );
    expect(hrefs).toEqual(["/kora/hermes"]);
    expect(container.querySelector("button[aria-expanded]")).toBeNull();
  });
});
