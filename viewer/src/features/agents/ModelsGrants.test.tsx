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
import { narrowGrantsPage } from "./modelsModel";
import type {
  ModelProvider,
  ModelsGrantsPage,
  ModelsRosterPage,
} from "@/gateway/boardTypes";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * MF3 grants + slot-machine facts on the provider card (ux-blueprint
 * §3.2/§3.3 under the security verdict §5). QA matrix:
 * - the slot wakes: «used N ago» on `set`, «last attempt N ago» on
 *   `rejected` (the provider-401 fact reachable since enforcement);
 * - MF-GRANT-EMPTY: the honest board-only fact + the grant CTA;
 * - the CTA is disabled WITH its reason while the key is unset
 *   (authority without material is dead);
 * - the dialog draws its checkboxes from the LIVE selector registry and
 *   the full CRUD path lands on the gateway (create → pause → revoke);
 * - MF-GRANT-SELECTOR-EMPTY: an empty registry leaves the controls
 *   disabled WITH the explanation (never hidden);
 * - the projection narrows a buggy wire defensively (never invents).
 */

function rosterPage(overrides: Partial<ModelsRosterPage> = {}): ModelsRosterPage {
  return {
    ok: true,
    providers: [],
    discovered: [],
    board: [],
    meta: { max_models_per_row: 50, providers_off: false },
    ...overrides,
  };
}

async function mountPage(
  seed?: (gateway: MockAdapter) => void,
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
              <MemoryRouter initialEntries={["/agents/models"]}>
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

async function clickButton(container: HTMLElement, label: string): Promise<void> {
  const button = Array.from(container.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").trim() === label,
  );
  expect(button, `button «${label}» must render`).not.toBeNull();
  await act(async () => {
    (button as HTMLButtonElement).click();
  });
}

async function toggleCheckbox(id: string): Promise<void> {
  const box = document.querySelector(`#${CSS.escape(id)}`) as HTMLInputElement | null;
  expect(box, `#${id} must render`).not.toBeNull();
  // The click is the honest toggle (the ExecutorSheet discipline):
  // happy-dom flips `checked` and fires the change React listens for.
  await act(async () => {
    box!.click();
  });
}

async function submitGrantForm(): Promise<void> {
  const form = Array.from(document.body.querySelectorAll("form")).at(-1);
  expect(form, "the grant form must render").not.toBeNull();
  await act(async () => {
    (form as HTMLFormElement).dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

describe("ModelsGrants — the slot-machine facts (MF3 §3)", () => {
  it("a `set` card ticks «used N ago»; a never-used card states it honestly", async () => {
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
              last_used_at: new Date(Date.now() - 120_000).toISOString(),
              rejected_at: null,
            },
            {
              provider_key: "ollama-local",
              base_url: "http://127.0.0.1:11434",
              fingerprint: "af19ce11ce90",
              created_at: "2026-10-24T00:00:00+00:00",
              rotated_at: null,
              status: "set",
              last_used_at: null,
              rejected_at: null,
            },
          ],
        }),
      );
    });
    mounted = page;
    await waitLoaded(page.container, "openrouter");
    const text = page.container.textContent ?? "";
    expect(text).toContain("used ");
    expect(text).toContain("never used");
    expect(text).not.toContain("last attempt");
  });

  it("a `rejected` card names the provider-401 fact with the attempt time", async () => {
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
              status: "rejected",
              last_used_at: null,
              rejected_at: new Date(Date.now() - 300_000).toISOString(),
            },
          ],
        }),
      );
    });
    mounted = page;
    await waitLoaded(page.container, "openrouter");
    const text = page.container.textContent ?? "";
    expect(text).toContain("Key rejected by the provider");
    expect(text).toContain("last attempt ");
  });
});

/** Seed the REAL mock registry (the grants read hits it) and pin the
 * roster shape the hub renders from — the roster spy is the slot-facts
 * carrier, the registry is the real mock state. */
function seedProvider(
  gateway: MockAdapter,
  overrides: Partial<ModelProvider> = {},
) {
  void gateway.createModelProvider({
    provider_key: "openrouter",
    base_url: "https://openrouter.ai/api/v1",
    credential: "sk-qa-fake-credential-placeholder-0001",
  });
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
          last_used_at: null,
          rejected_at: null,
          ...overrides,
        },
      ],
    }),
  );
}

describe("ModelsGrants — the grants table (MF3 §3.3)", () => {
  it("MF-GRANT-EMPTY: the board-only fact, the pull promise, and the CTA", async () => {
    const page = await mountPage((gateway) => {
      seedProvider(gateway);
    });
    mounted = page;
    await waitLoaded(page.container, "openrouter");
    const text = page.container.textContent ?? "";
    expect(text).toContain(
      "No access granted — the provider is available to the board only",
    );
    expect(text).toContain(
      "Pause and revoke act immediately: the next call from this address will fail.",
    );
    const grant = Array.from(page.container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim() === "Grant access",
    );
    expect(grant?.disabled).toBe(false);
  });

  it("the CTA is disabled WITH its reason while the key is unset", async () => {
    const page = await mountPage((gateway) => {
      vi.spyOn(gateway, "modelsRoster").mockResolvedValue(
        rosterPage({
          providers: [
            {
              provider_key: "openrouter",
              base_url: "https://openrouter.ai/api/v1",
              fingerprint: null,
              created_at: "2026-10-24T00:00:00+00:00",
              rotated_at: null,
              status: null,
              last_used_at: null,
              rejected_at: null,
            },
          ],
        }),
      );
    });
    mounted = page;
    await waitLoaded(page.container, "openrouter");
    const grant = Array.from(page.container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim() === "Grant access",
    );
    expect(grant?.disabled).toBe(true);
    expect(page.container.textContent).toContain(
      "Set the key first — access is granted to a connected provider only",
    );
  });

  it("the full CRUD path lands on the gateway: create, pause, revoke", { timeout: 30_000 }, async () => {
    const page = await mountPage((gateway) => {
      seedProvider(gateway);
    });
    mounted = page;
    await waitLoaded(page.container, "openrouter");

    const createSpy = vi.spyOn(page.gateway, "createModelGrant");
    const pauseSpy = vi.spyOn(page.gateway, "setModelGrantEnabled");
    const revokeSpy = vi.spyOn(page.gateway, "deleteModelGrant");

    // Open the dialog; the registry checkboxes come from the mock spine.
    await clickButton(page.container, "Grant access");
    await actWaitUntil(() => {
      expect(document.querySelector("#grant-target-host-laptop")).not.toBeNull();
    });
    await toggleCheckbox("grant-target-host-laptop");
    await submitGrantForm();

    await actWaitUntil(() => {
      const [key, payload] = createSpy.mock.calls[0] ?? [];
      expect(key).toBe("openrouter");
      expect(payload).toEqual({
        selector_kind: "host",
        selector_value: "laptop",
      });
    });
    // The row lands (invalidate → refetch) and reads active.
    await actWaitUntil(() => {
      const text = page.container.textContent ?? "";
      expect(text).toContain("laptop");
      expect(text).toContain("active");
    });

    // Pause: the labelled switch never disappears (audit stays visible).
    await act(async () => {
      const box = page.container.querySelector(
        'input[aria-label="Access for laptop"]',
      ) as HTMLInputElement | null;
      expect(box).not.toBeNull();
      box!.click();
    });
    await actWaitUntil(() => {
      const [key, grantId, enabled] = pauseSpy.mock.calls[0] ?? [];
      expect(key).toBe("openrouter");
      expect(grantId).toMatch(/^mgr-/);
      expect(enabled).toBe(false);
      expect(page.container.textContent).toContain("paused");
    });

    // Revoke: the confirm names the consequence, the row leaves.
    await clickButton(page.container, "Revoke");
    expect(page.container.textContent).toContain(
      "Revoke access for laptop? The next call from this address will fail.",
    );
    await clickButton(page.container, "Revoke access");
    await actWaitUntil(() => {
      const [key, grantId] = revokeSpy.mock.calls[0] ?? [];
      expect(key).toBe("openrouter");
      expect(grantId).toMatch(/^mgr-/);
      expect(page.container.textContent).toContain(
        "No access granted — the provider is available to the board only",
      );
    });
  });

  it("MF-GRANT-SELECTOR-EMPTY: an empty registry disables the controls WITH the explanation", async () => {
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
              last_used_at: null,
              rejected_at: null,
            },
          ],
        }),
      );
      vi.spyOn(gateway, "listModelGrants").mockResolvedValue({
        ok: true,
        grants: [],
        meta: { selector_registry: { hosts: [], executors: [] } },
      } as ModelsGrantsPage);
    });
    mounted = page;
    await waitLoaded(page.container, "openrouter");
    await clickButton(page.container, "Grant access");
    await actWaitUntil(() => {
      const body = document.body.textContent ?? "";
      expect(body).toContain("No hosts registered — connect an agent first");
    });
    const submit = Array.from(document.body.querySelectorAll("button")).find(
      (b) => (b.getAttribute("type") ?? "") === "submit",
    );
    expect(submit?.disabled).toBe(true);
  });
});

describe("ModelsGrants — the projection narrows a buggy wire defensively", () => {
  it("bad rows drop, the selector falls back to kind:value, the registry bounds", () => {
    const page = narrowGrantsPage({
      ok: true,
      grants: [
        {
          grant_id: "mgr-ok",
          provider_key: "prov",
          selector_kind: "host",
          selector_value: "laptop",
          selector: "",
          enabled: true,
          created_at: "2026-10-26T00:00:00+00:00",
          created_by: "ui",
        },
        {
          grant_id: "mgr-bad-kind",
          provider_key: "prov",
          selector_kind: "wildcard",
          selector_value: "*",
          selector: "wildcard:*",
          enabled: true,
          created_at: "",
          created_by: "ui",
        },
        { grant_id: "" },
        null,
        "junk",
      ],
      meta: {
        selector_registry: {
          hosts: ["laptop", 42, "", "x".repeat(200)],
          executors: ["zcode@laptop"],
        },
        junk: "ignored",
      },
    } as unknown as ModelsGrantsPage);
    expect(page.grants.length).toBe(1);
    expect(page.grants[0]?.selector).toBe("host:laptop");
    expect(page.grants[0]?.enabled).toBe(true);
    expect(page.selectorRegistry.hosts).toEqual(["laptop", "x".repeat(60)]);
    expect(page.selectorRegistry.executors).toEqual(["zcode@laptop"]);
  });
});
