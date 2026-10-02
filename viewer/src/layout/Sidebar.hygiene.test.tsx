import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Sidebar } from "./Sidebar";
import { BoardAdapter } from "@/gateway/BoardAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { I18nProvider } from "@/i18n";
import { HotkeysProvider } from "@/layout/Hotkeys";

/**
 * Sidebar horizontal-overflow hygiene + collapse control placement (UI-19
 * owner feedback, redressed by union И1 / stand 03 §3): long translations
 * («Устройства и подключение», docs domain) must NEVER force the fixed-width
 * panel into a horizontal scroll — labels truncate under a full-name
 * title/aria-label and the nav clips overflow-x. The collapse control lives
 * in the sidebar FOOTER («Свернуть», stand 03 §3 — the union moved it from
 * the header), carries a tooltip title, and the icon-only rail keeps
 * accessible names on every domain row (the docs third layer returns on
 * expand — the rail is domain-icons only per the stand).
 * renderToString pattern: Sidebar.session.test.tsx (DOM-free, node env).
 */

function renderSidebar(path: string, collapsed: boolean, lang: "ru" | "en" = "ru") {
  return renderToString(
    <GatewayContext.Provider value={new BoardAdapter("/api")}>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { enabled: false, retry: false } },
          })
        }
      >
        <I18nProvider initialLang={lang}>
          <HotkeysProvider>
            <MemoryRouter initialEntries={[path]}>
              <Sidebar collapsed={collapsed} onToggle={() => undefined} />
            </MemoryRouter>
          </HotkeysProvider>
        </I18nProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>,
  );
}

describe("Sidebar section disabled-slots (UX-overhaul §6, Ф1 + ME-072 A)", () => {
  it("renders Sessions/Traces as inert slots with an honest «later» badge — never links", () => {
    // On the System domain page the sections render; the two blocked items
    // are disabled slots: inert buttons with the «позже» badge + tooltip.
    const html = renderSidebar("/system/status", false);
    expect(html).toContain("Сессии появятся позже"); // tooltip promise
    expect(html).toContain("Трассировки появятся позже");
    expect(html).toContain("cursor-not-allowed");
    // The slot is NOT a link — no href to the placeholder route.
    expect(html).not.toContain('href="/system/sessions"');
    expect(html).not.toContain('href="/system/traces"');
    // The badge reads «позже» in words (ME-072 A: the ROUTES answer — the
    // slot is honest about the blockage, never colour-only, WCAG 1.4.1).
    expect(html).toContain(">позже<");
    // (The /stores DOMAIN slot still reads «скоро» — it renders on every
    // page; its honesty is covered by the dedicated test below.)
  });

  it("keeps «скоро» for the never-built /stores domain slot (ME-072 A)", () => {
    // The stores DOMAIN has no route at all — its badge stays «скоро».
    const html = renderSidebar("/", false);
    expect(html).toContain(">скоро<");
    expect(html).toContain("cursor-not-allowed");
  });

  it("keeps the LIVE System sections as links next to the slots", () => {
    const html = renderSidebar("/system/status", false);
    expect(html).toContain('href="/system/status"');
    expect(html).toContain('href="/system/settings"');
    expect(html).toContain('href="/system/devices"');
  });
});

describe("Sidebar overflow hygiene (UI-19)", () => {
  it("expanded: labels truncate, no nowrap on label spans, nav clips overflow-x", () => {
    const html = renderSidebar("/docs/c/devices", false);
    expect(html).toContain("truncate");
    // Label spans must not force single-line overflow (the Button's own
    // whitespace-nowrap is irrelevant — it holds an icon only).
    expect(html.match(/<span class="[^"]*whitespace-nowrap/g)).toBeNull();
    expect(html).toContain("overflow-x-hidden");
    // Union И1 (stand 03 §3): the expanded panel is the 232px token slot;
    // the SSR string carries the plain w-sidebar (desktop snapshot).
    expect(html).toContain("w-sidebar");
  });

  it("every long label row keeps its FULL name as title AND aria-label", () => {
    const html = renderSidebar("/docs/c/devices", false);
    // The docs domain renders PROJECT GROUPS now (ADR 0016): its category
    // rows keep the same title/aria-label discipline as before.
    expect(html).toContain('title="Устройства и подключение"');
    expect(html).toContain('aria-label="Устройства и подключение"');
    expect(html).toContain('title="Безопасность и токены"');
    expect(html).toContain('title="vesma-eyes"'); // project group row
  });

  it("the same holds for the EN dictionary", () => {
    const html = renderSidebar("/docs/c/devices", false, "en");
    // & renders HTML-escaped in the SSR string.
    expect(html).toContain('title="Devices &amp; pairing"');
    expect(html).toContain('aria-label="Security &amp; tokens"');
  });

  it("icon-rail (collapsed): domain rows keep their names, the docs tree waits for expand (stand 03 §3)", () => {
    const html = renderSidebar("/docs/c/devices", true);
    // The rail is domain icons only — every row keeps its accessible name.
    expect(html).toContain('aria-label="Документация"');
    // Union И1: the third layer (projects/categories) returns on expand —
    // the rail carries no second icon column (stand collapsed state).
    expect(html).toContain("w-sidebar-rail");
    expect(html).not.toContain("Устройства и подключение");
  });
});

describe("Sidebar collapse control (UI-19; footer since union И1)", () => {
  it("lives in the FOOTER (after the nav), the «Свернуть» row with the [ hint", () => {
    const html = renderSidebar("/docs/c/devices", false);
    const toggle = html.indexOf('title="Свернуть панель"');
    const nav = html.indexOf("<nav");
    expect(toggle).toBeGreaterThan(-1);
    expect(nav).toBeGreaterThan(-1);
    expect(toggle).toBeGreaterThan(nav); // footer position (stand 03 §3)
    expect(html).toContain('aria-label="Свернуть панель"');
    // The advertised key exists (honesty: no dead hints).
    expect(html).toContain(">[<");
  });

  it("collapsed: the control flips to «Развернуть панель»", () => {
    const html = renderSidebar("/docs/c/devices", true);
    expect(html).toContain('title="Развернуть панель"');
    expect(html).toContain('aria-label="Развернуть панель"');
  });
});
