// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TaskInbox } from "@/gateway/boardTypes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { actUnmount } from "@/test/actTools";
import { KoraPult } from "./KoraPult";
import { resetEtherForTests } from "./koraEtherStore";
import type { KoraEtherRow } from "./koraEtherStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Пульт (U5 — v7-стык + 15-WOW §3.2 «два крыла»): STARTS COLLAPSED (the И1
 * honest cut stands — an auto-expanded empty Дайджест would be noise); the
 * badge is the REAL UI-30 counter (hidden while unknown, muted at 0,
 * /tasks/inbox link); expansion deploys BOTH wings (Дайджест + Эфир — the
 * tabs are gone); the seams are honest separators; the height/width
 * decisions persist ONLY on commit (vesmaro.koraPultH / vesmaro.koraEtherW);
 * Home/dblclick resets to auto by REMOVING the height key.
 */

const mountedRoots: Root[] = [];

function mountPult(options: {
  inboxCount?: number;
  hasSession?: boolean;
  etherRows?: readonly KoraEtherRow[];
}): { container: HTMLElement; root: Root } {
  const adapter = new MockAdapter({ latency: false });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (options.inboxCount !== undefined) {
    queryClient.setQueryData<TaskInbox>(keys.tasks.inbox(), {
      items: [],
      refreshed_at: "2026-10-08T00:00:00Z",
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
              <KoraPult
                hasSession={options.hasSession ?? false}
                etherRows={options.etherRows ?? []}
              />
            </MemoryRouter>
          </I18nProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return { container, root };
}

const expandButton = (container: HTMLElement): HTMLButtonElement => {
  // The toggle is found by its aria wiring — the LABEL flips («Развернуть»
  // ↔ «Свернуть») with the state, the wiring does not.
  const found = container.querySelector<HTMLButtonElement>(
    'button[aria-controls="kora-pult-body"]',
  );
  if (found === null) throw new Error("expand button not rendered");
  return found;
};

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) {
    await actUnmount(root);
  }
  document.body.innerHTML = "";
  localStorage.clear();
  resetEtherForTests();
});

describe("KoraPult — the collapsed strip (the honest default)", () => {
  it("starts COLLAPSED: caps + Развернуть, no wing content, no tabs", () => {
    const { container } = mountPult({ inboxCount: 2 });
    const html = container.innerHTML;
    expect(html).toContain("Пульт");
    expect(html).toContain("Развернуть");
    // The wings deploy together on expansion — nothing leaks on the strip.
    expect(html).not.toContain("Выберите сессию — её разбор появится здесь");
    expect(html).not.toContain("Эфир — всё, что происходит в сессиях сейчас");
    // The И1 tabs are superseded by the wings (15-WOW §3.2).
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(0);
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
    expect(zeroBadge?.className).toContain("text-foreground-muted"); // 0 — muted
  });

  it("hides the badge while the inbox source is unknown (no fake 0)", () => {
    const { container } = mountPult({}); // no prefill ⇒ the query stays pending
    expect(container.querySelector('a[href="/tasks/inbox"]')).toBeNull();
  });
});

describe("KoraPult — the two wings (15-WOW §3.2)", () => {
  it("expands by an explicit click: BOTH wings deploy, honest empties", async () => {
    const { container } = mountPult({ inboxCount: 1 });
    await act(async () => {
      expandButton(container).click();
    });
    expect(expandButton(container).getAttribute("aria-expanded")).toBe("true");
    // Wing 1: the honest digest invitation (no session).
    expect(container.textContent).toContain(
      "Выберите сессию — её разбор появится здесь",
    );
    // Wing 2: the honest ether empty (a silent bus).
    expect(container.textContent).toContain("Событий пока нет");
    // The wings seams are honest separators.
    const separators = container.querySelectorAll('[role="separator"]');
    expect(separators.length).toBe(2); // the top seam + the wings seam
  });

  it("a session flips the digest wing to the honest building note + transcript action", async () => {
    const { container } = mountPult({ inboxCount: 1, hasSession: true });
    await act(async () => {
      expandButton(container).click();
    });
    expect(container.textContent).toContain(
      "Разбор сессии собирается автоматически — появится позже",
    );
    expect(container.textContent).toContain("Читать транскрипт");
  });

  it("the ether wing renders the REAL ring rows (no fixture feeds)", async () => {
    const mounted = mountPult({
      inboxCount: 0,
      etherRows: [
        {
          id: 1,
          ts: Date.parse("2026-10-08T10:00:00Z"),
          host: "gpu-box",
          key: "kora.ether.online",
          params: { name: "zcode@box", host: "gpu-box" },
        },
      ],
    });
    await act(async () => {
      expandButton(mounted.container).click();
    });
    expect(mounted.container.textContent).toContain(
      "zcode@box на gpu-box — на связи",
    );
  });
});

describe("KoraPult — the height hardware (07l §3)", () => {
  it("persists a fixed height ONLY via the seam commit; Home resets to auto", async () => {
    const { container } = mountPult({ inboxCount: 0 });
    await act(async () => {
      expandButton(container).click();
    });
    const topSeam = container.querySelector<HTMLElement>('[role="separator"]');
    expect(topSeam?.getAttribute("aria-label")).toBe("Высота Пульта");
    // Auto mode after the expand: no key written yet (the absence = auto).
    expect(localStorage.getItem("vesmaro.koraPultH")).toBeNull();
    // Keyboard: ArrowUp from auto widens to the minimum → the commit persists.
    await act(async () => {
      topSeam?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    await act(async () => {
      topSeam?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
      );
    });
    await act(async () => {
      topSeam?.dispatchEvent(
        new KeyboardEvent("keyup", { key: "ArrowUp", bubbles: true, cancelable: true }),
      );
    });
    expect(localStorage.getItem("vesmaro.koraPultH")).toBe("160");
    // Home resets to auto by REMOVING the key (07l §3.2).
    await act(async () => {
      topSeam?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }),
      );
    });
    expect(localStorage.getItem("vesmaro.koraPultH")).toBeNull();
  });

  it("restores a persisted fixed height on mount; garbage resets to auto", async () => {
    localStorage.setItem("vesmaro.koraPultH", "240");
    const { container } = mountPult({ inboxCount: 0 });
    const topSeam = container.querySelector<HTMLElement>('[role="separator"]');
    // The seam mirrors the collapsed strip honestly (40px) until deployed.
    expect(topSeam?.getAttribute("aria-valuenow")).toBe("40");
    localStorage.setItem("vesmaro.koraEtherW", "garbage");
    const second = mountPult({ inboxCount: 0 });
    await act(async () => {
      expandButton(second.container).click();
    });
    const etherSeam = [
      ...second.container.querySelectorAll('[role="separator"]'),
    ].find((el) => el.getAttribute("aria-label") === "Ширина Эфира");
    // garbage → the documented default, never a throw (07l §5.2).
    expect(etherSeam?.getAttribute("aria-valuenow")).toBe("320");
  });

  it("the Эфир width persists only on commit; dblclick resets to the default", async () => {
    const { container } = mountPult({ inboxCount: 0 });
    await act(async () => {
      expandButton(container).click();
    });
    const etherSeam = [...container.querySelectorAll('[role="separator"]')].find(
      (el) => el.getAttribute("aria-label") === "Ширина Эфира",
    );
    expect(etherSeam?.getAttribute("aria-valuemin")).toBe("280");
    expect(etherSeam?.getAttribute("aria-valuemax")).toBe("480");
    await act(async () => {
      etherSeam?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    await act(async () => {
      etherSeam?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }),
      );
    });
    await act(async () => {
      etherSeam?.dispatchEvent(
        new KeyboardEvent("keyup", { key: "ArrowLeft", bubbles: true, cancelable: true }),
      );
    });
    expect(localStorage.getItem("vesmaro.koraEtherW")).toBe("336");
    await act(async () => {
      etherSeam?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(localStorage.getItem("vesmaro.koraEtherW")).toBe("320");
  });
});
