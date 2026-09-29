import { describe, expect, it } from "vitest";
import { isEditableTarget, resolveGlobalHotkey, resolveHotkey } from "./hotkeyActions";

/**
 * Ф1 hotkey layer (ARCHCOM-3 verdict §2): the ai-brain canon — `/` opens the
 * command palette (Ф2: the palette keeps the search promise), `?` opens the
 * cheatsheet, and BOTH stay quiet inside editable surfaces (the `inInput`
 * guard) and under modifier combos. Ф2 adds the ONE global exception:
 * ⌘K / Ctrl+K opens the palette from anywhere — even inside form fields.
 */
function target(tag: string, editable = false): HTMLElement {
  return { tagName: tag, isContentEditable: editable } as unknown as HTMLElement;
}

describe("resolveHotkey", () => {
  it("maps / to open-palette and ? to open-help", () => {
    expect(resolveHotkey({ key: "/" })).toBe("open-palette");
    expect(resolveHotkey({ key: "?" })).toBe("open-help");
  });

  it("ignores every other bare key", () => {
    expect(resolveHotkey({ key: "a" })).toBeNull();
    expect(resolveHotkey({ key: "Escape" })).toBeNull();
    expect(resolveHotkey({ key: "k" })).toBeNull(); // bare k is nothing; ⌘K is global
    expect(resolveHotkey({ key: "g" })).toBeNull(); // g-prefix likewise
  });

  it("ignores modifier combos (browser/OS owns those — ⌘K is the one global)", () => {
    expect(resolveHotkey({ key: "/", metaKey: true })).toBeNull();
    expect(resolveHotkey({ key: "/", ctrlKey: true })).toBeNull();
    expect(resolveHotkey({ key: "?", altKey: true })).toBeNull();
  });

  it("applies the inInput guard: quiet inside form fields", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(resolveHotkey({ key: "/", target: target(tag) })).toBeNull();
      expect(resolveHotkey({ key: "?", target: target(tag) })).toBeNull();
    }
    expect(resolveHotkey({ key: "/", target: target("DIV") })).toBe("open-palette");
  });

  it("applies the inInput guard to contentEditable surfaces", () => {
    expect(isEditableTarget(target("DIV", true))).toBe(true);
    expect(resolveHotkey({ key: "?", target: target("DIV", true) })).toBeNull();
  });

  it("tolerates non-element targets (window itself)", () => {
    expect(resolveHotkey({ key: "/", target: null })).toBe("open-palette");
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("resolveGlobalHotkey (⌘K / Ctrl+K — the palette, Ф2)", () => {
  it("maps Cmd+K and Ctrl+K to open-palette", () => {
    expect(resolveGlobalHotkey({ key: "k", metaKey: true })).toBe("open-palette");
    expect(resolveGlobalHotkey({ key: "k", ctrlKey: true })).toBe("open-palette");
    // Case-insensitive (Caps Lock snapshots).
    expect(resolveGlobalHotkey({ key: "K", metaKey: true })).toBe("open-palette");
  });

  it("works inside editable surfaces — the palette IS an input", () => {
    expect(
      resolveGlobalHotkey({ key: "k", ctrlKey: true, target: target("INPUT") }),
    ).toBe("open-palette");
    expect(
      resolveGlobalHotkey({ key: "k", metaKey: true, target: target("DIV", true) }),
    ).toBe("open-palette");
  });

  it("stays quiet without the modifier or with extra ones", () => {
    expect(resolveGlobalHotkey({ key: "k" })).toBeNull();
    expect(resolveGlobalHotkey({ key: "k", altKey: true, metaKey: true })).toBeNull();
    expect(resolveGlobalHotkey({ key: "k", shiftKey: true, ctrlKey: true })).toBeNull();
    expect(resolveGlobalHotkey({ key: "a", ctrlKey: true })).toBeNull();
  });
});
