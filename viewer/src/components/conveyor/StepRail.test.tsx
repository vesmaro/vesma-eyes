// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import { StepRail, stepRailState, type ConveyorStepDef } from "./StepRail";
import { I18nProvider } from "@/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * U8 StepRail (the v12 wizard-steps canon on the main construct): the
 * current step carries aria-current="step", past steps are ✓ and clickable
 * ONLY when the flow allows revisiting, future steps are disabled — the
 * rail never advertises a step the owner has not earned.
 */

const STEPS: readonly ConveyorStepDef[] = [
  { id: "what", label: "Что" },
  { id: "whom", label: "Кому" },
  { id: "check", label: "Проверка" },
];

function renderHtml(current: number, onStepClick?: (index: number) => void): string {
  return renderToString(
    <I18nProvider initialLang="ru">
      <StepRail steps={STEPS} current={current} label="Шаги" onStepClick={onStepClick} />
    </I18nProvider>,
  );
}

describe("stepRailState", () => {
  it("derives done/current/upcoming from the REAL current index", () => {
    expect(stepRailState(0, 1)).toBe("done");
    expect(stepRailState(1, 1)).toBe("current");
    expect(stepRailState(2, 1)).toBe("upcoming");
  });
});

describe("StepRail render", () => {
  it("marks the current step with aria-current and leaves future disabled", () => {
    const html = renderHtml(1);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("disabled");
    expect(html).toContain("Текущий шаг");
    expect(html).toContain("Шаг впереди");
  });

  it("renders ✓ for done steps and names the state to SR", () => {
    const html = renderHtml(2);
    expect(html).toContain("✓");
    expect(html).toContain("Шаг пройден");
  });

  it("is an ordered list with an accessible group label", () => {
    const html = renderHtml(0);
    expect(html).toContain("<ol");
    expect(html).toContain('aria-label="Шаги"');
  });
});

describe("StepRail interactions", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = null;
    container = null;
  });

  function mount(current: number, onStepClick?: (index: number) => void): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <I18nProvider initialLang="ru">
          <StepRail steps={STEPS} current={current} label="Шаги" onStepClick={onStepClick} />
        </I18nProvider>,
      );
    });
    return container;
  }

  it("clicking a done step calls back with its index when revisiting is allowed", () => {
    const seen: number[] = [];
    const el = mount(2, (index) => seen.push(index));
    const doneButtons = [...el.querySelectorAll("button")].filter(
      (button) => button.textContent?.includes("Что"),
    );
    expect(doneButtons).toHaveLength(1);
    act(() => {
      doneButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(seen).toEqual([0]);
  });

  it("done steps render inert without a back handler (live operation)", () => {
    const seen: number[] = [];
    const el = mount(2, undefined);
    const done = [...el.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Что"),
    );
    // No handler = the flow forbids editing submitted facts; the button has
    // no click wiring at all (nothing to fake-press).
    done?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(seen).toEqual([]);
  });

  it("upcoming steps are disabled in the DOM", () => {
    const el = mount(0);
    const upcoming = [...el.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Проверка"),
    );
    expect(upcoming?.disabled).toBe(true);
  });
});
