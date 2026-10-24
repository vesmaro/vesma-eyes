import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pageGridClass } from "@/layout/pageGrid";
import { DOCS_COLUMN, docsFieldClass } from "./docsField";

/**
 * The docs GEOMETRY gate (docs-tables-width W2, blueprint §4) at the
 * class/token level — the ONE sources of the field:
 *
 * - the docs measure token exists: `--measure-docs: 80ch`; the scroll
 *   measure is untouched (`--measure-scroll: 72ch` — Kora/Memory keep
 *   their rhythm);
 * - the reading field is max-w-6xl and stays uncapped at lg+ (the
 *   group-centered docs geometry);
 * - the reading column carries the docs measure (`max-w-docs`), never the
 *   scroll one.
 *
 * The ch-number proof of the 60–85ch prose corridor at 1440/1280/1024 is
 * the programmatic measurement in scripts/dtw-shots.mjs (real layout) —
 * a unit test cannot measure ch without an engine.
 */

const REPO_VIEWER = resolve(import.meta.dirname, "../../..");
const tokensCss = readFileSync(resolve(REPO_VIEWER, "src/styles/tokens.css"), "utf8");

describe("docs field geometry (docs-tables-width W2)", () => {
  it("tokens: --measure-docs is 80ch, --measure-scroll stays 72ch", () => {
    expect(tokensCss).toMatch(/--measure-docs:\s*80ch\b/);
    expect(tokensCss).toMatch(/--measure-scroll:\s*72ch\b/);
  });

  it("tailwind maps max-w-docs to the token", () => {
    const tw = readFileSync(resolve(REPO_VIEWER, "tailwind.config.ts"), "utf8");
    expect(tw).toMatch(/docs:\s*"var\(--measure-docs\)"/);
  });

  it("the reading field is 6xl, uncapped at lg+; other regimes unchanged", () => {
    expect(docsFieldClass()).toContain("max-w-6xl");
    expect(docsFieldClass()).toContain("lg:max-w-none");
    expect(pageGridClass("showcase")).toContain("max-w-4xl");
    expect(pageGridClass("operational")).not.toContain("max-w-");
  });

  it("the docs column reads the docs measure, never the scroll one", () => {
    expect(DOCS_COLUMN).toContain("max-w-docs");
    expect(DOCS_COLUMN).not.toContain("max-w-scroll");
  });
});
