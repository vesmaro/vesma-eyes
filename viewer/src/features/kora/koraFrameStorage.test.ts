// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import {
  DRAFT_PREFIX,
  KORA_ETHER_DEFAULT,
  KORA_ETHER_MAX,
  KORA_ETHER_MIN,
  KORA_PULT_MAX,
  KORA_PULT_MIN,
  KORA_SIDE_DEFAULT,
  KORA_SIDE_MAX,
  KORA_SIDE_MIN,
  clearKoraDraft,
  clearKoraPultH,
  readFrameInt,
  readKoraDraft,
  readKoraEtherW,
  readKoraPultH,
  readKoraSideW,
  writeKoraDraft,
  writeKoraEtherW,
  writeKoraPultH,
  writeKoraSideW,
} from "./koraFrameStorage";

/**
 * The v7 frame storage (07l §5.2 «безопасные геттеры»): garbage resets,
 * out-of-range clamps, absent keys mean the documented default (the Пульт
 * auto mode = the key's ABSENCE), storage failures never throw, and the
 * draft round-trips under its per-session key.
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

  it("Пульт height: the key's ABSENCE = auto (0), values clamp to 160..420", () => {
    expect(readKoraPultH()).toBe(0);
    writeKoraPultH(240);
    expect(readKoraPultH()).toBe(240);
    writeKoraPultH(50);
    expect(readKoraPultH()).toBe(KORA_PULT_MIN);
    writeKoraPultH(999);
    expect(readKoraPultH()).toBe(KORA_PULT_MAX);
    clearKoraPultH();
    expect(readKoraPultH()).toBe(0); // reset = auto, the key removed
  });

  it("Эфир width: default 320, clamped to 280..480 (15-WOW ≥280px)", () => {
    expect(readKoraEtherW()).toBe(KORA_ETHER_DEFAULT);
    writeKoraEtherW(200);
    expect(readKoraEtherW()).toBe(KORA_ETHER_MIN);
    writeKoraEtherW(900);
    expect(readKoraEtherW()).toBe(KORA_ETHER_MAX);
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
