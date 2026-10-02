// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TaskInboxPage } from "./TaskInboxPage";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { ToastViewport } from "@/components/Toast/ToastViewport";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import { UI_TOKEN_STORAGE_KEY } from "@/gateway/uiToken";
import { actFlush } from "@/test/actTools";

/**
 * ME-073 «Принять все» on /tasks/inbox: the button appears exactly when
 * something is adoptable (not stale, not adopted), confirms WITH the count,
 * fires ONE batch call and reports through ONE toast. The confirm-decline
 * path sends nothing.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mountInbox(): Promise<MockAdapter> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  sessionStorage.setItem(UI_TOKEN_STORAGE_KEY, "dev-token");
  const gateway = new MockAdapter({ latency: false });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await queryClient.prefetchQuery({
    queryKey: keys.tasks.inbox({ include_adopted: false }),
    queryFn: () => gateway.inbox({ include_adopted: false }),
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <GatewayContext.Provider value={gateway}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <UiTokenProvider>
              <I18nProvider initialLang="en">
                <MemoryRouter initialEntries={["/tasks/inbox"]}>
                  {/* The Shell mounts the viewport inside the router; the
                   * test tree mirrors that so pushed toasts materialize. */}
                  <TaskInboxPage />
                  <ToastViewport />
                </MemoryRouter>
              </I18nProvider>
            </UiTokenProvider>
          </ToastProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return gateway;
}

async function waitFor(what: string, probe: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  for (;;) {
    if (probe()) return;
    if (Date.now() > deadline) {
      throw new Error(
        `waitFor(${what}) timed out; page text: ${container!.textContent?.slice(0, 300)}`,
      );
    }
    await act(async () => {
      await actFlush(25);
    });
  }
}

async function click(target: Element | null | undefined): Promise<void> {
  expect(target, "interaction target must exist").toBeDefined();
  await act(async () => {
    (target as HTMLButtonElement).click();
    await actFlush(20);
  });
}

function adoptAllButton(): HTMLButtonElement | undefined {
  return [...container!.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Accept all"),
  );
}

/** happy-dom ships no window.confirm — install a recording double and
 * restore the original (undefined) afterwards. */
function stubConfirm(impl: (message: string) => boolean): void {
  (window as { confirm?: unknown }).confirm = impl;
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(async () => {
  (window as { confirm?: unknown }).confirm = undefined;
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

describe("ME-073 «Принять все»", () => {
  it("confirms with the counter, batch-adopts once, toasts the report", async () => {
    const gateway = await mountInbox();
    await waitFor("adopt-all button", () => adoptAllButton() !== undefined);

    const batchSpy = vi.spyOn(gateway, "adoptInboxBatch");
    const confirmMessages: string[] = [];
    stubConfirm((message) => {
      confirmMessages.push(message);
      return true;
    });

    await click(adoptAllButton());

    // the confirm named the ADOPTABLE count (2 live rows; stale/adopted excluded)
    expect(confirmMessages).toEqual(["Accept all records to the board (2)?"]);
    // ONE batch call carrying both ids (the mock fixture's adoptable rows)
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy.mock.calls[0]?.[0].sort()).toEqual([
      "bd945a48-0888-4b1f-9ebb-841519e5f8b9",
      "c2a111f3-5a44-4bb7-9d0e-6f7a2b3c4d5e",
    ]);

    // the toast viewport renders in a portal (document.body), not the page tree
    await waitFor("result toast", () =>
      document.body.textContent?.includes("Records accepted") ?? false);
    await waitFor("button hides when nothing is adoptable", () =>
      adoptAllButton() === undefined);
  });

  it("a declined confirmation adopts nothing", async () => {
    const gateway = await mountInbox();
    await waitFor("adopt-all button", () => adoptAllButton() !== undefined);

    const batchSpy = vi.spyOn(gateway, "adoptInboxBatch");
    stubConfirm(() => false);

    await click(adoptAllButton());

    expect(batchSpy).not.toHaveBeenCalled();
    expect(adoptAllButton()).toBeDefined();
  });
});
