// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Sidebar } from "./Sidebar";
import { BoardAdapter } from "@/gateway/BoardAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { HotkeysProvider } from "@/layout/Hotkeys";
import { I18nProvider } from "@/i18n";

/**
 * Dead-expand guard (journey over prod 1.81.0, wave ux-sidebar-tasks): from
 * a NON-task route the «Задачи» group row must never dead-end — the first
 * click opens the submenu (Канбан/Список/Активность/Входящие/Архив live
 * links), and a second click ENTERS the domain root (/tasks) instead of
 * just collapsing back. The ACTIVE domain's row keeps its pure toggle (the
 * on-route behaviour is untouched), and the rule is uniform for every group
 * domain (Память as the neighbour sample). aria-expanded stays honest and
 * the row stays a real keyboard-activatable button.
 *
 * happy-dom has no layout engine, so «visible» is asserted at the state
 * seam the component itself owns: the reveal container flips the
 * `visible`/`invisible` classes (closed sections also leave the tab order
 * via that visibility pair).
 */

function stubMatchMedia(matches: boolean): void {
  const stub = (query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  (globalThis as { matchMedia: unknown }).matchMedia = stub;
  (window as { matchMedia: unknown }).matchMedia = stub;
}

const healthProbeNeverFetch: typeof fetch = () => new Promise(() => undefined);

function click(element: HTMLElement): void {
  act(() => {
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

const mountedRoots: Root[] = [];

beforeEach(() => {
  stubMatchMedia(true); // desktop: the inline expanded panel
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) {
    await act(async () => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
});

/** Renders the desktop sidebar at `initialPath`; records the live pathname. */
async function mountSidebar(initialPath: string): Promise<{
  container: HTMLElement;
  location: { pathname: string };
}> {
  const location = { pathname: initialPath };
  function LocationProbe(): null {
    const { pathname } = useLocation();
    location.pathname = pathname;
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <GatewayContext.Provider
        value={
          new BoardAdapter({ baseUrl: "/api", fetchImpl: healthProbeNeverFetch })
        }
      >
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: { queries: { enabled: false, retry: false } },
            })
          }
        >
          <I18nProvider initialLang="ru">
            <HotkeysProvider>
              <MemoryRouter initialEntries={[initialPath]}>
                <LocationProbe />
                <Sidebar collapsed={false} onToggle={() => undefined} />
              </MemoryRouter>
            </HotkeysProvider>
          </I18nProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return { container, location };
}

function tasksRow(container: HTMLElement): HTMLButtonElement {
  const row = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Задачи"]',
  );
  if (!row) throw new Error("tasks group row not found");
  return row;
}

/** The reveal container that owns the submenu's visibility state. */
function tasksReveal(container: HTMLElement): HTMLElement {
  const link = container.querySelector<HTMLElement>('a[href="/tasks/list"]');
  if (!link) throw new Error("tasks submenu (Список link) not found");
  const reveal = link.closest<HTMLElement>("div.grid");
  if (!reveal) throw new Error("tasks reveal container not found");
  return reveal;
}

function sectionLink(
  container: HTMLElement,
  href: string,
): HTMLAnchorElement | null {
  return container.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
}

describe("«Задачи» group row from a NON-task route (dead-expand guard)", () => {
  it("first click from Обзор opens the submenu with the five live sections", async () => {
    const { container, location } = await mountSidebar("/");
    const row = tasksRow(container);
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(tasksReveal(container).className).toContain("invisible");

    click(row);

    expect(row.getAttribute("aria-expanded")).toBe("true");
    const reveal = tasksReveal(container);
    expect(reveal.className).toContain("visible");
    expect(reveal.className).not.toContain("invisible");
    // The five working items of the stand order, all real links.
    for (const href of [
      "/tasks",
      "/tasks/list",
      "/tasks/activity",
      "/tasks/inbox",
      "/tasks/archive",
    ]) {
      expect(sectionLink(container, href)).not.toBeNull();
    }
    // Still on the overview — the first click is the reveal, not a hijack.
    expect(location.pathname).toBe("/");
  });

  it("second click from Обзор ENTERS /tasks instead of collapsing (the click is not eaten)", async () => {
    const { container, location } = await mountSidebar("/");
    const row = tasksRow(container);
    click(row); // open
    click(row); // was a bare toggle → the accordion ate the click

    expect(location.pathname).toBe("/tasks");
    // Honest disclosure: the submenu IS open after landing (active domain
    // auto-open), and the kanban section claims aria-current.
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(tasksReveal(container).className).toContain("visible");
    expect(
      sectionLink(container, "/tasks")?.getAttribute("aria-current"),
    ).toBe("page");
  });

  it("the same contract from a second non-task route (Кора)", async () => {
    const { container, location } = await mountSidebar("/kora");
    const row = tasksRow(container);
    click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(tasksReveal(container).className).toContain("visible");
    expect(location.pathname).toBe("/kora");
    click(row);
    expect(location.pathname).toBe("/tasks");
  });

  it("the neighbour sample (Память) behaves the same — the rule is uniform", async () => {
    const { container, location } = await mountSidebar("/");
    const row = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Память"]',
    );
    if (!row) throw new Error("memory group row not found");
    click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    click(row);
    expect(location.pathname).toBe("/memory");
  });

  it("the row is a real button — focusable, platform keyboard activation", async () => {
    const { container } = await mountSidebar("/");
    const row = tasksRow(container);
    row.focus();
    expect(document.activeElement).toBe(row);
  });
});

describe("«Задачи» group row ON the tasks domain (on-route behaviour unchanged)", () => {
  it("the active domain's row stays a pure toggle — it never hijacks the click", async () => {
    const { container, location } = await mountSidebar("/tasks");
    const row = tasksRow(container);
    // Auto-opened on arrival, as before.
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(tasksReveal(container).className).toContain("visible");

    click(row);
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(tasksReveal(container).className).toContain("invisible");
    expect(location.pathname).toBe("/tasks");

    click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(location.pathname).toBe("/tasks");
  });
});
