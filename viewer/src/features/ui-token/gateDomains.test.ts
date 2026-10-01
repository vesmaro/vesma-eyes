import { describe, expect, it } from "vitest";

import { GATED_DOMAINS, gatedDomainFor } from "./gateDomains";

/**
 * The v6 public-surface table (ME-043, 07k §2.1 + the owner's
 * §10-аддендум): which Shell domains are gated, which stay public, and the
 * prefix matching both the Shell content gate and the sidebar locks share.
 */

describe("gatedDomainFor (the public-surface table)", () => {
  it("the five gated domains match their roots", () => {
    expect(gatedDomainFor("/memory")?.prefix).toBe("/memory");
    expect(gatedDomainFor("/tasks")?.prefix).toBe("/tasks");
    expect(gatedDomainFor("/agents")?.prefix).toBe("/agents");
    expect(gatedDomainFor("/kora")?.prefix).toBe("/kora");
    expect(gatedDomainFor("/system")?.prefix).toBe("/system");
  });

  it("deep links resolve to their domain — /kora/:sessionId and /system/* stay gated", () => {
    expect(gatedDomainFor("/kora/s-20260929-abc")?.prefix).toBe("/kora");
    expect(gatedDomainFor("/memory/T-128")?.prefix).toBe("/memory");
    expect(gatedDomainFor("/tasks/TB-1")?.prefix).toBe("/tasks");
    expect(gatedDomainFor("/system/settings")?.prefix).toBe("/system");
    expect(gatedDomainFor("/system/sessions/9")?.prefix).toBe("/system");
  });

  it("public surfaces answer null: Обзор, Документы, the entry routes", () => {
    expect(gatedDomainFor("/")).toBeNull();
    expect(gatedDomainFor("/docs")).toBeNull();
    expect(gatedDomainFor("/docs/vesmaro-eyes")).toBeNull();
    expect(gatedDomainFor("/pair")).toBeNull();
    expect(gatedDomainFor("/auth")).toBeNull();
  });

  it("prefix collisions never mis-gate: /memories-x is not /memory", () => {
    expect(gatedDomainFor("/memories-x")).toBeNull();
    expect(gatedDomainFor("/systems")).toBeNull();
  });

  it("every gated domain carries the full copy set (inside + 3 see-more lines)", () => {
    expect(GATED_DOMAINS).toHaveLength(5);
    for (const domain of GATED_DOMAINS) {
      expect(domain.nameKey).toBeTruthy();
      expect(domain.insideKey).toBeTruthy();
      expect(domain.seeMoreKeys).toHaveLength(3);
    }
  });
});
