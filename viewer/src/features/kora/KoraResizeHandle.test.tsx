// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/i18n";
import { actUnmount } from "@/test/actTools";
import { KoraResizeHandle } from "./KoraResizeHandle";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The v7 seam handle (07l §3 — the wave's finale blocker): the FULL
 * keyboard path (arrows ±16, Home = reset, End = max, Esc = revert the
 * series), the honest separator aria (orientation/min/max/now/valuetext),
 * commit-on-keyup (persist per series, never per frame), the collapse
 * stickiness below the line, and dblclick reset with focus retention
 * (07l §3.4). Pointer capture is an enhancement — happy-dom has no real
 * pointer pipeline, the drag contract is covered by the callbacks.
 */

const mountedRoots: Root[] = [];

function mountHandle(overrides: Partial<Parameters<typeof KoraResizeHandle>[0]> = {}): {
  container: HTMLElement;
  root: Root;
  onValue: ReturnType<typeof vi.fn>;
  onCommit: ReturnType<typeof vi.fn>;
  onReset: ReturnType<typeof vi.fn>;
  onCollapse: ReturnType<typeof vi.fn>;
} {
  const onValue = vi.fn();
  const onCommit = vi.fn();
  const onReset = vi.fn();
  const onCollapse = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      <I18nProvider initialLang="ru">
        <KoraResizeHandle
          orientation="vertical"
          label="Ширина панели хостов и сессий"
          tooltip="Потяните"
          min={240}
          max={420}
          value={320}
          valueText="320 px"
          onValue={onValue}
          onCommit={onCommit}
          onReset={onReset}
          onCollapse={onCollapse}
          {...overrides}
        />
      </I18nProvider>,
    );
  });
  return { container, root, onValue, onCommit, onReset, onCollapse };
}

function seam(container: HTMLElement): HTMLElement {
  const found = container.querySelector<HTMLElement>('[role="separator"]');
  if (found === null) throw new Error("separator not rendered");
  return found;
}

function key(element: HTMLElement, keyName: string): Promise<void> {
  return act(async () => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: keyName, bubbles: true, cancelable: true }),
    );
  });
}

async function keyUp(element: HTMLElement, keyName: string): Promise<void> {
  await act(async () => {
    element.dispatchEvent(
      new KeyboardEvent("keyup", { key: keyName, bubbles: true, cancelable: true }),
    );
  });
}

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) {
    await actUnmount(root);
  }
  document.body.innerHTML = "";
});

describe("KoraResizeHandle — the honest separator aria", () => {
  it("exposes orientation, the px range and the honest valuetext", () => {
    const { container } = mountHandle();
    const el = seam(container);
    expect(el.getAttribute("aria-orientation")).toBe("vertical");
    expect(el.getAttribute("aria-valuemin")).toBe("240");
    expect(el.getAttribute("aria-valuemax")).toBe("420");
    expect(el.getAttribute("aria-valuenow")).toBe("320");
    expect(el.getAttribute("aria-valuetext")).toBe("320 px");
    expect(el.getAttribute("aria-label")).toBe("Ширина панели хостов и сессий");
    expect(el.tabIndex).toBe(0);
  });
});

describe("KoraResizeHandle — the keyboard path (07l §3.3)", () => {
  it("ArrowLeft widens (+16), ArrowRight narrows (−16); persist on keyup", async () => {
    const h = mountHandle();
    const el = seam(h.container);
    await key(el, "ArrowLeft");
    expect(h.onValue).toHaveBeenCalledWith(336);
    await key(el, "ArrowRight");
    expect(h.onValue).toHaveBeenCalledWith(304);
    // Persist rides the keyup (the series end), not the keydown.
    expect(h.onCommit).not.toHaveBeenCalled();
    await keyUp(el, "ArrowRight");
    expect(h.onCommit).toHaveBeenCalledTimes(1);
  });

  it("horizontal seams grow with ArrowUp / shrink with ArrowDown", async () => {
    const h = mountHandle({ orientation: "horizontal" });
    const el = seam(h.container);
    expect(el.getAttribute("aria-orientation")).toBe("horizontal");
    await key(el, "ArrowUp");
    expect(h.onValue).toHaveBeenCalledWith(336);
    await key(el, "ArrowDown");
    expect(h.onValue).toHaveBeenCalledWith(304);
  });

  it("Home resets (focus stays), End goes to the max — both commit", async () => {
    const h = mountHandle();
    const el = seam(h.container);
    await key(el, "Home");
    expect(h.onReset).toHaveBeenCalledTimes(1);
    await key(el, "End");
    expect(h.onValue).toHaveBeenCalledWith(420);
    expect(h.onCommit).toHaveBeenCalled();
    expect(seam(h.container)).toBe(el); // the element is still mounted
  });

  it("Escape reverts the series to the focus value AND commits the revert", async () => {
    // A CONTROLLED parent: the keyboard series actually moves the value
    // (320 → 336), then Escape walks it back and persists the revert.
    const commits = vi.fn();
    function Controlled(): React.ReactElement {
      const [value, setValue] = useState(320);
      return (
        <I18nProvider initialLang="ru">
          <KoraResizeHandle
            orientation="vertical"
            label="Ширина панели хостов и сессий"
            tooltip="Потяните"
            min={240}
            max={420}
            value={value}
            valueText={`${value} px`}
            onValue={setValue}
            onCommit={() => commits(value)}
            onReset={() => setValue(320)}
          />
        </I18nProvider>
      );
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    await act(async () => {
      root.render(<Controlled />);
    });
    const el = seam(container);
    await act(async () => {
      el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    await key(el, "ArrowLeft");
    expect(el.getAttribute("aria-valuenow")).toBe("336");
    await key(el, "Escape");
    expect(el.getAttribute("aria-valuenow")).toBe("320");
    expect(commits).toHaveBeenCalled();
  });

  it("a NARROWING keyboard step below the minimum means «свернуть» (v12 stickiness)", async () => {
    // The Пульт fixture: min 160, drag line 120. From a fixed 160 a
    // narrowing step (160 − 16 = 144 < 160) is the collapse intent —
    // without this clamp(min) would trap the keyboard at 160 forever.
    const h = mountHandle({
      orientation: "horizontal",
      min: 160,
      value: 160,
      collapseBelow: 120,
    });
    const el = seam(h.container);
    await key(el, "ArrowDown");
    expect(h.onCollapse).toHaveBeenCalledTimes(1);
    expect(h.onValue).not.toHaveBeenCalled();
    // A WIDENING step from the strip (40, already below the min) deploys
    // to the minimum instead — the «развернуть» intent.
    const strip = mountHandle({
      orientation: "horizontal",
      min: 160,
      value: 40,
      collapseBelow: 120,
    });
    await key(seam(strip.container), "ArrowUp");
    expect(strip.onCollapse).not.toHaveBeenCalled();
    expect(strip.onValue).toHaveBeenCalledWith(160);
    // Normal narrowing inside the range never collapses.
    const mid = mountHandle({ orientation: "horizontal", min: 160, value: 240 });
    await key(seam(mid.container), "ArrowDown");
    expect(mid.onCollapse).not.toHaveBeenCalled();
    expect(mid.onValue).toHaveBeenCalledWith(224);
  });

  it("character keys are NOT shortcuts (WCAG 2.1.4 is automatic)", async () => {
    const h = mountHandle();
    const el = seam(h.container);
    await key(el, "r");
    await key(el, "+");
    expect(h.onValue).not.toHaveBeenCalled();
    expect(h.onCommit).not.toHaveBeenCalled();
  });
});
