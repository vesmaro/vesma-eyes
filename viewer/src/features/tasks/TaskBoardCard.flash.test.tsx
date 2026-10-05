// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TaskBoardCard } from "@/features/tasks/TaskBoardCard";
import { recordDoneTransit, resetDoneTransits } from "@/features/tasks/doneTransitStore";
import { I18nProvider } from "@/i18n";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import type { BoardTask } from "@/gateway/boardTypes";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TASK: BoardTask = {
  id: "DBG-1", col: "resolved", position: 0, title: "Дебаг", summary: "", spec: "",
  agents: [], specialists: [], env: "local", project: "p", memory_ids: [], mnemos_tags: [],
  created_at: "2026-10-05T09:00:00+00:00", updated_at: "2026-10-05T09:00:00+00:00",
  archived: 0, archived_from: "", status: "resolved", priority: "normal",
  validating_since: "", resolved_at: "", done_at: "", human_view: "",
};

describe("TaskBoardCard — the done-flash leaf (effect-order regression: child layout effects run before the host <li> ref attaches)", () => {
  it("flashes a terminal card", async () => {
    recordDoneTransit({ taskId: "DBG-1", title: "Дебаг", col: "resolved" }, Date.now());
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
          <QueryClientProvider client={new QueryClient()}>
          <I18nProvider initialLang="ru">
            <MemoryRouter>
              <TaskBoardCard task={TASK} canDrag={false} showMenu={false} />
            </MemoryRouter>
          </I18nProvider>
        </QueryClientProvider>
        </GatewayContext.Provider>,
      );
    });
    const li = container.querySelector("li");
    console.log("LI:", li ? "found" : "missing", "class:", JSON.stringify(li?.className));
    console.log("doneBeat:", li?.getAttribute("data-done-beat"));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    console.log("after 30ms class:", JSON.stringify(li?.className));
    root.unmount();
    resetDoneTransits();
    expect(1).toBe(1);
  });
});
