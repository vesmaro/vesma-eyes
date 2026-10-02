// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TaskBoardPage } from "./TaskBoardPage";
import { MockAdapter } from "@/gateway/MockAdapter";
import type { BoardSummary } from "@/gateway/boardTypes";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import { DensityProvider } from "@/components/density-provider";
import { BOARD_COLUMNS_STORAGE_KEY } from "./tasksViewPrefs";

/**
 * ME-077 column visibility on the kanban: the persisted mode project (all 7
 * vs compact 5), the folded-empty pre-validation lanes (the default in the
 * "all" mode), and the honest hidden-lanes note in the compact mode when
 * the hidden lanes hold live cards. SSR render per the board-page test
 * pattern; the persisted mode rides happy-dom localStorage.
 */

type Gateway = MockAdapter;

/** Mock projection with EMPTY pre-validation lanes (the mock surface has no
 * task delete; the projection filter is exactly what the page consumes). */
class EmptyPreValidationAdapter extends MockAdapter {
  override async board(): Promise<BoardSummary> {
    const summary = await super.board();
    return {
      ...summary,
      tasks: summary.tasks.filter(
        (task) => task.col !== "backlog" && task.col !== "validating",
      ),
      counts: { ...summary.counts, backlog: 0, validating: 0 },
    };
  }
}

async function renderBoard(
  seed: (client: QueryClient, gateway: Gateway) => Promise<void>,
): Promise<string> {
  const gateway = new MockAdapter({ latency: false });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await seed(queryClient, gateway);
  return renderToString(
    <GatewayContext.Provider value={gateway}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <UiTokenProvider>
            <I18nProvider initialLang="en">
              <DensityProvider initialDensity="comfortable">
                <MemoryRouter initialEntries={["/tasks"]}>
                  <TaskBoardPage />
                </MemoryRouter>
              </DensityProvider>
            </I18nProvider>
          </UiTokenProvider>
        </ToastProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>,
  );
}

async function seedDefault(
  client: QueryClient,
  gateway: Gateway,
): Promise<void> {
  await client.prefetchQuery({
    queryKey: keys.tasks.board(),
    queryFn: () => gateway.board(),
  });
}

/** Seed through an adapter whose pre-validation lanes are empty so the
 * "all" mode folds them. */
async function seedWithoutPreValidation(
  client: QueryClient,
  _gateway: Gateway,
): Promise<void> {
  await client.prefetchQuery({
    queryKey: keys.tasks.board(),
    queryFn: () => new EmptyPreValidationAdapter().board(),
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("ME-077 column visibility", () => {
  it("default mode 'all': 7 lanes, empty pre-validation lanes fold", async () => {
    const html = await renderBoard(seedWithoutPreValidation);
    // the 5 workflow lanes render expanded (hint line present)
    expect(html).toContain("Column “Queued”");
    expect(html).toContain("moves: executor — take into work");
    // empty backlog/validating render as folded strips, still labelled
    expect(html).toContain("Expand the empty “Backlog” column");
    expect(html).toContain("Expand the empty “Validating” column");
    expect(html).toMatch(/aria-label="Column “Backlog”"[^>]*w-11/s);
  });

  it("a non-empty lane never folds, even in its default-collapsed set", async () => {
    const html = await renderBoard(seedDefault);
    expect(html).not.toContain("Expand the empty");
    expect(html).toContain("Column “Backlog”");
  });

  it("compact mode: 5 lanes + the honest hidden-lanes note", async () => {
    localStorage.setItem(BOARD_COLUMNS_STORAGE_KEY, "compact");
    const html = await renderBoard(seedDefault);
    expect(html).toContain("Column “Queued”");
    expect(html).not.toContain("Column “Backlog”");
    // hidden lanes with live cards are named with their counts
    expect(html).toMatch(/Hidden: Backlog \(1\), Validating \(2\)/);
  });

  it("compact mode with empty hidden lanes: no note (nothing to disclose)", async () => {
    localStorage.setItem(BOARD_COLUMNS_STORAGE_KEY, "compact");
    const html = await renderBoard(seedWithoutPreValidation);
    expect(html).not.toContain("Hidden:");
  });
});
