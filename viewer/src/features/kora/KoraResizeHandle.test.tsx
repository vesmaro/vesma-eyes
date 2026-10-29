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
 * (07l §3.4). The POINTER path (cascade W2 QA P3) dispatches synthetic
 * PointerEvents on the seam itself (the TaskBoard.cardMenu pattern) —
 * happy-dom carries them into the React handlers; setPointerCapture rides
 * the component's optional chaining, so no real capture pipeline is
 * needed for the drag/commit contract.
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

/** One raw pointer event on the seam (the TaskBoard.cardMenu dispatch
 * pattern): down/move/up/cancel reach the React handlers by bubbling. */
async function pointer(
  element: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  clientX: number,
): Promise<void> {
  await act(async () => {
    element.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        isPrimary: true,
        pointerId: 1,
        clientX,
        clientY: 100,
      }),
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

  it("dragSign −1 (the edge on the RIGHT — the nav panel): keyboard mirrors the visual movement", async () => {
    // Review P2: the keyboard delta rides the dragSign, so a right-edged
    // seam grows with ArrowRight and shrinks with ArrowLeft; the collapse
    // stickiness judges the SIGNED delta (narrowing folds, whichever key).
    const h = mountHandle({ dragSign: -1 });
    const el = seam(h.container);
    await key(el, "ArrowRight");
    expect(h.onValue).toHaveBeenCalledWith(336); // wider — the edge moves right
    await key(el, "ArrowLeft");
    expect(h.onValue).toHaveBeenCalledWith(304); // narrower
    // A narrowing step below the minimum folds (the signed judgement).
    const folded = mountHandle({ dragSign: -1, value: 240 });
    await key(seam(folded.container), "ArrowLeft");
    expect(folded.onCollapse).toHaveBeenCalledTimes(1);
    expect(folded.onValue).not.toHaveBeenCalled();
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
    // The commit carries the committed VALUE (same-tick value+commit: a
    // closure read would still hold the pre-End width).
    expect(h.onCommit).toHaveBeenCalledWith(420);
    expect(seam(h.container)).toBe(el); // the element is still mounted
  });

  it("Escape reverts the series to the focus value AND commits the revert", async () => {
    // A CONTROLLED parent: the keyboard series actually moves the value
    // (320 → 336), then Escape walks it back and persists the revert. The
    // commit must carry the REVERT VALUE (320) as its argument: onValue +
    // onCommit fire in the SAME tick, so a commit reading the parent's
    // closure state would persist the rejected 336 (kora-seam-commit-
    // stale-closure — storage must agree with the UI it shows).
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
            onCommit={(next) => commits(next)}
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
    // WHAT was committed = the revert value, not the pre-revert closure.
    expect(commits).toHaveBeenCalledTimes(1);
    expect(commits).toHaveBeenCalledWith(320);
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

describe("KoraResizeHandle — the pointer path (cascade W2 QA P3)", () => {
  /** A CONTROLLED seam (the Escape-test shape): onValue actually moves the
   * prop, so the commit's closure reads are observable — the mount range
   * mirrors mountHandle (240–420, start 320). */
  function mountControlled(): {
    container: HTMLElement;
    commits: ReturnType<typeof vi.fn>;
  } {
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
            onCommit={(next) => commits(next)}
            onReset={() => setValue(320)}
          />
        </I18nProvider>
      );
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    act(() => {
      root.render(<Controlled />);
    });
    return { container, commits };
  }

  it("drag release (pointerup) commits the CLAMPED drag value", async () => {
    // A 500px leftward drag on a vertical seam: the raw candidate is
    // 320 + 500 = 820, the clamp floors it at the max — the parent shows
    // 420, and THAT is what the commit must persist: not the unclamped
    // 820, not the pre-drag 320 a stale closure would still hold.
    const { container, commits } = mountControlled();
    const el = seam(container);
    await pointer(el, "pointerdown", 100);
    await pointer(el, "pointermove", -400);
    expect(el.getAttribute("aria-valuenow")).toBe("420"); // the clamped UI
    await pointer(el, "pointerup", -400);
    expect(commits).toHaveBeenCalledTimes(1);
    expect(commits).toHaveBeenCalledWith(420);
  });

  it("pointercancel reverts AND commits the REVERT value in the same tick", async () => {
    // The same-tick class the seam fix (350e138) was made for: cancel
    // fires onValue(revert) + onCommit(revert) inside ONE event, while
    // the parent's closure still holds the dragged 360 — a commit reading
    // it would persist the value the UI just rejected. The revert value
    // (the drag's start, 320) must ride the call.
    const { container, commits } = mountControlled();
    const el = seam(container);
    await pointer(el, "pointerdown", 100);
    await pointer(el, "pointermove", 60); // +40 wider → the parent shows 360
    expect(el.getAttribute("aria-valuenow")).toBe("360");
    await pointer(el, "pointercancel", 60);
    expect(el.getAttribute("aria-valuenow")).toBe("320"); // reverted
    expect(commits).toHaveBeenCalledTimes(1);
    expect(commits).toHaveBeenCalledWith(320); // …and THAT is what persisted
  });
});
