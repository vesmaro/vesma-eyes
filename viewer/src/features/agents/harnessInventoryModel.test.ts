import { describe, expect, it } from "vitest";
import type { HarnessInventoryEnvironment } from "@/gateway/boardTypes";
import { gcwSpecialistsCount, inventoryCategories } from "./harnessInventoryModel";

/** The spec §3.2 payload shape, verbatim. */
function env(
  overrides: Partial<HarnessInventoryEnvironment> = {},
): HarnessInventoryEnvironment {
  return {
    name: "zcode",
    kind: "cli",
    home_path: "/home/u/.zcode",
    capabilities: {
      specialists: ["bathys-researcher", "gcw-tech-lead"],
      specialists_count: 39,
      gcw_specialists_count: 38,
      skills: ["a11y-audit"],
      skills_count: 121,
      plugins: [],
      instructions: ["architectural-committee.md"],
      instructions_count: 24,
      notes: { agents_md: true, gcw_managed: true },
    },
    ...overrides,
  };
}

describe("inventoryCategories (ME-064, spec §3.2)", () => {
  it("four categories in the fixed reading order, full counters + honest overflow", () => {
    const categories = inventoryCategories(env());
    expect(categories.map((category) => category.key)).toEqual([
      "specialists",
      "skills",
      "plugins",
      "instructions",
    ]);
    // Counters are FULL (the agent's own report); the lists are capped —
    // the overflow is the visible cut, never a silent trim.
    expect(categories[0]).toMatchObject({
      names: ["bathys-researcher", "gcw-tech-lead"],
      count: 39,
      overflow: 37,
    });
    expect(categories[1]).toMatchObject({
      names: ["a11y-audit"],
      count: 121,
      overflow: 120,
    });
    // plugins: empty list AND no explicit count → 0/0 (honest absence).
    expect(categories[2]).toMatchObject({ names: [], count: 0, overflow: 0 });
    expect(categories[3]).toMatchObject({
      names: ["architectural-committee.md"],
      count: 24,
      overflow: 23,
    });
  });

  it("a missing capabilities object degrades to four honest zero categories", () => {
    const categories = inventoryCategories(env({ capabilities: undefined }));
    expect(categories).toHaveLength(4);
    expect(
      categories.every(
        (category) => category.count === 0 && category.names.length === 0,
      ),
    ).toBe(true);
  });

  it("a buggy agent's garbage narrows defensively: non-string names drop, non-finite counts fall back", () => {
    const categories = inventoryCategories(
      env({
        capabilities: {
          specialists: ["ok-name", 42, null, "second"],
          specialists_count: "thirty-nine",
          skills: "not-a-list",
          skills_count: -5,
          plugins: [],
          plugins_count: Number.NaN,
        },
      }),
    );
    expect(categories[0]).toMatchObject({
      names: ["ok-name", "second"],
      // No numeric counter → the visible list length, never a fabricated 39.
      count: 2,
      overflow: 0,
    });
    expect(categories[1]).toMatchObject({ names: [], count: 0, overflow: 0 });
    expect(categories[2]).toMatchObject({ names: [], count: 0, overflow: 0 });
  });

  it("an inconsistent count BELOW the visible names never hides names", () => {
    const categories = inventoryCategories(
      env({
        capabilities: { specialists: ["a", "b", "c"], specialists_count: 1 },
      }),
    );
    expect(categories[0].count).toBe(3);
    expect(categories[0].overflow).toBe(0);
  });
});

describe("gcwSpecialistsCount — the share is a report, never a guess", () => {
  it("reads the agent's own gcw_specialists_count", () => {
    expect(gcwSpecialistsCount(env())).toBe(38);
  });

  it("absent or garbage → null (honest absence)", () => {
    expect(gcwSpecialistsCount(env({ capabilities: {} }))).toBeNull();
    expect(
      gcwSpecialistsCount(env({ capabilities: { gcw_specialists_count: "38" } })),
    ).toBeNull();
  });
});
