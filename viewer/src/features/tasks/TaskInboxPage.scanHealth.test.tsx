import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TaskInboxPage } from "./TaskInboxPage";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import type { TaskInbox } from "@/gateway/boardTypes";

/**
 * 2026-10-27 honesty banner (prod: 58 rows frozen stale for days while the
 * scan was healthy-but-empty — «vanished» explained nothing). When stale
 * rows exist AND the last scan's per-source verdict explains them (a source
 * answered empty or is unreachable), the page renders the ScanHealthBanner
 * naming every source with its found count / error.
 */

class StaleSourcesAdapter extends MockAdapter {
  constructor(private readonly scan: NonNullable<TaskInbox["scan"]>) {
    super({ latency: false });
  }

  override async inbox(): Promise<TaskInbox> {
    const base = await super.inbox();
    // Every fixture row becomes stale (the prod shape: nothing comes back).
    const items = base.items.map((item) => ({ ...item, stale: true }));
    return { ...base, items, count: items.length, scan: this.scan };
  }
}

async function renderInbox(gateway: MockAdapter): Promise<string> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await queryClient.prefetchQuery({
    queryKey: keys.tasks.inbox({ include_adopted: false }),
    queryFn: () => gateway.inbox({ include_adopted: false }),
  });
  return renderToString(
    <GatewayContext.Provider value={gateway}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <UiTokenProvider>
            <I18nProvider initialLang="en">
              <MemoryRouter initialEntries={["/tasks/inbox"]}>
                <TaskInboxPage />
              </MemoryRouter>
            </I18nProvider>
          </UiTokenProvider>
        </ToastProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>,
  );
}

const EMPTY_SOURCES_SCAN: NonNullable<TaskInbox["scan"]> = {
  at: "2026-10-27T16:53:29+00:00",
  scanned_servers: 2,
  found: 0,
  new: 0,
  sources: [
    { server: "cluster", found: 0, error: null, truncated: false },
    { server: "core-51", found: 0, error: null, truncated: false },
  ],
};

const DEAD_SOURCES_SCAN: NonNullable<TaskInbox["scan"]> = {
  at: "2026-10-27T16:53:29+00:00",
  scanned_servers: 0,
  found: 0,
  new: 0,
  sources: [
    { server: "cluster", found: 0, error: "cluster: unreachable (ConnectError)", truncated: false },
    { server: "core-51", found: 0, error: "core-51: unreachable (ConnectError)", truncated: false },
  ],
};

const HEALTHY_SOURCES_SCAN: NonNullable<TaskInbox["scan"]> = {
  at: "2026-10-27T16:53:29+00:00",
  scanned_servers: 1,
  found: 2,
  new: 0,
  sources: [{ server: "cluster", found: 2, error: null, truncated: false }],
};

// Review P2-1: the walk hit SCAN_MAX_PAGES with the last page still full —
// found is a floor and the banner must name the cut, not read healthy.
const TRUNCATED_SOURCES_SCAN: NonNullable<TaskInbox["scan"]> = {
  at: "2026-10-27T16:53:29+00:00",
  scanned_servers: 1,
  found: 1000,
  new: 0,
  sources: [{ server: "cluster", found: 1000, error: null, truncated: true }],
};

describe("TaskInboxPage scan-health banner", () => {
  it("names the empty-but-healthy sources behind stale rows", async () => {
    const html = await renderInbox(new StaleSourcesAdapter(EMPTY_SOURCES_SCAN));
    expect(html).toContain(
      "The stores answer but return no task:queue records",
    );
    expect(html).toContain("cluster — 0 records");
    expect(html).toContain("core-51 — 0 records");
    // The honest hint: adoption stays impossible until a source returns.
    expect(html).toContain("memory-server registry");
  });

  it("names the unreachable sources when the scan could not connect", async () => {
    const html = await renderInbox(new StaleSourcesAdapter(DEAD_SOURCES_SCAN));
    expect(html).toContain("The scanner could not reach any memory store");
    expect(html).toContain("cluster — error: cluster: unreachable (ConnectError)");
  });

  it("names a capped walk instead of reading it healthy", async () => {
    const html = await renderInbox(
      new StaleSourcesAdapter(TRUNCATED_SOURCES_SCAN),
    );
    expect(html).toContain(
      "cluster — listing truncated at 1000 records (scan cap)",
    );
    // The healthy line would lie here: the tail never reached the scan.
    expect(html).not.toContain("cluster — 1000 records");
  });

  it("stays silent when healthy sources still return records", async () => {
    const html = await renderInbox(
      new StaleSourcesAdapter(HEALTHY_SOURCES_SCAN),
    );
    expect(html).not.toContain(
      "The stores answer but return no task:queue records",
    );
    expect(html).not.toContain("The scanner could not reach any memory store");
  });
});
