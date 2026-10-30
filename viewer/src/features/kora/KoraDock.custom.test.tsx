// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { KoraDock } from "./KoraDock";
import { buildKoraTree } from "./koraWorkspaceModel";
import { KORA_FIXTURE_SESSIONS } from "./koraFixtures";
import { resetKoraDockCustomForTests } from "./koraDockCustomStore";
import type { KoraRegistryEmpty } from "./KoraWorkzone";
import type { ExecutorItem } from "@/gateway/boardTypes";
import { I18nProvider } from "@/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The dock CUSTOMIZATION (kora-ide В4, contract §3.1/§7 В4): the
 * pin-SECTION of sessions (a LOCAL shelf above the views), the LOCAL
 * aliases (the «локально» badge — the server name stays the tooltip and
 * the honest key; renaming NEVER rewrites it), the LOCAL hiding (the
 * K-DOCK-HIDDEN line «скрыты локально: N — показать»), the search
 * reading aliases and excluding hidden rows, and the honest
 * K-PERSIST-FAIL line for a refused customization write.
 */

function executor(
  id: string,
  harness: string,
  host: string,
): ExecutorItem {
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

const EXECUTORS = [executor("exec-zcode-main", "zcode", "abyss-laptop")];
const MODEL = buildKoraTree(KORA_FIXTURE_SESSIONS, EXECUTORS);

const mountedRoots: Root[] = [];

function mountDock(): { container: HTMLElement; root: Root } {
  // The TIMELINE view: one flat list — every row reachable without
  // unfolding a group (the customization tests hide rows one by one).
  localStorage.setItem("vesmaro.koraDockView", "timeline");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      <I18nProvider initialLang="ru">
        <MemoryRouter initialEntries={["/kora"]}>
          <KoraDock
            items={KORA_FIXTURE_SESSIONS}
            model={MODEL}
            dockReady={true}
            registryEmpty={null as KoraRegistryEmpty}
          />
        </MemoryRouter>
      </I18nProvider>,
    );
  });
  return { container, root };
}

/** The row's actions menu: open it for the FIRST row and click a command. */
function rowAction(container: HTMLElement, action: string): void {
  const trigger = container.querySelector<HTMLButtonElement>(
    '[data-testid="kora-dock-row-menu"]',
  );
  if (trigger === null) throw new Error("row menu trigger not rendered");
  act(() => {
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const row = container.querySelector<HTMLButtonElement>(
    `[data-testid="kora-dock-row-${action}"]`,
  );
  if (row === null) throw new Error(`row action ${action} not rendered`);
  act(() => {
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Session rows only — the cluster pin (/kora/hermes) is not one. */
const sessionRows = (container: HTMLElement): NodeListOf<HTMLAnchorElement> =>
  container.querySelectorAll<HTMLAnchorElement>(
    "a[href^='/kora/']:not([href='/kora/hermes'])",
  );

const firstRowText = (container: HTMLElement): string =>
  sessionRows(container)[0]?.textContent ?? "";

/** Any stored alias value (the key carries the fixture session's id). */
const aliasStored = (): string | null => {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("vesmaro.koraAlias:")) return localStorage.getItem(key);
  }
  return null;
};

beforeEach(() => {
  localStorage.clear();
  resetKoraDockCustomForTests();
});

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) {
    root.unmount();
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("KoraDock customization (В4)", () => {
  it("pins a row into the pin-SECTION above the views; unpin removes it", () => {
    const { container } = mountDock();
    expect(container.querySelector('[data-testid="kora-dock-pin-section"]')).toBeNull();
    rowAction(container, "pin");
    const section = container.querySelector('[data-testid="kora-dock-pin-section"]');
    expect(section).not.toBeNull();
    // The pinned row links the frozen deep link and sits ABOVE the views.
    expect(sessionRows(section as HTMLElement)[0]).not.toBeUndefined();
    // Unpin through the section row's own menu.
    rowAction(container, "pin");
    expect(container.querySelector('[data-testid="kora-dock-pin-section"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem("vesmaro.koraDockPins") ?? "[]")).toEqual([]);
  });

  it("renames LOCALLY: the alias shows with the «локально» badge, the server name stays the tooltip", () => {
    const { container } = mountDock();
    rowAction(container, "rename");
    const field = container.querySelector<HTMLInputElement>(
      '[data-testid="kora-dock-rename-input"]',
    );
    expect(field).not.toBeNull();
    const serverName = firstRowText(container);
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(field!, "Моя задача");
      field!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = container.querySelector<HTMLButtonElement>(
      '[data-testid="kora-dock-rename-save"]',
    );
    act(() => {
      save?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // The alias badge marks the LOCAL overlay honestly.
    expect(
      container.querySelector('[data-testid="kora-dock-alias-badge"]')?.textContent,
    ).toBe("локально");
    // The row displays the alias; the server name survives as the tooltip.
    const row = sessionRows(container)[0];
    expect(row?.textContent).toContain("Моя задача");
    expect(row?.textContent).not.toBe(serverName);
    expect(aliasStored()).toContain("Моя задача");
  });

  it("the search reads the LOCAL alias too", () => {
    const { container } = mountDock();
    rowAction(container, "rename");
    const field = container.querySelector<HTMLInputElement>(
      '[data-testid="kora-dock-rename-input"]',
    );
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(field!, "зазубренное-имя");
      field!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = container.querySelector<HTMLButtonElement>(
      '[data-testid="kora-dock-rename-save"]',
    );
    act(() => {
      save?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const search = container.querySelector<HTMLInputElement>("input[type='search']");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(search!, "зазубренное");
      search!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // The aliased row is found; the honest found-counter says 1.
    expect(sessionRows(container)).toHaveLength(1);
    expect(container.textContent).toContain("найдено: 1");
  });

  it("hides a row LOCALLY; the K-DOCK-HIDDEN line names the count and gives the way back", () => {
    const { container } = mountDock();
    rowAction(container, "hide");
    const rows = () => sessionRows(container).length;
    const before = rows();
    expect(before).toBeGreaterThan(0);
    const line = container.querySelector('[data-testid="kora-dock-hidden-line"]');
    expect(line?.textContent).toContain("Скрыты локально: 1");
    // «показать» restores the row (no server archive exists — nothing is
    // pretended to be gone).
    const show = container.querySelector<HTMLButtonElement>(
      '[data-testid="kora-dock-hidden-show"]',
    );
    act(() => {
      show?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(rows()).toBe(before + 1);
    expect(container.querySelector('[data-testid="kora-dock-hidden-line"]')).toBeNull();
  });

  it("K-DOCK-HIDDEN: everything hidden reads the honest explanation, not an invented empty", () => {
    const { container } = mountDock();
    // Hide every loaded row (until no row menu remains — the fixture
    // count is the upper bound, the work view's grouping re-derives
    // under us).
    for (let i = 0; i <= KORA_FIXTURE_SESSIONS.length; i++) {
      if (container.querySelector('[data-testid="kora-dock-row-menu"]') === null) break;
      rowAction(container, "hide");
    }
    expect(sessionRows(container)).toHaveLength(0);
    expect(container.textContent).toContain(
      "Все сессии этой выборки скрыты локально",
    );
    // The honest residue «Здесь сессий нет» must NOT pretend emptiness.
    expect(container.textContent).not.toContain("Здесь сессий нет");
  });

  it("hidden rows stay hidden from the search too (hidden means hidden)", () => {
    const { container } = mountDock();
    rowAction(container, "rename");
    const field = container.querySelector<HTMLInputElement>(
      '[data-testid="kora-dock-rename-input"]',
    );
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(field!, "уникальное-имя");
      field!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = container.querySelector<HTMLButtonElement>(
      '[data-testid="kora-dock-rename-save"]',
    );
    act(() => {
      save?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    rowAction(container, "hide");
    const search = container.querySelector<HTMLInputElement>("input[type='search']");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(search!, "уникальное");
      search!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // The only match is hidden — the honest zero-match reads.
    expect(sessionRows(container)).toHaveLength(0);
    expect(container.textContent).toContain("Ничего не найдено");
  });

  it("a pin past the loaded pages renders nothing (no invented rows)", () => {
    localStorage.setItem(
      "vesmaro.koraDockPins",
      JSON.stringify(["exec-ghost:not-loaded"]),
    );
    resetKoraDockCustomForTests();
    const { container } = mountDock();
    expect(container.querySelector('[data-testid="kora-dock-pin-section"]')).toBeNull();
  });

  it("a refused customization write raises the honest K-PERSIST-FAIL line", () => {
    const { container } = mountDock();
    // Refuse writes AFTER the mount (the view pre-seed writes first) —
    // private mode hits exactly the customization write.
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    rowAction(container, "pin");
    expect(container.textContent).toContain(
      "Не сохранилось — хранилище браузера недоступно",
    );
    spy.mockRestore();
  });
});
