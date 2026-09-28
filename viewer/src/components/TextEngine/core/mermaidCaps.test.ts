import { describe, expect, it } from "vitest";
import {
  MERMAID_UNTRUSTED_MAX_FENCE_CHARS,
  MERMAID_UNTRUSTED_MAX_FENCES_PER_SURFACE,
  countMermaidFences,
  fenceExceedsSizeCap,
} from "./mermaidCaps";

/**
 * ME-013 (ADR 0020 Amendment 1, protective condition 2): the hard size caps
 * on the untrusted profile. The cap VALUES are contract, not tuning knobs —
 * these tests pin their boundaries and the fence scanner's CommonMark edges
 * (both failure directions must be SAFE: scanner doubt may only overcount →
 * honest fallback, never undercount → unbounded renders).
 */
describe("mermaidCaps (untrusted profile)", () => {
  describe("fenceExceedsSizeCap", () => {
    it("lets a fence of exactly the cap through, cuts one char over", () => {
      const atCap = "a".repeat(MERMAID_UNTRUSTED_MAX_FENCE_CHARS);
      const overCap = atCap + "b";
      expect(fenceExceedsSizeCap(atCap)).toBe(false);
      expect(fenceExceedsSizeCap(overCap)).toBe(true);
    });

    it("cap sits 2× under mermaid's own maxTextSize (cut BEFORE the chunk loads)", () => {
      // АРХКОМ-8 fixed mermaid maxTextSize at 20_000; the untrusted fence cap
      // must stay below it so a hopeless fence never mounts the diagram
      // component at all.
      expect(MERMAID_UNTRUSTED_MAX_FENCE_CHARS).toBeLessThan(20_000);
    });
  });

  describe("countMermaidFences", () => {
    it("counts zero for fenceless text and for non-mermaid fences", () => {
      expect(countMermaidFences("plain text\n\nmore text")).toBe(0);
      expect(countMermaidFences("```ts\nconst x = 1;\n```\n")).toBe(0);
      expect(countMermaidFences("~~~python\nprint(1)\n~~~\n")).toBe(0);
    });

    it("counts a closed mermaid fence and an unclosed EOF fence alike", () => {
      expect(countMermaidFences("```mermaid\nflowchart LR\nA-->B\n```\n")).toBe(1);
      // Unclosed fence: micromark renders code to EOF — still a fence.
      expect(countMermaidFences("```mermaid\nflowchart LR\nA-->B\n")).toBe(1);
    });

    it("counts tilde fences and longer backtick markers", () => {
      expect(countMermaidFences("~~~mermaid\nA-->B\n~~~\n")).toBe(1);
      expect(countMermaidFences("````mermaid\nA-->B\n````\n")).toBe(1);
      // A ``` line inside a 4-backtick fence is content, not a closer.
      expect(
        countMermaidFences("````mermaid\nnested\n```\nstill fenced\n````\n"),
      ).toBe(1);
    });

    it("matches the info word exactly (case-insensitive, first word only)", () => {
      expect(countMermaidFences("```MERMAID\nA-->B\n```\n")).toBe(1);
      expect(countMermaidFences("```  mermaid \nA-->B\n```\n")).toBe(1);
      // "mermaid-ish" is a different language — micromark would not theme it.
      expect(countMermaidFences("```mermaid-ish\nA-->B\n```\n")).toBe(0);
      expect(countMermaidFences("```ts mermaid\nconst x\n```\n")).toBe(0);
    });

    it("allows up to 3 spaces of indentation, rejects a 4-space code block", () => {
      expect(countMermaidFences("   ```mermaid\nA-->B\n   ```\n")).toBe(1);
      // 4-space indent = an indented code block, not a fence (no language).
      expect(countMermaidFences("    ```mermaid\nA-->B\n```\n")).toBe(0);
    });

    it("counts every mermaid fence on a surface (capped by the caller)", () => {
      const source = Array.from(
        { length: MERMAID_UNTRUSTED_MAX_FENCES_PER_SURFACE + 1 },
        (_, i) => `\`\`\`mermaid\nA${i}-->B${i}\n\`\`\`\n`,
      ).join("\n");
      expect(countMermaidFences(source)).toBe(
        MERMAID_UNTRUSTED_MAX_FENCES_PER_SURFACE + 1,
      );
    });

    it("never counts a closer carrying an info string (CommonMark)", () => {
      // The "``` closer-ish" line does NOT close; the real closer does —
      // exactly one fence either way.
      expect(
        countMermaidFences("```mermaid\nA-->B\n``` trailing\n```\n"),
      ).toBe(1);
    });
  });
});
