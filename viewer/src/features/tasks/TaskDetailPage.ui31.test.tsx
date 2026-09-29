// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TaskDetailPage } from "./TaskDetailPage";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import { UI_TOKEN_STORAGE_KEY } from "@/gateway/uiToken";
import type { BoardSummary } from "@/gateway/boardTypes";

/**
 * UI-31 card contract: the description (spec) is the FIRST content section
 * of the task card — TextEngine-rendered, honestly empty when absent — and
 * the «Связанное» row deep-links the task's cross-surface context
 * (Активность with the task_id filter, Кора, Память), every link carrying
 * `return=` back to the card state (UI-18 §2.2 rule 3).
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mountCard(options: {
  entry?: string;
  lang?: "ru" | "en";
  patchBoard?: (board: BoardSummary) => BoardSummary;
}): Promise<HTMLDivElement> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  sessionStorage.setItem(UI_TOKEN_STORAGE_KEY, "dev-token");
  const gateway = new MockAdapter({ latency: false });
  if (options.patchBoard) {
    const patch = options.patchBoard;
    const baseBoard = gateway.board.bind(gateway);
    gateway.board = (async (): Promise<BoardSummary> =>
      patch(await baseBoard(undefined))) as unknown as MockAdapter["board"];
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await queryClient.prefetchQuery({
    queryKey: keys.tasks.board(),
    queryFn: () => gateway.board(undefined),
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
              <I18nProvider initialLang={options.lang ?? "en"}>
                <MemoryRouter
                  initialEntries={[options.entry ?? "/tasks/TB-1"]}
                >
                  <Routes>
                    <Route path="/tasks/:id" element={<TaskDetailPage />} />
                  </Routes>
                </MemoryRouter>
              </I18nProvider>
            </UiTokenProvider>
          </ToastProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return container;
}

async function waitFor(what: string, probe: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  for (;;) {
    if (probe()) return;
    if (Date.now() > deadline) {
      throw new Error(`waitFor(${what}) timed out; html: ${container!.innerHTML.slice(0, 1200)}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

beforeEach(() => {
  sessionStorage.clear();
  container = null;
  root = null;
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

describe("TaskDetailPage card (UI-31)", () => {
  it("description is the FIRST content section: before «Связанное» and before the tab nav", async () => {
    const el = await mountCard({});
    await waitFor("description section", () =>
      Boolean(el.querySelector('section[aria-label="Description"]')),
    );
    const description = el.querySelector('section[aria-label="Description"]')!;
    const related = el.querySelector('nav[aria-label="Related"]')!;
    const tabs = el.querySelector('nav[aria-label="Task sections"]')!;
    // Header → description → related → tabs, in document order.
    const header = el.querySelector("header")!;
    expect(
      header.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      description.compareDocumentPosition(related) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      related.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The mock TB-1 spec is plain prose — the TextEngine plain path.
    expect(description.textContent).toContain("Acceptance criteria");
  });

  it("empty spec: honest «no description» copy with the edit hint on a mutable row", async () => {
    const el = await mountCard({
      patchBoard: (board) => ({
        ...board,
        tasks: board.tasks.map((task) =>
          task.id === "TB-1" ? { ...task, spec: "" } : task,
        ),
      }),
    });
    await waitFor("empty description copy", () =>
      el.querySelector('section[aria-label="Description"]')?.textContent?.includes(
        "No description yet.",
      ) === true,
    );
    const description = el.querySelector('section[aria-label="Description"]')!;
    expect(description.textContent).toContain("Add one via «Edit».");
    // No TextEngine well box is fabricated around nothing.
    expect(description.querySelector(".bg-well")).toBeNull();
  });

  it("«Связанное»: Активность carries the task_id filter, Кора and Память link, all preserving ?return=", async () => {
    const el = await mountCard({
      entry: "/tasks/TB-1?tab=details&return=%2Ftasks%3Fstatus%3Dopen",
    });
    await waitFor("related nav", () =>
      Boolean(el.querySelector('nav[aria-label="Related"]')),
    );
    const activity = el.querySelector<HTMLAnchorElement>(
      'nav[aria-label="Related"] a[href^="/tasks/activity"]',
    );
    expect(activity, "activity deep link").not.toBeNull();
    // The task filter rides the link (UI-28 URL contract).
    expect(activity!.getAttribute("href")).toContain("task_id=TB-1");
    // The card state (pathname+search, incl. the incoming return=) rides
    // back as THIS link's return=.
    expect(activity!.getAttribute("href")).toContain(
      `return=${encodeURIComponent("/tasks/TB-1?tab=details&return=%2Ftasks%3Fstatus%3Dopen")}`,
    );
    expect(
      el.querySelector<HTMLAnchorElement>('nav[aria-label="Related"] a[href^="/kora"]'),
    ).not.toBeNull();
    // Память is the in-card tab swap: same pathname, tab=memory, return kept.
    const memory = el.querySelector<HTMLAnchorElement>(
      'nav[aria-label="Related"] a[href*="tab=memory"]',
    );
    expect(memory).not.toBeNull();
    expect(memory!.getAttribute("href")).toContain("return=");
  });

  it("ru: the description and related labels speak Russian", async () => {
    const el = await mountCard({ lang: "ru" });
    await waitFor("ru description", () =>
      Boolean(el.querySelector('section[aria-label="Описание"]')),
    );
    expect(el.querySelector('nav[aria-label="Связанное"]')).not.toBeNull();
    expect(
      el.querySelector('section[aria-label="Описание"]')?.textContent,
    ).toContain("Acceptance criteria");
    const related = el.querySelector('nav[aria-label="Связанное"]')!;
    expect(related.textContent).toContain("Активность по задаче");
    expect(related.textContent).toContain("Рабочие сессии (Кора)");
    expect(related.textContent).toContain("Память задачи");
  });

  it("?tab=execution (no assignments): «Кто работал» resolves the mock attribution, reports jump wired", async () => {
    // TB-10: open, no corpus assignments. The workers feed fetches live in
    // the act loop (no prefetch) — the integration path.
    const el = await mountCard({ entry: "/tasks/TB-10?tab=execution" });
    await waitFor("workers panel", () =>
      Boolean(el.querySelector('section[aria-label="Who worked on this"]')),
    );
    // Scoped to the workers section: the tab nav carries the same href.
    const jump = () =>
      el.querySelector<HTMLAnchorElement>(
        'section[aria-label="Who worked on this"] a[href="/tasks/TB-10?tab=reports"]',
      );
    await waitFor("reports jump", () => Boolean(jump()));
    expect(jump()?.textContent).toContain("Task reports: ");
  });
});
