// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearKoraDockHidden,
  getKoraDockAlias,
  getKoraDockCustomPersistFailure,
  getKoraDockHidden,
  getKoraDockPins,
  resetKoraDockCustomForTests,
  setKoraDockAlias,
  setKoraDockHidden,
  setKoraDockPinned,
  subscribeKoraDockCustom,
} from "./koraDockCustomStore";

/**
 * The dock CUSTOMIZATION store (В4; kora-ide contract §3.1/§7 В4): pins /
 * local aliases / local hiding — every write honest (the boolean is never
 * swallowed; a refused write raises the K-PERSIST-FAIL bit), everything
 * LOCAL (no server archive/rename exists, none is invented), the seeded
 * reads never replace a snapshot (the store-loop lesson).
 */

const PINS_KEY = "vesmaro.koraDockPins";
const HIDDEN_KEY = "vesmaro.koraDockHidden";
const ALIAS_KEY = "vesmaro.koraAlias:exec-zc:one";

beforeEach(() => {
  localStorage.clear();
  // The store caches at module load — every test re-reads from the
  // (cleared) storage, the test-only reset.
  resetKoraDockCustomForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pins (vesmaro.koraDockPins)", () => {
  it("pins in order, unpins, and persists the order", () => {
    expect(setKoraDockPinned("a")).toBe(true);
    expect(setKoraDockPinned("b")).toBe(true);
    expect(getKoraDockPins()).toEqual(["a", "b"]);
    expect(JSON.parse(localStorage.getItem(PINS_KEY) ?? "[]")).toEqual(["a", "b"]);
    // The null call TOGGLES (the /pin command's semantics — the fact
    // returns so the composer can announce what happened): the second
    // call unpins.
    expect(setKoraDockPinned("a")).toBe(false);
    expect(getKoraDockPins()).toEqual(["b"]);
    // Explicit states work both ways (the row menu's pin/unpin rows).
    expect(setKoraDockPinned("a", true)).toBe(true);
    expect(setKoraDockPinned("a", false)).toBe(false);
    expect(getKoraDockPins()).toEqual(["b"]);
  });

  it("seeds from storage (a reload restores the pin shelf)", () => {
    localStorage.setItem(PINS_KEY, JSON.stringify(["x", "y"]));
    resetKoraDockCustomForTests(); // = the module re-read on a reload
    expect(getKoraDockPins()).toEqual(["x", "y"]);
  });

  it("garbage storage reads as absent, never throws", () => {
    localStorage.setItem(PINS_KEY, "{not json");
    resetKoraDockCustomForTests();
    expect(getKoraDockPins()).toEqual([]);
    localStorage.setItem(PINS_KEY, JSON.stringify([1, 2]));
    resetKoraDockCustomForTests();
    expect(getKoraDockPins()).toEqual([]);
  });

  it("a refused write keeps the visit-local state and raises K-PERSIST-FAIL", () => {
    // Private mode: the INSTANCE spy (happy-dom's localStorage does not
    // route through Storage.prototype — the specialist store's precedent).
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(setKoraDockPinned("k")).toBe(true);
    expect(getKoraDockPins()).toEqual(["k"]); // works this visit
    expect(getKoraDockCustomPersistFailure()).toBe(true);
    expect(localStorage.getItem(PINS_KEY)).toBeNull(); // nothing pretended
    // A later successful write clears the bit.
    spy.mockRestore();
    expect(setKoraDockPinned("k", false)).toBe(false);
    expect(getKoraDockCustomPersistFailure()).toBe(false);
  });
});

describe("local aliases (vesmaro.koraAlias:{sessionId})", () => {
  it("sets, reads and clears; an emptied name clears", () => {
    setKoraDockAlias("exec-zc:one", "Моя задача");
    expect(getKoraDockAlias("exec-zc:one")).toBe("Моя задача");
    expect(localStorage.getItem(ALIAS_KEY)).toBe("Моя задача");
    setKoraDockAlias("exec-zc:one", "  ");
    expect(getKoraDockAlias("exec-zc:one")).toBeNull();
    expect(localStorage.getItem(ALIAS_KEY)).toBeNull();
  });

  it("slices overlong names (a name annotation, not an archive)", () => {
    setKoraDockAlias("exec-zc:one", "и".repeat(500));
    expect(getKoraDockAlias("exec-zc:one")).toHaveLength(200);
  });

  it("an absent alias reads null — never an empty string", () => {
    expect(getKoraDockAlias("exec-zc:none")).toBeNull();
  });

  it("a refused write raises the bit; a success clears it", () => {
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    setKoraDockAlias("exec-zc:one", "Локальное");
    expect(getKoraDockAlias("exec-zc:one")).toBe("Локальное");
    expect(getKoraDockCustomPersistFailure()).toBe(true);
    spy.mockRestore();
    setKoraDockAlias("exec-zc:one", "Локальное");
    expect(getKoraDockCustomPersistFailure()).toBe(false);
  });
});

describe("local hiding (vesmaro.koraDockHidden)", () => {
  it("hides, unhides, clears all; persists", () => {
    setKoraDockHidden("a", true);
    setKoraDockHidden("b", true);
    expect(getKoraDockHidden().has("a")).toBe(true);
    expect([...getKoraDockHidden()].sort()).toEqual(["a", "b"]);
    expect(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]").sort()).toEqual(["a", "b"]);
    setKoraDockHidden("a", false);
    expect(getKoraDockHidden().has("a")).toBe(false);
    clearKoraDockHidden();
    expect(getKoraDockHidden().size).toBe(0);
  });

  it("toggling (null) flips the current state", () => {
    setKoraDockHidden("t"); // hidden
    expect(getKoraDockHidden().has("t")).toBe(true);
    setKoraDockHidden("t"); // unhidden
    expect(getKoraDockHidden().has("t")).toBe(false);
  });

  it("a refused write raises the bit (the honest line says «не сохранилось»)", () => {
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    setKoraDockHidden("h", true);
    expect(getKoraDockHidden().has("h")).toBe(true);
    expect(getKoraDockCustomPersistFailure()).toBe(true);
    spy.mockRestore();
  });
});

describe("subscriptions", () => {
  it("notifies on every write (the surfaces stay in sync)", () => {
    const seen: number[] = [];
    const unsub = subscribeKoraDockCustom(() => seen.push(seen.length));
    setKoraDockPinned("s");
    setKoraDockAlias("s", "имя");
    setKoraDockHidden("s", true);
    clearKoraDockHidden();
    unsub();
    expect(seen).toHaveLength(4);
  });
});
