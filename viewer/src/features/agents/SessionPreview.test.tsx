// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AgentsHostsPage } from "./HostsRosterPage";
import type * as KoraGatewayContextModule from "@/features/kora/koraGatewayContext";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { koraKeys } from "@/features/kora/useKora";
import type {
  KoraCoverage,
  KoraSession,
  KoraTranscriptItem,
} from "@/features/kora/koraTypes";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import type { ExecutorItem, ExecutorsPage } from "@/gateway/boardTypes";
import { actFlush, actUnmount, actWaitUntil } from "@/test/actTools";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * agents-workspace-ide W3 «Сессия в центре» — the S-SESSION slice:
 * - the route `/agents/hosts/:host/sessions/:sessionId` selects a live
 *   session IN the field (deep-linkable; one frame element — the SAME
 *   AgentsHostsPage element as `:host?`, states.md §3);
 * - the preview is READ-ONLY: transcript (the Kora reading grammar) +
 *   mini-meta + [Открыть в Корe] — and the §9 guard: NO composer, no pult,
 *   no model picker, ever;
 * - the WIRE LIFECYCLE gate (blueprint §7): the transcript read mounts ONLY
 *   with a resolved selection and stops with switch/close — counted on a
 *   recording kora gateway (vi.mock makeKoraGateway);
 * - the session op menu (real operations only) with Esc closing the MENU
 *   first (stopPropagation) — the session stays;
 * - Esc / the ✕ button return to S-HOST-LIVE; an unknown deep-link id gets
 *   the honest not-found line and NEVER a transcript read.
 */

/** The recording state the mocked makeKoraGateway feeds (vi.hoisted). */
interface CountedGateway {
  transcriptCalls: Record<string, number>;
  hermesCalls: Record<string, number>;
}
const w3 = vi.hoisted((): { gateways: CountedGateway[] } => {
  const state: { gateways: CountedGateway[] } = { gateways: [] };
  return state;
});

vi.mock("@/features/kora/koraGatewayContext", async (importOriginal) => {
  const actual = await importOriginal<typeof KoraGatewayContextModule>();
  const { KoraMockAdapter } = await import("@/features/kora/KoraMockAdapter");
  type Adapter = InstanceType<typeof KoraMockAdapter>;
  class CountingAdapter extends KoraMockAdapter {
    transcriptCalls: Record<string, number> = {};
    hermesCalls: Record<string, number> = {};
    override getTranscript(
      ...args: Parameters<Adapter["getTranscript"]>
    ): Promise<Awaited<ReturnType<Adapter["getTranscript"]>>> {
      const id = args[0];
      this.transcriptCalls[id] = (this.transcriptCalls[id] ?? 0) + 1;
      return super.getTranscript(...args);
    }
    override hermesMessages(
      ...args: Parameters<Adapter["hermesMessages"]>
    ): Promise<Awaited<ReturnType<Adapter["hermesMessages"]>>> {
      const id = args[0];
      this.hermesCalls[id] = (this.hermesCalls[id] ?? 0) + 1;
      return super.hermesMessages(...args);
    }
  }
  return {
    ...actual,
    makeKoraGateway: () => {
      const gateway = new CountingAdapter({ latency: false });
      w3.gateways.push(gateway);
      return gateway;
    },
  };
});

/** The last gateway the workspace built (one per mount). */
const lastGateway = (): CountedGateway | undefined =>
  w3.gateways[w3.gateways.length - 1];

const transcriptReads = (gateway: CountedGateway): number =>
  Object.values(gateway.transcriptCalls).reduce((sum, n) => sum + n, 0);

// --- fixtures ----------------------------------------------------------------------

const ago = (base: number, seconds: number): string =>
  new Date(base - seconds * 1000).toISOString();

function status(
  state: NonNullable<ExecutorItem["status"]>["state"],
  base: number,
): ExecutorItem["status"] {
  return {
    state,
    since: ago(base, 60),
    last_report_age_s: 30,
    reason: "fixture",
    next_action: "",
  };
}

function executor(base: number, id: string): ExecutorItem {
  return {
    id,
    name: `zcode@laptop-${id}`,
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
    status: status("online", base),
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

function session(base: number, id: string): KoraSession {
  return {
    id,
    executor_id: "ex-1",
    native_id: id.split(":")[1] ?? id,
    harness: "zcode",
    project: `proj:${id}`,
    cwd: null,
    state: "live",
    origin: "relay",
    steerable: true,
    started_at: ago(base, 600),
    last_activity_at: ago(base, 30),
    age_seconds: 600,
    last_line_preview: `preview of ${id}`,
  };
}

const coverage: KoraCoverage = {
  harnesses: [{ harness: "zcode", support: "full" }],
  gaps: [],
};

function transcriptItem(seq: number, role: string, content: string): KoraTranscriptItem {
  return {
    seq,
    role: role as KoraTranscriptItem["role"],
    kind: null,
    ts: null,
    content,
    redaction_applied: false,
  };
}

/** Seed the transcript PAGE cache exactly as the preview hook reads it
 * (staleTime Infinity — the seeded page survives, no fetch fires). */
function seedTranscript(
  client: QueryClient,
  sessionId: string,
  marker: string,
): void {
  client.setQueryData(koraKeys.transcriptPaged(sessionId, 50), {
    pages: [
      {
        session_id: sessionId,
        items: [
          transcriptItem(1, "user", `question ${marker}`),
          transcriptItem(2, "assistant", `answer ${marker}`),
        ],
        next_after_seq: 2,
        has_more: false,
      },
    ],
    pageParams: [0],
  });
}

// --- the mount stand ---------------------------------------------------------------

/** BOTH W3 route shapes mount the SAME element (states.md §3). */
function PageUnderTest(): React.ReactElement {
  return (
    <Routes>
      <Route path="/agents/hosts/:host?" element={<AgentsHostsPage />} />
      <Route
        path="/agents/hosts/:host/sessions/:sessionId"
        element={<AgentsHostsPage />}
      />
    </Routes>
  );
}

interface MountOptions {
  path?: string;
  /** Seed the transcript page cache for these session ids. */
  seededTranscripts?: string[];
}

async function mountPage(options: MountOptions = {}): Promise<{
  root: Root;
  container: HTMLElement;
  client: QueryClient;
  /** The MemoryRouter's current pathname (window.location is untouched). */
  readPath: () => string;
}> {
  const base = Date.now();
  let latestPath = options.path ?? "/agents/hosts/laptop";
  const gateway = new MockAdapter({ latency: false });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  await client.prefetchQuery({
    queryKey: keys.tasks.board(),
    queryFn: () => gateway.board(),
  });
  client.setQueryData(keys.agents.executors.list(), executorsPage([executor(base, "ex-1")]));
  client.setQueryData(keys.agents.assignments.list({}), {
    ok: true,
    count: 0,
    items: [],
  });
  // The Kora REGISTRY (the «Сейчас» live list read — useKoraSessionPages(100)).
  client.setQueryData(koraKeys.sessionsPaged(100), {
    pages: [
      {
        ok: true,
        count: 2,
        items: [session(base, "ex-1:alpha"), session(base, "ex-1:beta")],
        coverage,
        meta: {},
      },
    ],
    pageParams: [0],
  });
  for (const id of options.seededTranscripts ?? []) {
    seedTranscript(client, id, id.endsWith("alpha") ? "alpha" : "beta");
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
                <MemoryRouter
                  initialEntries={[options.path ?? "/agents/hosts/laptop"]}
                >
                  <LocationProbe onLocation={(path) => (latestPath = path)} />
                  <PageUnderTest />
                </MemoryRouter>
              </I18nProvider>
            </UiTokenProvider>
          </ToastProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return { root, container, client, readPath: () => latestPath };
}

/** Writes the router's pathname out (MemoryRouter never touches the URL). */
function LocationProbe({
  onLocation,
}: {
  onLocation: (path: string) => void;
}): null {
  const location = useLocation();
  onLocation(location.pathname);
  return null;
}

async function teardown(root: Root): Promise<void> {
  await actUnmount(root);
  document.body.innerHTML = "";
}

// --- selectors ---------------------------------------------------------------------

const preview = (container: HTMLElement): HTMLElement | null =>
  container.querySelector<HTMLElement>("[data-agents-session-preview]");

const sessionRow = (container: HTMLElement, id: string): HTMLAnchorElement =>
  [...container.querySelectorAll<HTMLAnchorElement>('[aria-current], a[href*="sessions/"]')].find(
    (row) => row.getAttribute("href")?.includes(encodeURIComponent(id)),
  )!;

const liveRows = (container: HTMLElement): HTMLAnchorElement[] =>
  [...container.querySelectorAll<HTMLAnchorElement>("a")].filter((row) =>
    row.getAttribute("href")?.includes("/sessions/"),
  );

beforeEach(() => {
  localStorage.clear();
  w3.gateways.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// --- the suite ---------------------------------------------------------------------

describe("W3 S-SESSION: the route + the read-only preview", () => {
  it("deep link renders the preview with the transcript, mini-meta and the Kora CTA", async () => {
    const { root, container } = await mountPage({
      path: "/agents/hosts/laptop/sessions/ex-1:alpha",
      seededTranscripts: ["ex-1:alpha"],
    });
    const box = await actWaitUntil(() => {
      const node = preview(container);
      expect(node).not.toBeNull();
      return node!;
    });
    // The transcript RENDERS (the seeded page): the reading grammar works.
    expect(box.textContent).toContain("question alpha");
    expect(box.textContent).toContain("answer alpha");
    // Mini-meta: real registry fields only.
    expect(box.textContent).toContain("zcode");
    expect(box.textContent).toContain("ex-1:alpha");
    // The §9 note + the primary CTA target the KORA route (canonical chat).
    expect(box.textContent).toContain("Read-only preview");
    const cta = box.querySelector<HTMLAnchorElement>('a[href^="/kora/"]');
    expect(cta).not.toBeNull();
    expect(cta!.getAttribute("href")).toBe(`/kora/${encodeURIComponent("ex-1:alpha")}`);
    await teardown(root);
  });

  it("§9 composer guard: no textarea, no textbox, no combobox, no form in the preview", async () => {
    const { root, container } = await mountPage({
      path: "/agents/hosts/laptop/sessions/ex-1:alpha",
      seededTranscripts: ["ex-1:alpha"],
    });
    await actWaitUntil(() => {
      expect(preview(container)).not.toBeNull();
    });
    // The chat surface lives ONLY in Kora — the field never grows one.
    expect(container.querySelectorAll("textarea").length).toBe(0);
    expect(container.querySelectorAll('[role="textbox"]').length).toBe(0);
    expect(container.querySelectorAll('[role="combobox"]').length).toBe(0);
    expect(container.querySelectorAll("select").length).toBe(0);
    expect(container.querySelectorAll("form").length).toBe(0);
    await teardown(root);
  });

  it("wire lifecycle gate: the transcript read mounts ONLY with a selection and stops on close", async () => {
    const { root, container } = await mountPage({
      path: "/agents/hosts/laptop",
    });
    await actFlush(20);
    const gateway = lastGateway();
    expect(gateway).toBeDefined();
    // S-HOST-LIVE: no selection → ZERO transcript reads (either leg).
    expect(transcriptReads(gateway!)).toBe(0);
    expect(Object.keys(gateway!.hermesCalls).length).toBe(0);

    // A live row click selects the session → the preview mounts → ONE read.
    const row = sessionRow(container, "ex-1:alpha");
    await act(async () => {
      row.click();
    });
    await actWaitUntil(() => {
      expect(preview(container)).not.toBeNull();
      expect(gateway!.transcriptCalls["ex-1:alpha"]).toBeGreaterThanOrEqual(1);
    });
    const readsAtSelection = transcriptReads(gateway!);

    // CLOSE (Esc) → S-HOST-LIVE: the preview unmounts, no further reads.
    const box = preview(container)!;
    await act(async () => {
      box.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await actWaitUntil(() => {
      expect(preview(container)).toBeNull();
    });
    await actFlush(30);
    expect(transcriptReads(gateway!)).toBe(readsAtSelection);
    await teardown(root);
  });

  it("switching sessions retargets the transcript (the old read unmounts)", async () => {
    const { root, container } = await mountPage({
      path: "/agents/hosts/laptop/sessions/ex-1:alpha",
      seededTranscripts: ["ex-1:alpha", "ex-1:beta"],
    });
    await actWaitUntil(() => {
      expect(preview(container)?.textContent).toContain("answer alpha");
    });
    const row = sessionRow(container, "ex-1:beta");
    await act(async () => {
      row.click();
    });
    await actWaitUntil(() => {
      expect(preview(container)?.textContent).toContain("answer beta");
    });
    expect(preview(container)!.textContent).not.toContain("answer alpha");
    // The selected row carries the state (aria-current on the live list).
    const selectedRow = sessionRow(container, "ex-1:beta");
    expect(selectedRow.getAttribute("aria-current")).toBe("true");
    await teardown(root);
  });

  it("Esc and the ✕ button return to S-HOST-LIVE (the route drops the session)", async () => {
    const { root, container } = await mountPage({
      path: "/agents/hosts/laptop/sessions/ex-1:alpha",
      seededTranscripts: ["ex-1:alpha"],
    });
    await actWaitUntil(() => {
      expect(preview(container)).not.toBeNull();
    });
    // ✕ button (the labelled close).
    const close = preview(container)!.querySelector<HTMLButtonElement>(
      'button[aria-label="Close the session preview"]',
    );
    expect(close).not.toBeNull();
    await act(async () => {
      close!.click();
    });
    await actWaitUntil(() => {
      expect(preview(container)).toBeNull();
    });
    // The live list survives (S-HOST-LIVE) — the rows are still offered.
    expect(liveRows(container).length).toBe(2);
    await teardown(root);
  });

  it("an unknown deep-link id gets the honest not-found and NEVER a transcript read", async () => {
    const { root, container } = await mountPage({
      path: "/agents/hosts/laptop/sessions/ex-1:ghost",
    });
    await actWaitUntil(() => {
      expect(container.textContent).toContain(
        "not among the host's live sessions",
      );
    });
    expect(preview(container)).toBeNull();
    const gateway = lastGateway();
    expect(gateway).toBeDefined();
    await actFlush(30);
    expect(transcriptReads(gateway!)).toBe(0);
    // The honest exits: back to the host + the Kora deep link.
    expect(
      container.querySelector<HTMLAnchorElement>('a[href="/agents/hosts/laptop"]'),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLAnchorElement>(
        `a[href="/kora/${encodeURIComponent("ex-1:ghost")}"]`,
      ),
    ).not.toBeNull();
    await teardown(root);
  });
});

describe("W3 S-SESSION: the operations menu", () => {
  const openMenu = async (container: HTMLElement): Promise<HTMLElement> => {
    const trigger = preview(container)!.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="menu"]',
    )!;
    await act(async () => {
      trigger.click();
    });
    return await actWaitUntil(() => {
      const menu = container.querySelector<HTMLElement>('[role="menu"]');
      expect(menu).not.toBeNull();
      return menu!;
    });
  };

  it("carries the REAL operations only: open in Kora, copy link, copy id", async () => {
    const { root, container } = await mountPage({
      path: "/agents/hosts/laptop/sessions/ex-1:alpha",
      seededTranscripts: ["ex-1:alpha"],
    });
    await actWaitUntil(() => {
      expect(preview(container)).not.toBeNull();
    });
    const menu = await openMenu(container);
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    expect(items.length).toBe(3);
    expect(
      (items[0] as HTMLAnchorElement).getAttribute("href"),
    ).toBe(`/kora/${encodeURIComponent("ex-1:alpha")}`);
    await teardown(root);
  });

  it("Esc closes the MENU first — the session selection stays (S-SESSION)", async () => {
    const { root, container, readPath } = await mountPage({
      path: "/agents/hosts/laptop/sessions/ex-1:alpha",
      seededTranscripts: ["ex-1:alpha"],
    });
    await actWaitUntil(() => {
      expect(preview(container)).not.toBeNull();
    });
    await openMenu(container);
    await act(async () => {
      container
        .querySelector<HTMLElement>('[role="menu"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
    });
    await actFlush(20);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    // The menu consumed the Esc: the preview (and the route) survive.
    expect(preview(container)).not.toBeNull();
    expect(readPath()).toBe("/agents/hosts/laptop/sessions/ex-1:alpha");
    await teardown(root);
  });

  it("right-click on the header opens the menu at the pointer (the contextmenu path)", async () => {
    const { root, container } = await mountPage({
      path: "/agents/hosts/laptop/sessions/ex-1:alpha",
      seededTranscripts: ["ex-1:alpha"],
    });
    await actWaitUntil(() => {
      expect(preview(container)).not.toBeNull();
    });
    const header = preview(container)!.querySelector<HTMLElement>("div");
    await act(async () => {
      header!.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 60,
        }),
      );
    });
    await actWaitUntil(() => {
      expect(container.querySelector('[role="menu"]')).not.toBeNull();
    });
    await teardown(root);
  });

  it("copy link writes the KORA deep link to the clipboard", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const { root, container } = await mountPage({
      path: "/agents/hosts/laptop/sessions/ex-1:alpha",
      seededTranscripts: ["ex-1:alpha"],
    });
    await actWaitUntil(() => {
      expect(preview(container)).not.toBeNull();
    });
    const menu = await openMenu(container);
    const copyLink = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')][1]!;
    await act(async () => {
      copyLink.click();
    });
    await actFlush(20);
    expect(writeText).toHaveBeenCalledTimes(1);
    const written = writeText.mock.calls[0]![0]!;
    expect(written).toContain(`/kora/${encodeURIComponent("ex-1:alpha")}`);
    expect(written.startsWith("http")).toBe(true);
    await teardown(root);
  });
});

describe("W3 routing: the live rows select in place, Kora stays reachable", () => {
  it("a live row click navigates to the agents session route (S-HOST-LIVE → S-SESSION)", async () => {
    const { root, container, readPath } = await mountPage({
      path: "/agents/hosts/laptop",
    });
    await actFlush(20);
    const rows = liveRows(container);
    expect(rows.length).toBe(2);
    expect(rows[0]!.getAttribute("href")).toBe(
      `/agents/hosts/laptop/sessions/${encodeURIComponent("ex-1:alpha")}`,
    );
    await act(async () => {
      rows[0]!.click();
    });
    await actWaitUntil(() => {
      expect(preview(container)).not.toBeNull();
    });
    expect(readPath()).toBe(
      `/agents/hosts/laptop/sessions/${encodeURIComponent("ex-1:alpha")}`,
    );
    await teardown(root);
  });
});
