import { describe, expect, it } from "vitest";
import {
  deriveRelayAlive,
  KORA_SESSION_RELAY_CAPABILITY,
  type KoraRelayExecutorFacts,
} from "./koraRelay";

/**
 * The A1 relay-signal derivation (koraRelay.ts): relay alive ⇔ ∃
 * APPROVED, ENABLED executor declaring the `session-relay` capability.
 * Every negative is a real registry shape: the ladder states, the
 * kill-switch, the owner-PATCHed capability list, the empty/absent
 * registry (the honest relay-off — no invented signal).
 */

function executor(
  overrides: Partial<KoraRelayExecutorFacts> = {},
): KoraRelayExecutorFacts {
  return {
    capabilities: [KORA_SESSION_RELAY_CAPABILITY],
    state: "approved",
    enabled: true,
    ...overrides,
  };
}

describe("deriveRelayAlive (A1 relay signal)", () => {
  it("alive: one approved enabled executor with the session-relay capability", () => {
    expect(deriveRelayAlive([executor()])).toBe(true);
  });

  it("alive: survives other capabilities riding the same row", () => {
    expect(
      deriveRelayAlive([
        executor({ capabilities: ["kora-scan", KORA_SESSION_RELAY_CAPABILITY] }),
      ]),
    ).toBe(true);
  });

  it("dead: no executor declares the capability (the pre-PATCH registry)", () => {
    expect(
      deriveRelayAlive([executor({ capabilities: ["kora-scan"] })]),
    ).toBe(false);
  });

  it("dead: capability on a pending executor (the ladder gate)", () => {
    expect(deriveRelayAlive([executor({ state: "pending" })])).toBe(false);
  });

  it("dead: capability on a revoked executor", () => {
    expect(deriveRelayAlive([executor({ state: "revoked" })])).toBe(false);
  });

  it("dead: capability on a disabled executor (the routing kill-switch)", () => {
    expect(deriveRelayAlive([executor({ enabled: false })])).toBe(false);
  });

  it("dead: the empty registry is the honest relay-off", () => {
    expect(deriveRelayAlive([])).toBe(false);
  });

  it("alive: one qualifying row among many non-qualifying (existential)", () => {
    expect(
      deriveRelayAlive([
        executor({ state: "pending" }),
        executor({ capabilities: [] }),
        executor(),
      ]),
    ).toBe(true);
  });
});
