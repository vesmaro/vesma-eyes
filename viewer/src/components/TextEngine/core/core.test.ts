import { describe, expect, it } from "vitest";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { defaultSchema } from "hast-util-sanitize";
import { buildPipeline } from "./pipeline";
import { themeComponents } from "./theme";

/**
 * Core contracts worth pinning (ADR 0020 Ф1) — the two identity guarantees
 * the consumers depend on:
 * 1. themeComponents returns ONE map per theme, by reference (TextEngine
 *    memoizes on props; a fresh map per call would churn the render tree —
 *    the ME-005 review finding).
 * 2. buildPipeline: escape-only = remark-gfm + EMPTY rehype (no rehype-raw
 *    on the untrusted profile — SEC-4); corpus = raw → dropSubtrees →
 *    sanitize(schema) IN THAT ORDER (АРХКОМ-8: the order is the security
 *    model); repeated calls return the same arrays.
 */
describe("text-engine/core", () => {
  it("themeComponents caches one map per theme (stable identity)", () => {
    const full = themeComponents("full");
    const fullAgain = themeComponents("full");
    const compact = themeComponents("compact");
    expect(fullAgain).toBe(full);
    expect(compact).not.toBe(full);
    // `article` is the Ф2 slot — resolves to the full map until Ф2 lands the
    // docs typography as its own branch.
    expect(themeComponents("article")).toBe(full);
  });

  it("escape-only pipeline: remark-gfm, EMPTY rehype, stable references", () => {
    const first = buildPipeline({ mode: "escape-only" });
    const second = buildPipeline({ mode: "escape-only" });
    expect(first).toBe(second);
    expect(first.remarkPlugins).toEqual([remarkGfm]);
    expect(first.rehypePlugins).toEqual([]);
    // NO rehype-raw anywhere on the untrusted profile.
    expect(first.rehypePlugins.includes(rehypeRaw)).toBe(false);
  });

  it("corpus pipeline: raw → dropSubtrees → sanitize(schema) in order, cached", () => {
    const config = {
      dropSubtrees: ["script", "style", "iframe"] as const,
      schema: defaultSchema,
    };
    const first = buildPipeline({ mode: "corpus", rawHtml: config });
    const second = buildPipeline({ mode: "corpus", rawHtml: config });
    expect(second).toBe(first);
    // The exact curated order (АРХКОМ-8) — asserted positionally.
    expect(first.rehypePlugins[0]).toBe(rehypeRaw);
    expect(first.rehypePlugins[1]).toBeTypeOf("function");
    expect(first.rehypePlugins[2]).toEqual([rehypeSanitize, defaultSchema]);
    expect(first.remarkPlugins).toEqual([remarkGfm]);
  });

  it("corpus mode without rawHtml config throws (fail-closed)", () => {
    expect(() =>
      buildPipeline({ mode: "corpus" } as Parameters<typeof buildPipeline>[0]),
    ).toThrow(/corpus mode requires rawHtml/);
  });
});