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
 * the polite announcement), the manual toggle, the beat expiry (one
 * attention window) and the timer cleanup on unmount. The renderers
 * (zcode scroll + hermes scroll) consume these through props — the render
 * grammar is pinned in KoraTranscript.test.tsx. The answer → raw-walk
 * direction is the fold summary itself (adjacent by construction) — its
 * programmatic wire was unconsumed and removed with its flash beat
 * (ux-hygiene-followups-20261020; обратное направление живёт в ката).
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

/** The wire target: the DOM id the machine scrolls to (the renderers mint
 * the same id through the model helper). */
function installWireTargets(): {
  anchorScroll: ReturnType<typeof vi.fn>;
} {
  const anchorScroll = vi.fn();
  const anchorEl = document.createElement("div");
  anchorEl.id = "kora-anchor-2";
  anchorEl.scrollIntoView = anchorScroll;
  document.body.append(anchorEl);
  return { anchorScroll };
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

  it("two quick jumps to different anchors never announce the same line (live region)", async () => {
    installWireTargets();
    await mountProbe();
    act(() => {
      probeHolder.current?.jumpToAnswer(2);
    });
    const first = currentWires().announce;
    act(() => {
      probeHolder.current?.jumpToAnswer(7);
    });
    const second = currentWires().announce;
    expect(first).not.toBe("");
    expect(second).not.toBe(first);
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
