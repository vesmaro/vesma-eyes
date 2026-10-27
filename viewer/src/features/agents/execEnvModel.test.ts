import { describe, expect, it } from "vitest";
import type { ExecutorItem } from "@/gateway/boardTypes";
import type { TranslateFn, TranslationKey } from "@/i18n";
import {
  execEnvBadgeTitle,
  executorExecEnv,
  executorFoundTrail,
  executorSurfaceFacts,
  inventoryRowExecEnv,
  inventoryRowFoundTrail,
} from "./execEnvModel";

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

describe("executorFoundTrail (the badge's dedupe trail)", () => {
  it("rides the SAME winning inventory row the badge label does", () => {
    const m = member({
      harness_inventory: [
        { name: "zcode", exec_env: "distrobox:dev-box",
          found_at: ["/home/u/.zcode", "/box/home/u/.zcode"] },
      ],
    });
    expect(executorFoundTrail(m)).toEqual([
      "/home/u/.zcode",
      "/box/home/u/.zcode",
    ]);
  });

  it("a dup row without a badge is skipped; the badged row's trail wins", () => {
    const m = member({
      harness_inventory: [
        { name: "zcode", found_at: ["/wrong-row-path"] },
        { name: "zcode", exec_env: "metal", found_at: ["/right-row-path"] },
      ],
    });
    expect(executorFoundTrail(m)).toEqual(["/right-row-path"]);
  });

  it("the k8s pod fallback carries NO trail (a pod has no home_path)", () => {
    const m = member({
      harness_inventory: undefined,
      exec_env_inventory: {
        k8s: { pods: [{ name: "hermes-0", harness: "zcode",
                        exec_env: "pod:hermes-0" }] },
      },
    });
    expect(executorExecEnv(m)).toBe("pod:hermes-0");
    expect(executorFoundTrail(m)).toEqual([]);
  });

  it("defensive narrowing: junk paths drop, bounds mirror the store (8 × 200)", () => {
    const m = member({
      harness_inventory: [
        { name: "zcode", exec_env: "metal",
          found_at: [
            "   ", 42 as unknown as string, "/kept",
            ...Array.from({ length: 12 }, (_, i) => `/p${i}`),
          ] as never },
      ],
    });
    const trail = executorFoundTrail(m);
    expect(trail).toHaveLength(8);
    expect(trail[0]).toBe("/kept");
    expect(trail.every((p) => p.length <= 200)).toBe(true);
  });

  it("no facts at all — the honest empty trail", () => {
    expect(executorFoundTrail(member())).toEqual([]);
  });
});

describe("inventoryRowExecEnv / inventoryRowFoundTrail (the row distinguisher, harness-labels wave)", () => {
  it("reads each row's OWN surface label — duplicates carry different labels", () => {
    // The owner's prod case: box-home vs host-home installs of one harness.
    const rows = [
      { name: "zcode", kind: "cli", exec_env: "metal" },
      { name: "zcode", kind: "cli", exec_env: "distrobox:ubuntu" },
    ];
    expect(inventoryRowExecEnv(rows[0]!)).toBe("metal");
    expect(inventoryRowExecEnv(rows[1]!)).toBe("distrobox:ubuntu");
  });

  it("an unbadged row degrades to null — honest absence, never a fabricated metal", () => {
    expect(inventoryRowExecEnv({ name: "copilot", kind: "cli" })).toBeNull();
  });

  it("defensive narrowing: junk label / whitespace / over-60 bound", () => {
    expect(inventoryRowExecEnv({ name: "x", exec_env: "   " })).toBeNull();
    expect(inventoryRowExecEnv({ name: "x", exec_env: 42 as unknown as string })).toBeNull();
    const long = `distrobox:${"b".repeat(80)}`;
    expect(inventoryRowExecEnv({ name: "x", exec_env: long })).toBe(
      long.slice(0, 60),
    );
  });

  it("the trail rides the SAME row (each duplicate keeps its own paths)", () => {
    const rows = [
      { name: "zcode", found_at: ["/home/u/.zcode"] },
      { name: "zcode", found_at: ["/var/home/abyss/.zcode", "/home/u/.zcode"] },
    ];
    expect(inventoryRowFoundTrail(rows[0]!)).toEqual(["/home/u/.zcode"]);
    expect(inventoryRowFoundTrail(rows[1]!)).toEqual([
      "/var/home/abyss/.zcode",
      "/home/u/.zcode",
    ]);
  });

  it("no trail — the honest empty (never a home_path echo)", () => {
    expect(inventoryRowFoundTrail({ name: "copilot" })).toEqual([]);
    expect(inventoryRowFoundTrail({ name: "x", found_at: [1, null, "  "] as never })).toEqual(
      [],
    );
  });
});

describe("execEnvBadgeTitle (the shared tooltip composition, hygiene-batch DRY)", () => {
  // Key-echo translator: the composition structure is pinned exactly,
  // independent of any locale's wording.
  const t = ((key: TranslationKey) => key) as TranslateFn;

  it("a trail composes: surface line, «also found at» header, then the paths", () => {
    expect(
      execEnvBadgeTitle(t, ["/home/u/.zcode", "/var/home/abyss/.zcode"]),
    ).toBe(
      "agents.hosts.execEnvTooltip\nagents.hosts.foundAtTooltip\n/home/u/.zcode\n/var/home/abyss/.zcode",
    );
  });

  it("an empty trail is the bare surface line — no dangling header", () => {
    expect(execEnvBadgeTitle(t, [])).toBe("agents.hosts.execEnvTooltip");
  });

  it("one consumer contract: the roster chip and the row badge pass the SAME shape", () => {
    // The helper takes exactly what executorFoundTrail /
    // inventoryRowFoundTrail return — a readonly string list — so the two
    // call sites cannot drift apart again.
    const trail: readonly string[] = ["/only/path"];
    expect(execEnvBadgeTitle(t, trail).split("\n")).toHaveLength(3);
  });
});

describe("executorSurfaceFacts (the card's surface mirror)", () => {
  it("projects the full v0.9.0 shape: runtime=pod + nodes + pods + verdicts", () => {
    const m = member({
      exec_env_inventory: {
        runtime: { kind: "pod", systemd: "pod-mode: no systemd unit" },
        k8s: {
          nodes: [
            { name: "abyss-ai-agent", ready: true,
              kubelet_version: "v1.33.4+k3s1" },
            { name: "abyss-ai1-small", ready: false },
          ],
          pods: [
            { name: "hermes-0", phase: "Running", node: "abyss-ai-agent",
              harness: "hermes", exec_env: "pod:hermes-0" },
            { name: "vesma-eyes-6d7f", phase: "Running",
              exec_env: "pod:vesma-eyes-6d7f" },
          ],
          verdicts: { pods: "denied", pods_detail: "forbidden" },
        },
      },
    });
    const facts = executorSurfaceFacts(m);
    expect(facts).not.toBeNull();
    expect(facts!.runtimeKind).toBe("pod");
    expect(facts!.runtimeNote).toBe("pod-mode: no systemd unit");
    expect(facts!.nodes).toEqual([
      { name: "abyss-ai-agent", ready: true,
        kubeletVersion: "v1.33.4+k3s1" },
      { name: "abyss-ai1-small", ready: false, kubeletVersion: null },
    ]);
    expect(facts!.pods.map((p) => p.execEnv)).toEqual([
      "pod:hermes-0",
      "pod:vesma-eyes-6d7f",
    ]);
    expect(facts!.verdicts).toEqual([
      ["pods", "denied"],
      ["pods_detail", "forbidden"],
    ]);
  });

  it("projects the distrobox containers leg", () => {
    const m = member({
      exec_env_inventory: {
        distrobox_containers: [
          { name: "dev-box", status: "Up 2 hours", scan_verdict: "ok",
            running: true },
          { name: "", phase: "junk" },
        ],
      },
    });
    const facts = executorSurfaceFacts(m);
    expect(facts!.containers).toEqual([
      { name: "dev-box", status: "Up 2 hours", verdict: "ok" },
    ]);
  });

  it("no surface facts — null (the section renders nothing)", () => {
    expect(executorSurfaceFacts(member())).toBeNull();
    expect(
      executorSurfaceFacts(member({ exec_env_inventory: {} })),
    ).toBeNull();
  });

  it("junk-only facts degrade to null (no crash, no fabricated rows, no empty shell)", () => {
    const m = member({
      exec_env_inventory: {
        runtime: { kind: 42 },
        distrobox_containers: [null, "junk", { status: "no name" }] as never,
        k8s: { nodes: [null, { ready: true }] as never,
               pods: [42, { phase: "no name" }] as never,
               verdicts: { pods: "  " } },
      },
    });
    expect(executorSurfaceFacts(m)).toBeNull();
  });

  it("junk rows around a valid one: the valid row survives, junk drops", () => {
    const m = member({
      exec_env_inventory: {
        runtime: { kind: 42, systemd: 7 },
        distrobox_containers: [null, "junk", { name: "dev-box",
                                               scan_verdict: "ok" }] as never,
        k8s: { nodes: [null, { name: "node-a", ready: true }] as never,
               pods: [42, { name: "pod-a", exec_env: "pod:pod-a" }] as never,
               verdicts: { pods: "  ", images: "denied" } },
      },
    });
    const facts = executorSurfaceFacts(m);
    expect(facts).not.toBeNull();
    expect(facts!.runtimeKind).toBeNull();
    expect(facts!.runtimeNote).toBeNull();
    expect(facts!.containers).toEqual([
      { name: "dev-box", status: null, verdict: "ok" },
    ]);
    expect(facts!.nodes).toEqual([
      { name: "node-a", ready: true, kubeletVersion: null },
    ]);
    expect(facts!.pods).toEqual([
      { name: "pod-a", phase: null, node: null, execEnv: "pod:pod-a" },
    ]);
    expect(facts!.verdicts).toEqual([["images", "denied"]]);
  });

  it("lists are display-capped at 8 with the honest overflow count", () => {
    const m = member({
      exec_env_inventory: {
        k8s: {
          pods: Array.from({ length: 12 }, (_, i) => ({
            name: `pod-${i}`,
            exec_env: `pod:pod-${i}`,
          })),
        },
      },
    });
    const facts = executorSurfaceFacts(m);
    expect(facts!.pods).toHaveLength(8);
    expect(facts!.podsOverflow).toBe(4);
  });
});
