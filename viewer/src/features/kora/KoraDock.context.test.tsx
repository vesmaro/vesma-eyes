// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { KoraDock } from "./KoraDock";
import { buildKoraTree } from "./koraWorkspaceModel";
import { KORA_FIXTURE_SESSIONS } from "./koraFixtures";
import type { KoraRegistryEmpty } from "./KoraWorkzone";
import type { ExecutorItem } from "@/gateway/boardTypes";
import { I18nProvider } from "@/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The dock's CONTEXT filter (kora-ide В3, contract §2.3): a harness click
 * in the tree filters the dock to that harness's sessions, a host click to
 * the host's — «переключение харнеса → динамический список сессий». The
 * filter is a pure derivation over the ALREADY-LOADED slice (acceptance
 * (в): no queries beyond the registry — the dock receives props only), it
 * names itself honestly in the status line with the one-click way out, and
 * an empty context reads K-DOCK-FILTERED-EMPTY.
 */

function executor(
  id: string,
  harness: string,
  host: string,
  presence: ExecutorItem["presence"] = "online",
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
    presence,
    registered_via: "",
    registered_at: "2026-09-20T09:00:00Z",
    updated_at: "2026-09-24T11:00:00Z",
  };
}

const EXECUTORS = [
  executor("exec-zcode-main", "zcode", "abyss-laptop"),
  executor("exec-vscode-lab", "vscode", "abyss-laptop"),
  executor("exec-pi-edge", "pi", "pi-edge", "offline"),
];

const MODEL = buildKoraTree(KORA_FIXTURE_SESSIONS, EXECUTORS);

function mountDock(props: {
  contextHost?: string | null;
  contextExecutorId?: string | null;
}): { container: HTMLElement; root: Root } {
  localStorage.setItem("vesmaro.koraDockView", "timeline");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <I18nProvider initialLang="ru">
        <MemoryRouter initialEntries={["/kora"]}>
          <KoraDock
            items={KORA_FIXTURE_SESSIONS}
            model={MODEL}
            dockReady={true}
            registryEmpty={null as KoraRegistryEmpty}
            {...props}
          />
        </MemoryRouter>
      </I18nProvider>,
    );
  });
  return { container, root };
}

/** The dock's session rows (the /kora/:sessionId deep links — not the
 * host-route links, not the cluster pin; react-router serializes the id's
 * colon percent-encoded). The TIMELINE view is pinned for every mount, so
 * the rows are flat links — no folded group hides one. */
const sessionRows = (container: HTMLElement): string[] =>
  [
    ...container.querySelectorAll("a[href^='/kora/']"),
  ]
    .map((el) => el.getAttribute("href") ?? "")
    .map((href) => decodeURIComponent(href))
    .filter((href) => !href.startsWith("/kora/host/") && href !== "/kora/hermes");

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("KoraDock context filter (В3)", () => {
  it("a harness context keeps only that harness's rows and names itself honestly", () => {
    const { container } = mountDock({ contextExecutorId: "exec-zcode-main" });
    expect(sessionRows(container)).toEqual(["/kora/exec-zcode-main:sess_7f3a91"]);
    expect(container.textContent).toContain("Фильтр: zcode@abyss-laptop");
    expect(container.textContent).toContain("показать все");
  });

  it("a host context keeps the host's agents' rows (both abyss-laptop harnesses)", () => {
    const { container } = mountDock({ contextHost: "abyss-laptop" });
    expect(sessionRows(container)).toEqual([
      "/kora/exec-zcode-main:sess_7f3a91",
      "/kora/exec-vscode-lab:a83f1c22",
    ]);
    expect(container.textContent).toContain("Фильтр: abyss-laptop");
  });

  it("a registry-miss context reads the mono id and the honest filtered-empty", () => {
    const { container } = mountDock({ contextExecutorId: "exec-ghost" });
    expect(container.textContent).toContain("Под этот фильтр сессий нет");
    expect(container.textContent).toContain("показать все");
    expect(sessionRows(container)).toEqual([]);
  });

  it("no context: the full slice, no filter line", () => {
    const { container } = mountDock({});
    expect(container.textContent).not.toContain("Фильтр:");
    // zcode + vscode + pi + 2 hermes rows = 5 fixture sessions.
    expect(sessionRows(container).length).toBe(5);
  });

  it("K-INV-1: the dock machinery never moves — the pin, the view switcher and the search render with and without a context", () => {
    const without = mountDock({});
    const withContext = mountDock({ contextExecutorId: "exec-zcode-main" });
    for (const { container } of [without, withContext]) {
      expect(container.textContent).toContain("Чат с кластером");
      expect(container.textContent).toContain("По работе");
      expect(container.textContent).toContain("Таймлайн");
      expect(container.querySelector("input[type='search']")).not.toBeNull();
    }
  });
});
