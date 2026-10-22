// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleTocClick, scrollToHeading } from "./tocScroll";

/**
 * Review P3 unit pins for the TOC click mechanics (D2 + P2): the instant
 * landing, the repeat click, the modifier/native escapes and the router-
 * owned URL sync (navigate — never a raw pushState: a pushState entry is
 * invisible to the router's save bookkeeping, which is what kept BACK on
 * the anchor; see tocScroll.ts).
 */

function makeEvent(
  overrides: Partial<Parameters<typeof handleTocClick>[0]> = {},
): Parameters<typeof handleTocClick>[0] {
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = `<h2 id="target-section" class="scroll-mt-24">Section</h2>`;
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("scrollToHeading", () => {
  it("scrolls the window instantly at the sticky-corrected offset", () => {
    expect(scrollToHeading("target-section")).toBe(true);
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0, // rect.top (0 in happy-dom) + 0 − 96 → clamped at 0
      behavior: "instant",
    });
  });

  it("returns false for a missing target — the caller falls back to native", () => {
    expect(scrollToHeading("no-such-heading")).toBe(false);
  });
});

describe("handleTocClick", () => {
  it("plain left click: scrolls, prevents default, syncs the URL through the router", () => {
    const navigate = vi.fn();
    const event = makeEvent();
    handleTocClick(event, "target-section", navigate);
    expect(window.scrollTo).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("#target-section");
  });

  it("repeat click on the same anchor scrolls again (never dead)", () => {
    const navigate = vi.fn();
    handleTocClick(makeEvent(), "target-section", navigate);
    handleTocClick(makeEvent(), "target-section", navigate);
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it("modifier clicks keep the browser defaults (new tab / new window)", () => {
    for (const overrides of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 2 },
    ]) {
      const navigate = vi.fn();
      const event = makeEvent(overrides);
      handleTocClick(event, "target-section", navigate);
      expect(event.preventDefault, JSON.stringify(overrides)).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    }
  });

  it("an already-handled event is left alone", () => {
    const navigate = vi.fn();
    const event = makeEvent({ defaultPrevented: true });
    handleTocClick(event, "target-section", navigate);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("a missing target falls through to native (no preventDefault, no navigate)", () => {
    const navigate = vi.fn();
    const event = makeEvent();
    handleTocClick(event, "no-such-heading", navigate);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
