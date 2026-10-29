import { describe, expect, it } from "vitest";
import {
  deriveRelayAlive,
  deriveSessionRelayAlive,
  KORA_SESSION_RELAY_CAPABILITY,
  type KoraRelayExecutorFacts,
} from "./koraRelay";

/**
 * The A1 relay-signal derivations (koraRelay.ts). The REGISTRY-level
 * form: relay alive ⇔ ∃ APPROVED, ENABLED executor declaring the
 * `session-relay` capability — every negative is a real registry shape
 * (the ladder states, the kill-switch, the owner-PATCHed capability
 * list, the empty/absent registry — the honest relay-off, no invented
 * signal).
 *
 * The PER-SESSION form (`deriveSessionRelayAlive`) is what the composer
 * renders from: the board parks the turn by the SESSION'S executor (the
 * transport seam resolves the item by `executor_id`), so only the
 * session's own row qualifying keeps the «повторите» promise honest.
 * The divergent-registry pair below pins exactly that: capability
 * elsewhere never lights a session whose executor cannot serve.
 */

function executor(
  overrides: Partial<KoraRelayExecutorFacts> = {},
): KoraRelayExecutorFacts {
  return {
    id: "exec-a",
    capabilities: [KORA_SESSION_RELAY_CAPABILITY],
    state: "approved",
    enabled: true,
    ...overrides,
  };
}

describe("deriveRelayAlive (A1 relay signal, registry-level)", () => {
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

describe("deriveSessionRelayAlive (A1 relay signal, per-session)", () => {
  it("alive: the session's own executor qualifies", () => {
    expect(deriveSessionRelayAlive([executor()], "exec-a:live")).toBe(true);
  });

  it("alive: the DIVERGENT registry, session on the capable side — on even though another row cannot serve", () => {
    // The brief's pair, honest-on side: session on A (relay-capable),
    // B carries no capability. Only A's own qualification matters.
    const registry = [
      executor({ id: "exec-a" }),
      executor({ id: "exec-b", capabilities: ["kora-scan"] }),
    ];
    expect(deriveSessionRelayAlive(registry, "exec-a:live")).toBe(true);
    expect(deriveSessionRelayAlive(registry, "exec-b:live")).toBe(false);
  });

  it("off: the DIVERGENT REGISTRY — capability rides executor A while the session lives on B (the board parks by the session's executor)", () => {
    // The P2 case: the registry-level signal says alive, but THIS
    // session's executor cannot serve — a live button here would promise
    // a POST that settles failed retryable «исполнитель без реле», where
    // «повторите» lies about a permanent refusal. The per-session form
    // stays honestly off while the existential one says on.
    const registry = [
      executor({ id: "exec-a" }),
      executor({ id: "exec-b", capabilities: ["kora-scan"] }),
    ];
    expect(deriveSessionRelayAlive(registry, "exec-b:live")).toBe(false);
    expect(deriveRelayAlive(registry)).toBe(true);
  });

  it("off: the session's executor disabled while a relay-capable row exists elsewhere (the kill-switch is per-row)", () => {
    const registry = [
      executor({ id: "exec-a" }),
      executor({ id: "exec-b", enabled: false }),
    ];
    expect(deriveSessionRelayAlive(registry, "exec-b:live")).toBe(false);
  });

  it("off: the session's executor pending (the ladder gate is per-row too)", () => {
    expect(
      deriveSessionRelayAlive([executor({ state: "pending" })], "exec-a:live"),
    ).toBe(false);
  });

  it("the native id may carry colons: the FIRST colon splits (the server's own partition convention)", () => {
    expect(
      deriveSessionRelayAlive([executor()], "exec-a:na:tive:handle"),
    ).toBe(true);
  });

  it("off: unknown executor prefix (a deep link / a stale registry slice)", () => {
    expect(deriveSessionRelayAlive([executor()], "exec-x:live")).toBe(false);
  });

  it("off: a handle without an executor prefix is the honest relay-off", () => {
    expect(deriveSessionRelayAlive([executor()], "bare-native")).toBe(false);
    expect(deriveSessionRelayAlive([executor()], ":live")).toBe(false);
    expect(deriveSessionRelayAlive([executor()], "")).toBe(false);
  });
});
