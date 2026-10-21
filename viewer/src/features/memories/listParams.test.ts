import { describe, expect, it } from "vitest";
import {
  hasActiveFilters,
  parseMemoryListParams,
  toListParams,
} from "./listParams";

describe("memory list URL params", () => {
  it("falls back to defaults for missing or invalid values", () => {
    const state = parseMemoryListParams(new URLSearchParams(""));
    expect(state).toEqual({
      status: undefined,
      project: undefined,
      agent: undefined,
      limit: 20,
      page: 1,
    });

    const invalid = parseMemoryListParams(
      new URLSearchParams("limit=7&page=-2&status=nope"),
    );
    expect(invalid.limit).toBe(20);
    expect(invalid.page).toBe(1);
    expect(invalid.status).toBeUndefined();
  });

  it("maps page+limit to an offset for the gateway", () => {
    const state = parseMemoryListParams(new URLSearchParams("page=3&limit=10&status=published&project=vesma"));
    expect(toListParams(state)).toEqual({
      status: "published",
      project: "vesma",
      limit: 10,
      offset: 20,
    });
  });

  it("carries the agent filter into the gateway params (D7)", () => {
    const state = parseMemoryListParams(new URLSearchParams("agent=zed&tag=mnemos:decision"));
    expect(state.agent).toBe("zed");
    expect(toListParams(state)).toMatchObject({ agent: "zed", tags: "mnemos:decision" });
  });

  it("detects active filters for the empty-state copy", () => {
    expect(hasActiveFilters(parseMemoryListParams(new URLSearchParams("project=x")))).toBe(true);
    expect(hasActiveFilters(parseMemoryListParams(new URLSearchParams("agent=zed")))).toBe(true);
    expect(hasActiveFilters(parseMemoryListParams(new URLSearchParams("")))).toBe(false);
  });
});
