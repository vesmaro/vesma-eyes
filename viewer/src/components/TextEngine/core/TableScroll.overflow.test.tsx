// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/i18n";
import { TableScroll } from "./TableScroll";

/**
 * The overflow re-measurement gate of the scroll wrapper (hygiene batch
 * review tail textengine-overflow-mutationobserver): streaming markdown
 * REPLACES the block node inside the wrapper — a half-streamed paragraph
 * completes into a GFM table and the <p> element is swapped for a
 * <table>. The ResizeObserver captured at mount keeps watching the
 * DETACHED node, and the wrapper's own content box does not move when
 * its overflow grows, so without a childList re-check the overflow state
 * (scroll affordance, data-table-overflow → sticky first column) goes
 * stale exactly mid-stream.
 *
 * happy-dom has no layout engine (scrollWidth/clientWidth are always 0
 * and ResizeObserver never fires), so the test pins the metrics with
 * per-element getters and drives ResizeObserver with a controllable
 * fake; the MutationObserver leg is the REAL happy-dom observer — the
 * block swap below must re-measure WITHOUT any ResizeObserver event.
 */

/** Controllable ResizeObserver double: records what it observes and
 * never fires on its own. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly observed = new Set<Element>();
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.add(el);
  }

  unobserve(el: Element): void {
    this.observed.delete(el);
  }

  disconnect(): void {
    this.observed.clear();
  }

  trigger(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

/** happy-dom reports 0 for every box metric — pin them per instance. */
function setMetrics(el: Element, clientWidth: number, scrollWidth: number): void {
  Object.defineProperty(el, "clientWidth", {
    configurable: true,
    get: () => clientWidth,
  });
  Object.defineProperty(el, "scrollWidth", {
    configurable: true,
    get: () => scrollWidth,
  });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(children: React.ReactNode): Promise<void> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <I18nProvider initialLang="en">
        <TableScroll>{children}</TableScroll>
      </I18nProvider>,
    );
  });
}

async function rerender(children: React.ReactNode): Promise<void> {
  await act(async () => {
    root!.render(
      <I18nProvider initialLang="en">
        <TableScroll>{children}</TableScroll>
      </I18nProvider>,
    );
    // Let the MutationObserver microtasks deliver.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function region(): HTMLElement {
  const el = container!.querySelector('[role="region"]');
  expect(el, "the keyboard-focusable scroll region mounted").not.toBeNull();
  return el as HTMLElement;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  vi.unstubAllGlobals();
  FakeResizeObserver.instances = [];
});

describe("TableScroll overflow re-measurement on block swap", () => {
  it("a replaced block (<p> → <table> swap) re-measures WITHOUT a ResizeObserver event — overflow goes live", async () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver as unknown);
    await mount(<p className="block-a">half-streamed text</p>);

    const el = region();
    setMetrics(el, 100, 100); // no overflow at mount
    expect(el.getAttribute("data-table-overflow")).toBeNull();

    // The streaming completion: the paragraph becomes a table — React
    // replaces the child node; the new block is WIDER than the wrapper.
    setMetrics(el, 100, 300);
    await rerender(<table className="block-b"><tbody><tr><td>wide row</td></tr></tbody></table>);

    // No ResizeObserver callback fired — the childList watch alone must
    // have re-measured.
    expect(el.getAttribute("data-table-overflow")).toBe("true");
  });

  it("re-arms the child observation: the new block is observed, the detached one is not", async () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver as unknown);
    await mount(<p className="block-a">half-streamed text</p>);
    const el = region();

    const observer = FakeResizeObserver.instances.at(-1)!;
    const oldChild = el.firstElementChild!;
    await rerender(<table className="block-b"><tbody><tr><td>row</td></tr></tbody></table>);

    const newChild = el.firstElementChild!;
    expect(newChild).not.toBe(oldChild);
    expect(observer.observed.has(newChild), "the new block is observed").toBe(
      true,
    );
    expect(
      observer.observed.has(oldChild),
      "the detached block is unobserved",
    ).toBe(false);
    // The wrapper stays observed throughout (viewport/rail resizes).
    expect(observer.observed.has(el)).toBe(true);
  });

  it("the ResizeObserver leg keeps working: a callback still re-measures", async () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver as unknown);
    await mount(<table><tbody><tr><td>row</td></tr></tbody></table>);
    const el = region();
    setMetrics(el, 100, 100);
    expect(el.getAttribute("data-table-overflow")).toBeNull();

    setMetrics(el, 100, 400);
    const observer = FakeResizeObserver.instances.at(-1)!;
    await act(async () => {
      observer.trigger();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(el.getAttribute("data-table-overflow")).toBe("true");
  });
});
