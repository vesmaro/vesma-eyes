// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { KoraPult } from "./KoraPult";
import type { TaskInbox } from "@/gateway/boardTypes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { actUnmount } from "@/test/actTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Пульт (07j §4 / 07l §2, И1 decision from i1-dressing-map §1.2.3):
 * - STARTS COLLAPSED — the smart-default auto-expand would show an empty
 *   tab in И1 (the digest has no source until И4);
 * - the «ждут владельца» badge is the REAL UI-30 inbox counter: hidden
 *   while the source is pending/failed (no fake 0), muted at 0, always a
 *   link to /tasks/inbox;
 * - expansion is explicit; the tab choice persists ONLY on an explicit
 *   tab click (vesmaro.koraPanel), and the honest tab content renders:
 *   Дайджест — empty-CTA + the real «читать транскрипт» action; Эфир — an
 *   HonestLine naming what arrives. No fixture feeds, no demo pulses.
 */

const mountedRoots: Root[] = [];

function mountPult(options: { inboxCount?: number; hasSession?: boolean }): {
  container: HTMLElement;
  root: Root;
} {
  const adapter = new MockAdapter({ latency: false });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (options.inboxCount !== undefined) {
    queryClient.setQueryData<TaskInbox>(keys.tasks.inbox(), {
      items: [],
      refreshed_at: "2026-09-27T00:00:00Z",
      count: options.inboxCount,
    });
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      <GatewayContext.Provider value={adapter}>
        <QueryClientProvider client={queryClient}>
          <I18nProvider initialLang="ru">
            {/* The badge is an in-app Link — router context is required. */}
            <MemoryRouter>
              <KoraPult hasSession={options.hasSession ?? false} />
            </MemoryRouter>
          </I18nProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return { container, root };
}

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) {
    await actUnmount(root);
  }
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("KoraPult (union И1, dressing map §1.2.3)", () => {
  it("starts COLLAPSED: the strip with tabs + hint, no tab content", () => {
    const { container } = mountPult({ inboxCount: 2 });
    const html = container.innerHTML;
    expect(html).toContain("Пульт");
    expect(html).toContain("Дайджест");
    expect(html).toContain("Эфир");
    expect(html).toContain("Выберите сессию — её разбор появится здесь");
    expect(html).toContain("Развернуть");
    // Collapsed ⇒ no tab panels leaked.
    expect(html).not.toContain('role="tabpanel"');
  });

  it("shows the REAL inbox badge: the count, muted at 0, linked to /tasks/inbox", () => {
    const { container } = mountPult({ inboxCount: 2 });
    const badge = container.querySelector<HTMLAnchorElement>('a[href="/tasks/inbox"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("ждут владельца: 2");
    expect(badge?.className).not.toContain("text-foreground-muted");

    const zero = mountPult({ inboxCount: 0 });
    const zeroBadge = zero.container.querySelector<HTMLAnchorElement>(
      'a[href="/tasks/inbox"]',
    );
    expect(zeroBadge?.textContent).toContain("ждут владельца: 0");
    expect(zeroBadge?.className).toContain("text-foreground-muted"); // N=0 — muted, still clickable
  });

  it("hides the badge while the inbox source is unknown (no fake 0)", () => {
    const { container } = mountPult({}); // no prefill ⇒ the query stays pending in the sync render
    expect(container.querySelector('a[href="/tasks/inbox"]')).toBeNull();
  });

  it("expands by an explicit click: Дайджест shows the honest empty-CTA; a session adds the real transcript action", async () => {
    const { container } = mountPult({ inboxCount: 1 });
    const expand = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Развернуть"),
    );
    expect(expand?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      expand?.click();
    });
    expect(expand?.getAttribute("aria-expanded")).toBe("true");
    // No session ⇒ the invitation, no transcript action.
    expect(container.textContent).toContain(
      "Выберите сессию — её разбор появится здесь",
    );
    expect(container.textContent).not.toContain("Читать транскрипт");

    const withSession = mountPult({ inboxCount: 1, hasSession: true });
    const expand2 = [...withSession.container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Развернуть"),
    );
    await act(async () => {
      expand2?.click();
    });
    expect(withSession.container.textContent).toContain(
      "Разбор сессии собирается автоматически — появится позже",
    );
    expect(withSession.container.textContent).toContain("Читать транскрипт");
  });

  it("Эфир names what arrives (an HonestLine, never a fixture feed)", async () => {
    const { container } = mountPult({ inboxCount: 0 });
    const etherTab = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Эфир",
    );
    await act(async () => {
      etherTab?.click();
    });
    expect(container.textContent).toContain(
      "Лента событий появится позже — пока читайте ход сессий в транскриптах",
    );
    // The tab click expanded the Пульт (an explicit action) AND persisted
    // the choice (vesmaro.koraPanel, 07j §4.2).
    expect(localStorage.getItem("vesmaro.koraPanel")).toBe("ether");
  });

  it("resets a garbage persisted tab to the digest default (never throws)", () => {
    localStorage.setItem("vesmaro.koraPanel", "17");
    const { container } = mountPult({ inboxCount: 0 });
    const digest = container.querySelectorAll('[role="tab"]')[0];
    const ether = container.querySelectorAll('[role="tab"]')[1];
    expect(digest.getAttribute("aria-selected")).toBe("true");
    expect(ether.getAttribute("aria-selected")).toBe("false");
  });
});
