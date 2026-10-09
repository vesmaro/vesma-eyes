// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  recordPresenceFlash,
  usePresenceFlash,
  type PresenceFlash,
} from "./presenceLight";
import { muteLiving } from "@/lib/livingFeed";
import { actUnmount } from "@/test/actTools";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * U6 присутствие-свет: the flash store records ONLY real transitions fed by
 * the agents bridge, coalesces per executor, and re-renders subscribers on
 * new records. The anti-fake gate (muteLiving — the ?quiet=1 surface) drops
 * records: the mute never adds motion.
 *
 * NOTE: the mute test runs LAST on purpose — muteLiving is a module-global
 * latch (mute holds until reload, by design) and this file's module
 * registry is isolated per vitest file.
 */

/** Probe: mirrors one executor's flash into a caller-owned box. */
function makeProbe(id: string, box: { flash: PresenceFlash | null }): Root {
  const container = document.createElement("div");
  const root = createRoot(container);
  function Probe() {
    box.flash = usePresenceFlash(id);
    return null;
  }
  act(() => {
    root.render(<Probe />);
  });
  return root;
}

describe("presenceLight (U6 присутствие-свет)", () => {
  it("starts with no flash and records a real transition", () => {
    const box: { flash: PresenceFlash | null } = { flash: null };
    const root = makeProbe("exec-1", box);
    expect(box.flash).toBeNull();
    act(() => {
      recordPresenceFlash("exec-1", "online");
    });
    expect(box.flash?.tone).toBe("online");
    expect(typeof box.flash?.seq).toBe("number");
    actUnmount(root);
  });

  it("coalesces per executor: the newest transition wins", () => {
    const box: { flash: PresenceFlash | null } = { flash: null };
    const root = makeProbe("exec-2", box);
    act(() => {
      recordPresenceFlash("exec-2", "online");
    });
    const first = box.flash;
    act(() => {
      recordPresenceFlash("exec-2", "offline");
    });
    expect(box.flash?.tone).toBe("offline");
    expect(box.flash!.seq).toBeGreaterThan(first!.seq);
    actUnmount(root);
  });

  it("keeps executors independent", () => {
    const boxA: { flash: PresenceFlash | null } = { flash: null };
    const boxB: { flash: PresenceFlash | null } = { flash: null };
    const rootA = makeProbe("exec-a", boxA);
    const rootB = makeProbe("exec-b", boxB);
    act(() => {
      recordPresenceFlash("exec-a", "online");
    });
    expect(boxA.flash?.tone).toBe("online");
    expect(boxB.flash).toBeNull();
    actUnmount(rootA);
    actUnmount(rootB);
  });

  it("ignores an empty executor id", () => {
    const box: { flash: PresenceFlash | null } = { flash: null };
    const root = makeProbe("", box);
    act(() => {
      recordPresenceFlash("", "online");
    });
    expect(box.flash).toBeNull();
    actUnmount(root);
  });

  it("drops records under the anti-fake gate (the mute never adds motion)", () => {
    const box: { flash: PresenceFlash | null } = { flash: null };
    const root = makeProbe("exec-q", box);
    act(() => {
      muteLiving();
      recordPresenceFlash("exec-q", "online");
    });
    expect(box.flash).toBeNull();
    actUnmount(root);
  });
});
