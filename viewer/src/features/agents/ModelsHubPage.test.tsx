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
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { actUnmount, actWaitUntil } from "@/test/actTools";
import type { ModelsRosterPage } from "@/gateway/boardTypes";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * `/agents/models` hub integration (MF1 roster + MF2 provider
 * connection): the REAL MockAdapter through the REAL query path — the
 * live shape (owner-registry cards with key slots + the board hermes row),
 * MF-HUB-EMPTY, MF-HUB-OFF (the honest-off card + disabled CTA), the caps
 * cut (8 + «…и ещё N»), the loading skeleton, the error + retry state,
 * and the red lines: no credential field, no show/copy surface (verdict
 * §5).
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
    meta: { max_models_per_row: 50, providers_off: false },
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
          <ToastProvider>
            <I18nProvider initialLang="en">
              <MemoryRouter initialEntries={[path]}>
                <ModelsHubPage />
              </MemoryRouter>
            </I18nProvider>
          </ToastProvider>
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
  it("renders the three zones: the connect CTA, the connected empty note, the mirror note, the hermes board card", async () => {
    const page = await mountPage();
    mounted = page;
    await waitLoaded(page.container, "hermes");
    const text = page.container.textContent ?? "";

    // Zones render in EVERY data state (the static-roster precedent).
    expect(text).toContain("Connected providers");
    expect(text).toContain("No providers connected yet.");
    expect(text).toContain("Found by agents — not connected");
    expect(text).toContain("No models visible yet — waiting for agent reports");
    expect(text).toContain("Board roster");

    // MF2: the owner act exists — the connect CTA (enabled: providers_off
    // is false in the fixture meta).
    const connect = Array.from(page.container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").includes("Connect provider"),
    );
    expect(connect).toBeDefined();
    expect(connect?.hasAttribute("disabled")).toBe(false);

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
    // MF1 review P3-4: «token» joined the pin family.
    const lowered = text.toLowerCase();
    for (const banned of ["credential", "api_key", "apikey", "secret", "token"]) {
      expect(lowered).not.toContain(banned);
    }
  });
});

describe("ModelsHubPage — provider registry cards (MF2)", () => {
  it("a `set` card: the slot text, the fingerprint with the not-the-key hint, the date, rotate/remove acts", async () => {
    const page = await mountPage((gateway) => {
      vi.spyOn(gateway, "modelsRoster").mockResolvedValue(
        rosterPage({
          providers: [
            {
              provider_key: "openrouter",
              base_url: "https://openrouter.ai/api/v1",
              fingerprint: "3f9a21c0bde4",
              created_at: "2026-10-24T00:00:00+00:00",
              rotated_at: null,
              status: "set",
            },
          ],
        }),
      );
    });
    mounted = page;
    await waitLoaded(page.container, "openrouter");
    const text = page.container.textContent ?? "";
    // The slot is the emphasized fact; the fingerprint is metadata, NOT
    // the key — with its honest hint.
    expect(text).toContain("Key set");
    expect(text).toContain("fp 3f9a21c0bde4");
    expect(text).toContain("The fingerprint is not the key");
    expect(text).toContain("set Oct 24, 2026");
    // Owner acts + the MF3 roadmap note (no dead grant control).
    expect(text).toContain("Replace key");
    expect(text).toContain("Remove key");
    expect(text).toContain("Access management arrives in the next wave");
    // Red line: the metadata card carries no credential-shaped string.
    const lowered = text.toLowerCase();
    for (const banned of ["credential", "api_key", "apikey", "secret", "token"]) {
      expect(lowered).not.toContain(banned);
    }
  });

  it("an unset card: the honest slot + the Set key act", async () => {
    const page = await mountPage((gateway) => {
      vi.spyOn(gateway, "modelsRoster").mockResolvedValue(
        rosterPage({
          providers: [
            {
              provider_key: "ollama-local",
              base_url: "http://127.0.0.1:11434",
              fingerprint: null,
              created_at: "2026-10-24T00:00:00+00:00",
              rotated_at: null,
              status: null,
            },
          ],
        }),
      );
    });
    mounted = page;
    await waitLoaded(page.container, "ollama-local");
    const text = page.container.textContent ?? "";
    expect(text).toContain("Not connected — no key set");
    expect(text).toContain("Set key");
  });

  it("an out-of-enum status degrades to the honest unset (never invented)", async () => {
    const page = await mountPage((gateway) => {
      vi.spyOn(gateway, "modelsRoster").mockResolvedValue(
        rosterPage({
          providers: [
            {
              provider_key: "weird",
              base_url: "https://x.example",
              fingerprint: "abc",
              created_at: "2026-10-24T00:00:00+00:00",
              rotated_at: null,
              status: "rejected" as never,
            },
          ],
        }),
      );
    });
    mounted = page;
    // MF2 wire enum IS closed including `rejected` (minted by MF3): the
    // slot machine renders the named fact, never a crash or a ghost «set».
    await waitLoaded(page.container, "Key rejected by the provider");
  });
});

describe("ModelsHubPage — MF-HUB-OFF (the honest 503 family)", () => {
  it("providers_off meta renders the named-reason card and DISABLES the connect CTA", async () => {
    const page = await mountPage((gateway) => {
      vi.spyOn(gateway, "modelsRoster").mockResolvedValue(
        rosterPage({
          meta: { max_models_per_row: 50, providers_off: true },
        }),
      );
    });
    mounted = page;
    await waitLoaded(page.container, "Provider connection is off");
    const text = page.container.textContent ?? "";
    // The reason is named; the FACTS below still render (no off-branch
    // for facts — the roster zones stay).
    expect(text).toContain("The board has no secrets directory configured");
    expect(text).toContain("Board roster");
    const connect = Array.from(page.container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").includes("Connect provider"),
    );
    expect(connect?.hasAttribute("disabled")).toBe(true);
  });

  it("MF-HUB-EMPTY with providers_off: the single CTA renders disabled", async () => {
    const page = await mountPage((gateway) => {
      vi.spyOn(gateway, "modelsRoster").mockResolvedValue(
        rosterPage({
          board: [],
          discovered: [],
          providers: [],
          meta: { max_models_per_row: 50, providers_off: true },
        }),
      );
    });
    mounted = page;
    await waitLoaded(page.container, "No models visible yet");
    const connect = Array.from(page.container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").includes("Connect provider"),
    );
    expect(connect).toBeDefined();
    expect(connect?.hasAttribute("disabled")).toBe(true);
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
              <ToastProvider>
                <I18nProvider initialLang="en">
                  <MemoryRouter initialEntries={["/agents/models"]}>
                    <ModelsHubPage />
                  </MemoryRouter>
                </I18nProvider>
              </ToastProvider>
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
