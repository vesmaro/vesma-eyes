// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { MemoryRouter, createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MobileSidebar, Sidebar } from "./Sidebar";
import { buildRoutes } from "@/app/routes";
import { BoardAdapter } from "@/gateway/BoardAdapter";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { DensityProvider } from "@/components/density-provider";
import { HotkeysProvider } from "@/layout/Hotkeys";
import { I18nProvider } from "@/i18n";

/**
 * Union И1 (stand 03 §3–§4): the mobile sidebar is the OFF-CANVAS drawer —
 * a Radix Dialog owned by the Shell (the hand-rolled focus trap is retired).
 * Below md the inline <Sidebar> renders NOTHING; the drawer lives in a
 * portal while open; Radix provides the trap, Esc, the backdrop click and
 * the focus return to the TopBar trigger. The old UI-22 contract keeps its
 * meaning: the drawer state is session-only (never the persisted desktop
 * intent) and the covered page leaves the a11y tree (ME-002 — Shell wiring).
 *
 * happy-dom answers matchMedia "no match" by default — exactly the phone
 * viewport; the desktop describe stubs a matching query (same seam as
 * LoginDialog.flow.test.tsx).
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

/** ME-006: the health probe stand-in (see Sidebar.session.test.tsx). */
const healthProbeNeverFetch: typeof fetch = () => new Promise(() => undefined);

function click(element: HTMLElement): void {
  act(() => {
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

/** Let Radix's async settle (autofocus, unmount hooks) flush inside act. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const mountedRoots: Root[] = [];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) {
    await act(async () => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
});

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GatewayContext.Provider
      value={new BoardAdapter({ baseUrl: "/api", fetchImpl: healthProbeNeverFetch })}
    >
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { enabled: false, retry: false } },
          })
        }
      >
        <I18nProvider initialLang="ru">
          <HotkeysProvider>{children}</HotkeysProvider>
        </I18nProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>
  );
}

describe("Sidebar below md (off-canvas drawer replaced the rail)", () => {
  beforeEach(() => stubMatchMedia(false));

  it("the inline panel does not render at all below md", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    await act(async () => {
      root.render(
        <Providers>
          <MemoryRouter initialEntries={["/memory"]}>
            <Sidebar collapsed={false} onToggle={() => undefined} />
          </MemoryRouter>
        </Providers>,
      );
    });
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector("nav")).toBeNull();
  });
});

describe("Sidebar on desktop (>=md, inline panel)", () => {
  beforeEach(() => stubMatchMedia(true));

  it("expanded: sticky 232px panel with the footer affordances", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    await act(async () => {
      root.render(
        <Providers>
          <MemoryRouter initialEntries={["/memory"]}>
            <Sidebar collapsed={false} onToggle={() => undefined} />
          </MemoryRouter>
        </Providers>,
      );
    });
    const aside = container.querySelector("aside");
    expect(aside?.className).toContain("w-sidebar");
    expect(aside?.className).toContain("sticky");
    expect(aside?.className).not.toContain("fixed");
    // Page chrome, not a dialog.
    expect(aside?.getAttribute("role")).toBeNull();
    // The footer carries Палитра / Шпаргалка / Свернуть (03 §3).
    expect(container.querySelector('button[aria-label="Палитра"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Шпаргалка"]')).not.toBeNull();
    const collapse = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Свернуть панель"]',
    );
    expect(collapse).not.toBeNull();
    expect(collapse?.getAttribute("aria-expanded")).toBe("true");
  });

  it("the footer «Свернуть» row flips the persisted intent; the rail keeps geometry", async () => {
    const onToggle = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    await act(async () => {
      root.render(
        <Providers>
          <MemoryRouter initialEntries={["/memory"]}>
            <Sidebar collapsed={false} onToggle={onToggle} />
          </MemoryRouter>
        </Providers>,
      );
    });
    click(
      container.querySelector('button[aria-label="Свернуть панель"]') as HTMLElement,
    );
    expect(onToggle).toHaveBeenCalledTimes(1);

    const rail = document.createElement("div");
    document.body.appendChild(rail);
    const railRoot = createRoot(rail);
    mountedRoots.push(railRoot);
    await act(async () => {
      railRoot.render(
        <Providers>
          <MemoryRouter initialEntries={["/memory"]}>
            <Sidebar collapsed onToggle={() => undefined} />
          </MemoryRouter>
        </Providers>,
      );
    });
    const aside = rail.querySelector("aside");
    expect(aside?.className).toContain("w-sidebar-rail");
    expect(aside?.className).toContain("sticky");
    expect(aside?.className).not.toContain("fixed");
    const expand = rail.querySelector<HTMLButtonElement>(
      'button[aria-label="Развернуть панель"]',
    );
    expect(expand).not.toBeNull();
    expect(expand?.getAttribute("aria-expanded")).toBe("false");
    // Rail = icons only: the docs third layer waits for the expand (И1).
    expect(rail.querySelector('a[aria-label="vesmaro-eyes"]')).toBeNull();
  });
});

describe("MobileSidebar drawer (Radix Dialog, union И1)", () => {
  beforeEach(() => stubMatchMedia(false));

  function DrawerHarness({ initialOpen = false } = {}) {
    const [open, setOpen] = useState(initialOpen);
    return (
      <Providers>
        <MemoryRouter initialEntries={["/memory"]}>
          <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
            <DialogPrimitive.Trigger asChild>
              <button type="button" aria-label="Открыть разделы">
                trigger
              </button>
            </DialogPrimitive.Trigger>
            <MobileSidebar open={open} onOpenChange={setOpen} />
          </DialogPrimitive.Root>
        </MemoryRouter>
      </Providers>
    );
  }

  function drawerPanel(): HTMLElement | null {
    return document.body.querySelector('[role="dialog"]');
  }

  function drawerBackdrop(): HTMLElement | null {
    // The portal pair: Overlay + Content both carry data-state; the overlay
    // is the one WITHOUT the dialog role.
    return document.body.querySelector<HTMLElement>(
      'div[data-state="open"]:not([role="dialog"])',
    );
  }

  function triggerButton(): HTMLButtonElement {
    const button = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть разделы"]',
    );
    if (!button) throw new Error("drawer trigger not found");
    return button;
  }

  async function mountHarness(initialOpen = false): Promise<HTMLElement> {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    await act(async () => {
      root.render(<DrawerHarness initialOpen={initialOpen} />);
    });
    return container;
  }

  it("renders NOTHING while closed (controlled portal)", async () => {
    await mountHarness();
    expect(drawerPanel()).toBeNull();
    expect(triggerButton().getAttribute("aria-expanded")).toBe("false");
    expect(triggerButton().getAttribute("data-state")).toBe("closed");
  });

  it("open: dialog semantics, the 232px panel, the backdrop, focus inside", async () => {
    await mountHarness();
    click(triggerButton());
    await flush();
    const panel = drawerPanel();
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("data-state")).toBe("open");
    expect(panel?.className).toContain("w-sidebar");
    expect(panel?.className).toContain("fixed");
    // The sr-only title names the dialog («Разделы»).
    expect(panel?.textContent).toContain("Разделы");
    // The full panel: nav groups with labels + footer affordances.
    expect(panel?.querySelector('button[aria-label="Память"]')).not.toBeNull();
    expect(panel?.querySelector('button[aria-label="Палитра"]')).not.toBeNull();
    expect(drawerBackdrop()).not.toBeNull();
    expect(triggerButton().getAttribute("aria-expanded")).toBe("true");
    // Radix FocusScope pulled focus into the panel on open.
    expect(panel!.contains(document.activeElement)).toBe(true);
  });

  it("Esc closes the drawer and returns focus to the trigger", async () => {
    await mountHarness();
    click(triggerButton());
    await flush();
    const panel = drawerPanel() as HTMLElement;
    act(() => {
      panel.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    await flush();
    expect(drawerPanel()).toBeNull();
    expect(document.activeElement).toBe(triggerButton());
  });

  it("a backdrop click closes the drawer (and returns focus)", async () => {
    await mountHarness();
    click(triggerButton());
    await flush();
    const shade = drawerBackdrop();
    expect(shade).not.toBeNull();
    // Radix DismissableLayer: the full pointer sequence outside the content
    // (pointerdown alone is not enough in this radix revision).
    act(() => {
      shade!.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
      );
      shade!.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, cancelable: true }),
      );
      shade!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    await flush();
    expect(drawerPanel()).toBeNull();
    expect(document.activeElement).toBe(triggerButton());
  });

  it("the footer «Свернуть» row is the Dialog.Close affordance", async () => {
    await mountHarness();
    click(triggerButton());
    await flush();
    const close = drawerPanel()?.querySelector<HTMLButtonElement>(
      'button[aria-label="Свернуть панель"]',
    );
    expect(close).not.toBeNull();
    click(close as HTMLElement);
    await flush();
    expect(drawerPanel()).toBeNull();
  });

  it("Tab cycles INSIDE the drawer and never reaches the page behind", async () => {
    await mountHarness();
    click(triggerButton());
    await flush();
    const panel = drawerPanel() as HTMLElement;
    const outside = document.createElement("button");
    outside.id = "outside-content";
    document.body.appendChild(outside);
    // Radix FocusScope pulled focus into the panel on open.
    expect(panel.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 6; i += 1) {
      act(() => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Tab",
            bubbles: true,
            cancelable: true,
          }),
        );
      });
    }
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(outside);
  });
});

/**
 * ME-002 (background inert) + the Shell-level drawer wiring: the covered
 * page must leave the ACCESSIBILITY tree (`inert`), the body scroll locks,
 * and a route change (a nav click inside the drawer) closes it. The Shell
 * owns all three — these cases mount the real router tree.
 */
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
  return { container };
}

function shellTrigger(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Открыть разделы"]',
  );
  if (!button) throw new Error("shell drawer trigger not found");
  return button;
}

function skipLink(container: HTMLElement): HTMLAnchorElement | null {
  return container.querySelector<HTMLAnchorElement>("a[href='#main']");
}

describe("Shell drawer wiring (ME-002 inert + scroll lock + nav close)", () => {
  beforeEach(() => {
    stubMatchMedia(false); // the phone viewport
    localStorage.clear();
  });

  it("while the drawer is open the covered page is inert and locked; a nav click closes", async () => {
    const { container } = await mountShell();
    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    // Closed: page chrome is fully live — no stray inert anywhere.
    expect(main!.closest("[inert]")).toBeNull();
    expect(skipLink(container)?.hasAttribute("inert")).toBe(false);

    click(shellTrigger(container));
    // Everything the dialog covers leaves the a11y tree (and the pointer):
    // main, the skip link, the whole content row.
    expect(main!.closest("[inert]")).not.toBeNull();
    expect(skipLink(container)?.hasAttribute("inert")).toBe(true);
    // The document cannot scroll behind the overlay…
    expect(document.body.style.overflow).toBe("hidden");
    // …while the DIALOG subtree (portal) stays live, and the trigger that
    // owns the focus return lives OUTSIDE the inerted row (in the TopBar).
    const panel = document.body.querySelector('[role="dialog"]');
    expect(panel).not.toBeNull();
    expect(panel!.closest("[inert]")).toBeNull();
    expect(shellTrigger(container).closest("[inert]")).toBeNull();

    // A nav-link click inside the drawer navigates → the drawer closes, the
    // page comes back to the tree and the scroll unlock follows.
    const link = panel!.querySelector<HTMLElement>("nav a");
    expect(link).not.toBeNull();
    click(link as HTMLElement);
    await vi.waitFor(() => {
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    });
    expect(main!.closest("[inert]")).toBeNull();
    expect(skipLink(container)?.hasAttribute("inert")).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });
});
