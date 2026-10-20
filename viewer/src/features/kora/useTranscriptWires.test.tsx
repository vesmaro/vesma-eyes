// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { actUnmount } from "@/test/actTools";
import { useTranscriptWires } from "./useTranscriptWires";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The transcript wire STATE MACHINE (transcript-ux wave, «связность
 * лог↔ответ»): raw row → answer (jumpToAnswer: scroll + spotlight beat +
 * the polite announcement) and answer → raw walk (jumpToRawWalk: open the
 * fold + scroll + flash beat), the manual toggle, the beat expiry (one
 * attention window) and the timer cleanup on unmount. The renderers
 * (zcode scroll today, hermes scroll next leg) consume these through
 * props — the render grammar is pinned in KoraTranscript.test.tsx.
 */

/** The probe hands the machine over OUTSIDE render (an effect — the
 * react-hooks purity rule); every act() flush re-renders the hook, so
 * tests re-read the holder instead of holding a stale snapshot. */
const probeHolder: { current: ReturnType<typeof useTranscriptWires> | null } = {
  current: null,
};

function WiresProbe(): null {
  const wires = useTranscriptWires();
  useEffect(() => {
    probeHolder.current = wires;
  });
  return null;
}

function currentWires(): ReturnType<typeof useTranscriptWires> {
  const wires = probeHolder.current;
  if (wires === null) throw new Error("probe not mounted");
  return wires;
}

const mountedRoots: Root[] = [];

async function mountProbe(): Promise<void> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(<WiresProbe />);
  });
}

/** The wire targets: DOM ids the machine scrolls to (the renderers mint
 * the same ids through the model helpers). */
function installWireTargets(): {
  anchorScroll: ReturnType<typeof vi.fn>;
  foldScroll: ReturnType<typeof vi.fn>;
} {
  const anchorScroll = vi.fn();
  const foldScroll = vi.fn();
  const anchorEl = document.createElement("div");
  anchorEl.id = "kora-anchor-2";
  anchorEl.scrollIntoView = anchorScroll;
  const foldEl = document.createElement("div");
  foldEl.id = "kora-fold-2";
  foldEl.scrollIntoView = foldScroll;
  document.body.append(anchorEl, foldEl);
  return { anchorScroll, foldScroll };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    if (root !== undefined) await actUnmount(root);
  }
  document.body.innerHTML = "";
  probeHolder.current = null;
  vi.useRealTimers();
});

describe("useTranscriptWires («связность лог↔ответ»)", () => {
  it("jumpToAnswer: scrolls the anchor into view, spotlights + announces", async () => {
    const { anchorScroll } = installWireTargets();
    await mountProbe();
    act(() => {
      probeHolder.current?.jumpToAnswer(2);
    });
    const probe = currentWires();
    expect(anchorScroll).toHaveBeenCalledWith(
      expect.objectContaining({ block: "center" }),
    );
    expect(probe.spotSeq).toBe(2);
    expect(probe.announce).not.toBe("");
  });

  it("jumpToRawWalk: opens the fold, then scrolls it into view after the frame", async () => {
    const { foldScroll } = installWireTargets();
    await mountProbe();
    act(() => {
      probeHolder.current?.jumpToRawWalk(2);
    });
    const probe = currentWires();
    expect(probe.openFolds.has(2)).toBe(true);
    expect(probe.flashFold).toBe(2);
    // The scroll waits one frame (the fold must exist/open first).
    expect(foldScroll).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(32); // one rAF tick
    });
    expect(foldScroll).toHaveBeenCalledWith(
      expect.objectContaining({ block: "center" }),
    );
  });

  it("the beat expires after one attention window (static, no animation)", async () => {
    installWireTargets();
    await mountProbe();
    act(() => {
      probeHolder.current?.jumpToAnswer(2);
    });
    expect(currentWires().announce).not.toBe("");
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    const probe = currentWires();
    expect(probe.spotSeq).toBeNull();
    expect(probe.flashFold).toBeNull();
    expect(probe.announce).toBe("");
  });

  it("onFoldToggle drives the manual fold state both ways", async () => {
    installWireTargets();
    await mountProbe();
    act(() => {
      probeHolder.current?.onFoldToggle(7, true);
    });
    expect(currentWires().openFolds.has(7)).toBe(true);
    act(() => {
      probeHolder.current?.onFoldToggle(7, false);
    });
    expect(currentWires().openFolds.has(7)).toBe(false);
  });

  it("unmount mid-beat clears the timer — no state writes after unmount", async () => {
    installWireTargets();
    await mountProbe();
    act(() => {
      probeHolder.current?.jumpToAnswer(2);
    });
    const root = mountedRoots.pop();
    if (root === undefined) throw new Error("root missing");
    await actUnmount(root);
    expect(() => {
      vi.advanceTimersByTime(1600);
    }).not.toThrow();
  });
});
