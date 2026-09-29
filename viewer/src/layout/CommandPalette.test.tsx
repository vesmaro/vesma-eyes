// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { buildRoutes } from "@/app/routes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import { DensityProvider } from "@/components/density-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { HotkeysProvider } from "@/layout/Hotkeys";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { getPaletteOpen, setPaletteOpen } from "@/lib/paletteState";
import type { SearchResult } from "@/gateway/types";

/**
 * Command-palette interaction gates (UX-overhaul §7.3, Ф2) over the REAL
 * route table in a real DOM:
 *   1. ⌘K / Ctrl+K opens the dialog (from anywhere — the global hotkey);
 *      Esc closes;
 *   2. the bare `/` opens it with Память as the FIRST section (the old
 *      focus-search promise, J3) and the empty query shows navigation only;
 *   3. typing raises the honest sections — memory hits carry their store
 *      provenance («где лежит»), the registry answers with APPROVED agents
 *      only (pending/revoked never surface);
 *   4. ↑/↓ walk the flattened rows with wrap-around; Enter activates the
 *      selection through the router (memory row → /memory/:id?return=…);
 *   5. a task row navigates WITH its return= context (UI-18 through the
 *      palette);
 *   6. an empty memory result offers «Расширенный поиск» → /memory/search?q=…
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let router: ReturnType<typeof createMemoryRouter> | null = null;

/** The palette's memory leg rides the existing search endpoint; the stub
 * answers with the board-wire shape (hits carry the store name). */
const PROVENANCE_HITS: SearchResult[] = [
  {
    id: "bd945a48-0888-4b1f-9ebb-841519e5f8b9",
    title: "Снять corpus с живого борда для Ф2",
    content: "recorded corpus",
    tags: [],
    score: 0.9,
    search_type: "fts",
    server: "laptop",
  },
];

async function mount(
  seed: (client: QueryClient, gateway: MockAdapter) => Promise<void> = async () => {},
): Promise<MockAdapter> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  const gateway = new MockAdapter({ latency: false });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await seed(queryClient, gateway);
  router = createMemoryRouter(buildRoutes(), { initialEntries: ["/"] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <GatewayContext.Provider value={gateway}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider adapterMode="mock" endpoint="/api">
              <I18nProvider initialLang="en">
                <DensityProvider initialDensity="comfortable">
                  <HotkeysProvider>
                    <ToastProvider>
                      <UiTokenProvider>
                        <RouterProvider router={router!} />
                      </UiTokenProvider>
                    </ToastProvider>
                  </HotkeysProvider>
                </DensityProvider>
              </I18nProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return gateway;
}

async function waitFor(
  what: string,
  probe: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (probe()) return;
    if (Date.now() > deadline) {
      throw new Error(
        `waitFor(${what}) timed out; body text: ${document.body.textContent?.slice(0, 400)}`,
      );
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

/** Dispatch a keydown on the window (the hotkey listener's surface). */
async function pressKey(init: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
}): Promise<void> {
  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: init.key,
        metaKey: init.metaKey ?? false,
        ctrlKey: init.ctrlKey ?? false,
        bubbles: true,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function type(query: string): Promise<void> {
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>(
      "[role='dialog'] input[role='combobox']",
    );
    expect(input, "palette combobox input must exist").toBeDefined();
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input!, query);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function pressInInput(key: string): Promise<void> {
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>(
      "[role='dialog'] input[role='combobox']",
    );
    input!.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[role='dialog']");
}

function options(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[role='option']")];
}

function activeOption(): HTMLElement | null {
  const input = document.querySelector<HTMLInputElement>(
    "[role='dialog'] input[role='combobox']",
  );
  const id = input?.getAttribute("aria-activedescendant");
  return id ? document.getElementById(id) : null;
}

function groupLabels(): string[] {
  return [
    ...document.querySelectorAll<HTMLElement>("[role='group'] > div[id]"),
  ].map((element) => element.textContent ?? "");
}

function location(): string {
  return router!.state.location.pathname + router!.state.location.search;
}

async function seedPaletteData(
  client: QueryClient,
  gateway: MockAdapter,
): Promise<void> {
  await client.prefetchQuery({
    queryKey: keys.tasks.board(),
    queryFn: () => gateway.board(),
  });
  await client.prefetchQuery({
    queryKey: keys.agents.executors.list(),
    queryFn: () => gateway.listExecutors(),
  });
}

beforeEach(() => {
  localStorage.clear();
  setPaletteOpen(false);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  router = null;
});

describe("CommandPalette (Ф2, UX-overhaul §7.3)", () => {
  it("⌘K opens the dialog; the input is focused with combobox semantics; Esc closes", async () => {
    await mount();
    expect(getPaletteOpen()).toBe(false);
    expect(dialog()).toBeNull();

    await pressKey({ key: "k", metaKey: true });
    await waitFor("palette dialog", () => dialog() !== null);
    expect(getPaletteOpen()).toBe(true);
    const input = document.querySelector<HTMLInputElement>(
      "[role='dialog'] input[role='combobox']",
    );
    expect(input).toBeDefined();
    expect(document.activeElement).toBe(input);
    expect(input!.getAttribute("aria-expanded")).toBe("true");
    expect(input!.getAttribute("aria-controls")).toBe("command-palette-listbox");
    expect(input!.getAttribute("placeholder")).toBe(
      "Memory, tasks, agents, navigation — start typing",
    );

    await pressInInput("Escape");
    await waitFor("palette closed", () => dialog() === null);
    expect(getPaletteOpen()).toBe(false);
  });

  it("Ctrl+K opens it too (non-mac hosts)", async () => {
    await mount();
    await pressKey({ key: "k", ctrlKey: true });
    await waitFor("palette dialog", () => dialog() !== null);
  });

  it("the bare `/` opens the palette; the empty query shows navigation only", async () => {
    await mount();
    await pressKey({ key: "/" });
    await waitFor("palette dialog", () => dialog() !== null);

    // Honest empty state: no fake sections — only the route index speaks.
    expect(groupLabels()).toEqual(["Go to"]);
    expect(document.body.textContent).toContain("Overview");
    expect(document.body.textContent).toContain("/memory/pulse");
  });

  it("typing raises the honest sections: memory with PROVENANCE, tasks by id", async () => {
    const gateway = await mount(async (client, mock) => {
      await seedPaletteData(client, mock);
      mock.search = vi.fn(async () => PROVENANCE_HITS);
    });

    await pressKey({ key: "/" });
    await waitFor("palette dialog", () => dialog() !== null);
    await type("TB");
    await waitFor(
      "memory+tasks sections",
      () => groupLabels().join("|") === "Memory|Tasks",
      3000,
    );
    expect(gateway.search).toHaveBeenCalledWith(
      { query: "TB", limit: 5 },
      expect.anything(),
    );
    // The hit's hint is WHERE IT LIES (the store name) — provenance, Ф2.
    expect(document.body.textContent).toContain("Снять corpus с живого борда для Ф2");
    expect(document.body.textContent).toContain("laptop");
    // Task rows match id and title, the hint carries the id.
    expect(options().some((option) => option.textContent?.includes("TB-1"))).toBe(true);
  });

  it("the registry section lists APPROVED agents only (pending/revoked never surface)", async () => {
    await mount(async (client, mock) => {
      await seedPaletteData(client, mock);
      mock.search = vi.fn(async () => PROVENANCE_HITS);
    });
    await pressKey({ key: "k", metaKey: true });
    await waitFor("palette dialog", () => dialog() !== null);

    await type("zcode");
    await waitFor(
      "memory+agents sections",
      () => groupLabels().join("|") === "Memory|Agents",
      3000,
    );
    expect(document.body.textContent).toContain("zcode@laptop");
    expect(document.body.textContent).toContain("zcode@mesh-2");

    // The pending (copilot@new-host) and revoked (copilot@old-host) fixture
    // rows are not agents yet — a copilot query finds NOTHING.
    await type("copilot");
    await waitFor(
      "no rows for the non-agents",
      () => options().length === 0,
      3000,
    );
    expect(document.body.textContent).not.toContain("copilot@new-host");
  });

  it("↑/↓ walk the flattened rows with wrap-around; Enter navigates the selection", async () => {
    await mount(async (client, mock) => {
      await seedPaletteData(client, mock);
      mock.search = vi.fn(async () => PROVENANCE_HITS);
    });
    await pressKey({ key: "/" });
    await waitFor("palette dialog", () => dialog() !== null);
    await type("TB-1"); // memory hit + the TB-1*/tasks rows
    // The nav rows render instantly (the route index needs no wire) — the
    // walk starts only when the DEBOUNCED memory search has landed and the
    // flat list really begins with the memory section.
    await waitFor(
      "memory row first",
      () => options()[0]?.id.includes("memory") === true && options().length >= 3,
      3000,
    );

    // The first row owns the initial selection.
    expect(activeOption()).toBe(options()[0]);
    await pressInInput("ArrowDown");
    expect(activeOption()).toBe(options()[1]);
    // Wrap up past the top → the LAST row.
    await pressInInput("ArrowUp");
    await pressInInput("ArrowUp");
    expect(activeOption()).toBe(options()[options().length - 1]);
    // Wrap down past the bottom → the FIRST row again.
    await pressInInput("ArrowDown");
    expect(activeOption()).toBe(options()[0]);

    // Enter activates through the router: the memory row → its detail page
    // WITH the source context (UI-18) — the palette was opened from "/".
    await pressInInput("Enter");
    await waitFor("navigated", () => location() !== "/");
    expect(location()).toContain("/memory/bd945a48");
    expect(location()).toContain(`return=${encodeURIComponent("/")}`);
    await waitFor("dialog closed", () => dialog() === null);
  });

  it("a task row navigates WITH its return= context (UI-18 through the palette)", async () => {
    await mount(async (client, mock) => {
      await seedPaletteData(client, mock);
      mock.search = vi.fn(async () => []);
    });
    await pressKey({ key: "k", metaKey: true });
    await waitFor("palette dialog", () => dialog() !== null);
    await type("TB-1");
    await waitFor(
      "task row",
      () => options().some((option) => option.textContent?.includes("TB-1")),
      3000,
    );

    const taskRow = options().find((option) => option.textContent?.includes("TB-1"));
    await act(async () => {
      (taskRow!.querySelector("button") as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await waitFor("navigated to the task", () => location().startsWith("/tasks/TB-1"));
    // The detail page received the SOURCE context (the overview, here "/").
    expect(location()).toContain(`return=${encodeURIComponent("/")}`);
  });

  it("an empty memory result offers «Расширенный поиск» → /memory/search?q=…", async () => {
    const gateway = await mount(async (client, mock) => {
      await seedPaletteData(client, mock);
    });
    gateway.search = vi.fn(async () => []);

    await pressKey({ key: "/" });
    await waitFor("palette dialog", () => dialog() !== null);
    await type("zzzz-nothing");
    await waitFor(
      "extended search row",
      () => document.body.textContent!.includes("Advanced search"),
      3000,
    );
    const row = options().find((option) =>
      option.textContent?.includes("Advanced search"),
    );
    expect(row).toBeDefined();
    expect(row!.textContent).toContain("/memory/search?q=zzzz-nothing");
  });
});
