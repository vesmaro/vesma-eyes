// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  HostsPresenceBlock,
  HostsPulseBlock,
  HostsSettingsBlock,
} from "./HostsMetaPanel";
import { groupExecutorsByHost, type HostGroup } from "./rosterModel";
import { keys } from "@/lib/queryKeys";
import { koraKeys } from "@/features/kora/useKora";
import { I18nProvider } from "@/i18n";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import type {
  ActivityBucket,
  ActivityItem,
  ActivityPage,
  ExecutorItem,
  ExecutorsPage,
} from "@/gateway/boardTypes";
import { actUnmount } from "@/test/actTools";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The RIGHT meta-panel blocks (agents-workspace-ide W2 «Мета-панель»,
 * states.md §2): collapsible-block mechanics (the Kora MetaBlock grammar —
 * aria-expanded/aria-controls, session-only open state), the documented
 * defaults (Присутствие/Пульс expanded, Настройки collapsed), the pulse's
 * honest states (strip + rows / quiet / no-host line), and the settings
 * block's verdict discipline (a broken pair warns in BOTH collapse states;
 * quiet hub links live in the expanded body only).
 *
 * The roster listbox INSIDE «Присутствие» keeps its own A2 §3.E coverage
 * in HostsRosterPage.test.tsx — here the block takes placeholder children.
 */

const ago = (base: number, seconds: number): string =>
  new Date(base - seconds * 1000).toISOString();

function executor(
  base: number,
  overrides: Partial<ExecutorItem> & { id: string },
): ExecutorItem {
  return {
    name: overrides.id,
    harness: "zcode",
    host: "laptop",
    transport: "local-poll",
    capabilities: [],
    version: "1.0.0",
    enabled: true,
    state: "approved",
    last_seen: ago(base, 30),
    presence: "online",
    registered_via: "",
    registered_at: "",
    updated_at: "",
    ...overrides,
  };
}

function executorsPage(items: ExecutorItem[]): ExecutorsPage {
  return {
    ok: true,
    count: items.length,
    items,
    meta: {
      presence: { online_max_age_s: 120, stale_max_age_s: 600 },
      sweeper_interval_s: 60,
      lifecycle: {
        silent_max_age_s: 600,
        states: [
          "provisioning",
          "awaiting-approval",
          "awaiting-first-report",
          "online",
          "silent",
          "offline",
          "disabled",
          "revoked",
        ],
      },
    },
  };
}

/** One host group from the REAL projection (no hand-made aggregates). */
function hostGroup(base: number, host = "laptop"): HostGroup {
  const groups = groupExecutorsByHost(
    [
      executor(base, { id: "ex-1", name: "zcode@laptop", host }),
    ],
    executorsPage([]).meta,
    base,
  );
  const group = groups.find((candidate) => candidate.host === host);
  if (!group) throw new Error(`fixture group ${host} missing`);
  return group;
}

function activityItem(base: number, overrides: Partial<ActivityItem>): ActivityItem {
  return {
    id: "a-1",
    ts: ago(base, 60),
    kind: "assignment.started",
    task_id: "TB-7",
    task_title: "the pulse fixture task",
    ...overrides,
  };
}

interface MountOptions {
  /** Query seeding — runs against the client BEFORE the mount. */
  seed?: (client: QueryClient, base: number) => void;
  /** The element under test. */
  ui: (group: HostGroup | null, now: number) => React.ReactElement;
}

async function mountBlocks(options: MountOptions): Promise<{
  root: Root;
  container: HTMLElement;
}> {
  const base = Date.now();
  const gateway = new MockAdapter({ latency: false });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  options.seed?.(client, base);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <GatewayContext.Provider value={gateway}>
        <QueryClientProvider client={client}>
          <I18nProvider initialLang="en">
            <MemoryRouter initialEntries={["/agents/hosts/laptop"]}>
              {options.ui(hostGroup(base), base)}
            </MemoryRouter>
          </I18nProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return { root, container };
}

/** The collapsible block header by its title text. */
const blockHeader = (
  container: HTMLElement,
  title: string,
): HTMLButtonElement =>
  [...container.querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-controls") !== null &&
      button.textContent?.includes(title),
  )!;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the collapsible block grammar (the Kora MetaBlock contract)", () => {
  it("«Присутствие» defaults EXPANDED: aria-expanded + aria-controls resolve, children render; the toggle collapses them", async () => {
    const { root, container } = await mountBlocks({
      ui: () => (
        <HostsPresenceBlock>
          <p>the roster body fixture</p>
        </HostsPresenceBlock>
      ),
    });
    const header = blockHeader(container, "Presence");
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(header.getAttribute("aria-controls")).toBe("hosts-meta-presence-body");
    const body = document.getElementById("hosts-meta-presence-body");
    expect(body).not.toBeNull();
    expect(body!.textContent).toContain("the roster body fixture");
    await act(async () => {
      header.click();
    });
    expect(blockHeader(container, "Presence").getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(document.getElementById("hosts-meta-presence-body")).toBeNull();
    await actUnmount(root);
  });
});

describe("«Пульс» (the ex-«Недавно» of the field, states.md §2)", () => {
  const seedPulse =
    (host: string, rows: ActivityItem[], buckets: ActivityBucket[]) =>
    (client: QueryClient, base: number) => {
      const page: ActivityPage = {
        ok: true,
        count: rows.length,
        items: rows.map((row) => ({ ...row, ts: ago(base, 60) })),
        has_more: false,
      };
      client.setQueryData(keys.tasks.activity.list({ host, limit: 8 }), {
        pages: [page],
        pageParams: [undefined],
      });
      client.setQueryData(
        keys.tasks.activity.buckets({ host, bucket: "hour", hours: 24 }),
        { buckets },
      );
    };

  it("defaults EXPANDED and renders the 24h strip + the freshest rows (host-scoped)", async () => {
    const base = Date.now();
    const { root, container } = await mountBlocks({
      seed: seedPulse(
        "laptop",
        [activityItem(base, {})],
        [{ ts: new Date(base).toISOString(), total: 3, by_type: { task: 1, assignment: 1, report: 1 } }],
      ),
      ui: (group, now) => <HostsPulseBlock group={group} now={now} />,
    });
    const header = blockHeader(container, "Pulse");
    expect(header.getAttribute("aria-expanded")).toBe("true");
    // The strip renders from RESOLVED buckets (static divs, never canvas).
    expect(container.querySelector('div[aria-hidden="true"].h-12')).not.toBeNull();
    // The feed row: kind label + the task title.
    expect(container.textContent).toContain("started");
    expect(container.textContent).toContain("the pulse fixture task");
    await actUnmount(root);
  });

  it("collapse unmounts the body — the wires stay quiet with the block closed", async () => {
    const base = Date.now();
    const { root, container } = await mountBlocks({
      seed: seedPulse("laptop", [activityItem(base, {})], []),
      ui: (group, now) => <HostsPulseBlock group={group} now={now} />,
    });
    await act(async () => {
      blockHeader(container, "Pulse").click();
    });
    expect(container.textContent).not.toContain("the pulse fixture task");
    expect(document.getElementById("hosts-meta-pulse-body")).toBeNull();
    await actUnmount(root);
  });

  it("a host that never spoke answers with the honest quiet line", async () => {
    const base = Date.now();
    const { root, container } = await mountBlocks({
      seed: seedPulse("laptop", [], [
        { ts: new Date(base).toISOString(), total: 0, by_type: { task: 0, assignment: 0, report: 0 } },
      ]),
      ui: (group, now) => <HostsPulseBlock group={group} now={now} />,
    });
    expect(container.textContent).toContain(
      "Quiet. The first events arrive after the first report.",
    );
    await actUnmount(root);
  });

  it("no host selected → the honest line, never a guessed feed", async () => {
    const { root, container } = await mountBlocks({
      ui: (_group, now) => <HostsPulseBlock group={null} now={now} />,
    });
    expect(container.textContent).toContain("Pick a host");
    expect(container.querySelector('div[aria-hidden="true"].h-12')).toBeNull();
    await actUnmount(root);
  });
});

describe("«Настройки» (the first line, states.md §2)", () => {
  const seedWarning =
    (defaultExecutor: string, withExecutor = true) =>
    (client: QueryClient, base: number) => {
      if (withExecutor) {
        client.setQueryData(
          keys.agents.executors.list(),
          executorsPage([executor(base, { id: "ex-1", name: "zcode@laptop" })]),
        );
      }
      client.setQueryData(keys.agents.settings.execution(), {
        ok: true,
        default_executor: defaultExecutor,
        fallback_executor: "",
        scope: "",
      });
    };

  it("defaults COLLAPSED, yet a BROKEN pair still warns under the header; expanding reveals the quiet hub links", async () => {
    const { root, container } = await mountBlocks({
      seed: seedWarning(""),
      ui: (_group, now) => <HostsSettingsBlock key={now} />,
    });
    const header = blockHeader(container, "Settings");
    expect(header.getAttribute("aria-expanded")).toBe("false");
    // The verdict is a WARNING: it never hides behind the collapsed default.
    expect(container.textContent).toContain(
      "No default executor is set — new tasks will not be picked up.",
    );
    expect(container.textContent).toContain(
      "No fallback executor is set — if the first one fails, tasks have nowhere to go.",
    );
    // Links live in the expanded body only.
    expect(container.querySelector('a[href="/system/settings#execution"]')).toBeNull();
    await act(async () => {
      header.click();
    });
    expect(
      container.querySelector('a[href="/system/settings#execution"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('a[href="/system/settings#automation"]'),
    ).not.toBeNull();
    await actUnmount(root);
  });

  it("a HEALTHY pair renders no verdict at all — silence is the honest resting state", async () => {
    const { root, container } = await mountBlocks({
      seed: seedWarning("ex-1"),
      ui: (_group, now) => <HostsSettingsBlock key={now} />,
    });
    expect(container.textContent).not.toContain("will not be picked up");
    await actUnmount(root);
  });
});

// The blocks mount beside the frame's other consumers — a smoke guard that
// the pulse keys never collide with the Kora registry keys (one wire each).
describe("the pulse wiring", () => {
  it("the pulse query keys stay distinct from the Kora sessions key", () => {
    const feedKey = keys.tasks.activity.list({ host: "laptop", limit: 8 });
    const bucketKey = keys.tasks.activity.buckets({
      host: "laptop",
      bucket: "hour",
      hours: 24,
    });
    const koraKey = koraKeys.sessionsPaged(100);
    expect(JSON.stringify(feedKey)).not.toBe(JSON.stringify(koraKey));
    expect(JSON.stringify(bucketKey)).not.toBe(JSON.stringify(koraKey));
  });
});
