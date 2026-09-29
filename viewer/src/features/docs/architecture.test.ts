import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture gates (contract §9.4/§9.5), enforced mechanically:
 * 1. `features/docs` never imports `gateway/*` — the docs domain is a
 *    pure-frontend surface, backend-independent by design.
 * 2. react-markdown has ONE import site — `Markdown.tsx` (the single
 *    sanitization story lives there, not scattered across the feature).
 * 3. the sanitize stack (rehype-raw / rehype-sanitize / hast-util-sanitize)
 *    has ONE engine module — `TextEngine/core/pipeline.corpus.ts` (ME-022,
 *    closing ME-013 P3-1/P3-2): static forms are lint-covered in
 *    eslint.config.js, DYNAMIC `import()` forms are covered here, because
 *    ESLint's no-restricted-imports never sees ImportExpression nodes.
 */

const DOCS_DIR = join(import.meta.dirname);
/** Engine-wide scan root (ME-013): the mermaid invariant is engine-wide. */
const SRC_DIR = join(DOCS_DIR, "..", "..");

function listSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__fixtures__") continue; // content, not code
      files.push(...listSources(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

describe("docs feature architecture gates", () => {
  const sources = listSources(DOCS_DIR);

  it("imports nothing from gateway/*", () => {
    expect(sources.length, "sanity: real code scanned").toBeGreaterThan(5);
    const offenders = sources.filter((file) =>
      /from\s+["'][^"']*gateway\//.test(readFileSync(file, "utf8")),
    );
    expect(
      offenders.map((file) => file.replace(`${DOCS_DIR}/`, "")),
      "gateway/* imports found in features/docs",
    ).toEqual([]);
  });

  it("keeps react-markdown in exactly one module (Markdown.tsx)", () => {
    const offenders = sources.filter(
      (file) =>
        !file.endsWith("Markdown.tsx") &&
        /from\s+["']react-markdown["']/.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map((file) => file.replace(`${DOCS_DIR}/`, ""))).toEqual([]);
  });

  it("keeps mermaid imports in exactly ONE engine module (core/Mermaid.tsx, Amendment 1)", () => {
    // ME-013 (ADR 0020 Amendment 1): mermaid is an engine capability on BOTH
    // trust profiles, rehomed to TextEngine/core/Mermaid.tsx. The lazy-chunk
    // budget (ADR-0015: mermaid pool ≤450 KiB, loaded only on fence pages)
    // depends on the library being behind that ONE dynamic import — static
    // or duplicate imports weld it into base chunks. The scan is ENGINE-WIDE
    // (components + features, not just docs): the invariant is «one mermaid
    // import module», not «docs owns it». Test files are out of scope (they
    // mock or smoke the real package).
    // Scan scope note (ME-013 review P3-4): features + components carry all
    // app code that could plausibly import a markdown stack; src/lib,
    // src/gateway, src/layout and friends are covered by the app-wide ESLint
    // no-restricted-imports block (which fires on every src/** file).
    const engineSrc = [
      ...listSources(join(SRC_DIR, "features")),
      ...listSources(join(SRC_DIR, "components")),
    ];
    const exempt = join(SRC_DIR, "components", "TextEngine", "core", "Mermaid.tsx");
    const offenders = engineSrc.filter(
      (file) =>
        // Exact-path exemption only (P3-3): a basename match would let a
        // future features/*/Mermaid.tsx escape this grep-test.
        file !== exempt &&
        !file.includes(".test.") &&
        /(from\s+["']mermaid["'])|(import\s*\(\s*["']mermaid["']\s*\))/.test(
          readFileSync(file, "utf8"),
        ),
    );
    expect(
      offenders.map((file) => file.replace(`${DOCS_DIR}/../`, "")),
    ).toEqual([]);
    // And the one sanctioned site is exactly the rehomed engine module.
    expect(statSync(exempt).isFile()).toBe(true);
    expect(
      /(import\s*\(\s*["']mermaid["']\s*\))/.test(readFileSync(exempt, "utf8")),
    ).toBe(true);
  });

  it("keeps the sanitize stack in exactly ONE engine module (core/pipeline.corpus.ts, ME-022)", () => {
    // ME-022 (ME-013 P3-1/P3-2): the ESLint pins cover static imports only —
    // no-restricted-imports visits Import/Export declarations but NOT
    // dynamic import(). This gate is the mechanical backstop for the dynamic
    // half and for every specifier shape (bare, deep
    // "rehype-sanitize/lib/index.js", hast-util-sanitize itself), scanned
    // across the WHOLE src tree: unlike the mermaid scan above (features +
    // components), a dynamic sanitize import anywhere — src/lib, src/layout —
    // would weld the md-sanitize pool onto its chunk with no budget gate to
    // see it, so the wider net is free here.
    const engineSrc = listSources(SRC_DIR);
    const SPEC = "(rehype-raw|rehype-sanitize|hast-util-sanitize)";
    const stackImport = new RegExp(
      `from\\s*["'][^"']*${SPEC}` + // static import / re-export
        `|import\\s*\\(\\s*["'][^"']*${SPEC}` + // dynamic import()
        `|import\\s*["'][^"']*${SPEC}`, // side-effect import
    );
    // Exact-path exemptions (P3-3 style, no basename matches):
    // - pipeline.corpus.ts IS the sanctioned single site (its static stack
    //   imports are the pipeline itself);
    // - *.test.* files mock/smoke the real packages (same rule as above).
    const corpusSite = join(
      SRC_DIR,
      "components",
      "TextEngine",
      "core",
      "pipeline.corpus.ts",
    );
    // Shape allowances, erased before matching so the gate greps what the
    // BUNDLER sees:
    // - `import type ...;` statements are erased at compile time (zero
    //   runtime/chunk impact) — legal anywhere, mirroring the ESLint
    //   allowTypeImports allowances;
    // - sanitizeSchema.ts may import the defaultSchema BASE (Ф2: the wrapper
    //   supplies the config) — the exact sanctioned statement is erased, so
    //   any other value import (e.g. sanitize) still fails the gate.
    const TYPE_IMPORT = /import\s+type\s+[^;]*?;/g;
    const DEFAULT_SCHEMA_BASE =
      /import\s*\{\s*defaultSchema\s*\}\s*from\s*["']hast-util-sanitize["']\s*;/g;
    const offenders = engineSrc
      .filter((file) => file !== corpusSite && !file.includes(".test."))
      .filter((file) => {
        let src = readFileSync(file, "utf8").replace(TYPE_IMPORT, ";");
        if (file === join(SRC_DIR, "features", "docs", "sanitizeSchema.ts")) {
          src = src.replace(DEFAULT_SCHEMA_BASE, ";");
        }
        return stackImport.test(src);
      });
    expect(
      offenders.map((file) => file.replace(`${DOCS_DIR}/../`, "")),
    ).toEqual([]);
    // And the one sanctioned site is real and still owns the stack.
    expect(statSync(corpusSite).isFile()).toBe(true);
    expect(stackImport.test(readFileSync(corpusSite, "utf8"))).toBe(true);
  });
});
