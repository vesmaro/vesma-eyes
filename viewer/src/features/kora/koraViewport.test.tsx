// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import {
  KORA_FRAME_QUERY,
  KORA_WIDE_QUERY,
  useIsFrameViewport,
  useIsWideFrame,
} from "./koraViewport";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The ladder's viewport hooks (states.md §6, KW3): the two query strings
 * must stay EXACTLY Tailwind's lg/xl (the `lg:`/`xl:` classes and the JS
 * placement branch have to agree), and a viewport change must re-render
 * the flag (useSyncExternalStore subscription).
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
  // Seed BOTH ladder queries eagerly — the tests pin the regimes before
  // the first render touches matchMedia.
  make(KORA_WIDE_QUERY);
  make(KORA_FRAME_QUERY);
  window.matchMedia = ((query: string) =>
    registry.get(query) ?? make(query)) as unknown as typeof window.matchMedia;
  return registry;
}

function probe(): { wide: boolean; frame: boolean } {
  const box = document.createElement("div");
  let value = { wide: false, frame: false };
  const root = createRoot(box);
  const Probe = (): null => {
    value = { wide: useIsWideFrame(), frame: useIsFrameViewport() };
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
  it("the queries stay Tailwind's xl/lg verbatim", () => {
    expect(KORA_WIDE_QUERY).toBe("(min-width: 1280px)");
    expect(KORA_FRAME_QUERY).toBe("(min-width: 1024px)");
  });

  it("happy-dom's null viewport reads as the document flow (both false)", () => {
    installFakeMatchMedia();
    expect(probe()).toEqual({ wide: false, frame: false });
  });

  it("lg..xl answers frame=true / wide=false (the nav rides the meta panel)", () => {
    const registry = installFakeMatchMedia();
    registry.get(KORA_FRAME_QUERY)!.matches = true;
    expect(probe()).toEqual({ wide: false, frame: true });
  });

  it("≥xl answers both true (the three-column frame)", () => {
    const registry = installFakeMatchMedia();
    registry.get(KORA_FRAME_QUERY)!.matches = true;
    registry.get(KORA_WIDE_QUERY)!.matches = true;
    expect(probe()).toEqual({ wide: true, frame: true });
  });

  it("a viewport crossing re-renders the flag (the subscription is live)", async () => {
    const registry = installFakeMatchMedia();
    let rendered = { wide: false, frame: false };
    const box = document.createElement("div");
    document.body.appendChild(box);
    const root = createRoot(box);
    const Probe = (): null => {
      rendered = { wide: useIsWideFrame(), frame: useIsFrameViewport() };
      return null;
    };
    act(() => {
      root.render(<Probe />);
    });
    expect(rendered).toEqual({ wide: false, frame: false });
    // Cross into the wide frame: the MQL fires, the hook re-reads.
    act(() => {
      registry.get(KORA_WIDE_QUERY)!.matches = true;
      registry.get(KORA_WIDE_QUERY)!.listeners.forEach((l) => l());
    });
    expect(rendered).toEqual({ wide: true, frame: false });
    act(() => {
      root.unmount();
    });
  });
});
