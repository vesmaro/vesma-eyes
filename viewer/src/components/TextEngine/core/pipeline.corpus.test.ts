import { describe, expect, it } from "vitest";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { defaultSchema } from "hast-util-sanitize";
import { buildCorpusPipeline } from "./pipeline.corpus";

/**
 * The curated pipeline contracts (ADR 0020 Ф2), moved verbatim from the Ф1
 * core.test.ts corpus block: rehype-raw → dropSubtrees → sanitize(schema) IN
 * THAT ORDER (АРХКОМ-8: the order is the security model), cached by config
 * identity. (The fail-closed corpus-mode rejection of buildPipeline is a
 * pipeline.ts contract — pinned in core.test.tsx, not here.) This module is
 * the ONLY src site importing the sanitize stack — ESLint pins it; the
 * md-sanitize vendor pool hangs off exactly this import edge.
 */
describe("text-engine/core corpus pipeline", () => {
  it("corpus pipeline: raw → dropSubtrees → sanitize(schema) in order, cached", () => {
    const config = {
      dropSubtrees: ["script", "style", "iframe"] as const,
      schema: defaultSchema,
    };
    const first = buildCorpusPipeline(config);
    const second = buildCorpusPipeline(config);
    expect(second).toBe(first);
    // The exact curated order (АРХКОМ-8) — asserted positionally.
    expect(first.rehypePlugins[0]).toBe(rehypeRaw);
    expect(first.rehypePlugins[1]).toBeTypeOf("function");
    expect(first.rehypePlugins[2]).toEqual([rehypeSanitize, defaultSchema]);
    expect(first.remarkPlugins).toEqual([remarkGfm]);
  });

  it("a different config builds a different pipeline (cache keyed by identity)", () => {
    const base = buildCorpusPipeline({
      dropSubtrees: ["script"],
      schema: defaultSchema,
    });
    const other = buildCorpusPipeline({
      dropSubtrees: ["script", "style"],
      schema: defaultSchema,
    });
    expect(other).not.toBe(base);
  });
});
