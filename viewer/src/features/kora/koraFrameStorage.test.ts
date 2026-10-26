// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import {
  DRAFT_PREFIX,
  KORA_BAND_MAX,
  KORA_BAND_MIN,
  KORA_SIDE_DEFAULT,
  KORA_SIDE_MAX,
  KORA_SIDE_MIN,
  clearKoraDraft,
  clearKoraMovesH,
  readFrameInt,
  readKoraDraft,
  readKoraGroups,
  readKoraMovesH,
  readKoraSideW,
  writeKoraDraft,
  writeKoraGroups,
  writeKoraMovesH,
  writeKoraSideW,
} from "./koraFrameStorage";

/**
 * The v7 frame storage (07l §5.2 «безопасные геттеры»): garbage resets,
 * out-of-range clamps, absent keys mean the documented default (the «Все
 * ходы» auto mode = the key's ABSENCE), storage failures never throw, and
 * the draft round-trips under its per-session key. KW2: the Пульт-era
 * keepers (vesmaro.koraPultH / vesmaro.koraEtherW) are GONE — the height
 * key is vesmaro.koraMovesH now. KW4: vesmaro.koraLeftW is retired with
 * the left column (blueprint-kw4 §5) — a stale value is ignored dead
 * weight; vesmaro.koraGroups carries the field's group open-set.
 */

afterEach(() => {
  localStorage.clear();
});

describe("readFrameInt guards (07l §5.2)", () => {
  it("absent/empty → default; garbage → default; out-of-range → clamped", () => {
    expect(readFrameInt("test.absent", 7, 10, 20)).toBe(7);
    localStorage.setItem("test.garbage", "seventeen");
    expect(readFrameInt("test.garbage", 7, 10, 20)).toBe(7);
    localStorage.setItem("test.float", "12.9");
    expect(readFrameInt("test.float", 7, 10, 20)).toBe(12);
    localStorage.setItem("test.low", "3");
    expect(readFrameInt("test.low", 7, 10, 20)).toBe(10);
    localStorage.setItem("test.high", "99");
    expect(readFrameInt("test.high", 7, 10, 20)).toBe(20);
  });
});

describe("the named frame keys (v7 §3.1 ranges)", () => {
  it("side width: default 320, clamped to 240..420, round-trips", () => {
    expect(readKoraSideW()).toBe(KORA_SIDE_DEFAULT);
    writeKoraSideW(460);
    expect(readKoraSideW()).toBe(KORA_SIDE_MAX);
    writeKoraSideW(100);
    expect(readKoraSideW()).toBe(KORA_SIDE_MIN);
    writeKoraSideW(352);
    expect(readKoraSideW()).toBe(352);
    expect(KORA_SIDE_DEFAULT).toBe(320);
  });

  it("the retired left width (KW4): no keeper reads vesmaro.koraLeftW", () => {
    // The left column died with the two-zone frame; its named helpers are
    // gone. A stale value under the dead key is ignored dead weight — the
    // storage version is NOT bumped (07l §5.2 covers breaking schemas,
    // not ignored leftovers).
    localStorage.setItem("vesmaro.koraLeftW", "300");
    expect(readKoraSideW()).toBe(KORA_SIDE_DEFAULT);
  });

  it("group open-set (KW4, vesmaro.koraGroups): round-trips; garbage → null", () => {
    expect(readKoraGroups()).toBeNull();
    writeKoraGroups(["/home/a/proj", "__nocwd__"]);
    expect(readKoraGroups()).toEqual(["/home/a/proj", "__nocwd__"]);
    localStorage.setItem("vesmaro.koraGroups", "{not json");
    expect(readKoraGroups()).toBeNull();
    localStorage.setItem("vesmaro.koraGroups", JSON.stringify([1, 2]));
    expect(readKoraGroups()).toBeNull();
    localStorage.setItem("vesmaro.koraGroups", JSON.stringify({ open: [] }));
    expect(readKoraGroups()).toBeNull();
    localStorage.setItem("vesmaro.koraGroups", JSON.stringify([]));
    expect(readKoraGroups()).toEqual([]);
  });

  it("«Все ходы» height (KW2, vesmaro.koraMovesH): the key's ABSENCE = auto (0), values clamp to 160..420", () => {
    expect(readKoraMovesH()).toBe(0);
    writeKoraMovesH(240);
    expect(readKoraMovesH()).toBe(240);
    writeKoraMovesH(50);
    expect(readKoraMovesH()).toBe(KORA_BAND_MIN);
    writeKoraMovesH(999);
    expect(readKoraMovesH()).toBe(KORA_BAND_MAX);
    clearKoraMovesH();
    expect(readKoraMovesH()).toBe(0); // reset = auto, the key removed
  });

  it("the retired Пульт-era keys are gone (KW2): no keeper reads them", () => {
    // The legacy keys carry no live reader anymore — a stale value in
    // storage is dead weight the frame ignores (no migration needed: the
    // «Все ходы» zone starts honestly at its own default).
    localStorage.setItem("vesmaro.koraPultH", "240");
    localStorage.setItem("vesmaro.koraEtherW", "360");
    expect(readKoraMovesH()).toBe(0);
  });
});

describe("the composer draft (vesmaro.koraDraft:{sessionId})", () => {
  it("round-trips per session; empty text removes the key", () => {
    expect(readKoraDraft("sess-1")).toBeNull();
    expect(writeKoraDraft("sess-1", "набросок")).toBe(true);
    expect(readKoraDraft("sess-1")).toBe("набросок");
    expect(writeKoraDraft("sess-1", "")).toBe(true);
    expect(readKoraDraft("sess-1")).toBeNull();
    expect(localStorage.getItem(DRAFT_PREFIX + "sess-1")).toBeNull();
    clearKoraDraft("sess-1"); // idempotent on an absent key
  });
});
