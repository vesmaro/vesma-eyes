// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MemoryRouter,
  createMemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AgentsHostsPage } from "./HostsRosterPage";
import { recordPresenceFlash } from "./presenceLight";
import { buildRoutes } from "@/app/routes";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { koraKeys } from "@/features/kora/useKora";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { DensityProvider } from "@/components/density-provider";
import { HotkeysProvider } from "@/layout/Hotkeys";
import type {
  AssignmentItem,
  ExecutorItem,
  ExecutorsPage,
} from "@/gateway/boardTypes";
import { actFlush, actUnmount, actWaitUntil } from "@/test/actTools";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * `/agents/hosts/:host?` — the agents-redesign A1 HOSTS FRAME: the roster
 * as the RIGHT panel of compact host rows (the inversion), the selected
 * host's scaffold in the field, the selection as a ROUTE (one optional-param
 * element — the frame never re-assembles), the three filter chips, the
 * pending/revoked row verdicts, the first-host redirect, and the canonical
 * empty roster. The surface stays mutation-free.
 *
 * Fixtures are built against a per-mount base (real clock); the tick test
 * fakes ONLY Date (real timers stay) so the shared 1 Hz ticker re-renders
 * from a controlled clock.
 */

const ago = (base: number, seconds: number): string =>
  new Date(base - seconds * 1000).toISOString();

function status(
  state: NonNullable<ExecutorItem["status"]>["state"],
  base: number,
  reportAgeS: number | "" = 30,
): ExecutorItem["status"] {
  return {
    state,
    since: ago(base, 60),
    last_report_age_s: reportAgeS,
    reason: "fixture",
    next_action: "",
  };
}

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

function assignment(base: number, overrides: Partial<AssignmentItem>): AssignmentItem {
  return {
    id: 1,
    task_id: "TB-1",
    specialist: "SFE",
    harness: "zcode",
    state: "queued",
    created_by: "owner",
    claimed_by: null,
    note: "",
    spec_hash: "",
    executor_id: "",
    claimed_by_executor: "",
    created_at: ago(base, 60),
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
 * The frame's fixture roster: laptop (one online + one silent member),
 * mesh-2 (stale), new-host (pending decision), old-host (revoked).
 */
function rosterExecutors(base: number): ExecutorItem[] {
  return [
    executor(base, {
      id: "ex-1",
      name: "zcode@laptop",
      status: status("online", base),
      // The ME-064 inventory snapshot (the counters the row shows).
      harness_inventory: [
        {
          name: "zcode",
          kind: "cli",
          home_path: "/home/u/.zcode",
          capabilities: {
            specialists: ["a", "b"],
            specialists_count: 39,
            skills: ["x"],
            skills_count: 121,
            plugins: [],
            plugins_count: 0,
            instructions: ["y"],
            instructions_count: 24,
          },
        },
      ],
    }),
    executor(base, {
      id: "ex-2",
      name: "hermes@laptop",
      enabled: false,
      last_seen: ago(base, 300),
      presence: "stale",
      status: status("silent", base, 300),
    }),
    executor(base, {
      id: "ex-3",
      name: "zcode@mesh-2",
      host: "mesh-2",
      last_seen: ago(base, 300),
      presence: "stale",
      status: status("silent", base, 300),
    }),
    executor(base, {
      id: "ex-4",
      name: "copilot@new-host",
      host: "new-host",
      harness: "copilot",
      enabled: false,
      state: "pending",
      status: status("awaiting-approval", base, 60),
    }),
    executor(base, {
      id: "ex-6",
      name: "zcode@gone",
      host: "gone",
      last_seen: ago(base, 7200),
      presence: "offline",
      status: status("offline", base, 7200),
    }),
    executor(base, {
      id: "ex-5",
      name: "copilot@old-host",
      host: "old-host",
      harness: "copilot",
      enabled: false,
      state: "revoked",
      last_seen: ago(base, 7200),
      presence: "offline",
      status: status("revoked", base, 7200),
    }),
  ];
}

function rosterAssignments(base: number): AssignmentItem[] {
  return [
    // ex-1's active work: TB-1 claimed (the corpus title is asserted).
    assignment(base, {
      id: 11,
      task_id: "TB-1",
      state: "claimed",
      claimed_by_executor: "ex-1",
      claimed_at: ago(base, 30),
    }),
  ];
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

interface MountOptions {
  executors?: (base: number) => ExecutorItem[];
  assignments?: (base: number) => AssignmentItem[];
  path?: string;
  /** Freeze the clock at the fixture base (fake Date, REAL timers). */
  freezeClock?: boolean;
  /** Seed the KORA registry BEFORE mount — with staleTime Infinity the
   * mount-time fetch never fires and the seed survives. */
  koraSeed?: (base: number) => Record<string, unknown>;
}

/** The LOCAL route stand (the optional param needs a real pattern). */
function PageUnderTest(): React.ReactElement {
  return (
    <Routes>
      <Route path="/agents/hosts/:host?" element={<AgentsHostsPage />} />
    </Routes>
  );
}

async function mountPage(options: MountOptions = {}): Promise<{
  root: Root;
  container: HTMLElement;
  client: QueryClient;
}> {
  const {
    executors = rosterExecutors,
    assignments = rosterAssignments,
    path = "/agents/hosts",
  } = options;
  const base = Date.now();
  if (options.freezeClock) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(base);
  }
  const gateway = new MockAdapter({ latency: false });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  await client.prefetchQuery({
    queryKey: keys.tasks.board(),
    queryFn: () => gateway.board(),
  });
  client.setQueryData(keys.agents.executors.list(), executorsPage(executors(base)));
  client.setQueryData(keys.agents.assignments.list({}), {
    ok: true,
    count: assignments(base).length,
    items: assignments(base),
  });
  if (options.koraSeed !== undefined) {
    client.setQueryData(koraKeys.sessionsPaged(100), {
      pages: [options.koraSeed(base)],
      pageParams: [0],
    });
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <GatewayContext.Provider value={gateway}>
        <QueryClientProvider client={client}>
          <ToastProvider>
            <UiTokenProvider>
              <I18nProvider initialLang="en">
                <MemoryRouter initialEntries={[path]}>
                  <PageUnderTest />
                </MemoryRouter>
              </I18nProvider>
            </UiTokenProvider>
          </ToastProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return { root, container, client };
}

/** Unmount + restore the (possibly faked) clock. */
async function teardown(root: Root): Promise<void> {
  await actUnmount(root);
  vi.useRealTimers();
}

/** The roster panel (aside region). */
const panel = (container: HTMLElement): HTMLElement =>
  container.querySelector('aside[aria-label="Host roster"]')!;

/** The roster ROWS (listbox options; the panel's ul excludes the connect). */
const rows = (container: HTMLElement): NodeListOf<HTMLElement> =>
  panel(container).querySelectorAll('[role="listbox"] [role="option"]');

const rowOf = (container: HTMLElement, host: string): HTMLElement =>
  [...rows(container)].find((row) => row.textContent?.includes(host))!;

/** The main field = the grid's FIRST child (the handle and the aside follow). */
const mainField = (container: HTMLElement): HTMLElement =>
  panel(container).parentElement!.firstElementChild as HTMLElement;

const listBox = (container: HTMLElement): HTMLElement =>
  panel(container).querySelector('[role="listbox"]')!;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the frame: selection as a route", () => {
  it("redirects /agents/hosts to the FIRST host by the canon sort", async () => {
    const router = createMemoryRouter(buildRoutes(), {
      initialEntries: ["/agents/hosts"],
    });
    const gateway = new MockAdapter({ latency: false });
    const base = Date.now();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await client.prefetchQuery({
      queryKey: keys.tasks.board(),
      queryFn: () => gateway.board(),
    });
    client.setQueryData(
      keys.agents.executors.list(),
      executorsPage(rosterExecutors(base)),
    );
    client.setQueryData(keys.agents.assignments.list({}), {
      ok: true,
      count: 0,
      items: [],
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <GatewayContext.Provider value={gateway}>
          <QueryClientProvider client={client}>
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
    await actWaitUntil(() => {
      // The first host by the canon sort («Без хоста» sinks last) — with
      // this fixture set that is «gone» (alphabetically before laptop).
      expect(router.state.location.pathname).toBe("/agents/hosts/gone");
      expect(container.querySelector('h2[id="agents-host-title"]')?.textContent).toBe(
        "gone",
      );
    });
    await actUnmount(root);
  });

  it("clicking a row navigates to the host route and moves aria-current", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/laptop" });
    expect(rowOf(container, "laptop").getAttribute("aria-current")).toBe("page");
    await act(async () => {
      rowOf(container, "mesh-2").click();
    });
    expect(rowOf(container, "mesh-2").getAttribute("aria-current")).toBe("page");
    expect(rowOf(container, "laptop").getAttribute("aria-current")).toBeNull();
    // The field followed the route without losing the frame.
    expect(
      container.querySelector('h2[id="agents-host-title"]')?.textContent,
    ).toBe("mesh-2");
    await actUnmount(root);
  });
});

describe("the roster listbox (A2 §3.E keyboard path)", () => {
  it("arrows and j/k move the highlight; Enter opens the host and lands focus on the field title", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/laptop" });
    const list = listBox(container);
    expect(list.getAttribute("role")).toBe("listbox");
    // The highlight starts on the selection (aria-current preserved).
    expect(list.getAttribute("aria-activedescendant")).toBe(
      rowOf(container, "laptop").id,
    );
    expect(rowOf(container, "laptop").getAttribute("aria-selected")).toBe("true");
    await act(async () => {
      list.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    expect(list.getAttribute("aria-activedescendant")).toBe(
      rowOf(container, "mesh-2").id,
    );
    await act(async () => {
      list.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    });
    expect(list.getAttribute("aria-activedescendant")).toBe(
      rowOf(container, "new-host").id,
    );
    await act(async () => {
      list.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    });
    expect(list.getAttribute("aria-activedescendant")).toBe(
      rowOf(container, "mesh-2").id,
    );
    // Enter opens the highlighted host: route + the field + the focus.
    await act(async () => {
      list.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await actFlush(50);
    expect(
      container.querySelector('h2[id="agents-host-title"]')?.textContent,
    ).toBe("mesh-2");
    expect(document.activeElement?.id).toBe("agents-host-title");
    await actUnmount(root);
  });

  it("a plain click on an option navigates too (mouse parity)", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/laptop" });
    await act(async () => {
      rowOf(container, "old-host").click();
    });
    expect(
      container.querySelector('h2[id="agents-host-title"]')?.textContent,
    ).toBe("old-host");
    await actUnmount(root);
  });
});

describe("the md ribbon (A2 §3.D)", () => {
  it("renders one compact chip per host and navigates on click", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/laptop" });
    const ribbon = container.querySelector('[aria-label="Host ribbon"]');
    expect(ribbon).not.toBeNull();
    const chips = [...ribbon!.querySelectorAll("button")];
    expect(chips).toHaveLength(5);
    expect(
      chips.find((chip) => chip.textContent?.includes("laptop"))!.getAttribute(
        "aria-current",
      ),
    ).toBe("page");
    // The pending host keeps its decision pill in the ribbon.
    expect(
      chips.find((chip) => chip.textContent?.includes("new-host"))!.textContent,
    ).toContain("awaits decision");
    await act(async () => {
      chips.find((chip) => chip.textContent?.includes("mesh-2"))!.click();
    });
    expect(
      container.querySelector('h2[id="agents-host-title"]')?.textContent,
    ).toBe("mesh-2");
    await actUnmount(root);
  });
});

describe("the roster sheet (A2 §3.D, <xl)", () => {
  it("opens from the trigger; Enter navigates + closes + lands the focus; Esc closes", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/laptop" });
    const trigger = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Roster · 5"),
    )!;
    await act(async () => {
      trigger.click();
    });
    const dialog = document.body.querySelector("[role='dialog']");
    expect(dialog).not.toBeNull();
    expect(dialog!.querySelectorAll('[role="option"]').length).toBe(5);
    // Esc closes the top overlay.
    await act(async () => {
      dialog!
        .querySelector('[role="listbox"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
    });
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
    // The canonical overlay return: the trigger regains the focus.
    await actFlush(30);
    expect(
      (document.activeElement as HTMLElement | null)?.textContent?.includes(
        "Roster ·",
      ),
    ).toBe(true);
    // Reopen: the highlight moves, Enter navigates and closes the sheet.
    await act(async () => {
      trigger.click();
    });
    const list = document.body.querySelector('[role="dialog"] [role="listbox"]')! as HTMLElement;
    await act(async () => {
      list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    await act(async () => {
      list.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await actFlush(50);
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
    expect(
      container.querySelector('h2[id="agents-host-title"]')?.textContent,
    ).toBe("mesh-2");
    expect(document.activeElement?.id).toBe("agents-host-title");
    await actUnmount(root);
  });
});

describe("the host harnesses (B2 §3.C.3)", () => {
  const harnessRows = (container: HTMLElement): NodeListOf<HTMLButtonElement> =>
    container.querySelectorAll('[aria-label="Host harnesses"] [aria-expanded]');

  it("one accordion row per member: presence, harness, refusal badge, counters, env slot", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/laptop" });
    const rows = harnessRows(container);
    expect(rows.length).toBe(2);
    const zcode = [...rows].find((row) => row.textContent?.includes("zcode@laptop"))!;
    // Presence + harness type + the reserved «среда исполнения» slot.
    expect(zcode.textContent).toContain("online");
    expect(zcode.textContent).toContain("zcode");
    expect(zcode.querySelector('[data-slot="execution-env"]')).not.toBeNull();
    // The four inventory counters (the ME-064 fixture counts).
    expect(zcode.textContent).toContain("39");
    expect(zcode.textContent).toContain("121");
    // hermes: owner-disabled → the refusal badge rides the row.
    const hermes = [...rows].find((row) => row.textContent?.includes("hermes@laptop"))!;
    expect(hermes.textContent).toContain("disabled");
    await actUnmount(root);
  });

  it("the sessions-in-24h counter joins the kora registry by executor_id", async () => {
    const { root, container } = await mountPage({
      path: "/agents/hosts/laptop",
      koraSeed: (base) => ({
        ok: true as const,
        count: 1,
        items: [
          {
            id: "ex-1:sess_42",
            executor_id: "ex-1",
            native_id: "sess_42",
            harness: "vscode",
            project: "vesma-eyes",
            cwd: null,
            state: "live",
            origin: "relay",
            steerable: true,
            started_at: ago(base, 300),
            last_activity_at: ago(base, 30),
            age_seconds: 30,
            last_line_preview: "работает",
          },
        ],
        coverage: { harnesses: [], gaps: [] },
        meta: { generated_at: ago(base, 10) },
      }),
    });
    const zcode = [...harnessRows(container)].find((row) =>
      row.textContent?.includes("zcode@laptop"),
    )!;
    expect(zcode.textContent).toContain("1");
    await actUnmount(root);
  });

  it("expansion mounts the FULL sheet workbench in place (all sections)", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/laptop" });
    const zcode = [...harnessRows(container)].find((row) =>
      row.textContent?.includes("zcode@laptop"),
    )!;
    await act(async () => {
      zcode.click();
    });
    const body = container.querySelector("#harness-body-ex-1")!;
    expect(body).not.toBeNull();
    // The ExecutorSheet's own sections (behavior parity by construction).
    for (const section of ["Link", "Access", "Identity", "Capabilities (declared)", "Danger zone"]) {
      expect(body.querySelector(`section[aria-label="${section}"]`)).not.toBeNull();
    }
    expect(body.textContent).toContain("Detected on the host");
    // The secret clause: explained, never rendered.
    expect(body.textContent).toContain("secret");
    await actUnmount(root);
  });

  it("the mutation checklist is reachable within two clicks (expand → action)", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/new-host" });
    // approve: expand the pending member → the Approve button.
    const pending = [...harnessRows(container)].find((row) =>
      row.textContent?.includes("copilot@new-host"),
    )!;
    await act(async () => {
      pending.click();
    });
    const pendingBody = container.querySelector("#harness-body-ex-4")!;
    expect(
      [...pendingBody.querySelectorAll("button")].some((b) =>
        b.textContent?.includes("Approve"),
      ),
    ).toBe(true);
    await actUnmount(root);

    // enabled kill-switch + name + caps + link-check: expand the live member.
    const { root: root2, container: container2 } = await mountPage({
      path: "/agents/hosts/laptop",
    });
    const zcode = [...harnessRows(container2)].find((row) =>
      row.textContent?.includes("zcode@laptop"),
    )!;
    await act(async () => {
      zcode.click();
    });
    const body2 = container2.querySelector("#harness-body-ex-1")!;
    const labels = [...body2.querySelectorAll("label, button")].map((el) => el.textContent ?? "");
    expect(labels.join("|")).toContain("Enabled for dispatch");
    expect(body2.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(body2.querySelector("input")).not.toBeNull(); // the name field
    expect(
      [...body2.querySelectorAll("button")].some((b) => b.textContent?.includes("Revoke")),
    ).toBe(true);
    expect(
      [...body2.querySelectorAll("button")].some((b) => b.textContent?.includes("Delete")),
    ).toBe(true);
    expect(
      [...body2.querySelectorAll("button")].some((b) =>
        b.textContent?.includes("Refresh pulse"),
      ),
    ).toBe(true);
    await actUnmount(root2);
  });
});

describe("the roster panel (the inversion: compact rows, not cards)", () => {
  it("renders one row per host with presence, «N/M harnesses online», age, work chip", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/laptop" });
    const laptop = rowOf(container, "laptop");
    // Presence word + dot from the aggregate (one online member of two).
    expect(laptop.textContent).toContain("online");
    expect(laptop.textContent).toContain("1/2 harnesses online");
    // The freshest report age (the online member's 30 s → «0min»).
    expect(laptop.textContent).toContain("last seen: 0min");
    // The active-work chip (the claimed TB-1 via ex-1) + the host name.
    expect(laptop.textContent).toContain("борд v0.3");
    expect(laptop.textContent).toContain("claimed");
    // mesh-2: stale presence, honest idle (no chip).
    const mesh = rowOf(container, "mesh-2");
    expect(mesh.textContent).toContain("0/1 harnesses online");
    expect(mesh.textContent).not.toContain("idle");
    await actUnmount(root);
  });

  it("the pending host wears the «awaits decision» pill; the revoked host renders muted", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/laptop" });
    const pendingRow = rowOf(container, "new-host");
    expect(pendingRow.textContent).toContain("awaits decision");
    // The pill's tooltip carries the WHY (the registry's pending reason).
    const pill = [...pendingRow.querySelectorAll("span[title]")].find((span) =>
      span.textContent?.includes("awaits decision"),
    );
    expect(pill?.getAttribute("title")).toContain("awaiting owner approval");
    const revokedRow = rowOf(container, "old-host");
    expect(revokedRow.className).toContain("text-foreground-muted");
    await actUnmount(root);
  });

  it("U6 присутствие-свет: a real member transition flares the host row once", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/laptop" });
    const row = rowOf(container, "mesh-2");
    expect(row.className).not.toContain("agents-presence-online");
    act(() => {
      recordPresenceFlash("ex-3", "online");
    });
    expect(row.className).toContain("agents-presence-online");
    act(() => {
      recordPresenceFlash("ex-3", "offline");
    });
    expect(row.className).toContain("agents-presence-offline");
    await actUnmount(root);
  });

  it("the filter chips: attention set, decision set, and the honest filter empty", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/laptop" });
    const chip = (label: string): HTMLButtonElement =>
      [...panel(container).querySelectorAll("button")].find(
        (button) => button.textContent === label,
      )!;
    // All: five hosts.
    expect(rows(container).length).toBe(5);
    await act(async () => {
      chip("Need attention").click();
    });
    // laptop + mesh-2 are silent; new-host is awaiting; gone is offline;
    // old-host (revoked) is NOT.
    const attention = [...rows(container)].map((row) => row.textContent);
    expect(attention).toHaveLength(4);
    expect(attention.join("|")).toContain("laptop");
    expect(attention.join("|")).toContain("mesh-2");
    expect(attention.join("|")).toContain("new-host");
    expect(attention.join("|")).toContain("gone");
    expect(attention.join("|")).not.toContain("old-host");
    await act(async () => {
      chip("Awaiting decision").click();
    });
    expect(rows(container).length).toBe(1);
    expect(rows(container)[0].textContent).toContain("new-host");
    await act(async () => {
      chip("All").click();
    });
    expect(rows(container).length).toBe(5);
    await actUnmount(root);
  });

  it("the connect action lives at the panel bottom and walks the OPEN conveyor", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/laptop" });
    const action = panel(container).querySelector<HTMLAnchorElement>(
      'a[href="/agents/harnesses?connect=1"]',
    );
    expect(action).not.toBeNull();
    expect(action!.textContent).toContain("Connect a host");
    await actUnmount(root);
  });
});

describe("the main field: the selected host's scaffold", () => {
  it("name + lifecycle pill + next_action + stats (the B1 workbench header)", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/laptop" });
    const field = mainField(container);
    // The host aggregate pill: laptop's ladder lands on silent (one member
    // online, one silent — the attention verdict leads; EN label «quiet»).
    expect(field.textContent).toContain("laptop");
    expect(field.textContent).toContain("quiet");
    // The next_action is a VISIBLE line (07a: a pill is never alone).
    expect(field.textContent).toContain("No reports for");
    // The stats line: the breakdown + active tasks + the freshest report age.
    expect(field.textContent).toContain("1/2 harnesses online");
    expect(field.textContent).toContain("active tasks: 1");
    expect(field.textContent).toContain("last seen: 0min");
    // The header actions: give-a-task (routable host → enabled), the Kora
    // deep link carrying the host filter, the real link verdict.
    const give = [...field.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Give a task"),
    )!;
    expect(give.disabled).toBe(false);
    expect(field.querySelector('a[href="/kora?host=laptop"]')).not.toBeNull();
    expect(field.textContent).toContain("Check the link");
    // «Сейчас»: the claimed assignment links into the task's LIVE feed with
    // the roster as the return target.
    const feedLink = field.querySelector<HTMLAnchorElement>('a[href*="/tasks/TB-1"]');
    expect(feedLink).not.toBeNull();
    expect(feedLink!.getAttribute("href")).toContain("tab=execution");
    expect(feedLink!.getAttribute("href")).toContain(
      `return=${encodeURIComponent("/agents/hosts/laptop")}`,
    );
    // No live kora sessions for the fixture executors → the honest line.
    expect(field.textContent).toContain("No live sessions");
    await actUnmount(root);
  });

  it("«Сейчас» shows a live kora session joined by executor_id (B1 §3.C.2)", async () => {
    const { root, container } = await mountPage({
      path: "/agents/hosts/laptop",
      // A LIVE session owned by the host's member (the frozen
      // KoraSessionOut shape; vscode = the lists-only harness).
      koraSeed: (base) => ({
        ok: true as const,
        count: 1,
        items: [
          {
            id: "ex-1:sess_42",
            executor_id: "ex-1",
            native_id: "sess_42",
            harness: "vscode",
            project: "vesma-eyes",
            cwd: null,
            state: "live",
            origin: "relay",
            steerable: true,
            started_at: ago(base, 300),
            last_activity_at: ago(base, 30),
            age_seconds: 30,
            last_line_preview: "работает",
          },
        ],
        coverage: {
          harnesses: [
            { harness: "vscode", support: "lists-only" as const, note: null },
          ],
          gaps: [],
        },
        meta: { generated_at: ago(base, 10) },
      }),
    });
    const field = mainField(container);
    const sessionLink = field.querySelector<HTMLAnchorElement>(
      'a[href="/kora/ex-1%3Asess_42"]',
    );
    expect(sessionLink).not.toBeNull();
    expect(sessionLink!.textContent).toContain("vscode");
    // The lists-only harness wears the honest badge (never a dead link).
    expect(sessionLink!.textContent).toContain("lists only");
    await actUnmount(root);
  });

  it("«Недавно»: the revoked host's field answers with the honest quiet", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/old-host" });
    await actFlush(200);
    const field = mainField(container);
    // The tombstone block + the reconnect CTA.
    expect(field.textContent).toContain("Access revoked");
    const reconnect = [...field.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("Reconnect"),
    );
    expect(reconnect).not.toBeNull();
    expect(reconnect!.getAttribute("href")).toBe("/agents/harnesses?connect=1");
    // The feed resolves empty for the dead host → the canonical quiet line.
    expect(field.textContent).toContain("Quiet. The first events arrive");
    await actUnmount(root);
  });

  it("«Дать задачу» disables on non-routable hosts with the lifecycle explanation", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/old-host" });
    const give = [...mainField(container).querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Give a task"),
    )!;
    expect(give.disabled).toBe(true);
    expect(give.getAttribute("title")).toContain("Access revoked");
    await actUnmount(root);
    const { root: root2, container: container2 } = await mountPage({
      path: "/agents/hosts/gone",
    });
    const give2 = [...mainField(container2).querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Give a task"),
    )!;
    expect(give2.disabled).toBe(true);
    expect(give2.getAttribute("title")).toContain("check the link");
    await actUnmount(root2);
  });

  it("a pending host shows the decision pill in the field; revoked reads revoked", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/new-host" });
    expect(
      container.querySelector('h2[id="agents-host-title"]')?.textContent,
    ).toBe("new-host");
    expect(mainField(container).textContent).toContain("awaits decision");
    await actUnmount(root);
    const { root: root2, container: container2 } = await mountPage({
      path: "/agents/hosts/old-host",
    });
    expect(mainField(container2).textContent).toContain("revoked");
    await actUnmount(root2);
  });

  it("a deep link past the roster renders the honest not-found, panel intact", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/ghost" });
    expect(container.textContent).toContain("Host not found");
    expect(container.textContent).toContain("ghost");
    expect(rows(container).length).toBe(5);
    await actUnmount(root);
  });
});

describe("the empty roster", () => {
  it("stays on /agents/hosts with the canonical empty + the connect CTA", async () => {
    const { root, container } = await mountPage({
      executors: () => [],
      assignments: () => [],
    });
    expect(container.textContent).toContain("No agents yet");
    const cta = container.querySelector<HTMLAnchorElement>(
      'a[href="/agents/harnesses?connect=1"]',
    );
    expect(cta).not.toBeNull();
    expect(cta!.textContent).toContain("Connect a host");
    // No rows, no redirect target — the URL keeps its place.
    expect(rows(container).length).toBe(0);
    await actUnmount(root);
  });
});

describe("presence age ticks from the server meta TTLs", () => {
  it("classifies by the meta bounds and re-renders the age as the clock ticks", async () => {
    const { root, container } = await mountPage({
      executors: (base) => [
        executor(base, {
          id: "ex-1",
          host: "laptop",
          last_seen: ago(base, 59),
          status: status("online", base, 59),
        }),
      ],
      assignments: () => [],
      path: "/agents/hosts/laptop",
      freezeClock: true,
    });
    // The module-level ticker may hold a snapshot from an earlier test —
    // one real tick aligns it with the frozen clock.
    await actFlush(1100);
    // 59 s ≤ 120 s (meta.presence.online_max_age_s) → online, age «0min».
    const row = rowOf(container, "laptop");
    const dot = row.querySelector("span.size-2");
    expect(dot?.className).toContain("bg-success");
    expect(row.textContent).toContain("last seen: 0min");
    expect(row.textContent).toContain("1/1 harnesses online");
    // Tick the CLIENT clock past the online bound (59 + 65 = 124 s > 120 s
    // online, ≤ 600 s stale): the same server TTL contract reclassifies the
    // dot and the age ticks up — no refetch, the ticker alone.
    vi.setSystemTime(Date.now() + 65_000);
    await actFlush(1300); // one real 1 Hz tick
    expect(dot?.className).toContain("bg-warning");
    expect(row.textContent).toContain("last seen: 2min");
    expect(row.textContent).toContain("0/1 harnesses online");
    await teardown(root);
  });
});

describe("the roster surface is mutation-free", () => {
  it("renders NO registry buttons and NO context-menu triggers", async () => {
    const { root, container } = await mountPage({ path: "/agents/hosts/laptop" });
    const text = container.textContent ?? "";
    for (const forbidden of [
      "Approve",
      "Revoke",
      "Enable",
      "Disable",
      "Delete",
      "Save",
    ]) {
      expect(text).not.toContain(forbidden);
    }
    expect(
      container.querySelector('button[aria-label^="Actions for executor"]'),
    ).toBeNull();
    expect(container.querySelectorAll("[role='menuitem']")).toHaveLength(0);
    await actUnmount(root);
  });
});

describe("the /agents default landing", () => {
  it("the REAL route table still redirects /agents into the hosts frame", async () => {
    const base = Date.now();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(base);
    const gateway = new MockAdapter({ latency: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await client.prefetchQuery({
      queryKey: keys.tasks.board(),
      queryFn: () => gateway.board(),
    });
    client.setQueryData(
      keys.agents.executors.list(),
      executorsPage(rosterExecutors(base)),
    );
    client.setQueryData(keys.agents.assignments.list({}), {
      ok: true,
      count: 0,
      items: [],
    });
    const router = createMemoryRouter(buildRoutes(), { initialEntries: ["/agents"] });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <GatewayContext.Provider value={gateway}>
          <QueryClientProvider client={client}>
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
    // /agents → /agents/hosts (the alias) → the first host (the frame's
    // own replace redirect): one landing, the roster panel visible.
    await actWaitUntil(() => {
      expect(router.state.location.pathname).toBe("/agents/hosts/gone");
      expect(
        container.querySelector('aside[aria-label="Host roster"]'),
      ).not.toBeNull();
    });
    await actUnmount(root);
    vi.useRealTimers();
  });
});
