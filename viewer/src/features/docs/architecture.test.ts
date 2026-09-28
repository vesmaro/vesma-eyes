import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture gates (contract §9.4/§9.5), enforced mechanically:
 * 1. `features/docs` never imports `gateway/*` — the docs domain is a
 *    pure-frontend surface, backend-independent by design.
 * 2. react-markdown has ONE import site — `Markdown.tsx` (the single
 *    sanitization story lives there, not scattered across the feature).
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
    const engineSrc = [
      ...listSources(join(SRC_DIR, "features")),
      ...listSources(join(SRC_DIR, "components")),
    ];
    const offenders = engineSrc.filter(
      (file) =>
        !file.endsWith("Mermaid.tsx") &&
        !file.includes(".test.") &&
        /(from\s+["']mermaid["'])|(import\s*\(\s*["']mermaid["']\s*\))/.test(
          readFileSync(file, "utf8"),
        ),
    );
    expect(
      offenders.map((file) => file.replace(`${DOCS_DIR}/../`, "")),
    ).toEqual([]);
    // And the one sanctioned site is exactly the rehomed engine module.
    const singleSite = join(
      SRC_DIR,
      "components",
      "TextEngine",
      "core",
      "Mermaid.tsx",
    );
    expect(statSync(singleSite).isFile()).toBe(true);
    expect(
      /(import\s*\(\s*["']mermaid["']\s*\))/.test(readFileSync(singleSite, "utf8")),
    ).toBe(true);
  });
});
