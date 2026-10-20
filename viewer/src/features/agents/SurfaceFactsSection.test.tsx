import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { ExecutorItem } from "@/gateway/boardTypes";
import { I18nProvider } from "@/i18n";
import { SurfaceFactsSection } from "./SurfaceFactsSection";

/**
 * AGW-23/24: the card's execution-environment section — the mirrored
 * pods (exec_env=pod:<name>) and the runtime=pod verdict render OPEN;
 * a pre-v0.9 executor renders NOTHING (honest absence, zero geometry).
 */

function member(overrides: Partial<ExecutorItem> = {}): ExecutorItem {
  return {
    id: "ex-1",
    name: "vesma-eyes@abyss-ai-agent",
    harness: "vesma-eyes",
    host: "abyss-ai-agent",
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

function renderSection(executor: ExecutorItem): string {
  // renderToString interleaves <!-- --> markers between text nodes —
  // strip them so the assertions read the VISIBLE text.
  return renderToString(
    <I18nProvider initialLang="en">
      <SurfaceFactsSection executor={executor} />
    </I18nProvider>,
  ).replace(/<!-- -->/g, "");
}

describe("SurfaceFactsSection (the card's surface mirror)", () => {
  it("renders the runtime=pod verdict, nodes and mirrored pods with exec_env", () => {
    const html = renderSection(
      member({
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
                exec_env: "pod:hermes-0" },
              { name: "vesma-eyes-6d7f", phase: "Running",
                node: "abyss-ai-agent", exec_env: "pod:vesma-eyes-6d7f" },
            ],
            verdicts: { pods: "denied" },
          },
        },
      }),
    );
    // The runtime verdict (AGW-24: runtime=pod must be visible).
    expect(html).toContain("pod-mode: no systemd unit");
    // The nodes (the real 2-node cluster shape) with readiness words.
    expect(html).toContain("abyss-ai-agent");
    expect(html).toContain("abyss-ai1-small");
    expect(html).toContain("not ready");
    // The mirrored pods show the agent's OWN surface label (pod:<name>).
    expect(html).toContain("pod:hermes-0");
    expect(html).toContain("pod:vesma-eyes-6d7f");
    // Non-ok verdicts surface, named as the refusal they are.
    expect(html).toContain("pods: denied");
  });

  it("caps a long pod list with the honest overflow line", () => {
    const html = renderSection(
      member({
        exec_env_inventory: {
          k8s: {
            pods: Array.from({ length: 12 }, (_, i) => ({
              name: `pod-${i}`,
              exec_env: `pod:pod-${i}`,
            })),
          },
        },
      }),
    );
    expect(html).toContain("pod:pod-7");
    expect(html).not.toContain("pod:pod-8");
    expect(html).toContain("…and 4 more");
  });

  it("renders NOTHING for an executor without surface facts", () => {
    expect(renderSection(member())).toBe("");
  });
});
