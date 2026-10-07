import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The ONE focus-ring canon (U1/S3, honest-map finding: 6 hand-rolled
 * outline-iris-bright rings in the Shell cluster). Every focus ring in the
 * Shell surfaces — the layout chrome and the ui-token public contour — must
 * ride `--color-focus` (outline-focus; WCAG 2.4.11/2.4.13 geometry from the
 * tokens, the theme flips the value, the iris stays a TEXT/hover accent).
 * The 2026-10-07 strata resolution works the same way for washes: one
 * concept, one implementation.
 */

const ROOTS = [
  join(import.meta.dirname, "..", "..", "layout"),
  import.meta.dirname, // features/ui-token — the Shell public contour
];

function* tsFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* tsFiles(full);
    } else if (/\.tsx?$/.test(entry) && !/\.test\./.test(entry)) {
      yield full;
    }
  }
}

describe("focus-ring canon (U1/S3): --color-focus everywhere in the Shell cluster", () => {
  it("no hand-rolled outline-iris-bright rings remain in layout/ or ui-token/", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of tsFiles(root)) {
        if (readFileSync(file, "utf8").includes("outline-iris-bright")) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the ring lands through outline-focus in the dressed Shell surfaces", () => {
    const shellTopBar = readFileSync(
      join(import.meta.dirname, "..", "..", "layout", "TopBar.tsx"),
      "utf8",
    );
    expect(shellTopBar).toContain("focus-visible:outline-focus");
    const gate = readFileSync(
      join(import.meta.dirname, "GateScreen.tsx"),
      "utf8",
    );
    expect(gate).toContain("focus-visible:outline-focus");
  });
});
