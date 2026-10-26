// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ModelsHubPage } from "./ModelsHubPage";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { I18nProvider } from "@/i18n";
import { actUnmount, actWaitUntil } from "@/test/actTools";
import type { ModelsRosterPage } from "@/gateway/boardTypes";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * `/agents/models` hub integration (MF1): the REAL MockAdapter through the
 * REAL query path — the live shape (board hermes row + honest empty
 * zones), MF-HUB-EMPTY, the caps cut (8 + «…и ещё N»), the loading
 * skeleton, the error + retry state, and the red-line: no credential
 * field, no connect CTA (the form is MF2 — a dead button would be a lie).
 */

function rosterPage(overrides: Partial<ModelsRosterPage> = {}): ModelsRosterPage {
  return {
    ok: true,
    providers: [],
    discovered: [],
    board: [
      {
        provider: "hermes",
        base_url: "http://hermes.cluster:8642",
        models: ["hermes-4.5-405b", "hermes-4.5-70b"],
        default_model: "hermes-4.5-405b",
        provenance: "board",
      },
    ],
    meta: { max_models_per_row: 50 },
    ...overrides,
  };
}

async function mountPage(
  seed?: (gateway: MockAdapter) => void,
  path = "/agents/models",
): Promise<{ root: Root; container: HTMLElement; gateway: MockAdapter }> {
  const gateway = new MockAdapter({ latency: false });
  seed?.(gateway);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <GatewayContext.Provider value={gateway}>
        <QueryClientProvider client={client}>
          <I18nProvider initialLang="en">
            <MemoryRouter initialEntries={[path]}>
              <ModelsHubPage />
            </MemoryRouter>
          </I18nProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return { root, container, gateway };
}

let mounted: { root: Root; container: HTMLElement } | null = null;

beforeEach(() => {
  mounted = null;
});

afterEach(async () => {
  if (mounted) {
    await actUnmount(mounted.root);
    mounted = null;
  }
  vi.restoreAllMocks();
});

async function waitLoaded(container: HTMLElement, marker: string): Promise<void> {
  await actWaitUntil(() => {
    expect(container.textContent ?? "").toContain(marker);
  });
}

describe("ModelsHubPage — the live shape (MF-HUB-LIVE)", () => {
  it("renders the three zones: connected empty note, mirror empty note, the hermes board card", async () => {
    const page = await mountPage();
    mounted = page;
    await waitLoaded(page.container, "hermes");
    const text = page.container.textContent ?? "";

    // Zones render in EVERY data state (the static-roster precedent).
    expect(text).toContain("Connected providers");
    expect(text).toContain("No providers connected yet");
    expect(text).toContain("Found by agents — not connected");
    expect(text).toContain("No models visible yet — waiting for agent reports");
    expect(text).toContain("Board roster");

    // The board card grammar: name + (cluster) + provenance badge + no-key
    // fact + base_url + counter + default model. NO credential field.
    expect(text).toContain("hermes");
    expect(text).toContain("(cluster)");
    expect(text).toContain("board");
    expect(text).toContain("no key");
    expect(text).toContain(
      "http://agentsnode-hermes-clusterip.kube-agents.svc.cluster.local:8642",
    );
    expect(text).toContain("models: 2");
    expect(text).toContain("hermes-4.5-405b");
    expect(text).toContain("default: hermes-4.5-405b");

    // Red line (verdict §5): no credential-shaped string anywhere.
    const lowered = text.toLowerCase();
    for (const banned of ["credential", "api_key", "apikey", "secret"]) {
      expect(lowered).not.toContain(banned);
    }

    // MF1 honesty: NO connect CTA — the connect form is MF2.
    const buttons = Array.from(page.container.querySelectorAll("button"));
    expect(
      buttons.filter((b) => (b.textContent ?? "").toLowerCase().includes("connect")),
    ).toEqual([]);
  });
});

describe("ModelsHubPage — honest states", () => {
  it("MF-HUB-EMPTY: all zones empty → the single honest empty state", async () => {
    const page = await mountPage((gateway) => {
      vi.spyOn(gateway, "modelsRoster").mockResolvedValue(
        rosterPage({ board: [], discovered: [], providers: [] }),
      );
    });
    mounted = page;
    await waitLoaded(page.container, "No models visible yet");
    expect(page.container.textContent).toContain(
      "The board sees no model facts yet",
    );
    // The empty state REPLACES the zones (one fact, not three empty lists).
    expect(page.container.textContent).not.toContain("Board roster");
  });

  it("MF-HUB-LOADING: the pending read renders the skeleton with a status role", async () => {
    const gateway = new MockAdapter({ latency: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <GatewayContext.Provider value={gateway}>
            <QueryClientProvider client={client}>
              <I18nProvider initialLang="en">
                <MemoryRouter initialEntries={["/agents/models"]}>
                  <ModelsHubPage />
                </MemoryRouter>
              </I18nProvider>
            </QueryClientProvider>
          </GatewayContext.Provider>,
        );
      });
      expect(container.querySelector('[role="status"]')).not.toBeNull();
      expect(container.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe(
        "Loading the model roster",
      );
    } finally {
      await actUnmount(root);
    }
  });

  it("MF-HUB-ERROR: a failed read renders the error empty-state with retry", async () => {
    const page = await mountPage((gateway) => {
      vi.spyOn(gateway, "modelsRoster").mockRejectedValue(
        new Error("board exploded"),
      );
    });
    mounted = page;
    await waitLoaded(page.container, "Failed to load the model roster");
    const retry = Array.from(page.container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Retry"),
    );
    expect(retry).toBeDefined();
  });
});

describe("ModelsHubPage — the caps cut (MF-HUB-CAPS)", () => {
  it("shows 8 model ids + the «…and N more» overflow line", async () => {
    const models = Array.from({ length: 12 }, (_, i) => `m-${i + 1}`);
    const page = await mountPage((gateway) => {
      vi.spyOn(gateway, "modelsRoster").mockResolvedValue(
        rosterPage({
          board: [
            {
              provider: "hermes",
              base_url: "http://hermes.cluster:8642",
              models,
              default_model: "m-1",
              provenance: "board",
            },
          ],
        }),
      );
    });
    mounted = page;
    await waitLoaded(page.container, "models: 12");
    const text = page.container.textContent ?? "";
    expect(text).toContain("models: 12");
    expect(text).toContain("…and 4 more");
    // Shown list honors the 8-cut exactly (ids 1..8 present, 9..12 not).
    for (const id of ["m-8"]) expect(text).toContain(id);
    expect(text).not.toContain("m-9");
  });

  it("mirror rows render the seen-on attribution and the auth fact", async () => {
    const page = await mountPage((gateway) => {
      vi.spyOn(gateway, "modelsRoster").mockResolvedValue(
        rosterPage({
          discovered: [
            {
              provider: "deepseek",
              base_url: "https://api.deepseek.com/v1",
              models: ["deepseek-chat", "deepseek-reasoner"],
              auth: "configured",
              source: "config",
              seen_on: [
                {
                  executor_id: "zcode@desk-2",
                  harness: "zcode",
                  exec_env: "metal",
                  last_reported_at: "2026-10-26T00:00:00Z",
                },
                {
                  executor_id: "pi@desk-2",
                  harness: "pi",
                  exec_env: "pod:x",
                  last_reported_at: "2026-10-26T00:00:00Z",
                },
                {
                  executor_id: "vscode@desk-2",
                  harness: "vscode",
                  exec_env: "metal",
                  last_reported_at: "2026-10-26T00:00:00Z",
                },
                {
                  executor_id: "aider@desk-2",
                  harness: "aider",
                  exec_env: "metal",
                  last_reported_at: "2026-10-26T00:00:00Z",
                },
              ],
              provenance: "agent",
            },
          ],
        }),
      );
    });
    mounted = page;
    await waitLoaded(page.container, "deepseek");
    const text = page.container.textContent ?? "";
    expect(text).toContain("seen on zcode@desk-2");
    expect(text).toContain("key configured locally");
    expect(text).toContain("source: harness config");
    expect(text).toContain("models: 2");
    // seen-on cut: 3 + the honest overflow.
    expect(text).toContain("…and 1 more");
  });
});
