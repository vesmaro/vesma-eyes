// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ExecutorRegistryPage } from "./ExecutorRegistryPage";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import { actUnmount, actWaitUntil } from "@/test/actTools";
import type { ActiveProvisionJob } from "./useProvision";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * ProvisionDisclosure (UX-overhaul §4.1, review P3-3): the connect card
 * folds below the working registry and opens itself ONLY when it is the
 * answer — an EMPTY registry (the guide led the screen, the card follows)
 * or a LIVE provision job (the funnel must stay visible mid-run). The
 * owner's toggle wins over both defaults once touched.
 *
 * State matrix under test:
 * - non-empty registry, no job → FOLDED («Connect over SSH» absent);
 * - empty registry → OPEN (the card is the empty domain's answer);
 * - non-empty registry + live job (sessionStorage) → OPEN;
 * - owner's toggle → beats the registryEmpty default in BOTH directions.
 */

const ACTIVE_JOB_KEY = "vesmaro.provision.active";
const JOB: ActiveProvisionJob = {
  job_id: "job-1",
  host: "192.0.2.10",
  port: 22,
  name: "agent-x",
};

async function mountRegistry(seedEmpty: boolean): Promise<{
  root: Root;
  container: HTMLElement;
}> {
  const gateway = new MockAdapter({ latency: false });
  if (seedEmpty) {
    vi.spyOn(gateway, "listExecutors").mockResolvedValue({
      ok: true,
      count: 0,
      items: [],
      meta: { presence: { online_max_age_s: 120, stale_max_age_s: 600 }, sweeper_interval_s: 60 },
    });
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <GatewayContext.Provider value={gateway}>
        <QueryClientProvider client={client}>
          <ToastProvider>
            <UiTokenProvider>
              <I18nProvider initialLang="en">
                <MemoryRouter initialEntries={["/agents/harnesses"]}>
                  <ExecutorRegistryPage />
                </MemoryRouter>
              </I18nProvider>
            </UiTokenProvider>
          </ToastProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  await actWaitUntil(() => {
    const text = container.textContent ?? "";
    expect(
      text.includes("Awaiting approval") ||
        text.includes("How to connect an external agent"),
    ).toBe(true);
  });
  return { root, container };
}

const disclosureToggle = (container: HTMLElement): HTMLButtonElement =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    button.textContent?.includes("Connect a new agent"),
  )!;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(async () => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("ProvisionDisclosure (UX-overhaul §4.1, review P3-3)", () => {
  it("non-empty registry: FOLDED by default — no SSH form on screen", async () => {
    const { root, container } = await mountRegistry(false);
    const toggle = disclosureToggle(container);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("Connect over SSH");
    await actUnmount(root);
  });

  it("empty registry: the card opens itself (the empty domain's answer)", async () => {
    const { root, container } = await mountRegistry(true);
    const toggle = disclosureToggle(container);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Connect over SSH");
    await actUnmount(root);
  });

  it("non-empty registry + LIVE provision job (sessionStorage): forced OPEN", async () => {
    sessionStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(JOB));
    const { root, container } = await mountRegistry(false);
    const toggle = disclosureToggle(container);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // With a live job the card shows the JOB STATUS surface (the funnel
    // mid-run), not the SSH form — the point is visibility, and the
    // running job is on screen («Connecting <host>»).
    expect(container.textContent).toContain("Connecting 192.0.2.10");
    await actUnmount(root);
  });

  it("the owner's toggle WINS over the empty-registry default in both directions", async () => {
    // Empty registry → open by default; the owner folds it and it STAYS folded.
    const { root, container } = await mountRegistry(true);
    await act(async () => {
      disclosureToggle(container).click();
    });
    expect(disclosureToggle(container).getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("Connect over SSH");
    await actUnmount(root);

    // Non-empty registry → folded by default; the owner opens it and it
    // STAYS open (the toggle is not re-derived from the registry state).
    const second = await mountRegistry(false);
    await act(async () => {
      disclosureToggle(second.container).click();
    });
    expect(disclosureToggle(second.container).getAttribute("aria-expanded")).toBe("true");
    expect(second.container.textContent).toContain("Connect over SSH");
    await actUnmount(second.root);
  });
});