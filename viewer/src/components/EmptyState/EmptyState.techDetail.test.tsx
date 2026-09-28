// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EmptyState } from "./EmptyState";
import { I18nProvider } from "@/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * EmptyState `techDetail` (UX-overhaul spec §7.2, П4): a raw adapter
 * `error.message` NEVER renders open in the UI — it sits under a collapsed
 * «Технические подробности» disclosure (button + aria-expanded/aria-controls)
 * and only appears after an explicit click. The human `message` stays the
 * always-visible dictionary phrase.
 */

function mountEmptyState(
  props: { techDetail?: string; message?: string },
): { root: Root; container: HTMLElement } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <I18nProvider initialLang="ru">
        <EmptyState
          variant="error"
          title="Не удалось загрузить"
          message={props.message}
          techDetail={props.techDetail}
        />
      </I18nProvider>,
    );
  });
  return { root, container };
}

const roots: Root[] = [];
afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop()!;
    await act(async () => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
});

function mount(props: { techDetail?: string; message?: string }) {
  const mounted = mountEmptyState(props);
  roots.push(mounted.root);
  return mounted;
}

describe("EmptyState techDetail disclosure (UX-overhaul §7.2)", () => {
  it("hides the raw error behind a collapsed disclosure; nothing renders open by default", () => {
    const { container } = mount({
      message: "Не удалось получить состояние служб",
      techDetail: "BoardAdapter.metrics: merge-API 501 (adapter internals)",
    });
    const text = container.textContent ?? "";
    // The HUMAN phrase is the visible copy; the raw text is NOT in the DOM
    // before the click (collapsed = not rendered).
    expect(text).toContain("Не удалось получить состояние служб");
    expect(text).not.toContain("BoardAdapter.metrics");
    // The disclosure trigger states its contract.
    expect(text).toContain("Технические подробности");
    const button = container.querySelector<HTMLButtonElement>(
      "button[aria-expanded]",
    )!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBeTruthy();
  });

  it("opens on click: aria-expanded flips and the raw text appears (verifiable once)", async () => {
    const { container } = mount({
      techDetail: "BoardAdapter.metrics: merge-API 501 (adapter internals)",
    });
    const button = container.querySelector<HTMLButtonElement>(
      "button[aria-expanded]",
    )!;
    await act(async () => {
      button.click();
    });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const panelId = button.getAttribute("aria-controls")!;
    // React useId() ids contain «:» — select by attribute, not a raw
    // `#id` selector (happy-dom's parser chokes on it).
    const panel = container.querySelector(`[id="${panelId}"]`);
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("BoardAdapter.metrics");
    // A second click folds it back (a disclosure, not a one-way road).
    await act(async () => {
      button.click();
    });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(`[id="${panelId}"]`)).toBeNull();
  });

  it("renders no disclosure at all without techDetail (no dead furniture)", () => {
    const { container } = mount({ message: "Обычное пояснение" });
    expect(container.querySelector("button[aria-expanded]")).toBeNull();
    expect(container.textContent).not.toContain("Технические подробности");
  });
});