// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/i18n";
import { actUnmount } from "@/test/actTools";
import { KoraMovesZone } from "./KoraMovesZone";
import type { HermesMessage } from "./koraTypes";
import type { KoraHermesTranscriptPages } from "./useKora";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The «Все ходы» zone (kora-rethink blueprint §4, KW2): the collapsed
 * 40px strip is the DEFAULT (states.md K-MOVES-COLLAPSED); expanding
 * deploys the HermesTranscript UNCHANGED (§10.2 — the grammar is
 * byte-for-byte today's, its own suite owns it) with the zone's OWN
 * follow-tail and search (K-MOVES-SEARCH: cut folds with matches open,
 * the counter is honest); the height rides the ex-Пульт seam hardware
 * (auto ≤280 / fixed 160–420, the <120 гистерезис, persist on commit
 * into vesmaro.koraMovesH, dblclick/Home = auto with the key REMOVED).
 */

function message(
  partial: Partial<HermesMessage> & Pick<HermesMessage, "seq" | "role" | "content">,
): HermesMessage {
  return {
    kind: null,
    ts: "2026-10-10T12:00:00Z",
    redaction_applied: false,
    ...partial,
  };
}

const ITEMS: readonly HermesMessage[] = [
  message({ seq: 1, role: "user", content: "Покажи статус туннеля и журнал." }),
  message({ seq: 2, role: "assistant", content: "Туннель зелёный, ошибок нет." }),
  message({
    seq: 3,
    role: "tool",
    kind: "tool_result",
    content: "journal_tail → хвост журнала, ошибок нет",
  }),
];

function pages(
  overrides: Partial<KoraHermesTranscriptPages> = {},
): KoraHermesTranscriptPages {
  return {
    items: [...ITEMS],
    hasMore: false,
    isPending: false,
    isLoadingMore: false,
    error: null,
    loadMore: async () => {},
    refetch: async () => {},
    ...overrides,
  };
}

const mountedRoots: Root[] = [];

function mountZone(p: KoraHermesTranscriptPages): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      <I18nProvider initialLang="ru">
        <KoraMovesZone sessionId="hermes:api-server-main" pages={p} />
      </I18nProvider>,
    );
  });
  return container;
}

const strip = (container: HTMLElement): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>(
    'button[aria-controls="kora-moves-body"]',
  );
  if (found === null) throw new Error("moves strip not rendered");
  return found;
};
const seam = (container: HTMLElement): HTMLElement => {
  const found = container.querySelector<HTMLElement>('[role="separator"]');
  if (found === null) throw new Error("moves seam not rendered");
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
  while (mountedRoots.length > 0) {
    await actUnmount(mountedRoots.pop()!);
  }
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("KoraMovesZone — the collapsed strip is the default (K-MOVES-COLLAPSED)", () => {
  it("starts folded: the honest caps count, aria-expanded=false, no body mounted", () => {
    const container = mountZone(pages());
    expect(strip(container).getAttribute("aria-expanded")).toBe("false");
    expect(strip(container).textContent).toContain("Все ходы · 3");
    // A live cursor beyond the loaded page is a «+», never an invented total.
    expect(container.querySelector("#kora-moves-body")).toBeNull();
    // The seam honestly mirrors the strip while folded.
    expect(seam(container).getAttribute("aria-valuenow")).toBe("40");
    expect(seam(container).getAttribute("aria-valuetext")).toContain("свёрнута");
    expect(localStorage.getItem("vesmaro.koraMovesH")).toBeNull();
  });

  it("the «+» marks the unloaded tail honestly", () => {
    const container = mountZone(pages({ hasMore: true }));
    expect(strip(container).textContent).toContain("Все ходы · 3+");
  });

  it("expanding deploys the transcript with the zone's OWN reading tools", async () => {
    const container = mountZone(pages());
    await act(async () => {
      strip(container).click();
      await Promise.resolve();
    });
    expect(strip(container).getAttribute("aria-expanded")).toBe("true");
    const body = container.querySelector("#kora-moves-body");
    expect(body).not.toBeNull();
    // The transcript grammar (its own suite owns the byte-for-byte shape):
    // the dialog rows + the kind tag ride as today.
    expect(body?.textContent).toContain("Покажи статус туннеля");
    expect(body?.textContent).toContain("tool_result");
    // The zone's own follow-tail and search input (separate DOM ids — the
    // chat's tail never rides this zone).
    expect(body?.textContent).toContain("Следить за хвостом");
    expect(container.querySelector("#kora-moves-search")).not.toBeNull();
    // The honest pending/empty lines stay inside the zone (nothing mounted
    // is a fake life).
  });

  it("K-MOVES-SEARCH: a match inside a cut fold opens it; the counter is honest; clearing restores", async () => {
    const container = mountZone(pages());
    await act(async () => {
      strip(container).click();
      await Promise.resolve();
    });
    const input = container.querySelector<HTMLInputElement>("#kora-moves-search");
    if (input === null) throw new Error("search input not rendered");
    // Before the query: the raw walk rides folded (the canon).
    const fold = container.querySelector("details");
    expect(fold).not.toBeNull();
    expect((fold as HTMLDetailsElement).hasAttribute("open")).toBe(false);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")
      ?.set;
    await act(async () => {
      set?.call(input, "журнала");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // The match inside the folded walk is VISIBLE (the fold opened)…
    expect(
      (container.querySelector("details") as HTMLDetailsElement).hasAttribute("open"),
    ).toBe(true);
    expect(container.textContent).toContain("журнала");
    // …and the counter is honest (the tool row matched).
    expect(container.textContent).toContain("совпадений: 1");
    await act(async () => {
      set?.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // Clearing restores the folded canon + drops the counter.
    expect(
      (container.querySelector("details") as HTMLDetailsElement).hasAttribute("open"),
    ).toBe(false);
    expect(container.textContent).not.toContain("совпадений:");
  });

  it("K-MOVES-EMPTY: the honest empty line, never a fake transcript", async () => {
    const container = mountZone(pages({ items: [] }));
    await act(async () => {
      strip(container).click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("записей в сторе нет");
  });

  it("K-MOVES-ERROR: the alert + the honest retry rides the zone", async () => {
    let refetched = 0;
    const container = mountZone(
      pages({
        items: [],
        error: new Error("hermes недоступен"),
        refetch: async () => {
          refetched += 1;
        },
      }),
    );
    await act(async () => {
      strip(container).click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Не удалось загрузить транскрипт");
    const retry = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Повторить"),
    );
    expect(retry).toBeDefined();
    await act(async () => {
      retry?.click();
      await Promise.resolve();
    });
    expect(refetched).toBe(1);
  });
});

describe("KoraMovesZone — the ex-Пульт seam hardware (vesmaro.koraMovesH)", () => {
  it("a keyboard deploy persists ONLY on commit; Home/dblclick resets to auto by REMOVING the key", async () => {
    const container = mountZone(pages());
    await act(async () => {
      strip(container).click();
      await Promise.resolve();
    });
    await keyOn(seam(container), "focusin");
    await keyOn(seam(container), "keydown", "ArrowUp");
    expect(localStorage.getItem("vesmaro.koraMovesH")).toBeNull(); // not yet
    await keyOn(seam(container), "keyup", "ArrowUp");
    expect(localStorage.getItem("vesmaro.koraMovesH")).toBe("160"); // commit
    // Reset = auto: the key is REMOVED, the zone stays deployed.
    await keyOn(seam(container), "keydown", "Home");
    expect(localStorage.getItem("vesmaro.koraMovesH")).toBeNull();
    expect(strip(container).getAttribute("aria-expanded")).toBe("true");
    await keyOn(seam(container), "dblclick");
    expect(localStorage.getItem("vesmaro.koraMovesH")).toBeNull();
  });

  it("the <120 гистерезис folds from the seam; a deliberate move re-deploys", async () => {
    const container = mountZone(pages());
    await act(async () => {
      strip(container).click();
      await Promise.resolve();
    });
    await keyOn(seam(container), "focusin");
    await keyOn(seam(container), "keydown", "ArrowDown"); // below the min
    expect(strip(container).getAttribute("aria-expanded")).toBe("false");
    await keyOn(seam(container), "keydown", "ArrowUp"); // from the strip
    expect(strip(container).getAttribute("aria-expanded")).toBe("true");
    await keyOn(seam(container), "keyup", "ArrowUp");
    expect(localStorage.getItem("vesmaro.koraMovesH")).toBe("160");
  });

  it("a persisted height restores on mount (the seam mirrors it when deployed)", async () => {
    localStorage.setItem("vesmaro.koraMovesH", "240");
    const container = mountZone(pages());
    expect(strip(container).getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      strip(container).click();
      await Promise.resolve();
    });
    const body = container.querySelector<HTMLElement>("#kora-moves-body");
    expect(body?.style.height).toBe("240px");
    expect(seam(container).getAttribute("aria-valuenow")).toBe("240");
  });
});
