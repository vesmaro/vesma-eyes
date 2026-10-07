// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PublicStatusLine } from "./PublicStatusLine";
import { GatewayContext } from "@/gateway/GatewayContext";
import type { MemoryGateway } from "@/gateway/MemoryGateway";
import { I18nProvider } from "@/i18n";
import { actWaitUntil } from "@/test/actTools";

/**
 * The public-contour status line (07k §1.3): one version source (the board
 * health read, like the sidebar footer) and honest absence — no version
 * served → «vesma-eyes · аноним», never a guessed number. The line is
 * anonymous on the public entry pages by definition.
 */

function makeGateway(health: unknown): MemoryGateway {
  return {
    boardHealth: () => Promise.resolve(health),
  } as unknown as MemoryGateway;
}

async function mount(gateway: MemoryGateway): Promise<() => void> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <GatewayContext.Provider value={gateway}>
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: { queries: { retry: false } },
            })
          }
        >
          <I18nProvider initialLang="ru">
            <PublicStatusLine />
          </I18nProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return () =>
    act(() => {
      root.unmount();
      container.remove();
    });
}

const mounted: (() => void)[] = [];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  document.body.innerHTML = "";
});

afterEach(() => {
  for (const unmount of mounted.splice(0).reverse()) unmount();
});

describe("PublicStatusLine — the public-contour footer (07k §1.3)", () => {
  it("reads the version from board health: «vesma-eyes 1.53.0 · аноним»", async () => {
    mounted.push(
      await mount(makeGateway({ ok: true, app_version: "1.53.0", servers: [] })),
    );
    await actWaitUntil(() =>
      expect(
        document.querySelector("[data-testid=public-status-line]")?.textContent,
      ).toBe("vesma-eyes 1.53.0 · аноним"),
    );
  });

  it("honest absence: no version served → «vesma-eyes · аноним»", async () => {
    mounted.push(
      await mount(makeGateway({ ok: true, app_version: null, servers: [] })),
    );
    await actWaitUntil(() =>
      expect(
        document.querySelector("[data-testid=public-status-line]")?.textContent,
      ).toBe("vesma-eyes · аноним"),
    );
  });
});
