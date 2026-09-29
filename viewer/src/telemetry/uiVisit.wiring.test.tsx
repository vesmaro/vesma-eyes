// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GatewayContext } from "@/gateway/GatewayContext";
import type { MemoryGateway } from "@/gateway/MemoryGateway";
import { MockAdapter } from "@/gateway/MockAdapter";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { I18nProvider } from "@/i18n";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import { UiTokenContext } from "@/features/ui-token/UiTokenContext";
import { __resetForTests, __stateForTests } from "./telemetry";

/**
 * The ui.visit wiring (taxonomy §1.2 #1): the provider's boot probe of the
 * live `vesmaro_ui` cookie (ME-028) is the ONLY arm signal. Probe 204 →
 * armed + one ui.visit; probe 401 → silent; an adapter with no session
 * wire (the mock playground) → silent.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  __resetForTests();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  __resetForTests();
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

/** The minimal session-source gateway (ADR 0014 Ф2 wire: verify/probe/logout). */
function sessionGateway(probeLive: boolean): MemoryGateway {
  return {
    verifyUiToken: async () => ({ ok: true, tokenClass: "ui" }),
    probeUiSession: async () => probeLive,
    logoutUiToken: async () => undefined,
  } as unknown as MemoryGateway;
}

async function mountProvider(gateway: MemoryGateway): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <GatewayContext.Provider value={gateway}>
        <I18nProvider initialLang="en">
          <ToastProvider>
            <UiTokenProvider>
              <UiTokenContext.Consumer>
                {(value) => <p>tokenPresent:{String(value?.tokenPresent)}</p>}
              </UiTokenContext.Consumer>
            </UiTokenProvider>
          </ToastProvider>
        </I18nProvider>
      </GatewayContext.Provider>,
    );
    // The probe resolves on a microtask — let it land before asserting.
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe("ui.visit wiring: the boot probe is the only arm (§1.2 #1, §1.3)", () => {
  it("probe 204 (live owner cookie) arms the battery and emits exactly one ui.visit", async () => {
    await mountProvider(sessionGateway(true));
    const state = __stateForTests();
    expect(state.armed).toBe(true);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]).toMatchObject({ kind: "ui.visit" });
    expect(state.visitId).toMatch(/^[0-9A-Za-z][0-9A-Za-z-]{7,63}$/);
  });

  it("probe refusal (anonymous) leaves the battery disarmed", async () => {
    await mountProvider(sessionGateway(false));
    const state = __stateForTests();
    expect(state.armed).toBe(false);
    expect(state.pending).toHaveLength(0);
    expect(state.visitId).toBeNull();
  });

  it("an adapter without the session wire (mock playground) never probes, never arms", async () => {
    await mountProvider(new MockAdapter() as unknown as MemoryGateway);
    expect(__stateForTests().armed).toBe(false);
  });
});
