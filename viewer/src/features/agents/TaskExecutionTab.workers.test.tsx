import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TaskExecutionTab } from "./TaskExecutionTab";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import type { ActivityItem, AssignmentItem, BoardTask } from "@/gateway/boardTypes";

/**
 * UI-31 «Кто работал»: the attribution block of the «Исполнение» tab for
 * tasks WITHOUT assignments (the owner's TB-1 pain — the queue is empty but
 * somebody obviously worked the task). The attribution source is the
 * per-task activity feed (recon fact: /tasks/{id}/history carries NO actor;
 * /activity?task_id= carries the AUTH-2 actor grammar). renderToString,
 * same posture as TaskExecutionTab.test.tsx.
 */

/** One queued assignment row (the live-queue regression fixture). */
function assignment(overrides: Partial<AssignmentItem>): AssignmentItem {
  return {
    id: 1,
    task_id: "TB-10",
    specialist: "@GCW: Senior Frontend Developer",
    harness: "zcode",
    state: "queued",
    created_by: "owner",
    claimed_by: null,
    note: "",
    spec_hash: "deadbeef",
    executor_id: "",
    claimed_by_executor: "",
    created_at: "2026-09-19T08:50:00+00:00",
    claimed_at: null,
    started_at: null,
    heartbeat_at: null,
    finished_at: null,
    topics: [],
    routing: null,
    ...overrides,
  };
}

/**
 * Seed the client cache the way the wire would have filled it. `corpus`
 * prefetches the REAL mock activity feed through the adapter (the same
 * read path the panel uses); explicit `activity` rows bypass it.
 */
async function makeClient(options: {
  taskId: string;
  assignments: AssignmentItem[];
  corpus?: boolean;
  activity?: readonly Partial<ActivityItem>[];
}): Promise<{ client: QueryClient; gateway: MockAdapter }> {
  const gateway = new MockAdapter({ latency: false });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await client.prefetchQuery({
    queryKey: keys.tasks.board(),
    queryFn: () => gateway.board(),
  });
  await client.prefetchQuery({
    queryKey: keys.agents.executors.list(),
    queryFn: () => gateway.listExecutors(),
  });
  client.setQueryData(keys.agents.assignments.list({ task_id: options.taskId }), {
    ok: true,
    count: options.assignments.length,
    items: options.assignments,
  });
  if (options.corpus) {
    await client.prefetchQuery({
      queryKey: keys.tasks.activity.list({ task_id: options.taskId, limit: 200 }),
      queryFn: () => gateway.activity({ task_id: options.taskId, limit: 200 }),
    });
  }
  if (options.activity !== undefined) {
    const rows: ActivityItem[] = options.activity.map((row, index) => ({
      id: String(100 - index),
      ts: new Date(Date.now() - index * 60_000).toISOString(),
      kind: "task.moved",
      task_id: options.taskId,
      ...row,
    }));
    client.setQueryData(
      keys.tasks.activity.list({ task_id: options.taskId, limit: 200 }),
      { ok: true, has_more: false, items: rows },
    );
  }
  return { client, gateway };
}

function Providers({
  client,
  gateway,
  children,
}: {
  client: QueryClient;
  gateway: MockAdapter;
  children: React.ReactNode;
}) {
  return (
    <GatewayContext.Provider value={gateway}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <UiTokenProvider>
            <I18nProvider initialLang="en">
              <MemoryRouter>{children}</MemoryRouter>
            </I18nProvider>
          </UiTokenProvider>
        </ToastProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>
  );
}

async function renderTab(
  options: Parameters<typeof makeClient>[0] & { task?: BoardTask },
): Promise<string> {
  const { client, gateway } = await makeClient(options);
  const task = options.task ?? (await gateway.taskById(options.taskId));
  return renderToString(
    <Providers client={client} gateway={gateway}>
      <TaskExecutionTab
        task={task}
        reportsHref={`/tasks/${options.taskId}?tab=reports`}
        reportsCount={2}
      />
    </Providers>,
  );
}

describe("TaskExecutionTab × TaskWorkersPanel (UI-31)", () => {
  it("no assignments → «Кто работал»: unique actors from the activity feed, machine:<id> resolved through the executors registry", async () => {
    // TB-1 with an OVERRIDDEN empty queue: four attributed corpus events —
    // report + assignment.started by machine:exec-laptop-zcode, task.moved
    // by the ui leg, assignment.created by machine:board.
    const html = await renderTab({
      taskId: "TB-1",
      assignments: [],
      corpus: true,
    });
    expect(html).toContain("No assignments yet");
    expect(html).toContain("Who worked on this");
    // machine:exec-laptop-zcode → the registry NAME, never the raw id (the
    // wire string rides the title tooltip only).
    expect(html).toContain("zcode@laptop");
    expect(html).not.toContain(">machine:exec-laptop-zcode</span>");
    // The class-named actors keep their grammar labels (identity = label).
    expect(html).toContain("owner");
    expect(html).toContain("board");
    // Counts: the executor leg has 4 events, ui 2, the board 1.
    expect(html).toContain("events: 4");
    expect(html).toContain("events: 2");
    expect(html).toContain("events: 1");
    expect(html).toContain("last: ");
  });

  it("activity rows exist but carry no actor → the honest pre-1.35 attribution line", async () => {
    const html = await renderTab({
      taskId: "TB-1",
      assignments: [],
      activity: [
        { kind: "task.moved" },
        { kind: "assignment.started" },
      ],
    });
    expect(html).toContain("Who worked on this");
    expect(html).toContain(
      "No attribution: the audit log did not record who worked on tasks before version 1.35.",
    );
    // No contributor rows are fabricated from actor-less events.
    expect(html).not.toContain("zcode@laptop");
  });

  it("no activity rows at all → the honest never-executed line + reports jump", async () => {
    // TB-10: no assignments, no corpus activity — nothing to attribute.
    const html = await renderTab({ taskId: "TB-10", assignments: [], corpus: true });
    expect(html).toContain(
      "No audit events for this task — it never reached execution.",
    );
    // The declared agents + reports count jump render beside the empty.
    expect(html).toContain("Declared agents");
    expect(html).toContain('href="/tasks/TB-10?tab=reports"');
    expect(html).toContain("Task reports: 2");
  });

  it("live assignments keep the queue view — no workers block on a non-empty queue", async () => {
    const html = await renderTab({
      taskId: "TB-10",
      assignments: [assignment({})],
    });
    expect(html).toContain("queued");
    expect(html).not.toContain("Who worked on this");
    expect(html).not.toContain("Task reports: 2");
  });
});
