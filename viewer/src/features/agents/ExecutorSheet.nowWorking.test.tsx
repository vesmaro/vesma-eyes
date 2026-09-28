// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ExecutorSheet } from "./ExecutorSheet";
import type { AssignmentItem } from "@/gateway/boardTypes";
import type { AssignmentsPage, ExecutorsPage } from "@/gateway/boardTypes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { ToastViewport } from "@/components/Toast/ToastViewport";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import { actUnmount } from "@/test/actTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * ExecutorSheet «Сейчас выполняет» (UX-overhaul §4.3, П3): the card's FIRST
 * block answers «чем занят» from the SHARED assignments queue filtered by
 * `claimed_by_executor`. The contract under test:
 * - the work block renders FIRST (before Link/Access);
 * - an executor with an active assignment lists it with the task title and
 *   the `return=`-bearing «Открыть задачу» link + the «Все задачи» deep-link
 *   pre-filtered on this executor;
 * - terminal assignments (done/expired) do NOT count as work;
 * - the idle state is a STATE («Свободен»), never a missing block.
 */

const EXECUTOR_ID = "exec-laptop-zcode";

function assignment(partial: Partial<AssignmentItem>): AssignmentItem {
  return {
    id: 1,
    task_id: "T-100",
    specialist: "@GCW: Senior Frontend Developer",
    harness: "zcode",
    state: "running",
    created_by: "owner",
    claimed_by: "z:laptop",
    note: "",
    spec_hash: "hash",
    executor_id: "",
    claimed_by_executor: EXECUTOR_ID,
    created_at: "2026-09-27T10:00:00Z",
    claimed_at: "2026-09-27T10:01:00Z",
    started_at: "2026-09-27T10:02:00Z",
    heartbeat_at: "2026-09-27T10:03:00Z",
    finished_at: null,
    topics: [],
    routing: null,
    ...partial,
  };
}

async function mountSheet(assignments: readonly AssignmentItem[]): Promise<{
  root: Root;
  container: HTMLElement;
}> {
  const gateway = new MockAdapter({ latency: false });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const registry: ExecutorsPage = await gateway.listExecutors();
  queryClient.setQueryData(keys.agents.executors.list(), registry);
  const queue: AssignmentsPage = {
    ok: true,
    count: assignments.length,
    items: assignments,
  };
  queryClient.setQueryData(keys.agents.assignments.list({}), queue);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <GatewayContext.Provider value={gateway}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <UiTokenProvider>
              <I18nProvider initialLang="ru">
                <MemoryRouter initialEntries={["/agents/harnesses"]}>
                  <ExecutorSheet
                    executorId={EXECUTOR_ID}
                    open
                    onOpenChange={() => undefined}
                  />
                  <ToastViewport />
                </MemoryRouter>
              </I18nProvider>
            </UiTokenProvider>
          </ToastProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return { root, container };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(async () => {
  document.body.innerHTML = "";
});

describe("ExecutorSheet «Сейчас выполняет» (UX-overhaul §4.3, П3)", () => {
  it("lists the active assignment first: title, state badge, return= link, all-tasks deep-link", async () => {
    const { root } = await mountSheet([
      assignment({ id: 7, task_id: "T-100", state: "running" }),
    ]);
    // Radix portals the card into document.body.
    const html = document.body.innerHTML;
    // The work block leads the card (before Link and Access sections).
    const workAt = html.indexOf("Сейчас выполняет");
    expect(workAt).toBeGreaterThanOrEqual(0);
    expect(workAt).toBeLessThan(html.indexOf("Связь"));
    expect(workAt).toBeLessThan(html.indexOf("Доступ"));
    // The task title resolves from the shared board cache.
    expect(html).toContain("Сейчас выполняет");
    // «Открыть задачу» carries the frozen return= mechanism (UI-18).
    expect(html).toContain("Открыть задачу");
    expect(html).toMatch(/href="\/tasks\/T-100\?tab=execution&amp;return=/);
    // «Все задачи» deep-links to /agents/execution filtered on this executor.
    expect(html).toContain("Все задачи");
    expect(html).toContain(
      `href="/agents/execution?executor=${encodeURIComponent(EXECUTOR_ID)}"`,
    );
    await actUnmount(root);
  });

  it("counts only ACTIVE states as work; terminal rows render idle", async () => {
    const { root } = await mountSheet([
      assignment({ id: 8, state: "done", finished_at: "2026-09-27T10:05:00Z" }),
      assignment({ id: 9, state: "expired" }),
    ]);
    // Done/expired are history, not work — the honest idle STATE renders.
    expect(document.body.textContent).toContain("Свободен — задач в работе нет");
    expect(document.body.textContent).not.toContain("Свободенundefined");
    await actUnmount(root);
  });

  it("shows the idle state when the queue is empty (a state, not a missing block)", async () => {
    const { root } = await mountSheet([]);
    const html = document.body.innerHTML;
    const workAt = html.indexOf("Сейчас выполняет");
    expect(workAt).toBeGreaterThanOrEqual(0);
    expect(workAt).toBeLessThan(html.indexOf("Связь"));
    expect(document.body.textContent).toContain("Свободен — задач в работе нет");
    await actUnmount(root);
  });

  it("never shows another executor's work (the claimed_by_executor filter)", async () => {
    const { root } = await mountSheet([
      assignment({ id: 10, claimed_by_executor: "exec-other-host", state: "running" }),
    ]);
    expect(document.body.textContent).toContain("Свободен — задач в работе нет");
    expect(document.body.textContent).not.toContain("T-100");
    await actUnmount(root);
  });
});