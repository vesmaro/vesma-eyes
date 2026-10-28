// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { KoraWorkspace } from "./KoraWorkspace";
import { KoraMockAdapter } from "./KoraMockAdapter";
import { KoraGatewayContext } from "./koraGatewayContext";
import { KORA_FRAME_QUERY } from "./koraViewport";
import { koraGroupListId } from "./koraWorkspaceModel";
import { koraKeys } from "./useKora";
import { KORA_FIXTURE_COVERAGE, KORA_FIXTURE_SESSIONS } from "./koraFixtures";
import type { ExecutorsPage, TaskInbox } from "@/gateway/boardTypes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The frame at the WORKSPACE level in its Kora IDE В1 THREE-zone cut
 * (kora-ide contract §2): the LEFT dock «Сессии» — permanent, immoveable
 * (K-INV-1: a session/host/harness selection never changes the dock's
 * composition, width, scroll or focus — the explicit fix of the owner's
 * «панель улетает вниз при выборе» defect), its seam persists through the
 * workspace's OWN callback (vesmaro.koraDockW → --kora-dock-w, 220–380,
 * def 300 — the dead vesmaro.koraLeftW stays unread), and the pin «Чат с
 * кластером» lives in the dock now. The RIGHT panel keeps its KW4 seam
 * (vesmaro.koraRightW → --kora-right-w, 240–420, def 320). TWO seams on
 * stage. The handle mechanics themselves are KoraResizeHandle's tests; the
 * Пульт height hardware lives on in useKoraBandHeight.test.tsx.
 */

const PAGE_SIZE = 50;

/** Pin the viewport hook (the ladder) to the FRAME regime: these tests own
 * the ≥lg three-zone geometry, and happy-dom answers every width query
 * false — the explicit stub states the regime instead of inheriting the
 * environment's null answer. */
function stubWideFrame(): void {
  window.matchMedia = ((query: string) => ({
    matches: query === KORA_FRAME_QUERY,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

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
    row("exec-vscode-lab", "vscode@abyss-laptop", "vscode", "abyss-laptop"),
    row("exec-pi-edge", "pi@pi-edge", "pi", "pi-edge"),
  ];
}

interface MountOptions {
  inboxCount?: number;
  sessionId?: string | null;
  host?: string | null;
  cluster?: boolean;
}

function mountWorkspace(options: MountOptions = {}): {
  container: HTMLElement;
  root: Root;
  rerender: (next: MountOptions) => void;
} {
  stubWideFrame();
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
    count: 3,
    items: executorsPage(),
    meta: {
      presence: { online_max_age_s: 120, stale_max_age_s: 600 },
      sweeper_interval_s: 60,
    },
  });
  if (options.inboxCount !== undefined) {
    queryClient.setQueryData<TaskInbox>(keys.tasks.inbox(), {
      items: [],
      refreshed_at: "2026-10-22T00:00:00Z",
      count: options.inboxCount,
    });
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (next: MountOptions): void => {
    root.render(
      <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
        <KoraGatewayContext.Provider value={new KoraMockAdapter({ latency: false })}>
          <QueryClientProvider client={queryClient}>
            <I18nProvider initialLang="ru">
              <MemoryRouter initialEntries={["/kora"]}>
                <KoraWorkspace
                  sessionId={next.sessionId ?? null}
                  host={next.host ?? null}
                  cluster={next.cluster ?? false}
                />
              </MemoryRouter>
            </I18nProvider>
          </QueryClientProvider>
        </KoraGatewayContext.Provider>
      </GatewayContext.Provider>,
    );
  };
  act(() => {
    render(options);
  });
  return {
    container,
    root,
    rerender: (next: MountOptions) => {
      act(() => {
        render(next);
      });
    },
  };
}

const seamByLabel = (container: HTMLElement, label: string): HTMLElement => {
  const found = [...container.querySelectorAll<HTMLElement>('[role="separator"]')].find(
    (el) => el.getAttribute("aria-label") === label,
  );
  if (found === undefined) throw new Error(`seam not rendered: ${label}`);
  return found;
};

const sideSeam = (container: HTMLElement): HTMLElement =>
  seamByLabel(container, "Ширина мета-панели");
const dockSeam = (container: HTMLElement): HTMLElement =>
  seamByLabel(container, "Ширина панели сессий");

const labelled = (container: HTMLElement, label: string): HTMLElement[] =>
  [...container.querySelectorAll<HTMLElement>("[aria-label]")].filter(
    (el) => el.getAttribute("aria-label") === label,
  );

const treeHeading = (container: HTMLElement): HTMLElement | null =>
  [...container.querySelectorAll("h2")].find(
    (el) => el.textContent === "Хосты и агенты",
  ) ?? null;

async function keyOn(
  element: HTMLElement,
  type: "keydown" | "keyup" | "dblclick" | "focusin",
  keyName?: string,
): Promise<void> {
  await act(async () => {
    if (type === "dblclick") {
      element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    } else if (type === "focusin") {
      element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    } else {
      element.dispatchEvent(
        new KeyboardEvent(type, {
          key: keyName ?? "",
          bubbles: true,
          cancelable: true,
        }),
      );
    }
  });
}

const dockHrefs = (container: HTMLElement): string[] => {
  const dock = labelled(container, "Сессии")[0];
  if (dock === undefined) throw new Error("dock not rendered");
  return [...dock.querySelectorAll("a")].map((el) => el.getAttribute("href") ?? "");
};

afterEach(async () => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("KoraWorkspace frame (07l §3; Kora IDE В1 — three zones)", () => {
  it("the dock seam is an honest separator bound to the grid variable (vesmaro.koraDockW)", () => {
    const { container } = mountWorkspace();
    const seam = dockSeam(container);
    expect(seam.getAttribute("aria-orientation")).toBe("vertical");
    expect(seam.getAttribute("aria-valuemin")).toBe("220");
    expect(seam.getAttribute("aria-valuemax")).toBe("380");
    expect(seam.getAttribute("aria-valuenow")).toBe("300");
    const grid = container.querySelector<HTMLElement>('[style*="--kora-dock-w"]');
    expect(grid?.getAttribute("style")).toContain("--kora-dock-w: 300px");
  });

  it("the side seam keeps its KW4 contract (240–420, def 320, vesmaro.koraRightW)", () => {
    const { container } = mountWorkspace();
    const seam = sideSeam(container);
    expect(seam.getAttribute("aria-valuemin")).toBe("240");
    expect(seam.getAttribute("aria-valuemax")).toBe("420");
    expect(seam.getAttribute("aria-valuenow")).toBe("320");
    const grid = container.querySelector<HTMLElement>('[style*="--kora-right-w"]');
    expect(grid?.getAttribute("style")).toContain("--kora-right-w: 320px");
  });

  it("THREE zones: dock + center + panel, TWO seams, the dead left key stays dead", () => {
    const { container } = mountWorkspace();
    // The dead KW4 key/var is never read nor rendered (gate: koraLeftW ignored).
    expect(container.innerHTML).not.toContain("--kora-left-w");
    expect(container.innerHTML).not.toContain("koraLeftW");
    // Exactly TWO separators — the dock's and the panel's.
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(2);
    // The three-column cut: dock var | center 1fr | right var.
    const grid = container.querySelector<HTMLElement>('[style*="--kora-dock-w"]');
    expect(grid?.className).toContain(
      "lg:grid-cols-[var(--kora-dock-w)_minmax(0,1fr)_var(--kora-right-w)]",
    );
    // The landmarks: the dock «Сессии» and the panel «Дерево и мета», one each.
    expect(labelled(container, "Сессии")).toHaveLength(1);
    expect(labelled(container, "Дерево и мета")).toHaveLength(1);
    // The v2 tree still rides INSIDE the panel (not a standalone column).
    expect(labelled(container, "Дерево и мета")[0].contains(treeHeading(container))).toBe(
      true,
    );
  });

  it("the pin «Чат с кластером» lives in the DOCK now (route /kora/hermes untouched)", () => {
    const { container } = mountWorkspace();
    const dock = labelled(container, "Сессии")[0];
    const panel = labelled(container, "Дерево и мета")[0];
    const pin = dock.querySelector<HTMLAnchorElement>('a[href="/kora/hermes"]');
    expect(pin).not.toBeNull();
    expect(pin?.textContent).toContain("Чат с кластером");
    // The panel is pin-free — the tree leads with the search.
    expect(panel.querySelector('a[href="/kora/hermes"]')).toBeNull();
  });

  it("a keyboard series persists the dock width on keyup (vesmaro.koraDockW)", async () => {
    const { container } = mountWorkspace();
    const seam = dockSeam(container);
    await keyOn(seam, "focusin");
    // The dock's edge is its RIGHT one (dragSign −1): ArrowRight widens.
    await keyOn(seam, "keydown", "ArrowRight");
    await keyOn(seam, "keyup", "ArrowRight");
    expect(localStorage.getItem("vesmaro.koraDockW")).toBe("316");
    expect(seam.getAttribute("aria-valuenow")).toBe("316");
  });

  it("dblclick resets the dock to the default AND persists the reset", async () => {
    localStorage.setItem("vesmaro.koraDockW", "360");
    const { container } = mountWorkspace();
    const seam = dockSeam(container);
    expect(seam.getAttribute("aria-valuenow")).toBe("360");
    await keyOn(seam, "dblclick");
    expect(localStorage.getItem("vesmaro.koraDockW")).toBe("300");
    expect(seam.getAttribute("aria-valuenow")).toBe("300");
  });

  it("K-INV-1 «док неподвижен»: selecting a session changes nothing in the dock", () => {
    const first = mountWorkspace();
    const dock = labelled(first.container, "Сессии")[0];
    const seam = dockSeam(first.container);
    const before = {
      hrefs: dockHrefs(first.container),
      seamNow: seam.getAttribute("aria-valuenow"),
      style: first.container
        .querySelector<HTMLElement>('[style*="--kora-dock-w"]')
        ?.getAttribute("style"),
      scroll: (() => {
        dock.scrollTop = 25;
        return dock.scrollTop;
      })(),
    };
    expect(before.hrefs.length).toBeGreaterThan(0);

    // THE selection: the center turns into the frozen session mode.
    first.rerender({ sessionId: "exec-zcode-main:sess_7f3a91" });

    const dockAfter = labelled(first.container, "Сессии")[0];
    expect(dockAfter).toBe(dock); // the SAME node — no remount, no re-seed
    expect(dockHrefs(first.container)).toEqual(before.hrefs);
    expect(dockSeam(first.container).getAttribute("aria-valuenow")).toBe(
      before.seamNow,
    );
    expect(
      first.container
        .querySelector<HTMLElement>('[style*="--kora-dock-w"]')
        ?.getAttribute("style"),
    ).toBe(before.style);
    expect(dockAfter.scrollTop).toBe(before.scroll); // scroll untouched
    // The selection reads on the row (aria-current) — and nowhere moves.
    const current = dockAfter.querySelector<HTMLAnchorElement>('[aria-current="page"]');
    expect(current?.getAttribute("href")).toBe(
      `/kora/${encodeURIComponent("exec-zcode-main:sess_7f3a91")}`,
    );
  });

  it("K-INV-1: a host selection and the cluster route leave the dock byte-still; focus never jumps", () => {
    const first = mountWorkspace();
    const dock = labelled(first.container, "Сессии")[0];
    const input = dock.querySelector<HTMLInputElement>("input[type='search']");
    act(() => {
      input?.focus();
    });
    expect(document.activeElement).toBe(input);
    const beforeHrefs = dockHrefs(first.container);
    const beforeSeam = dockSeam(first.container).getAttribute("aria-valuenow");

    // Host context: the center turns into the field, the dock holds still.
    first.rerender({ host: "abyss-laptop" });
    expect(labelled(first.container, "Сессии")[0]).toBe(dock);
    expect(dockHrefs(first.container)).toEqual(beforeHrefs);
    expect(dockSeam(first.container).getAttribute("aria-valuenow")).toBe(beforeSeam);

    // Cluster route: same stillness.
    first.rerender({ cluster: true });
    expect(labelled(first.container, "Сессии")[0]).toBe(dock);
    expect(dockHrefs(first.container)).toEqual(beforeHrefs);
    // The focus STAYED on the dock's search input through all selections —
    // no reflow, no focus theft (the anti-pattern the dock exists to kill).
    expect(document.activeElement).toBe(input);
  });

  it("the dock rows deep-link the frozen /kora/:sessionId (K-INV-2)", () => {
    const { container } = mountWorkspace();
    const hrefs = dockHrefs(container);
    expect(hrefs).toContain("/kora/hermes"); // the pin
    expect(hrefs).toContain(`/kora/${encodeURIComponent("exec-zcode-main:sess_7f3a91")}`);
    expect(hrefs.some((href) => href.startsWith("/kora/host/"))).toBe(false);
  });

  it("K-DOCK-SEARCH-0: the dock search is honest about zero matches", () => {
    const { container } = mountWorkspace();
    const dock = labelled(container, "Сессии")[0];
    const input = dock.querySelector<HTMLInputElement>("input[type='search']");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(input, "такого-нет-нигде");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(dock.textContent).toContain("Ничего не найдено");
    const status = dock.querySelector("p[role='status']");
    expect(status?.textContent).toContain("найдено: 0");
    // No session rows anywhere in the dock while the query holds.
    expect(dock.querySelectorAll('a[href^="/kora/exec-"], a[aria-current]')).toHaveLength(
      0,
    );
  });

  it("the dock view switcher persists its choice (vesmaro.koraDockView) and regroups", () => {
    const { container } = mountWorkspace();
    const dock = labelled(container, "Сессии")[0];
    const hostViewButton = [...dock.querySelectorAll("button")].find(
      (el) => el.textContent === "По хосту",
    );
    expect(hostViewButton?.getAttribute("aria-pressed")).toBe("false");
    act(() => {
      hostViewButton?.click();
    });
    expect(localStorage.getItem("vesmaro.koraDockView")).toBe("host");
    expect(hostViewButton?.getAttribute("aria-pressed")).toBe("true");
    // The host view: host → harness disclosure groups carry the sessions.
    expect(dock.textContent).toContain("abyss-laptop");
    expect(dock.textContent).toContain("pi-edge");
  });

  it("the dock group toggle persists the open-set (vesmaro.koraDockGroups)", () => {
    const { container } = mountWorkspace();
    const dock = labelled(container, "Сессии")[0];
    const toggle = dock.querySelector<HTMLButtonElement>("button[aria-expanded]");
    expect(toggle).not.toBeNull();
    const wasOpen = toggle?.getAttribute("aria-expanded") === "true";
    const controls = toggle?.getAttribute("aria-controls");
    act(() => {
      toggle?.click();
    });
    const stored = JSON.parse(localStorage.getItem("vesmaro.koraDockGroups") ?? "[]");
    expect(Array.isArray(stored)).toBe(true);
    // The stored keys are the RAW group keys; the DOM id is their digest
    // form (koraGroupListId) — the flip mirrors into storage exactly.
    expect(stored.every((key: unknown) => typeof key === "string")).toBe(true);
    expect(
      stored.some((key: string) => koraGroupListId(key) === controls),
    ).toBe(!wasOpen);
    expect(toggle?.getAttribute("aria-expanded")).toBe(String(!wasOpen));
  });

  it("K-PERSIST-FAIL: a refused write names itself — nothing pretends to persist", () => {
    // The storage keeps reads but refuses every write (private-mode quota).
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
      clear: () => undefined,
    });
    const { container } = mountWorkspace();
    expect(container.textContent).not.toContain("Не сохранилось");
    const dock = labelled(container, "Сессии")[0];
    // A dock view write fails → the honest bit appears.
    act(() => {
      [...dock.querySelectorAll("button")]
        .find((el) => el.textContent === "По хосту")
        ?.click();
    });
    expect(container.textContent).toContain(
      "Не сохранилось — хранилище браузера недоступно",
    );
  });
});
