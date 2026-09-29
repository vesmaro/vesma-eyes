// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { buildRoutes } from "@/app/routes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { DensityProvider } from "@/components/density-provider";
import { HotkeysProvider } from "@/layout/Hotkeys";
import { I18nProvider } from "@/i18n";
import { setPaletteOpen } from "@/lib/paletteState";
import { __resetForTests, __stateForTests, startVisit } from "./telemetry";

/**
 * The cmdk.* emitters through the REAL palette over the real route table:
 * open (trigger plumbing: button/hotkey) and row activation (click and
 * Enter) — including the palette attribution that lands on the following
 * ui.nav. The telemetry singleton is armed manually (the mock adapter has
 * no session wire — anonymous by construction, §1.3's mirror case).
 *
 * Route activations land through a lazy-route transition, so navigation
 * verdicts are awaited by polling (lazy chunk loads are slow in tests).
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let router: ReturnType<typeof createMemoryRouter> | null = null;

function pendingEvents(): Array<Record<string, unknown>> {
  return __stateForTests().pending as Array<Record<string, unknown>>;
}

function kinds(): string[] {
  return pendingEvents().map((event) => event.kind as string);
}

beforeEach(() => {
  __resetForTests();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => {
    root?.unmount();
    root = null;
  });
  container?.remove();
  container = null;
  router = null;
  __resetForTests();
  setPaletteOpen(false);
});

async function mountApp(): Promise<void> {
  const gateway = new MockAdapter({ latency: false });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
                    <RouterProvider router={router!} />
                  </HotkeysProvider>
                </DensityProvider>
              </I18nProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

async function waitFor(what: string, probe: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000;
  for (;;) {
    if (probe()) return;
    if (Date.now() > deadline) {
      throw new Error(
        `waitFor(${what}) timed out; events: ${JSON.stringify(pendingEvents())}`,
      );
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

async function openPalette(trigger: "button" | "hotkey"): Promise<void> {
  await act(async () => {
    setPaletteOpen(true, trigger);
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

/** Type into the palette combobox (the query never leaves the surface, §3.4). */
async function typeQuery(query: string): Promise<void> {
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
    await new Promise((resolve) => setTimeout(resolve, 260)); // debounce 200ms
  });
}

/** Click the palette row at `position`; waits for the navigation it starts. */
async function clickRow(position: number): Promise<void> {
  await act(async () => {
    const rows = document.querySelectorAll<HTMLButtonElement>(
      "[role='option'] button",
    );
    expect(rows.length, "palette rows must exist").toBeGreaterThan(position);
    rows[position].click();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

/** Press Enter on the palette combobox (the highlighted row activates). */
async function pressEnter(): Promise<void> {
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>(
      "[role='dialog'] input[role='combobox']",
    );
    expect(input, "palette combobox input must exist").toBeDefined();
    input!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

function lastNavEvent(): Record<string, unknown> | undefined {
  return pendingEvents().filter((event) => event.kind === "ui.nav").at(-1);
}

describe("cmdk emitters through the real palette (§1.2 #7, #8)", () => {
  it("opening via the TopBar path stamps trigger=button; the hotkey default stays hotkey", async () => {
    startVisit();
    await mountApp();
    await openPalette("button");
    expect(pendingEvents().at(-1)).toMatchObject({
      kind: "cmdk.palette_opened",
      trigger: "button",
    });
    await act(async () => {
      setPaletteOpen(false);
    });
    await openPalette("hotkey");
    expect(pendingEvents().at(-1)).toMatchObject({
      kind: "cmdk.palette_opened",
      trigger: "hotkey",
    });
  });

  it("re-opening without a close is idempotent (one event per real open)", async () => {
    startVisit();
    await mountApp();
    await openPalette("hotkey");
    await act(async () => {
      setPaletteOpen(true, "hotkey"); // no-op: already open
    });
    const opened = pendingEvents().filter(
      (event) => event.kind === "cmdk.palette_opened",
    );
    expect(opened).toHaveLength(1);
  });

  it("a clicked nav row emits item_selected(nav, click); the following ui.nav is palette-attributed", async () => {
    startVisit();
    await mountApp();
    await openPalette("hotkey");
    // Narrow the nav section to the Memory domain row (target /memory, so
    // the activation actually changes the route).
    await typeQuery("memory");
    await clickRow(0);
    await waitFor("item_selected + ui.nav", () => lastNavEvent() !== undefined);
    expect(pendingEvents().at(-2)).toMatchObject({
      kind: "cmdk.item_selected",
      group: "nav",
      via: "click",
    });
    expect(lastNavEvent()).toMatchObject({ surface: "memory", via: "palette" });
  });

  it("Enter on the highlighted row emits item_selected(nav, enter)", async () => {
    startVisit();
    await mountApp();
    await openPalette("hotkey");
    await typeQuery("pulse");
    await pressEnter();
    await waitFor("item_selected + ui.nav", () => lastNavEvent() !== undefined);
    expect(pendingEvents().at(-2)).toMatchObject({
      kind: "cmdk.item_selected",
      group: "nav",
      via: "enter",
    });
    expect(lastNavEvent()).toMatchObject({ surface: "memory", via: "palette" });
  });

  it("the query text NEVER boards an event (§3.4) — only group/via ride along", async () => {
    startVisit();
    await mountApp();
    await openPalette("hotkey");
    // A query with no matches: no rows, no activation — and no leak.
    await typeQuery("some private search text");
    const before = pendingEvents().length;
    expect(
      document.querySelectorAll("[role='option'] button"),
    ).toHaveLength(0);
    expect(pendingEvents()).toHaveLength(before);
    // Clear and take a real nav row: the full visit's events stay clean.
    await typeQuery("");
    await typeQuery("memory");
    await clickRow(0);
    await waitFor("navigation to settle", () => lastNavEvent() !== undefined);
    for (const event of pendingEvents()) {
      expect(JSON.stringify(event)).not.toContain("private search");
    }
    expect(kinds()).toEqual([
      "ui.visit",
      "cmdk.palette_opened",
      "cmdk.item_selected",
      "ui.nav",
    ]);
  });

  it("an anonymous (disarmed) session: the palette works, nothing emits", async () => {
    await mountApp();
    await openPalette("hotkey");
    await typeQuery("memory");
    await clickRow(0);
    await waitFor("navigation to settle", () =>
      router!.state.location.pathname === "/memory",
    );
    expect(__stateForTests().pending).toHaveLength(0);
  });
});
