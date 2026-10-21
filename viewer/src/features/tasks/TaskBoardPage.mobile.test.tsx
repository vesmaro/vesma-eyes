// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TaskBoardPage } from "@/features/tasks/TaskBoardPage";
import { BOARD_DESKTOP_QUERY } from "@/features/tasks/boardViewport";
import { BoardAdapter } from "@/gateway/BoardAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import { DensityProvider } from "@/components/density-provider";
import { BOARD_COLUMNS_STORAGE_KEY } from "@/features/tasks/tasksViewPrefs";
import type { BoardTask } from "@/gateway/boardTypes";
import type * as useTasksModule from "@/features/tasks/useTasks";

/**
 * W-C (user-panel verdict D5, P0): the below-md board renders the
 * ONE-lane-at-a-time mobile view — a chip rail of all visible lanes with
 * their wire counts, exactly one mounted column, the waiting facade
 * selecting the decision lane, and the «Новая задача» creation entry. The
 * desktop stub proves the horizontal row (all lanes) is untouched.
 *
 * The viewport seam is the Sidebar-contract useSyncExternalStore hook; the
 * SSR/happy-dom snapshot is desktop, so the mobile branch is driven by an
 * explicit matchMedia stub (the real browser behaviour is pinned by the
 * Playwright frames of the visual acceptance loop).
 */

// Test-env seam (the cardMenu-suite pattern): useReportCounts re-renders on
// every cache event and cycles against react-query's notifyManager under
// happy-dom's synchronous act().
vi.mock("@/features/tasks/useTasks", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof useTasksModule;
  return { ...actual, useReportCounts: () => ({}) };
});

const CORPUS: {
  columns: string[];
  tasks: BoardTask[];
  counts: Record<string, number>;
} = {
  columns: [
    "backlog",
    "validating",
    "open",
    "in-progress",
    "blocked",
    "resolved",
    "done",
  ],
  tasks: [
    makeTask("B-1", "backlog", "Backlog task"),
    makeTask("O-1", "open", "Open task"),
  ],
  counts: {
    backlog: 1,
    validating: 0,
    open: 1,
    "in-progress": 0,
    blocked: 0,
    resolved: 0,
    done: 0,
  },
};

function makeTask(id: string, col: string, title: string): BoardTask {
  return {
    id,
    col,
    position: 0,
    title,
    summary: "",
    spec: "",
    agents: [],
    specialists: [],
    env: "local",
    project: "repro",
    memory_ids: [],
    mnemos_tags: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived: 0,
    status: "open",
    priority: "normal",
    archived_from: "",
    validating_since: "",
    resolved_at: "",
    done_at: "",
    human_view: "",
  };
}

function stubMatchMedia(desktop: boolean) {
  return vi.spyOn(window, "matchMedia").mockImplementation(((query: string) => ({
    matches: desktop ? query === BOARD_DESKTOP_QUERY : false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  })) as unknown as typeof window.matchMedia);
}

/** Wire stub: board reads answer the CORPUS; mutations stay pending. */
function makeFetchStub(): typeof fetch {
  return ((input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/move") || url.includes("/archive")) {
      return new Promise<Response>(() => {});
    }
    return Promise.resolve(
      new Response(JSON.stringify(CORPUS), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let queryClient: QueryClient | null = null;
let matchMediaMock: ReturnType<typeof stubMatchMedia> | null = null;

async function mountBoard(route = "/tasks"): Promise<void> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  const gateway = new BoardAdapter({ fetchImpl: makeFetchStub(), baseUrl: "/api" });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await queryClient.prefetchQuery({
    queryKey: keys.tasks.board(),
    queryFn: () => gateway.board(),
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <GatewayContext.Provider value={gateway}>
        <QueryClientProvider client={queryClient!}>
          <ToastProvider>
            <UiTokenProvider>
              <I18nProvider initialLang="ru">
                <DensityProvider initialDensity="comfortable">
                  <MemoryRouter initialEntries={[route]}>
                    <TaskBoardPage />
                  </MemoryRouter>
                </DensityProvider>
              </I18nProvider>
            </UiTokenProvider>
          </ToastProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
}

function chipRail(): HTMLElement {
  const rail = container!.querySelector('[aria-label="Колонки доски"]');
  expect(rail).toBeDefined();
  return rail as HTMLElement;
}

function chipButtons(): HTMLButtonElement[] {
  return [...chipRail().querySelectorAll<HTMLButtonElement>("button")];
}

function mountedColumns(): string[] {
  return [...container!.querySelectorAll<HTMLElement>("section[data-column]")].map(
    (section) => section.dataset.column ?? "",
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  queryClient = null;
  matchMediaMock?.mockRestore();
  matchMediaMock = null;
});

describe("TaskBoardPage — the mobile (below-md) board", () => {
  it("renders ONE lane plus the chip rail of all visible lanes with wire counts", async () => {
    matchMediaMock = stubMatchMedia(false);
    await mountBoard();

    // The default column mode is "all 7" — the rail carries every lane.
    const chips = chipButtons();
    expect(chips).toHaveLength(7);
    // Wire-semantics counts ride the chips (the same rule as the headers).
    expect(chips[0].textContent).toContain("Бэклог");
    expect(chips[0].textContent).toContain("1");
    expect(chips[2].textContent).toContain("В очереди");
    expect(chips[2].textContent).toContain("1");
    // The pressed state marks the active lane (the first visible one).
    expect(chips[0].getAttribute("aria-pressed")).toBe("true");
    expect(chips[2].getAttribute("aria-pressed")).toBe("false");
    // Exactly one column section is mounted at a time.
    expect(mountedColumns()).toEqual(["backlog"]);
  });

  it("switches the mounted lane from a chip press (one tap = any column)", async () => {
    matchMediaMock = stubMatchMedia(false);
    await mountBoard();

    const openChip = chipButtons()[2];
    await act(async () => {
      openChip.click();
    });
    expect(mountedColumns()).toEqual(["open"]);
    expect(chipButtons()[2].getAttribute("aria-pressed")).toBe("true");
    expect(chipButtons()[0].getAttribute("aria-pressed")).toBe("false");
  });

  it("the compact column mode folds the rail to the 5 workflow lanes", async () => {
    localStorage.setItem(BOARD_COLUMNS_STORAGE_KEY, "compact");
    matchMediaMock = stubMatchMedia(false);
    await mountBoard();

    expect(chipButtons()).toHaveLength(5);
    // backlog/validating are the folded pre-validation lanes in compact.
    expect(chipButtons()[0].textContent).toContain("В очереди");
  });

  it("the waiting facade deep link lands on the validating lane", async () => {
    CORPUS.tasks.push(makeTask("V-1", "validating", "Validating task"));
    CORPUS.counts.validating = 1;
    try {
      matchMediaMock = stubMatchMedia(false);
      // Cold deep link: the facade's initial state lands on the decision
      // lane — below md there is no horizontal row to scroll into view, so
      // the view JUMPS instead.
      await mountBoard("/tasks?waiting=1");
      expect(mountedColumns()).toEqual(["validating"]);
    } finally {
      CORPUS.tasks.pop();
      CORPUS.counts.validating = 0;
    }
  });

  it("pressing the facade chip jumps the lane to validating (one gesture)", async () => {
    CORPUS.tasks.push(makeTask("V-1", "validating", "Validating task"));
    CORPUS.counts.validating = 1;
    try {
      matchMediaMock = stubMatchMedia(false);
      await mountBoard();
      expect(mountedColumns()).toEqual(["backlog"]);
      const facadeChip = container!.querySelector<HTMLButtonElement>(
        'button[aria-pressed="false"][title]',
      );
      expect(facadeChip?.textContent).toContain("Ждут владельца");
      await act(async () => {
        facadeChip!.click();
      });
      expect(mountedColumns()).toEqual(["validating"]);
    } finally {
      CORPUS.tasks.pop();
      CORPUS.counts.validating = 0;
    }
  });

  it("the creation entry names the action below md («Новая задача»)", async () => {
    matchMediaMock = stubMatchMedia(false);
    await mountBoard();

    const actions = container!.querySelector<HTMLElement>(
      '[data-testid="board-header-actions"]',
    );
    expect(actions).toBeDefined();
    const createLabel = actions!.querySelector<HTMLElement>(".md\\:hidden");
    expect(createLabel?.textContent).toBe("Новая задача");
    // The desktop label span is present for the md+ branch of the same
    // button — one control, two breakpoint labels.
    expect(actions!.querySelector<HTMLElement>(".max-md\\:hidden")?.textContent).toBe(
      "Задача",
    );
  });

  it("the card menu popup is viewport-fixed below md (reachable inside the scrolled lane)", async () => {
    matchMediaMock = stubMatchMedia(false);
    await mountBoard();

    const card = container!.querySelector<HTMLLIElement>("li[data-task-id]");
    expect(card).toBeDefined();
    const trigger = card!.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="menu"]',
    );
    expect(trigger).toBeDefined();
    // The ⋯ trigger is NOT hover-revealed below md (an invisible move
    // entry point was the panel's «перенос недостижим» finding).
    expect(trigger!.className).toContain("max-md:opacity-100");
    await act(async () => {
      trigger!.click();
    });
    // The fixed popup PORTALS to document.body (the card's
    // content-visibility paint containment would clip it otherwise).
    const menu = document.body.querySelector<HTMLElement>('[role="menu"]');
    expect(menu).toBeDefined();
    // Fixed + clamped into the viewport, whatever the lane's scroll state
    // (the fixed placement rides the placement class; the clamp writes the
    // inline left/top).
    expect(menu!.className).toContain("fixed");
    expect(menu!.style.left).not.toBe("");
    expect(menu!.style.top).not.toBe("");
    expect(parseFloat(menu!.style.left)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(menu!.style.top)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(menu!.style.top)).toBeLessThan(window.innerHeight);
    // The canonical move flow is present: «Переместить…» opens the column
    // submenu (tap ⋯ → tap Переместить… → tap column = 3 taps).
    const moveItem = [...menu!.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent === "Переместить…",
    );
    expect(moveItem).toBeDefined();
    await act(async () => {
      (moveItem as HTMLElement).click();
    });
    const items = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ].map((item) => item.textContent);
    expect(items).toContain("В работе");
    // The current lane is disabled in the move list.
    expect(
      document.body.querySelector<HTMLButtonElement>('[role="menuitem"][disabled]')
        ?.textContent,
    ).toBe("Бэклог");
  });
});

describe("TaskBoardPage — the desktop (md+) board stays the full row", () => {
  it("renders all wire columns and no mobile chip rail", async () => {
    matchMediaMock = stubMatchMedia(true);
    await mountBoard();

    expect(container!.querySelector('[aria-label="Колонки доски"]')).toBeNull();
    expect(mountedColumns()).toEqual([
      "backlog",
      "validating",
      "open",
      "in-progress",
      "blocked",
      "resolved",
      "done",
    ]);
    // The compact desktop label stays «Задача» — the mobile rename must
    // not leak above md.
    const actions = container!.querySelector<HTMLElement>(
      '[data-testid="board-header-actions"]',
    );
    expect(actions!.querySelector<HTMLElement>(".max-md\\:hidden")?.textContent).toBe(
      "Задача",
    );
  });
});
