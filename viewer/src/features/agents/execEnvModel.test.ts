import { describe, expect, it } from "vitest";
import type { ExecutorItem } from "@/gateway/boardTypes";
import { executorExecEnv } from "./execEnvModel";

/**
 * AGW-23/24: the «среда исполнения» badge projection (the B2 slot) —
 * the harness-inventory row of THIS harness wins, the k8s pod leg is the
 * fallback (pod executors may carry no inventory), and absence stays an
 * answer: no data, no label, no fabrication.
 */

function member(overrides: Partial<ExecutorItem> = {}): ExecutorItem {
  return {
    id: "ex-1",
    name: "zcode@laptop",
    harness: "zcode",
    host: "laptop",
    transport: "local-poll",
    capabilities: [],
    version: "",
    enabled: true,
    state: "approved",
    last_seen: "2026-10-20T00:00:00+00:00",
    presence: "online",
    registered_via: "",
    registered_at: "2026-10-20T00:00:00+00:00",
    updated_at: "2026-10-20T00:00:00+00:00",
    ...overrides,
  };
}

describe("executorExecEnv (the B2 badge projection)", () => {
  it("reads the harness_inventory row of THIS harness", () => {
    const m = member({
      harness_inventory: [
        { name: "hermes", exec_env: "distrobox:dev-box" },
        { name: "zcode", exec_env: "metal" },
      ],
    });
    expect(executorExecEnv(m)).toBe("metal");
  });

  it("distinguishes the ×2 duplicate rows: first matching row wins, order is the agent's", () => {
    // Two zcode installs in different surfaces — the badge shows the
    // surface of the row the agent listed first (its own honest order).
    const m = member({
      harness_inventory: [
        { name: "zcode", exec_env: "distrobox:dev-box" },
        { name: "zcode", exec_env: "metal" },
      ],
    });
    expect(executorExecEnv(m)).toBe("distrobox:dev-box");
  });

  it("falls back to the k8s pod leg when the inventory is absent", () => {
    const m = member({
      name: "hermes@abyss-ai-agent",
      harness: "hermes",
      host: "abyss-ai-agent",
      harness_inventory: undefined,
      exec_env_inventory: {
        k8s: {
          pods: [
            { name: "hermes-0", node: "abyss-ai-agent", harness: "hermes",
              exec_env: "pod:hermes-0" },
          ],
        },
      },
    });
    expect(executorExecEnv(m)).toBe("pod:hermes-0");
  });

  it("prefers the node-matched pod over a same-harness pod elsewhere", () => {
    const m = member({
      name: "vesma-eyes@abyss-ai1-small",
      harness: "vesma-eyes",
      host: "abyss-ai1-small",
      exec_env_inventory: {
        k8s: {
          pods: [
            { name: "vesma-eyes-6d7f", node: "abyss-ai-agent",
              harness: "vesma-eyes", exec_env: "pod:vesma-eyes-6d7f" },
            { name: "vesma-eyes-old", node: "abyss-ai1-small",
              harness: "vesma-eyes", exec_env: "pod:vesma-eyes-old" },
          ],
        },
      },
    });
    expect(executorExecEnv(m)).toBe("pod:vesma-eyes-old");
  });

  it("renders the label verbatim-but-bounded at 60 chars (the server bound)", () => {
    const m = member({
      harness_inventory: [
        { name: "zcode", exec_env: `distrobox:${"b".repeat(100)}` },
      ],
    });
    expect(executorExecEnv(m)).toHaveLength(60);
  });

  it("no surface facts at all — the honest null (the slot stays empty)", () => {
    expect(executorExecEnv(member())).toBeNull();
  });

  it("defensive narrowing: junk shapes degrade to null, never crash", () => {
    expect(
      executorExecEnv(member({
        harness_inventory: [
          { name: "zcode", exec_env: "   " },
          { name: "zcode", exec_env: 42 as unknown as string },
        ],
      })),
    ).toBeNull();
    expect(
      executorExecEnv(member({
        exec_env_inventory: {
          k8s: { pods: [null, "junk", { harness: "zcode" }] as never },
        },
      })),
    ).toBeNull();
  });

  it("a pod row without exec_env is skipped (no fabricated surface)", () => {
    const m = member({
      exec_env_inventory: {
        k8s: { pods: [{ name: "x", harness: "zcode", node: "laptop" }] },
      },
    });
    expect(executorExecEnv(m)).toBeNull();
  });
});
