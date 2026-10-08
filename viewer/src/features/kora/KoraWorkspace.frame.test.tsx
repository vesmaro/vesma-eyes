// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { KoraWorkspace } from "./KoraWorkspace";
import { KoraMockAdapter } from "./KoraMockAdapter";
import { KoraGatewayContext } from "./koraGatewayContext";
import { koraKeys } from "./useKora";
import { KORA_FIXTURE_COVERAGE, KORA_FIXTURE_SESSIONS } from "./koraFixtures";
import type { ExecutorsPage } from "@/gateway/boardTypes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The v7 frame at the WORKSPACE level (U5, 07l §3 — the finale blocker's
 * page wiring): the right-panel seam persists through the workspace's OWN
 * callbacks (vesmaro.koraRightW), the CSS variable carries the width to the
 * grid, dblclick resets to the documented default, and the 401 gate keeps
 * the document flow (no seams outside the frame). The handle mechanics
 * themselves are KoraResizeHandle's tests.
 */

const PAGE_SIZE = 50;

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

function mountWorkspace(): { container: HTMLElement; root: Root } {
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

const sideSeam = (container: HTMLElement): HTMLElement => {
  const found = [...container.querySelectorAll<HTMLElement>('[role="separator"]')].find(
    (el) => el.getAttribute("aria-label") === "Ширина панели хостов и сессий",
  );
  if (found === undefined) throw new Error("side seam not rendered");
  return found;
};

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

afterEach(async () => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("KoraWorkspace frame (U5, 07l §3)", () => {
  it("the side seam is an honest separator bound to the grid variable", () => {
    const { container } = mountWorkspace();
    const seam = sideSeam(container);
    expect(seam.getAttribute("aria-orientation")).toBe("vertical");
    expect(seam.getAttribute("aria-valuemin")).toBe("240");
    expect(seam.getAttribute("aria-valuemax")).toBe("420");
    expect(seam.getAttribute("aria-valuenow")).toBe("320");
    const grid = container.querySelector<HTMLElement>('[style*="--kora-right-w"]');
    expect(grid?.getAttribute("style")).toContain("--kora-right-w: 320px");
  });

  it("a keyboard series persists the width on keyup (vesmaro.koraRightW)", async () => {
    const { container } = mountWorkspace();
    const seam = sideSeam(container);
    await keyOn(seam, "focusin");
    await keyOn(seam, "keydown", "ArrowLeft");
    await keyOn(seam, "keyup", "ArrowLeft");
    expect(localStorage.getItem("vesmaro.koraRightW")).toBe("336");
    expect(seam.getAttribute("aria-valuenow")).toBe("336");
  });

  it("dblclick resets to the default AND persists the reset", async () => {
    localStorage.setItem("vesmaro.koraRightW", "400");
    const { container } = mountWorkspace();
    const seam = sideSeam(container);
    expect(seam.getAttribute("aria-valuenow")).toBe("400");
    await keyOn(seam, "dblclick");
    expect(localStorage.getItem("vesmaro.koraRightW")).toBe("320");
    expect(seam.getAttribute("aria-valuenow")).toBe("320");
  });

  it("the Эфир empty state is honest on the scene (a silent bus = zero rows)", () => {
    const { container } = mountWorkspace();
    expect(container.textContent).toContain(
      "Событий пока нет — лента собирает то, что происходит в сессиях, пока вы на странице",
    );
  });
});
