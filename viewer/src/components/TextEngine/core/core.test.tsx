import { describe, expect, it } from "vitest";
import remarkGfm from "remark-gfm";
import { buildPipeline } from "./pipeline";
import { themeComponents, articleComponents } from "./theme";

/**
 * Core contracts worth pinning (ADR 0020 Ф1, amended Ф2) — the identity
 * guarantees the consumers depend on:
 * 1. themeComponents returns ONE map per theme, by reference (TextEngine
 *    memoizes on props; a fresh map per call would churn the render tree —
 *    the ME-005 review finding). `article` is the Ф2 docs branch: it needs
 *    per-document hooks, so a hookless request fails closed instead of
 *    aliasing another theme; the hookful factory is articleComponents().
 * 2. buildPipeline: escape-only = remark-gfm + EMPTY rehype (no rehype-raw
 *    on the untrusted profile — SEC-4); corpus assembly lives in
 *    ./pipeline.corpus (the md-sanitize chunk boundary — see
 *    pipeline.corpus.test.ts) and buildPipeline rejects it fail-closed.
 */
describe("text-engine/core", () => {
  it("themeComponents caches one map per theme (stable identity)", () => {
    const full = themeComponents("full");
    const fullAgain = themeComponents("full");
    const compact = themeComponents("compact");
    expect(fullAgain).toBe(full);
    expect(compact).not.toBe(full);
    // Ф2: the article slot no longer aliases `full` — its typography needs
    // per-document hooks (heading slugs restart per document), so the
    // hookless request is refused (use articleComponents(hooks)).
    expect(() => themeComponents("article")).toThrow(/articleComponents/);
  });

  it("articleComponents builds the docs typography around the hooks", () => {
    const map = articleComponents({
      headingSlug: (text) => text,
      link: (href) => <a href={href} />,
      imageSrc: (src) => src,
      mermaid: (code) => <pre data-mermaid={code} />,
      codeBlock: ({ code }) => <pre data-code={code} />,
    });
    // The Ф2 article branch carries the docs class strings (spot checks —
    // the byte-level gate is the golden suite):
    for (const key of ["h1", "h2", "h3", "p", "pre", "code", "mark"] as const) {
      expect(map[key], `article map must theme ${key}`).toBeTypeOf("function");
    }
    expect(map.input).toBeUndefined(); // no task-list theming on article
  });

  it("escape-only pipeline: remark-gfm, EMPTY rehype, stable references", () => {
    const first = buildPipeline({ mode: "escape-only" });
    const second = buildPipeline({ mode: "escape-only" });
    expect(first).toBe(second);
    expect(first.remarkPlugins).toEqual([remarkGfm]);
    expect(first.rehypePlugins).toEqual([]);
  });

  it("corpus mode is refused here (fail-closed — lives in pipeline.corpus)", () => {
    expect(() =>
      buildPipeline({ mode: "corpus" } as Parameters<typeof buildPipeline>[0]),
    ).toThrow(/pipeline\.corpus/);
  });
});
