import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TaskSessionsPanel } from "./TaskSessionsPanel";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import { ApiError } from "@/lib/errors";
import type { BoardTask } from "@/gateway/boardTypes";

/**
 * ME-063 «Специалисты и сессии» (agents-ui-spec §6.2): the agent-reported
 * child level of the «Исполнение» tab. renderToString, the TaskExecutionTab
 * workers-test posture — the query cache is seeded the way the wire would
 * have filled it (the mock's own corpus for the rows case).
 */

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

/** A gateway that has the agents reads but NO task-sessions read — the
 * panel's `!capable` rung (a disabled query is pending forever; the honest
 * unavailable plate must replace the skeleton there). */
function withoutTaskSessions(gateway: MockAdapter): MockAdapter {
  const stripped = gateway as unknown as Record<string, unknown>;
  stripped.listTaskSessions = undefined;
  return gateway;
}

async function makeClient(): Promise<{ client: QueryClient; gateway: MockAdapter }> {
  const gateway = new MockAdapter({ latency: false });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, gateway };
}

async function taskOf(gateway: MockAdapter, taskId: string): Promise<BoardTask> {
  const task = await gateway.taskById(taskId);
  return task;
}

async function render(
  client: QueryClient,
  gateway: MockAdapter,
  task: BoardTask,
): Promise<string> {
  return renderToString(
    <Providers client={client} gateway={gateway}>
      <TaskSessionsPanel task={task} />
    </Providers>,
  );
}

describe("TaskSessionsPanel (ME-063)", () => {
  it("facts exist → rows: liveness word, specialist/harness/counter/duration, executor, deep-link", async () => {
    const { client, gateway } = await makeClient();
    const task = await taskOf(gateway, "TB-11");
    // Seed through the REAL mock read path (the corpus carries one finished
    // + one LIVE child for the running TB-11 attempt).
    await client.prefetchQuery({
      queryKey: keys.tasks.sessions("TB-11"),
      queryFn: () => gateway.listTaskSessions("TB-11"),
    });

    const html = await render(client, gateway, task);

    // The finished corpus child: role, harness, counter, duration (16 min
    // → mono 16:00), the executor registry name.
    expect(html).toContain("Specialists and sessions");
    expect(html).toContain("@GCW: Researcher");
    expect(html).toContain(">zcode</span>");
    expect(html).toContain("tool calls: 34");
    expect(html).toContain("16:00");
    expect(html).toContain("finished");
    expect(html).toContain("reported by zcode@laptop");
    // The LIVE child: no ended_at → the live verdict + the native-id label
    // fallback (specialist is best-effort empty in the corpus) + NO fake
    // 0:00 duration (honest absence).
    expect(html).toContain("running");
    expect(html).toContain("sess_c3f9e120");
    expect(html).not.toContain("0:00");
    // The deep-link rides the frozen glue id as one path segment.
    expect(html).toContain('href="/kora/exec-laptop-zcode%3Asess_4d81aa07"');
    expect(html).toContain('href="/kora/exec-laptop-zcode%3Asess_c3f9e120"');
    expect(html).toContain("Open transcript");
  });

  it("count 0 → the §5 honest-empty plaque, no skeleton and no fabricated rows", async () => {
    const { client, gateway } = await makeClient();
    const task = await taskOf(gateway, "TB-1");
    await client.prefetchQuery({
      queryKey: keys.tasks.sessions("TB-1"),
      queryFn: () => gateway.listTaskSessions("TB-1"),
    });

    const html = await render(client, gateway, task);

    expect(html).toContain("The agent has not reported any sessions yet");
    // Honest absence, not a breakage — the reason line rides along.
    expect(html).toContain("an honest absence, not a breakage");
    expect(html).not.toContain("Open transcript");
  });

  it("unresolved query → the bounded loading state (role=status), never an eternal answer", async () => {
    const { client, gateway } = await makeClient();
    const task = await taskOf(gateway, "TB-11");
    // NOT seeded: the synchronous render sees the pending query — the
    // honest loading state, which the wire resolves (unlike a disabled one).
    const html = await render(client, gateway, task);
    expect(html).toContain('aria-label="Loading specialist sessions"');
    expect(html).not.toContain("The agent has not reported");
  });

  it("failed read → the error plate with the server's own verdict and Retry", async () => {
    const { client, gateway } = await makeClient();
    const task = await taskOf(gateway, "TB-11");
    // The TaskDetailPage error-state posture: build the cache entry, set a
    // real error status, freeze remount retries so the sync render sees it.
    const query = client.getQueryCache().build(client, {
      queryKey: keys.tasks.sessions("TB-11"),
      queryFn: () => gateway.listTaskSessions("TB-11"),
    });
    query.setState({
      status: "error",
      fetchStatus: "idle",
      error: new ApiError(403, "sessions are owner-only (ui-class)"),
    });
    client.setQueryDefaults(keys.tasks.sessions("TB-11"), {
      retryOnMount: false,
      retry: false,
    });

    const html = await render(client, gateway, task);

    expect(html).toContain("Failed to load sessions");
    expect(html).toContain("Retry");
    // The raw wire verdict travels under the collapsed disclosure, never
    // open in the markup (UX-overhaul §7.2 П4).
    expect(html).toContain("Technical details");
    expect(html).not.toContain("owner-only");
  });

  it("gateway without the sessions read → the honest unavailable plate (no skeleton)", async () => {
    const { client, gateway } = await makeClient();
    const task = await taskOf(gateway, "TB-11");
    const stripped = withoutTaskSessions(gateway);

    const html = await render(client, stripped, task);

    expect(html).toContain("Sessions unavailable in this mode");
    // A disabled query is pending FOREVER — the loading skeleton must not
    // render (the empty plate's own role="status" is a different element).
    expect(html).not.toContain('aria-label="Loading specialist sessions"');
  });
});
