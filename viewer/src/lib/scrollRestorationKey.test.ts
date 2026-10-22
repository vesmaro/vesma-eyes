import { describe, expect, it } from "vitest";

import { scrollRestorationKey } from "./scrollRestorationKey";

/**
 * Review P1 regression pins (2026-10-22). The key contract decides WHERE a
 * navigation lands; both regimes are load-bearing.
 */

const PAGE = {
  hash: "",
  key: "K1",
  pathname: "/app/docs/api/vesmaro-eyes/automation",
  search: "",
};

describe("scrollRestorationKey", () => {
  it("gives fragment locations their own stable slot (anchor class stays closed)", () => {
    const anchor = { ...PAGE, hash: "#get-apiautomationlaunches" };
    expect(scrollRestorationKey(anchor)).toBe(
      "/app/docs/api/vesmaro-eyes/automation#get-apiautomationlaunches",
    );
    // stable across visits — a saved anchor position can be restored
    expect(scrollRestorationKey({ ...anchor, key: "K2" })).toBe(
      scrollRestorationKey(anchor),
    );
    // ...and never collides with the page's own (hashless) entry
    expect(scrollRestorationKey(anchor)).not.toBe(scrollRestorationKey(PAGE));
  });

  it("keeps the router's entry key for plain locations — a PUSH to a visited page lands on TOP", () => {
    // PUSH creates a fresh entry key: the restore lookup against saved
    // positions misses, so ScrollRestoration falls through to
    // window.scrollTo(0, 0) — the page does NOT inherit the previous
    // visit's offset (the regression the pathname+search keying had).
    const firstVisit = { ...PAGE, key: "AAA111" };
    const revisit = { ...PAGE, key: "BBB222" };
    const saved: Record<string, number> = { [scrollRestorationKey(firstVisit)]: 4167 };
    expect(scrollRestorationKey(revisit)).toBe("BBB222");
    expect(saved[scrollRestorationKey(revisit)]).toBeUndefined(); // miss → top
  });

  it("restores a POP by the same key the page left with", () => {
    // BACK to the original entry: same key → the saved offset is found.
    const entry = { ...PAGE, key: "AAA111" };
    const saved: Record<string, number> = { [scrollRestorationKey(entry)]: 4167 };
    expect(saved[scrollRestorationKey(entry)]).toBe(4167);
  });

  it("keeps search in the fragment slot", () => {
    expect(scrollRestorationKey({ ...PAGE, hash: "#x", search: "?lang=ru" })).toBe(
      "/app/docs/api/vesmaro-eyes/automation?lang=ru#x",
    );
  });
});
