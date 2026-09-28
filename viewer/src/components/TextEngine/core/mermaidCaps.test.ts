import { describe, expect, it } from "vitest";
import {
  MERMAID_UNTRUSTED_MAX_FENCE_CHARS,
  MERMAID_UNTRUSTED_MAX_FENCES_PER_SURFACE,
  countMermaidFences,
  fenceExceedsSizeCap,
} from "./mermaidCaps";
import { MERMAID_MAX_TEXT_SIZE } from "./Mermaid";

/**
 * ME-013 (ADR 0020 Amendment 1, protective condition 2): the hard size caps
 * on the untrusted profile. The cap VALUES are contract, not tuning knobs —
 * these tests pin their boundaries and the fence counter's CommonMark edges.
 * The counter counts through the SAME parser the renderer uses (remark-parse
 * mdast walk — ME-013 review P1-1), so scan-vs-parser drift cannot exist by
 * construction; these shapes are regression pins, not a re-implementation.
 */
describe("mermaidCaps (untrusted profile)", () => {
  describe("fenceExceedsSizeCap", () => {
    it("lets a fence of exactly the cap through, cuts one char over", () => {
      const atCap = "a".repeat(MERMAID_UNTRUSTED_MAX_FENCE_CHARS);
      const overCap = atCap + "b";
      expect(fenceExceedsSizeCap(atCap)).toBe(false);
      expect(fenceExceedsSizeCap(overCap)).toBe(true);
    });

    it("cap sits 2× under the app's own mermaid maxTextSize (cut BEFORE the chunk loads)", () => {
      // The app pins mermaid maxTextSize to the АРХКОМ-8 constant 20_000
      // (exported from core/Mermaid.tsx; upstream's default is 50_000) — the
      // untrusted fence cap must stay below it so a hopeless fence never
      // mounts the diagram component at all.
      expect(MERMAID_UNTRUSTED_MAX_FENCE_CHARS).toBeLessThan(MERMAID_MAX_TEXT_SIZE);
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

    it("matches the info word exactly (first word; CASE mirrors the renderer)", () => {
      // lang is EXACT "mermaid" — the same rule hast.ts languageOf applies:
      // `language-MERMAID` renders as a plain code block in the theme branch,
      // so the counter must not count it either (drift-free by construction).
      expect(countMermaidFences("```MERMAID\nA-->B\n```\n")).toBe(0);
      expect(countMermaidFences("```  mermaid \nA-->B\n```\n")).toBe(1);
      // "mermaid-ish" is a different language — micromark would not theme it.
      expect(countMermaidFences("```mermaid-ish\nA-->B\n```\n")).toBe(0);
      expect(countMermaidFences("```ts mermaid\nconst x\n```\n")).toBe(0);
    });

    it("counts CONTAINER-NESTED fences (P1-1 regression pins — the renderer intercepts these)", () => {
      // Blockquote-nested: CommonMark parses this into blockquote > code(mermaid)
      // — the theme pre-branch intercepts it, so the counter must see it too.
      expect(countMermaidFences("> ```mermaid\n> A-->B\n> ```\n")).toBe(1);
      // List-item-nested (inline open and fenced block forms) — same class.
      expect(countMermaidFences("- ```mermaid\n  A-->B\n  ```\n")).toBe(1);
      expect(
        countMermaidFences("1. пункт\n\n   ```mermaid\n   A-->B\n   ```\n"),
      ).toBe(1);
      // Mixed: one flat + one nested = 2 (the per-surface cap sees BOTH).
      expect(
        countMermaidFences("```mermaid\nA-->B\n```\n\n> ```mermaid\n> C-->D\n> ```\n"),
      ).toBe(2);
    });

    it("handles CRLF line endings (Windows-authored reports)", () => {
      expect(countMermaidFences("```mermaid\r\nA-->B\r\n```\r\n")).toBe(1);
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
