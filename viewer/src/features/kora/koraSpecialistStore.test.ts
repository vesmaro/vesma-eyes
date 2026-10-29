// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSpecialistAnnotation,
  getSpecialistPersistFailure,
  resetSpecialistAnnotationsForTests,
  setSpecialistAnnotation,
  subscribeSpecialist,
} from "./koraSpecialistStore";
import { SPECIALIST_PREFIX } from "./koraFrameStorage";

/**
 * The specialist ANNOTATION store (В2): the composer's selector writes,
 * the context bar reads — one module store, honestly local. The contract
 * under test:
 * - a set persists to vesmaro.koraSpecialist:{sessionId} and is visible
 *   through the getter (both surfaces + a reload read the same fact);
 * - null clears (storage + memory);
 * - every change notifies subscribers (the bar re-renders);
 * - a seed from storage: a value written before the first read (a
 *   reload) is returned verbatim;
 * - a refused write raises the honest K-PERSIST-FAIL bit (the choice
 *   still works this visit — the UI names the non-persistence).
 */

afterEach(() => {
  localStorage.clear();
  resetSpecialistAnnotationsForTests();
});

describe("koraSpecialistStore (В2 local annotation)", () => {
  it("sets, persists and returns the annotation per session", () => {
    setSpecialistAnnotation("s1", "@GCW: Tech Lead");
    expect(getSpecialistAnnotation("s1")).toBe("@GCW: Tech Lead");
    expect(localStorage.getItem(`${SPECIALIST_PREFIX}s1`)).toBe(
      "@GCW: Tech Lead",
    );
    // Per-session keys never bleed into each other.
    expect(getSpecialistAnnotation("s2")).toBeNull();
  });

  it("clears on null (memory + storage)", () => {
    setSpecialistAnnotation("s1", "@GCW: Tech Lead");
    setSpecialistAnnotation("s1", null);
    expect(getSpecialistAnnotation("s1")).toBeNull();
    expect(localStorage.getItem(`${SPECIALIST_PREFIX}s1`)).toBeNull();
  });

  it("notifies subscribers on every change", () => {
    const spy = vi.fn();
    const unsub = subscribeSpecialist(spy);
    setSpecialistAnnotation("s1", "b");
    setSpecialistAnnotation("s1", null);
    setSpecialistAnnotation("s2", "x"); // another session still notifies
    expect(spy).toHaveBeenCalledTimes(3);
    unsub();
    setSpecialistAnnotation("s1", "c");
    expect(spy).toHaveBeenCalledTimes(3); // unsubscribed — silent
  });

  it("seeds from storage on first read (reload survival)", () => {
    localStorage.setItem(`${SPECIALIST_PREFIX}s9`, "owner");
    expect(getSpecialistAnnotation("s9")).toBe("owner");
  });

  it("an empty/blank name is treated as a clear", () => {
    setSpecialistAnnotation("s1", "   ");
    expect(getSpecialistAnnotation("s1")).toBeNull();
    expect(localStorage.getItem(`${SPECIALIST_PREFIX}s1`)).toBeNull();
  });

  it("a refused write raises the honest K-PERSIST-FAIL bit; a later success clears it", () => {
    // Private mode: the storage refuses every write (the instance spy —
    // happy-dom's localStorage does not route through Storage.prototype).
    const setItem = vi
      .spyOn(localStorage, "setItem")
      .mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });
    setSpecialistAnnotation("s1", "@GCW: Tech Lead");
    // The in-memory choice still works this visit — but the refused
    // write is recorded, not swallowed (the UI's honest note reads it).
    expect(getSpecialistAnnotation("s1")).toBe("@GCW: Tech Lead");
    expect(getSpecialistPersistFailure("s1")).toBe(true);
    // Another session stays clean (per-session bits).
    expect(getSpecialistPersistFailure("s2")).toBe(false);
    setItem.mockRestore();
    // A successful write clears the bit.
    setSpecialistAnnotation("s1", "owner");
    expect(getSpecialistPersistFailure("s1")).toBe(false);
    expect(localStorage.getItem(`${SPECIALIST_PREFIX}s1`)).toBe("owner");
  });

  it("a failed clear (removeItem refusing) raises the bit too", () => {
    const removeItem = vi
      .spyOn(localStorage, "removeItem")
      .mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });
    setSpecialistAnnotation("s1", null);
    expect(getSpecialistAnnotation("s1")).toBeNull();
    expect(getSpecialistPersistFailure("s1")).toBe(true);
    removeItem.mockRestore();
    setSpecialistAnnotation("s1", "owner");
    expect(getSpecialistPersistFailure("s1")).toBe(false);
  });
});
