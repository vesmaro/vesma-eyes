// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { buildRoutes } from "@/app/routes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import { DensityProvider } from "@/components/density-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { HotkeysProvider } from "@/layout/Hotkeys";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { BOARD_COLUMNS_STORAGE_KEY } from "./tasksViewPrefs";
import {
  recordDoneTransit,
  resetDoneTransits,
} from "./doneTransitStore";
import type { BoardSummary, BoardTask } from "@/gateway/boardTypes";
import type * as useTasksModule from "@/features/tasks/useTasks";

// Same test-env seam as TaskBoard.routes (see the note there): the badge
// count subscription cycles under happy-dom's synchronous act().
vi.mock("@/features/tasks/useTasks", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof useTasksModule;
  return { ...actual, useReportCounts: () => ({}) };
});

/**
 * ME-071 W3 slice 1 (15-WOW §3.4 «Задачи — живой пульт», §8.5): the
 * «Ждут владельца» facade chip (?waiting=1), the done-tempo inside the
 * resolved column's framed counter, the task.done gold flash + toast and
 * the honest blocked edge. Real route table, real DOM (createRoot + act —
 * the effects must run for the transit store to surface).
 */

const RESOLVED_TASK: BoardTask = {
  id: "TB-W3",
  col: "resolved",
  position: 90,
  title: "W3: спектакль task.done",
  summary: "",
  spec: "",
  agents: [],
  specialists: [],
  env: "local",
  project: "vesmaro",
  memory_ids: [],
  mnemos_tags: [],
  created_at: "2026-10-05T09:00:00+00:00",
  updated_at: "2026-10-05T09:00:00+00:00",
  archived: 0,
  archived_from: "",
  status: "resolved",
  priority: "normal",
  validating_since: "",
  resolved_at: "2026-10-05T10:00:00+00:00",
  done_at: "",
  human_view: "",
};

const BLOCKED_TASK: BoardTask = {
  ...RESOLVED_TASK,
  id: "TB-BLK",
  col: "blocked",
  status: "blocked",
  title: "W3: блокировка честная",
  resolved_at: "",
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let queryClient: QueryClient | null = null;

async function renderAt(
  path: string,
  extraTasks: BoardTask[] = [],
): Promise<void> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  const gateway = new MockAdapter({ latency: false });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await queryClient.prefetchQuery({
    queryKey: keys.tasks.board(),
    queryFn: async () => {
      const summary: BoardSummary = await gateway.board();
      return {
        ...summary,
        tasks: [...summary.tasks, ...extraTasks],
        counts: {
          ...summary.counts,
          resolved: (summary.counts["resolved"] ?? 0) + extraTasks.filter((t) => t.col === "resolved").length,
          blocked: (summary.counts["blocked"] ?? 0) + extraTasks.filter((t) => t.col === "blocked").length,
        },
      };
    },
  });
  const router = createMemoryRouter(buildRoutes(), { initialEntries: [path] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <GatewayContext.Provider value={gateway}>
        <QueryClientProvider client={queryClient!}>
          <AuthProvider adapterMode="board" endpoint="test">
            <ThemeProvider>
              <I18nProvider initialLang="en">
                <DensityProvider initialDensity="comfortable">
                  <HotkeysProvider>
                    <ToastProvider>
                      <UiTokenProvider>
                        <RouterProvider router={router} />
                      </UiTokenProvider>
                    </ToastProvider>
                  </HotkeysProvider>
                </DensityProvider>
              </I18nProvider>
            </ThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitFor: condition not met");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

function cardOf(title: string): HTMLLIElement {
  const marker = Array.from(container!.querySelectorAll("li h3")).find(
    (h) => h.textContent?.includes(title),
  );
  if (!marker) throw new Error(`card not found: ${title}`);
  return marker.closest("li") as HTMLLIElement;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetDoneTransits();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  await queryClient?.cancelQueries();
  queryClient?.clear();
  root = null;
  container = null;
  queryClient = null;
});

// The mock surface's validating fixtures (the decision lane the facade counts).
const VALIDATING_TITLE = "Валидация фазы Ф2: чтение домена «Задачи» без рефетчей";
const LIVE_TITLE_SNIPPET = "Достроить борд v0.3";

describe("ME-071 W3: «Ждут владельца» facade chip", () => {
  it("renders the golden chip with the whole-board validating count", async () => {
    // The expected count comes from the SAME mock projection the page reads
    // (never a hardcoded guess): whole-board validating rows.
    const mockBoard = await new MockAdapter({ latency: false }).board();
    const expected = mockBoard.tasks.filter((task) => task.col === "validating").length;
    expect(expected).toBeGreaterThan(0);
    await renderAt("/tasks");
    await waitFor(() => container!.querySelector('a[href^="/tasks/TB-1?"]') !== null);
    const chip = Array.from(container!.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Waiting for the owner:"),
    );
    expect(chip).toBeDefined();
    expect(chip!.textContent).toContain(`Waiting for the owner: ${expected}`);
    expect(chip!.getAttribute("aria-pressed")).toBe("false");
  });

  it("click toggles ?waiting=1: the decision lane is the only card source", async () => {
    await renderAt("/tasks");
    await waitFor(() => container!.querySelector('a[href^="/tasks/TB-1?"]') !== null);
    const chip = Array.from(container!.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Waiting for the owner:"),
    )!;
    await act(async () => {
      chip.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await waitFor(() => chip.getAttribute("aria-pressed") === "true");
    // A validating fixture stays; a live-lane fixture leaves the board.
    expect(container!.textContent?.includes(VALIDATING_TITLE)).toBe(true);
    expect(container!.textContent?.includes(LIVE_TITLE_SNIPPET)).toBe(false);
  });

  it("surfaces the decision lane even in compact mode (a filter never hides its results)", async () => {
    localStorage.setItem(BOARD_COLUMNS_STORAGE_KEY, "compact");
    await renderAt("/tasks?waiting=1");
    await waitFor(
      () =>
        container!.textContent?.includes("Validating") === true &&
        container!.querySelector('a[href^="/tasks/"]') !== null,
    );
    expect(container!.textContent).toContain("Validating");
  });
});

describe("ME-071 W3: done-tempo + flash + blocked edge", () => {
  it("the resolved column header carries the tempo inside the framed counter", async () => {
    const now = Date.now();
    recordDoneTransit({ taskId: "TB-1", title: "a", col: "resolved" }, now);
    recordDoneTransit({ taskId: "TB-3", title: "b", col: "done" }, now + 10);
    await renderAt("/tasks");
    await waitFor(() => container!.querySelector('a[href^="/tasks/TB-1?"]') !== null);
    const resolvedHeader = Array.from(
      container!.querySelectorAll("section > header"),
    ).find((h) => h.textContent?.includes("Awaiting review"));
    expect(resolvedHeader).toBeDefined();
    expect(resolvedHeader!.textContent).toContain("·2/h");
    expect(resolvedHeader!.textContent).not.toContain("·3/h");
  });

  it("a fresh terminal transit flashes the card and toasts (the live region)", async () => {
    recordDoneTransit(
      { taskId: "TB-W3", title: RESOLVED_TASK.title, col: "resolved" },
      Date.now(),
    );
    await renderAt("/tasks", [RESOLVED_TASK]);
    await waitFor(() => container!.textContent?.includes(RESOLVED_TASK.title) === true);
    const card = cardOf(RESOLVED_TASK.title);
    expect(card.className).toContain("task-done-flash");
    // WCAG 4.1.3: the toast viewport is the shared polite live region.
    await waitFor(
      () => container!.textContent?.includes("resolved") === true &&
        container!.textContent?.includes("Task") === true,
    );
    expect(container!.textContent).toContain("Task “W3: спектакль task.done” resolved");
  });

  it("no records → no flash, no tempo, no toast (a reload replays nothing)", async () => {
    await renderAt("/tasks", [RESOLVED_TASK]);
    await waitFor(() => container!.textContent?.includes(RESOLVED_TASK.title) === true);
    expect(container!.querySelector(".task-done-flash")).toBeNull();
    const resolvedHeader = Array.from(
      container!.querySelectorAll("section > header"),
    ).find((h) => h.textContent?.includes("Awaiting review"));
    expect(resolvedHeader!.textContent).not.toContain("/h");
  });

  it("the blocked lane carries the reason edge + the VISIBLE derived reason (U3)", async () => {
    await renderAt("/tasks", [BLOCKED_TASK]);
    await waitFor(() => container!.textContent?.includes(BLOCKED_TASK.title) === true);
    const card = cardOf(BLOCKED_TASK.title);
    expect(card.className).toContain("before:bg-error/80");
    // U3 supersedes the W3 sr-only generic: the reason is now a VISIBLE
    // human line derived from the task's own data (no agents → no executor
    // assigned), ⟂-marked so the edge is never colour-alone (1.4.1).
    const reason = card.querySelector("p.text-error");
    expect(reason?.textContent).toContain("⟂");
    expect(reason?.textContent).toContain("no executor assigned");
  });

  it("the waiting facade gives validating cards the golden attention edge", async () => {
    await renderAt("/tasks?waiting=1");
    await waitFor(
      () => container!.textContent?.includes(VALIDATING_TITLE) === true,
    );
    const card = cardOf(VALIDATING_TITLE);
    expect(card.className).toContain("ring-confidence");
  });
});

describe("ME-071 W3 review fix: the done toast announces a transit once per session", () => {
  // The live-proven repro: a done transit → click into /tasks/:id → back —
  // the board remounts and the OLD toast replayed (the announce bookkeeping
  // lived in a useRef, which resets on remount; the store keeps items for
  // 60 minutes and useLatestDoneTransit is age-blind). The fix announces
  // each transit at most once per page session (module-level key set).
  const REPLAY_TASK: BoardTask = {
    ...RESOLVED_TASK,
    id: "TB-REPLAY",
    title: "W3: тост не переигрывается",
  };
  const RESOLVED_TOAST = `Task “${REPLAY_TASK.title}” resolved`;
  const DONE_TOAST = `Task “${REPLAY_TASK.title}” done`;

  it("transit → toast; remount with the SAME latest transit → no toast; a NEW transit → toast again", async () => {
    recordDoneTransit(
      { taskId: REPLAY_TASK.id, title: REPLAY_TASK.title, col: "resolved" },
      Date.now(),
    );
    await renderAt("/tasks", [REPLAY_TASK]);
    await waitFor(() => container!.textContent?.includes(RESOLVED_TOAST) === true);

    // Navigate away: the board unmounts, the store keeps the transit.
    await act(async () => {
      root?.unmount();
    });
    container?.remove();

    // Back on /tasks: the SAME latest transit is already announced — the
    // remount must NOT replay it (the ghost-toast repro, now impossible).
    await renderAt("/tasks", [REPLAY_TASK]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(container!.textContent).not.toContain(RESOLVED_TOAST);

    // A NEW transit (fresh key) announces again.
    await act(async () => {
      recordDoneTransit(
        { taskId: REPLAY_TASK.id, title: REPLAY_TASK.title, col: "done" },
        Date.now() + 10,
      );
    });
    await waitFor(() => container!.textContent?.includes(DONE_TOAST) === true);
  });
});
