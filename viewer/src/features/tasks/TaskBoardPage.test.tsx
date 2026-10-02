import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TaskBoardPage } from "./TaskBoardPage";
import { MockAdapter } from "@/gateway/MockAdapter";
import { HttpAdapter } from "@/gateway/HttpAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import { DensityProvider } from "@/components/density-provider";

/**
 * Ф3 kanban board (QA pattern — pages on the mock board): the 7 WF-1 wire
 * columns render with counters, the project-group accordions disclose via
 * aria-expanded, the archcom badge appears from the sweep tag, the view
 * toggle links both projections, and the URL `q` filters + highlights card
 * titles. DOM-free renderToString per the project pattern (both the board
 * and the list render — but the board is one layout, no table).
 */

type Gateway = MockAdapter | HttpAdapter;

async function renderBoard(
  gateway: Gateway,
  path = "/tasks",
  seed: (client: QueryClient, gateway: Gateway) => Promise<void> = async () => {},
): Promise<string> {
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
                <MemoryRouter initialEntries={[path]}>
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

/** Seed the shared board projection exactly like the running app would. */
async function seedBoard(client: QueryClient, gateway: Gateway): Promise<void> {
  if (gateway instanceof MockAdapter) {
    await client.prefetchQuery({
      queryKey: keys.tasks.board(),
      queryFn: () => gateway.board(),
    });
  }
}

describe("TaskBoardPage (mock adapter — 7 WF-1 columns)", () => {
  it("renders the 7 wire columns with counters and the board aria label", async () => {
    const html = await renderBoard(
      new MockAdapter({ latency: false }),
      "/tasks",
      seedBoard,
    );
    expect(html).toContain("Task kanban board");
    // All 7 WF-1 lanes in wire order.
    for (const title of [
      "backlog",
      "validating",
      "open",
      "in progress",
      "blocked",
      "resolved",
      "done",
    ]) {
      expect(html).toContain(title);
    }
    // Column counters come from the wire counts (whole-board, never filtered).
    // (ME-013: TB-15 — the smoke's untrusted-mermaid fixture — joined
    // in-progress, so the lane carries 4 cards.)
    expect(html).toMatch(/backlog.*>1</s);
    expect(html).toMatch(/validating.*>2</s);
    expect(html).toMatch(/in progress.*>4</s);
  });

  it("renders project-group accordions inside columns with aria-expanded", async () => {
    const html = await renderBoard(
      new MockAdapter({ latency: false }),
      "/tasks",
      seedBoard,
    );
    // The in-progress column holds two project groups (vesma-eyes, mnemos).
    expect(html).toContain('aria-expanded="true"');
    // Card titles link to the task page (keyboard/SR path) carrying the
    // board URL as ?return= (UI-18 pair 1).
    expect(html).toMatch(/href="\/tasks\/TB-1\?return=/);
  });

  it("badges the archcom-flagged validating card (sweep tag)", async () => {
    const html = await renderBoard(
      new MockAdapter({ latency: false }),
      "/tasks",
      seedBoard,
    );
    // TB-14 carries task:stage:archcom-review — the badge + its tooltip.
    expect(html).toContain(">archcom<");
    expect(html).toContain("owner decision required");
  });

  it("carries the «Kanban | List» toggle in the domain header", async () => {
    const html = await renderBoard(
      new MockAdapter({ latency: false }),
      "/tasks",
      seedBoard,
    );
    expect(html).toContain('aria-label="Task view"');
    expect(html).toContain('href="/tasks"'); // kanban target
    expect(html).toContain('href="/tasks/list"');
  });

  it("carries the «Groups | Classic» board style toggle on the ACTIONS side, apart from the projection toggle (ME-072 A, default: groups)", async () => {
    const html = await renderBoard(
      new MockAdapter({ latency: false }),
      "/tasks",
      seedBoard,
    );
    // A stateful segmented group (aria-pressed), no navigation — both styles
    // share the route; with no localStorage the default "groups" is pressed.
    expect(html).toContain('aria-label="Board layout"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(">Groups</button>");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain(">Classic</button>");
    // ME-072 A: the two segmented controls sit at OPPOSITE header ends —
    // the projection toggle by the H1, the style toggle inside the actions
    // cluster (with «New task»), never adjacent (they read as one control).
    const view = html.indexOf('aria-label="Task view"');
    const actions = html.indexOf('data-testid="board-header-actions"');
    const style = html.indexOf('aria-label="Board layout"');
    expect(view).toBeGreaterThan(-1);
    expect(actions).toBeGreaterThan(view);
    expect(style).toBeGreaterThan(actions);
  });

  it("renders ONE column-header pattern — every counter is the framed outline badge (ME-072 A)", async () => {
    const html = await renderBoard(
      new MockAdapter({ latency: false }),
      "/tasks",
      seedBoard,
    );
    // The per-column colour chips (iris/error/success) made two header
    // looks (framed vs floating); the framed outline counter is the ONE
    // pattern now. Card-level workflow colours are untouched.
    const headers = html.match(/<header[^>]*>[\s\S]*?<\/header>/g) ?? [];
    expect(headers.length).toBeGreaterThanOrEqual(7);
    for (const header of headers) {
      // The exact outline-badge class pair («border-border-subtle» must not
      // satisfy this — it is the header hairline, not the badge frame).
      expect(header).toContain("border-border text-foreground-secondary");
      expect(header).not.toMatch(/bg-(iris|success|error|warning)-tint/);
    }
  });

  it("keeps the filters in the URL: ?q= filters cards and highlights titles", async () => {
    const html = await renderBoard(
      new MockAdapter({ latency: false }),
      "/tasks?q=ADR",
      seedBoard,
    );
    // Matching cards stay with a <mark> highlight inside the title…
    expect(html).toContain("<mark");
    expect(html).toContain('href="/tasks/TB-14?return=');
    // …and non-matching cards are filtered out of the board.
    expect(html).not.toContain('href="/tasks/TB-1"');
  });

  it("renders the filtered empty state when no card matches the URL q", async () => {
    const html = await renderBoard(
      new MockAdapter({ latency: false }),
      "/tasks?q=definitely-no-such-task",
      seedBoard,
    );
    expect(html).toContain("Nothing matches these filters");
  });

  it("renders the honest unsupported state on a mnemos gateway", async () => {
    const html = await renderBoard(new HttpAdapter("/api"));
    expect(html).toContain("The Tasks domain is unavailable in vesma mode");
    expect(html).not.toContain("Task kanban board");
  });
});
