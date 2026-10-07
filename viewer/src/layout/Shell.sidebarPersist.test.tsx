// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SIDEBAR_COLLAPSED_STORAGE_KEY } from "./Shell";
import { buildRoutes } from "@/app/routes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { DensityProvider } from "@/components/density-provider";
import { HotkeysProvider } from "@/layout/Hotkeys";
import { I18nProvider } from "@/i18n";
import { actUnmount, actWaitUntil } from "@/test/actTools";

/**
 * Sidebar collapse persistence (UI-19 owner feedback): the collapsed rail
 * must survive F5. The flag rides "vesmaro.sidebarCollapsed" (the `vesmaro.*`
 * namespace) — read lazily on mount, written on every toggle. UI-22 scope:
 * it is the DESKTOP intent — the mobile (<md) drawer never reaches Shell's
 * setter, so a phone can neither read nor corrupt the stored flag.
 * Union И1: the desktop control is the FOOTER «Свернуть» row; below md the
 * inline panel does not render at all — the drawer (Radix dialog) opens from
 * the TopBar trigger and is session-only.
 * Pattern: DocsPage.test.tsx — happy-dom pragma, createRoot + real click
 * events. The expansion is state-driven (matchMedia seam): happy-dom answers
 * "no match" (= phone) by default, so the mobile describe runs unstumped and
 * the desktop describes stub a matching query.
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

/** U1 responsive default: answer TRUE only for the named queries — the
 * narrow-desktop viewport (768–1279) stub answers md=yes, wide=no. */
function stubMatchMediaOnly(matching: readonly string[]): void {
  const stub = (query: string) => ({
    matches: matching.includes(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  (globalThis as { matchMedia: unknown }).matchMedia = stub;
  (window as { matchMedia: unknown }).matchMedia = stub;
}

/** ME-006: roots kept alive across tests re-render (VersionLabel settles,
 * toast timers fire) OUTSIDE any act scope — unmount them in afterEach. */
const mountedRoots: ReturnType<typeof createRoot>[] = [];

async function mountShell(path = "/memory") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: { queries: { enabled: false, retry: false } },
            })
          }
        >
          <ThemeProvider>
            <AuthProvider adapterMode="mock" endpoint="/api">
              <I18nProvider initialLang="ru">
                <DensityProvider initialDensity="comfortable">
                  <HotkeysProvider>
                    <RouterProvider
                      router={createMemoryRouter(buildRoutes(), {
                        initialEntries: [path],
                      })}
                    />
                  </HotkeysProvider>
                </DensityProvider>
              </I18nProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return { root, container };
}

/** The footer collapse control (identified by its ru aria-label). */
function toggleButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Свернуть панель"], button[aria-label="Развернуть панель"]',
  );
  if (!button) throw new Error("sidebar collapse control not found");
  return button;
}

function click(button: HTMLButtonElement) {
  act(() => {
    button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

beforeEach(() => {
  localStorage.clear();
  stubMatchMedia(true); // desktop viewport by default; the mobile describe re-stubs
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) {
    await actUnmount(root);
  }
  document.body.innerHTML = "";
});

describe("Shell sidebar collapse persistence (UI-19)", () => {
  it("defaults to expanded and does NOT write until the owner chooses (U1: absence is a state)", async () => {
    const { container } = await mountShell();
    await actWaitUntil(() => {
      expect(container.querySelector("aside")).not.toBeNull();
    });
    expect(toggleButton(container).getAttribute("aria-expanded")).toBe("true");
    // U1: the stored value is the EXPLICIT intent — writing the default
    // «0» on mount would materialize the responsive rail default (below)
    // and defeat the «no choice yet» state. Toggles write, mounts don't.
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBeNull();
  });

  it("U1 responsive default: a 768–1279 desktop rides the 56px rail until an explicit choice", async () => {
    stubMatchMediaOnly(["(min-width: 768px)"]); // narrow desktop: no wide match
    const { container } = await mountShell();
    await actWaitUntil(() => {
      expect(container.querySelector("aside")).not.toBeNull();
    });
    expect(container.querySelector("aside")?.className).toContain("w-sidebar-rail");
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBeNull();
    // The explicit choice wins everywhere and persists as before.
    click(toggleButton(container)); // expand
    expect(container.querySelector("aside")?.className).toContain("w-sidebar");
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("0");
  });

  it("a stored «1» mounts COLLAPSED (the F5 survival the owner asked for)", async () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "1");
    const { container } = await mountShell();
    await actWaitUntil(() => {
      expect(container.querySelector("aside")).not.toBeNull();
    });
    const aside = container.querySelector("aside");
    expect(aside?.className).toContain("w-sidebar-rail");
    // Exact token — "w-sidebar" is a PREFIX of "w-sidebar-rail".
    expect(aside?.className.split(" ")).not.toContain("w-sidebar");
    expect(toggleButton(container).getAttribute("aria-expanded")).toBe("false");
    expect(toggleButton(container).getAttribute("aria-label")).toBe(
      "Развернуть панель",
    );
  });

  it("toggling flips the rail AND rewrites the stored flag both ways", async () => {
    const { container } = await mountShell();
    await actWaitUntil(() => {
      expect(container.querySelector("aside")).not.toBeNull();
    });
    const button = toggleButton(container);

    click(button); // collapse
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("aside")?.className).toContain("w-sidebar-rail");
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("1");

    click(button); // expand back
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("aside")?.className).toContain("w-sidebar");
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("0");
  });

  it("a corrupt stored value falls back to the open panel (honest default)", async () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "junk");
    const { container } = await mountShell();
    await actWaitUntil(() => {
      expect(container.querySelector("aside")).not.toBeNull();
    });
    expect(toggleButton(container).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("Shell sidebar on a phone (UI-22): the drawer is session-only", () => {
  beforeEach(() => stubMatchMedia(false)); // <md — the phone viewport

  function drawerTrigger(container: HTMLElement): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть разделы"]',
    );
    if (!button) throw new Error("drawer trigger not found");
    return button;
  }

  it("no inline panel below md; the drawer opens from the TopBar and never writes storage", async () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "0");
    const { container } = await mountShell();
    await actWaitUntil(() => {
      expect(drawerTrigger(container)).toBeTruthy();
    });
    // Entry state on <md: NO inline panel and NO pre-opened drawer — the
    // stored "0" (desktop intent) does not leak into the phone.
    expect(container.querySelector("aside")).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(drawerTrigger(container).getAttribute("aria-expanded")).toBe("false");

    click(drawerTrigger(container)); // open the drawer (portal)
    await actWaitUntil(() => {
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    });
    expect(drawerTrigger(container).getAttribute("aria-expanded")).toBe("true");
    // …and the stored flag is UNTOUCHED by the drawer.
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("0");

    // The footer «Свернуть» row is the dialog's Close — back to no drawer.
    const close = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Свернуть панель"]',
    );
    expect(close).not.toBeNull();
    click(close as HTMLButtonElement);
    await actWaitUntil(() => {
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    });
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("0");
  });

  it("a remount (F5) starts with the drawer closed — session-only state", async () => {
    const first = await mountShell();
    await actWaitUntil(() => {
      expect(drawerTrigger(first.container)).toBeTruthy();
    });
    click(drawerTrigger(first.container)); // open the drawer
    await actWaitUntil(() => {
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    });
    await act(async () => {
      await actUnmount(first.root);
    });
    document.body.innerHTML = "";

    const second = await mountShell();
    await actWaitUntil(() => {
      expect(drawerTrigger(second.container)).toBeTruthy();
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
