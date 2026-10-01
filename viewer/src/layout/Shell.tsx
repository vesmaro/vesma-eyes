import { Suspense, useEffect, useState } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { PanelLeft, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { MemoryCardSkeleton } from "@/components/skeletons/Skeletons";
import { ToastViewport } from "@/components/Toast/ToastViewport";
import { Button } from "@/components/ui/button";
import {
  saveSidebarCollapsed,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  toggleSidebarCollapsed,
  useSidebarCollapsed,
} from "@/lib/sidebarState";
import { setSidebarOverlayOpen } from "@/lib/sidebarOverlayState";
import { LivingBridge } from "@/lib/livingBridge";
import { LivingLayer } from "./LivingLayer";
import { ErrorBoundary } from "./ErrorBoundary";
import { CommandPalette } from "./CommandPalette";
import { MobileSidebar, Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { UpdateBanner } from "./UpdateBanner";
import { GatedOutlet } from "@/features/ui-token/GatedOutlet";
import { Breadcrumbs } from "./Breadcrumbs";
import { useDocsManifest } from "@/features/docs/manifest";
import { useT } from "@/i18n";

/**
 * App shell (union И1, stand 03 §2 — ONE shell for all screens): the 48px
 * TopBar spans the FULL WIDTH (brand + global search + status zone); below
 * it sit the sidebar (232px / 56px rail) and the content column with the
 * 40px crumbs row. Geometry comes from the shell tokens (--shell-*).
 *
 * The page itself still scrolls in the WINDOW (not an inner container) on
 * purpose: react-router `<ScrollRestoration/>` restores window scroll on POP
 * navigations — the master-detail BACK-restore of the QA verdict §3 — and it
 * cannot see inner containers. `FocusMain` moves focus to <main> on route
 * change so keyboard/SR users land at the new content (WCAG 2.4.3).
 *
 * The mobile sidebar is a Radix DIALOG now (И1): the Root wraps the app so
 * the TopBar trigger (below md) sits inside it — Radix owns the trap, Esc,
 * the backdrop and the focus return. While the drawer covers the page,
 * everything EXCEPT the dialog subtree leaves the accessibility tree
 * (ME-002 `inert` off the shared overlay store) and the body scroll locks.
 * Every route change closes the drawer (nav clicks are navigations).
 *
 * Desktop collapse state lives here so it survives route changes and
 * persists under "vesmaro.sidebarCollapsed" (UI-19 owner feedback: the
 * collapsed rail must survive F5; UI-23: the settings hub shares the store;
 * `[` hotkey shares it too). Shell re-affirms the stored value on every
 * mount exactly as before.
 */

// Re-exported for the persistence tests (the key moved to lib/sidebarState).
export { SIDEBAR_COLLAPSED_STORAGE_KEY };

export function Shell() {
  const collapsed = useSidebarCollapsed();
  const toggle = toggleSidebarCollapsed;
  // Mobile drawer (< md): session-only state — it starts closed on every
  // mount and NEVER reaches the persisted desktop intent (UI-22).
  const [mobileOpen, setMobileOpen] = useState(false);
  const backgroundInert = mobileOpen ? ("" as const) : undefined;
  // ME-002: the shared overlay store the chrome surfaces (this Shell, the
  // toast region, the update banner) read to leave the accessibility tree.
  useEffect(() => setSidebarOverlayOpen(mobileOpen), [mobileOpen]);
  // Body scroll lock while the drawer covers the page (Radix locks pointer
  // events itself; the wheel/keyboard scroll needs the overflow guard).
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);
  // Persist the desktop intent on every change (SSR-safe; the initial render
  // also re-affirms the stored value — a no-op write).
  useEffect(() => saveSidebarCollapsed(collapsed), [collapsed]);
  const location = useLocation();
  const t = useT();
  // A route change IS a navigation from the drawer — close it (footer rows
  // close it themselves for non-navigating actions). Derived during render
  // (the canonical "adjust state on prop change" shape — no effect).
  const [lastPathname, setLastPathname] = useState(location.pathname);
  if (location.pathname !== lastPathname) {
    setLastPathname(location.pathname);
    if (mobileOpen) setMobileOpen(false);
  }
  // Subscribe the chrome to the lazy docs manifest ONLY inside the section:
  // mounting the subscription kicks getManifest(), which fetches EVERY md
  // chunk — an unconditional call here would download the whole corpus on
  // the first paint of any route (laziness is the budget gate, contract §7).
  useDocsManifest(
    location.pathname === "/docs" || location.pathname.startsWith("/docs/"),
  );

  // The drawer opener: a Radix Trigger (below md) — Radix returns focus here
  // when the dialog closes, the backdrop included.
  const sidebarTrigger = (
    <DialogPrimitive.Trigger asChild>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("topbar.openSidebar")}
        className="h-8 w-8 shrink-0 md:hidden"
      >
        <PanelLeft className="size-4" aria-hidden="true" />
      </Button>
    </DialogPrimitive.Trigger>
  );

  return (
    <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
      {/* `isolate` makes the shell a stacking context so the living canvas
       * (fixed, -z) paints ABOVE the page background but UNDER every panel —
       * the W1a veil discipline: data never sits on the canvas. */}
      <div className="isolate flex min-h-dvh flex-col bg-background text-foreground">
        {/* ME-071 W1a «Живой фон»: the veins canvas under all content —
         * decorative only, never interactive, dimmed in quiet zones. The
         * bridge is a LEAF: its poll re-renders itself, not the shell. */}
        <LivingLayer />
        <LivingBridge />
        {/* Bypass the repeated nav (WCAG 2.4.1): visible only on keyboard
         * focus. Inert while the mobile sidebar dialog is open (ME-002). */}
        <a
          href="#main"
          inert={backgroundInert}
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-well focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-float"
        >
          {t("shell.skipToContent")}
        </a>
        <TopBar sidebarTrigger={sidebarTrigger} />
        <div className="flex min-w-0 flex-1" inert={backgroundInert}>
          <Sidebar collapsed={collapsed} onToggle={toggle} />
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Crumb row (03 §5): sticky under the top bar, on every page —
             * the root carries its single crumb + the palette affordance.
             * Its bottom seam is living vein Ж3 (ME-071 W1a). */}
            <div
              data-living-seam="crumbs"
              className="sticky top-topbar z-20 h-crumbs border-b border-border-subtle bg-background/95 px-4 backdrop-blur-sm md:px-8"
            >
              <Breadcrumbs pathname={location.pathname} search={location.search} />
            </div>
            <main id="main" tabIndex={-1} className="flex-1 p-6 focus:outline-none">
              <ErrorBoundary
                fallback={(error, reset) => (
                  <EmptyState
                    variant="error"
                    title={t("shell.viewFell")}
                    message={error.message}
                    action={
                      <Button variant="outline" onClick={reset}>
                        <RefreshCw className="size-4" aria-hidden="true" />{" "}
                        {t("shell.tryAgain")}
                      </Button>
                    }
                  />
                )}
              >
                <Suspense
                  fallback={
                    <MemoryCardSkeleton count={3} className="mx-auto max-w-3xl" />
                  }
                >
                  {/* Gates v6 (ME-043, 07k §2–§3): ONE interception for every
                   * gated domain — an anonymous visitor gets the honest gate
                   * screen instead of the page; the gated component never
                   * mounts (no closed-content flash, URL-first). */}
                  <GatedOutlet
                    pathname={location.pathname}
                    search={location.search}
                  >
                    <Outlet />
                  </GatedOutlet>
                </Suspense>
              </ErrorBoundary>
            </main>
          </div>
        </div>
      </div>
      {/* Restore window scroll on BACK/FORWARD (ARCHCOM-3 verdict §2: use the
       * router's ScrollRestoration, never a hand-rolled cache). */}
      <ScrollRestoration />
      <FocusMain pathname={location.pathname} />
      {/* The command palette (UX-overhaul §7.3 Ф2) — mounted inside the
       * data router so its rows navigate with router context; the open
       * state lives in lib/paletteState (hotkeys + TopBar drive it). */}
      <CommandPalette />
      {/* Toast region — mounted INSIDE the router (toast actions are in-app
       * Links; a Link outside Router context throws). Shell is the persistent
       * root layout, so toasts survive every route change. */}
      <ToastViewport />
      {/* Stale-bundle self-healing (owner feedback 2026-09-22): a calm
       * «new version» banner with a one-click reload — never auto-reloads. */}
      <UpdateBanner />
      {/* The mobile drawer (Radix portal panel) — renders only while open. */}
      <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />
    </DialogPrimitive.Root>
  );
}

/**
 * Focus <main> on route change so AT users are moved to the new content
 * instead of staying on the sidebar link (WCAG 2.4.3). preventScroll keeps
 * ScrollRestoration the single owner of the scroll position.
 */
function FocusMain({ pathname }: { pathname: string }) {
  useEffect(() => {
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}
