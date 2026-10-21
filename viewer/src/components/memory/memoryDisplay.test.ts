import { describe, expect, it } from "vitest";
import {
  humanMemoryTitle,
  isGenericMemoryTitle,
  memoryCardPreview,
  memoryHumanFace,
} from "./memoryDisplay";

describe("isGenericMemoryTitle", () => {
  it("matches the bare speaker words session ingests store as titles", () => {
    for (const title of ["User", "user", "Assistant", "SYSTEM", "human", "AI"]) {
      expect(isGenericMemoryTitle(title)).toBe(true);
    }
  });

  it("keeps real titles and empty titles out", () => {
    expect(isGenericMemoryTitle("Session 20260808 summary")).toBe(false);
    expect(isGenericMemoryTitle("Users of the overlay network")).toBe(false);
    expect(isGenericMemoryTitle("")).toBe(false);
    expect(isGenericMemoryTitle(null)).toBe(false);
    expect(isGenericMemoryTitle(undefined)).toBe(false);
  });
});

describe("memoryHumanFace (D7 — «десяток записей с заголовком User»)", () => {
  it("returns null for an informative title — the stock face stays", () => {
    expect(
      memoryHumanFace({ title: "ADR: gateway proxy", content: "whatever" }),
    ).toBeNull();
  });

  it("mines the headline from a transcript line under a role marker", () => {
    const face = memoryHumanFace({
      title: "User",
      content: "## User Да, если что — инициация со телефона.\nОтвет агента.",
    });
    expect(face).not.toBeNull();
    expect(face?.headline).toBe("Да, если что — инициация со телефона.");
    expect(face?.preview).toBe("Ответ агента.");
  });

  it("clips a long headline to 60 chars with an ellipsis", () => {
    const line = "Да, если что — инициация звонка идёт с телефона, а не с ноутбука, честно.";
    const face = memoryHumanFace({ title: "User", content: `## User ${line}` });
    expect(face?.headline).toBe(`${line.slice(0, 60).trimEnd()}…`);
  });

  it("drops a machine-dump head under the fold and keeps the prose face", () => {
    const face = memoryHumanFace({
      title: "User",
      content:
        "I'll save the audio attachment.\n"
        + "Если хостинг ляжет — откатываемся на прошлый бандл.",
    });
    expect(face?.headline).toBe("I'll save the audio attachment.");
    expect(face?.preview).toBe("Если хостинг ляжет — откатываемся на прошлый бандл.");
  });

  it("mines past a dump head when prose lives further down", () => {
    const face = memoryHumanFace({
      title: "user",
      content:
        "/var/folders/sc1eulyj1d81/audio_3be0bd9e76.ogg\n"
        + '{"json":"dump","with":"paths"}\n'
        + "Звуковая версия проходит проверку.\n"
        + "Дальше — больше.",
    });
    expect(face?.headline).toBe("Звуковая версия проходит проверку.");
    expect(face?.preview).toBe("Дальше — больше.");
  });

  it("returns null for an all-dump body — honest absence, no mined lie", () => {
    expect(
      memoryHumanFace({
        title: "User",
        content: "/tmp/audio_3be0bd9e76.ogg\n{\"a\":1}\n3f5a9b77c1e2",
      }),
    ).toBeNull();
  });

  it("never mines from fenced content", () => {
    expect(
      memoryHumanFace({
        title: "User",
        content: "```\n{\"payload\":\"likely prose inside code\"}\n```",
      }),
    ).toBeNull();
  });
});

describe("humanMemoryTitle / memoryCardPreview", () => {
  it("falls back through the mined headline to the stored title", () => {
    expect(humanMemoryTitle({ title: "ADR: gateway proxy", content: "body" })).toBe(
      "ADR: gateway proxy",
    );
    // All-dump body → the honest stored word stays.
    expect(humanMemoryTitle({ title: "User", content: "/tmp/dump.ogg" })).toBe("User");
  });

  it("keeps the effective content as preview for real titles", () => {
    expect(memoryCardPreview({ title: "Real", content: "plain body" })).toBe("plain body");
    expect(memoryCardPreview({ title: "Real", content: "raw", clean_content: "clean" })).toBe(
      "clean",
    );
  });

  it("preview drops everything through the headline line (dump head under the fold)", () => {
    const preview = memoryCardPreview({
      title: "User",
      content:
        "/tmp/audio.ogg\n{\"dump\":true}\nПервая осмысленная строка письма владельцу.\nВторая строка.",
    });
    expect(preview).toBe("Вторая строка.");
  });

  it("preview is empty when the headline is the whole body", () => {
    expect(memoryCardPreview({ title: "User", content: "Одна-единственная строка письма." })).toBe(
      "",
    );
  });
});
