import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pageGridClass } from "@/layout/pageGrid";
import { DOCS_ARTICLE, DOCS_COLUMN, docsFieldClass } from "./docsField";

/**
 * The docs GEOMETRY gate (docs-tables-width W2 + the docs-a4-field
 * amendment, blueprint §4) at the class/token level — the ONE sources of
 * the field:
 *
 * - the docs measure token exists: `--measure-docs: 80ch`; the scroll
 *   measure is untouched (`--measure-scroll: 72ch` — Kora/Memory keep
 *   their rhythm);
 * - the reading field is max-w-6xl and stays uncapped at lg+ (the
 *   group-centered docs geometry);
 * - the rail-less reading column carries the docs measure
 *   (`max-w-docs`), never the scroll one;
 * - docs-a4-field: the article SLOT carries the A4-landscape ceiling
 *   (`max-w-docs-field` = var(--docs-field-max), 1123px in global.css —
 *   viewer-only layout arithmetic, NOT a canon token; the viewer↔board
 *   parity of tokens.css stays untouched by design) and arms the prose
 *   clamp (`.docs-article`); the 80ch measure lives INSIDE the wide
 *   article, on prose-level blocks only — tables/diagrams/code take the
 *   full slot.
 *
 * The ch-number proof of the 60–85ch prose corridor at 1440/1280/1024 is
 * the programmatic measurement in scripts/dtw-shots.mjs (real layout) —
 * a unit test cannot measure ch without an engine.
 */

const REPO_VIEWER = resolve(import.meta.dirname, "../../..");
const tokensCss = readFileSync(resolve(REPO_VIEWER, "src/styles/tokens.css"), "utf8");
const globalCss = readFileSync(resolve(REPO_VIEWER, "src/styles/global.css"), "utf8");

describe("docs field geometry (docs-tables-width W2 + docs-a4-field)", () => {
  it("tokens: --measure-docs is 80ch, --measure-scroll stays 72ch", () => {
    expect(tokensCss).toMatch(/--measure-docs:\s*80ch\b/);
    expect(tokensCss).toMatch(/--measure-scroll:\s*72ch\b/);
  });

  it("the A4-landscape ceiling is viewer-only layout arithmetic in global.css", () => {
    // NOT in tokens.css: the ceiling is a viewer layout value — tokens.css
    // stays the frozen viewer↔board canon inventory (ADR 0006; the
    // --vesma-slot/--kora-frame-h standing). Parity stays intact by
    // construction: the board defines nothing new.
    expect(globalCss).toMatch(/--docs-field-max:\s*1123px/);
    expect(tokensCss).not.toContain("--docs-field-max");
  });

  it("tailwind maps max-w-docs and max-w-docs-field to their vars", () => {
    const tw = readFileSync(resolve(REPO_VIEWER, "tailwind.config.ts"), "utf8");
    expect(tw).toMatch(/docs:\s*"var\(--measure-docs\)"/);
    expect(tw).toMatch(/"docs-field":\s*"var\(--docs-field-max\)"/);
  });

  it("the reading field is 6xl, uncapped at lg+; other regimes unchanged", () => {
    expect(docsFieldClass()).toContain("max-w-6xl");
    expect(docsFieldClass()).toContain("lg:max-w-none");
    expect(pageGridClass("showcase")).toContain("max-w-4xl");
    expect(pageGridClass("operational")).not.toContain("max-w-");
  });

  it("the rail-less column reads the docs measure, never the scroll one", () => {
    expect(DOCS_COLUMN).toContain("max-w-docs");
    expect(DOCS_COLUMN).not.toContain("max-w-scroll");
  });

  it("the article slot carries the ceiling + shrink, prose measure moved inside", () => {
    expect(DOCS_ARTICLE).toContain("docs-article");
    expect(DOCS_ARTICLE).toContain("min-w-0");
    expect(DOCS_ARTICLE).toContain("max-w-docs-field");
    // The bare measure is NOT the slot anymore (the clamp owns it)…
    expect(DOCS_ARTICLE).not.toMatch(/max-w-docs(?!-field)/);
    // …and the slot stays a flex item of the centered group row.
    expect(DOCS_ARTICLE).not.toContain("mx-auto");
  });

  it("global.css clamps prose-level blocks to the measure inside the wide article", () => {
    const clamp = globalCss.match(
      /\.docs-article :is\(([^)]*)\)\s*\{\s*max-width:\s*var\(--measure-docs\)/,
    );
    expect(clamp, "the .docs-article prose clamp rule exists").not.toBeNull();
    for (const tag of ["h1", "p", "ul", "ol", "blockquote", "hr"]) {
      expect(clamp![1], `prose ${tag} is clamped`).toContain(tag);
    }
    // Wide blocks stay OUT of the clamp list — they take the full slot.
    for (const wide of ["table", "pre", "svg", "details", "div"]) {
      expect(clamp![1], `wide block ${wide} must NOT be clamped`).not.toContain(
        wide,
      );
    }
  });
});
