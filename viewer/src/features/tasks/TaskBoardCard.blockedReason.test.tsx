// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TaskBoardCard } from "@/features/tasks/TaskBoardCard";
import { I18nProvider } from "@/i18n";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { MOCK_ASSIGNMENTS } from "@/gateway/boardFixtures";
import type { AssignmentsPage, BoardTask } from "@/gateway/boardTypes";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * U3 blocked-reason edge (15-WOW §3.4 п.4): a blocked-lane card carries a
 * VISIBLE human reason derived from the task's own data — the failed
 * assignment's note when the corpus has one (RB-2), the dictionary line
 * otherwise — and the reason never renders on a card outside the lane.
 */

const BLOCKED: BoardTask = {
  id: "RB-2",
  col: "blocked",
  position: 0,
  title: "Защитить publish-токены",
  summary: "",
  spec: "",
  agents: ["zcode"],
  specialists: [],
  env: "laptop",
  project: "vesma",
  memory_ids: [],
  mnemos_tags: [],
  created_at: "2026-09-11T13:00:00+00:00",
  updated_at: "2026-09-16T17:40:00+00:00",
  archived: 0,
  archived_from: "",
  status: "blocked",
  priority: "high",
  validating_since: "",
  resolved_at: "",
  done_at: "",
  human_view: "",
};

const UNASSIGNED: BoardTask = {
  ...BLOCKED,
  id: "TB-902",
  col: "blocked",
  status: "blocked",
  title: "Без исполнителя",
  agents: [],
};

function mount(
  task: BoardTask,
  assignments: AssignmentsPage | null,
): { container: HTMLDivElement; root: Root } {
  const client = new QueryClient();
  if (assignments) {
    client.setQueryData(keys.agents.assignments.list({}), assignments);
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
        <QueryClientProvider client={client}>
          <I18nProvider initialLang="ru">
            <MemoryRouter>
              <TaskBoardCard task={task} canDrag={false} showMenu={false} column="blocked" />
            </MemoryRouter>
          </I18nProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return { container, root };
}

describe("TaskBoardCard — the U3 blocked reason edge", () => {
  it("shows the failed assignment's note as the visible reason (RB-2's corpus truth)", () => {
    const page: AssignmentsPage = {
      ok: true,
      count: MOCK_ASSIGNMENTS.length,
      items: MOCK_ASSIGNMENTS,
    };
    const { container, root } = mount(BLOCKED, page);
    const line = container.querySelector("p.text-error");
    // The note IS the visible line (the server's own words need no tooltip);
    // the ⟂ marker rides along (1.4.1 — the edge is never colour-alone).
    expect(line?.textContent).toContain(
      "причина из fail-отчёта: publish-токен без org → 403",
    );
    expect(line?.textContent).toContain("⟂");
    root.unmount();
    container.remove();
  });

  it("falls back to the dictionary line when the data names no reason", () => {
    const { container, root } = mount(UNASSIGNED, null);
    const line = container.querySelector("p.text-error");
    expect(line?.textContent).toContain("исполнитель не назначен");
    root.unmount();
    container.remove();
  });

  it("renders NO reason line outside the blocked lane", () => {
    const { container, root } = mount({ ...BLOCKED, col: "open", status: "open" }, null);
    expect(container.querySelector("p.text-error")).toBeNull();
    root.unmount();
    container.remove();
  });
});
