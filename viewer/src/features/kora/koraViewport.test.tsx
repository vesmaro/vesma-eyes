// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { KORA_FRAME_QUERY, useIsFrameViewport } from "./koraViewport";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The ladder's viewport hook (blueprint-kw4 §6): KW4 has ONE JS seam left —
 * the frame query must stay EXACTLY Tailwind's lg (the `lg:` classes and
 * the JS placement branch have to agree), and a viewport crossing must
 * re-render the flag (useSyncExternalStore subscription). The KW3 wide
 * query is retired with the three-column frame it ruled.
 */

interface FakeMql {
  matches: boolean;
  listeners: Array<() => void>;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

function installFakeMatchMedia(): Map<string, FakeMql> {
  const registry = new Map<string, FakeMql>();
  const make = (query: string): FakeMql => {
    const mql: FakeMql = {
      matches: false,
      listeners: [],
      addEventListener(type, listener) {
        if (type === "change") mql.listeners.push(listener);
      },
      removeEventListener(_type, listener) {
        mql.listeners = mql.listeners.filter((l) => l !== listener);
      },
    };
    registry.set(query, mql);
    return mql;
  };
  // Seed the ladder query eagerly — the tests pin the regime before the
  // first render touches matchMedia.
  make(KORA_FRAME_QUERY);
  window.matchMedia = ((query: string) =>
    registry.get(query) ?? make(query)) as unknown as typeof window.matchMedia;
  return registry;
}

function probe(): { frame: boolean } {
  const box = document.createElement("div");
  let value = { frame: false };
  const root = createRoot(box);
  const Probe = (): null => {
    value = { frame: useIsFrameViewport() };
    return null;
  };
  act(() => {
    root.render(<Probe />);
  });
  act(() => {
    root.unmount();
  });
  return value;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("koraViewport ladder hooks", () => {
  it("the query stays Tailwind's lg verbatim (the frame branch and the lg: classes agree)", () => {
    expect(KORA_FRAME_QUERY).toBe("(min-width: 1024px)");
  });

  it("happy-dom's null viewport reads as the document flow (false)", () => {
    installFakeMatchMedia();
    expect(probe()).toEqual({ frame: false });
  });

  it("≥lg answers frame=true (the two-zone 100vh frame)", () => {
    const registry = installFakeMatchMedia();
    registry.get(KORA_FRAME_QUERY)!.matches = true;
    expect(probe()).toEqual({ frame: true });
  });

  it("a viewport crossing re-renders the flag (the subscription is live)", async () => {
    const registry = installFakeMatchMedia();
    let rendered = { frame: false };
    const box = document.createElement("div");
    document.body.appendChild(box);
    const root = createRoot(box);
    const Probe = (): null => {
      rendered = { frame: useIsFrameViewport() };
      return null;
    };
    act(() => {
      root.render(<Probe />);
    });
    expect(rendered).toEqual({ frame: false });
    // Cross into the frame: the MQL fires, the hook re-reads.
    act(() => {
      registry.get(KORA_FRAME_QUERY)!.matches = true;
      registry.get(KORA_FRAME_QUERY)!.listeners.forEach((l) => l());
    });
    expect(rendered).toEqual({ frame: true });
    act(() => {
      root.unmount();
    });
  });
});
