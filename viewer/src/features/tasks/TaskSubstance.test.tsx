// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TaskDetailPage } from "./TaskDetailPage";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import { ApiError } from "@/lib/errors";
import type {
  BoardTask,
  SubstanceAssignment,
  SubstanceReport,
  TaskSubstance,
} from "@/gateway/boardTypes";

/**
 * The substance tab (P1 «карточка = вещество») against the pinned wire
 * contract of GET /api/tasks/{id}/substance (server: TaskSubstanceOut +
 * Substance*Out, tests/test_task_substance.py). The fixtures below MIRROR
 * the server-side test corpus so both sides of the wire stay honest:
 *
 * - full payload: plan = task.spec/summary as written; reports
 *   chronological (oldest first), the live final marked, the superseded
 *   final muted WITH its flag, agent names display-first + slug badge,
 *   slug_ok=false keeps the raw name (never dropped, never rewritten);
 * - honest empties: a task the loop never touched renders FACTS in words
 *   («нет данных»), never a skeleton;
 * - review: the contract null renders as a visible honest line in EVERY
 *   state — «источника ревью в базе нет», never a hidden section;
 * - failure classes: 404 → substanceNotFound, 401 → substanceNoAccess.
 *
 * En labels are pinned by the provider (initialLang="en"), matching the
 * i18n contract under test; assertions are section-scoped via the
 * aria-labels the tab renders.
 */

const TASK_ID = "TB-1"; // present in the board projection seed (boardFixtures)

let reportSeq = 0;
function makeReport(
  overrides: Partial<SubstanceReport> & Pick<SubstanceReport, "kind" | "body">,
): SubstanceReport {
  reportSeq += 1;
  return {
    id: reportSeq,
    agent: "",
    agent_slug: "",
    agent_slug_ok: false,
    human_body: "",
    superseded: false,
    created_at: "2026-10-22T09:00:00Z",
    ...overrides,
  };
}

function makeAssignment(
  overrides: Partial<SubstanceAssignment> &
    Pick<SubstanceAssignment, "state" | "harness">,
): SubstanceAssignment {
  return {
    id: 7,
    specialist: "",
    specialist_slug: "",
    specialist_slug_ok: false,
    created_by: "",
    claimed_by: "",
    executor_id: "",
    claimed_by_executor: "",
    note: "",
    topics: [],
    attempts: 0,
    created_at: "2026-10-22T11:00:00Z",
    claimed_at: "",
    started_at: "",
    heartbeat_at: "",
    finished_at: "",
    ...overrides,
  };
}

/** The typed board TaskOut (server regen — TaskSubstanceOut.task is no
 * longer an anonymous dict); mirrors the server-side make_task shape. */
function makeTaskOut(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: TASK_ID,
    col: "open",
    position: 0,
    title: "Substance fixture card",
    summary: "",
    spec: "",
    agents: [],
    specialists: [],
    env: "local",
    project: "repro",
    memory_ids: [],
    mnemos_tags: [],
    created_at: "2026-10-22T08:00:00Z",
    updated_at: "2026-10-22T08:00:00Z",
    archived: 0,
    status: "open",
    priority: "normal",
    archived_from: "",
    validating_since: "",
    resolved_at: "",
    done_at: "",
    human_view: "",
    ...overrides,
  };
}

/** Full composite, mirroring the server corpus: slug hits AND the honest
 * slug miss, a superseded final kept flagged, a live final picked, one
 * nomination history with a live active pick, one session fact with the
 * glue id, one linked memory id (board-DB truth, no resolution). */
function fullSubstance(): TaskSubstance {
  const liveFinal = makeReport({
    id: 3,
    kind: "final",
    agent: "gcw-tech-lead",
    agent_slug: "gcw-tech-lead",
    agent_slug_ok: true,
    body: "final draft v2: guard patched, regression test added",
    superseded: false,
    created_at: "2026-10-22T12:00:00Z",
  });
  return {
    ok: true,
    task_id: TASK_ID,
    task: makeTaskOut({
      summary: "Fix the login redirect loop",
      spec: "Steps: reproduce, patch the guard, add a regression test.",
    }),
    reports: {
      count: 3,
      live_count: 2,
      final: liveFinal,
      items: [
        makeReport({
          id: 1,
          kind: "intermediate",
          agent: "@GCW: Tech Lead",
          agent_slug: "gcw-tech-lead",
          agent_slug_ok: true,
          body: "step one done: reproduced the loop",
          created_at: "2026-10-22T09:00:00Z",
        }),
        makeReport({
          id: 2,
          kind: "final",
          agent: "Максим",
          agent_slug: "",
          agent_slug_ok: false,
          body: "final draft v1 (early attempt)",
          superseded: true,
          created_at: "2026-10-22T10:30:00Z",
        }),
        liveFinal,
      ],
    },
    executors: {
      count: 2,
      active: makeAssignment({
        state: "queued",
        harness: "zcode",
        specialist: "gcw-qa-engineer",
        specialist_slug: "gcw-qa-engineer",
        specialist_slug_ok: true,
        attempts: 2,
      }),
      items: [
        makeAssignment({
          id: 6,
          state: "cancelled",
          harness: "codex",
          specialist: "gcw-designer",
          finished_at: "2026-10-22T10:00:00Z",
        }),
        makeAssignment({
          state: "queued",
          harness: "zcode",
          specialist: "gcw-qa-engineer",
          specialist_slug: "gcw-qa-engineer",
          specialist_slug_ok: true,
          attempts: 2,
        }),
      ],
    },
    sessions: {
      count: 1,
      items: [
        {
          session_id: "exec-1:sess_abc",
          executor_id: "exec-1",
          executor_name: "zcode worker",
          native_id: "sess_abc",
          task_id: TASK_ID,
          harness: "zcode",
          specialist: "gcw-tech-lead",
          path: "/home/u/sessions/sess_abc.jsonl",
          tool_calls: 12,
          duration_s: 340.2,
          started_at: "2026-10-22T10:04:11Z",
          ended_at: "",
          parent_native_id: "",
          first_seen_at: "2026-10-22T10:04:12Z",
          reported_at: "2026-10-22T10:09:52Z",
          reported_age_s: 42,
        },
      ],
    },
    memories: {
      count: 1,
      linked: ["m-1"],
      items: {},
      unresolved: [],
      sources: {},
    },
    review: null,
  };
}

/** The fresh-task answer from the server contract test: every source
 * honestly empty (count 0 / null / []), review the explicit null. */
function emptySubstance(): TaskSubstance {
  return {
    ok: true,
    task_id: TASK_ID,
    task: makeTaskOut({ summary: "Card the loop never touched", spec: "" }),
    reports: { count: 0, live_count: 0, final: null, items: [] },
    executors: { count: 0, active: null, items: [] },
    sessions: { count: 0, items: [] },
    memories: { count: 0, linked: [], items: {}, unresolved: [], sources: {} },
    review: null,
  };
}

/** The asymmetric empty (review tail task-substance-p3-tail (г)): the
 * agents produced NO session facts but the owner DID link memories — the
 * sessions half must still state its emptiness in words. */
function sessionsEmptyMemoriesLinked(): TaskSubstance {
  return {
    ...emptySubstance(),
    task: makeTaskOut({ summary: "Card with memories but no sessions", spec: "" }),
    memories: { count: 1, linked: ["m-7"], items: {}, unresolved: [], sources: {} },
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let queryClient: QueryClient | null = null;

async function mountSubstanceTab(
  stub: (taskId: string, signal?: AbortSignal) => Promise<TaskSubstance>,
): Promise<Mock> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  const gateway = new MockAdapter({ latency: false });
  const taskSubstanceMock = vi.fn(stub);
  // MockAdapter predates the substance capability on purpose (the page
  // probes it structurally); grafting the stub keeps the rest of the Ф2
  // seed (board projection) real.
  Object.assign(gateway, { taskSubstance: taskSubstanceMock });
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
              <I18nProvider initialLang="en">
                <MemoryRouter initialEntries={[`/tasks/${TASK_ID}?tab=substance`]}>
                  <Routes>
                    <Route path="/tasks/:id" element={<TaskDetailPage />} />
                  </Routes>
                </MemoryRouter>
              </I18nProvider>
            </UiTokenProvider>
          </ToastProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return taskSubstanceMock;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function section(label: string): HTMLElement | null {
  return document.querySelector(`section[aria-label="${label}"]`);
}

function textOf(el: HTMLElement | null): string {
  return el?.textContent ?? "";
}

/** Leaf spans with exact text — Badge renders a bare <span>, so this
 * counts badge instances without matching ancestor textContent. */
function leafSpans(scope: HTMLElement, text: string): HTMLElement[] {
  return Array.from(scope.querySelectorAll("span")).filter(
    (span) => span.childElementCount === 0 && span.textContent === text,
  );
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  queryClient = null;
});

describe("TaskDetailPage — substance tab vs the wire contract (P1)", () => {
  it("full payload: plan as written, chronological reports with live-final mark, muted superseded row, display+slug agent names, executors, sessions+memory, and the honest review line", async () => {
    let resolveSubstance!: (value: TaskSubstance) => void;
    const taskSubstanceMock = await mountSubstanceTab(
      () =>
        new Promise<TaskSubstance>((resolve) => {
          resolveSubstance = resolve;
        }),
    );

    // Pending state first: a skeleton under an honest status role.
    const loading = document.querySelector('[role="status"]');
    expect(loading?.getAttribute("aria-label")).toBe(
      "Loading the card substance",
    );

    await act(async () => {
      resolveSubstance(fullSubstance());
    });
    await settle();

    // The composite read fired exactly once, for THIS card, at card open.
    expect(taskSubstanceMock).toHaveBeenCalledTimes(1);
    expect(taskSubstanceMock).toHaveBeenCalledWith(
      TASK_ID,
      expect.anything(),
    );
    expect(
      document.querySelector('[aria-label="Loading the card substance"]'),
    ).toBeNull();

    // План: spec/summary exactly as the owner wrote them.
    const plan = textOf(section("Plan"));
    expect(plan).toContain("Fix the login redirect loop");
    expect(plan).toContain("Steps: reproduce, patch the guard");

    // Отчёты: the header meta counts the wire truth (3 rows, 2 live).
    const reports = section("Reports");
    expect(reports).not.toBeNull();
    expect(textOf(reports)).toContain("3 total · 2 live");

    // Chronological: oldest first, superseded finals stay in the list.
    const order = textOf(reports);
    expect(order.indexOf("step one done: reproduced the loop")).toBeGreaterThan(-1);
    expect(order.indexOf("step one done: reproduced the loop")).toBeLessThan(
      order.indexOf("final draft v1 (early attempt)"),
    );
    expect(order.indexOf("final draft v1 (early attempt)")).toBeLessThan(
      order.indexOf("final draft v2: guard patched, regression test added"),
    );

    // The live final is marked exactly once; the superseded row keeps its
    // flag and the muted treatment, the live row does not.
    expect(leafSpans(reports!, "live final")).toHaveLength(1);
    expect(leafSpans(reports!, "superseded")).toHaveLength(1);
    const mutedRow = Array.from(reports!.querySelectorAll("details")).find(
      (row) => row.textContent?.includes("final draft v1 (early attempt)"),
    );
    expect(mutedRow?.className).toContain("opacity-60");
    const liveRow = Array.from(reports!.querySelectorAll("details")).find(
      (row) =>
        row.textContent?.includes(
          "final draft v2: guard patched, regression test added",
        ),
    );
    expect(liveRow?.className).not.toContain("opacity-60");

    // Agent names: display first; the slug badge only when the server
    // normalized it. slug_ok=false keeps «Максим» raw with NO slug badge
    // (the row's only mono span is the timestamp).
    expect(textOf(reports)).toContain("@GCW: Tech Lead");
    expect(textOf(reports)).toContain("Максим");
    const maximRow = Array.from(reports!.querySelectorAll("summary")).find(
      (summary) => summary.textContent?.includes("Максим"),
    );
    expect(maximRow?.querySelectorAll(".font-mono")).toHaveLength(1);
    const slugRow = Array.from(reports!.querySelectorAll("summary")).find(
      (summary) => summary.textContent?.includes("@GCW: Tech Lead"),
    );
    expect(slugRow?.textContent).toContain("gcw-tech-lead");

    // Исполнители: the active nomination plus the full history.
    const executors = textOf(section("Executors"));
    expect(executors).toContain("Active nomination");
    expect(executors).toContain("Nomination history");
    expect(executors).toContain("gcw-qa-engineer");
    expect(executors).toContain("attempts: 2");

    // Сессии и память: the fact row by its human projection (executor
    // display name, harness, effort), the live-session badge (no
    // ended_at), and the board-DB memory id. The glue session_id and the
    // host path stay off-card by design — the card shows human facts.
    const sessionsMemory = textOf(section("Sessions and memory"));
    expect(sessionsMemory).toContain("Work sessions");
    expect(sessionsMemory).toContain("zcode worker");
    expect(sessionsMemory).toContain("12 · 340s");
    expect(sessionsMemory).toContain("live session");
    expect(sessionsMemory).toContain("Linked memories");
    expect(sessionsMemory).toContain("m-1");

    // Ревью: the contract null is a VISIBLE line, not a hidden section.
    const reviewLine = document.querySelector(
      'p[data-substance-review="none"]',
    );
    expect(reviewLine?.textContent).toBe(
      "No review source exists in the database.",
    );
    expect(section("Review")).not.toBeNull();
  });

  it("honest empties: a task the loop never touched renders facts in words, never a skeleton", async () => {
    await mountSubstanceTab(async () => emptySubstance());
    await settle();

    // No skeleton left pending, no fake rows.
    expect(
      document.querySelector('[aria-label="Loading the card substance"]'),
    ).toBeNull();

    const plan = textOf(section("Plan"));
    expect(plan).toContain("Card the loop never touched");

    // Reports: the honest «no reports yet» line with its hint.
    const reports = textOf(section("Reports"));
    expect(reports).toContain("No reports yet");
    expect(reports).toContain("Agents have not reported on this task so far.");

    // Executors: «No nominations so far».
    expect(textOf(section("Executors"))).toContain("No nominations so far");

    // Sessions and memory: BOTH empty is a stated fact, not a skeleton.
    expect(textOf(section("Sessions and memory"))).toContain(
      "No data from agents: no work sessions, no linked memories.",
    );

    // The review line survives the empty state too — never hidden.
    expect(
      document.querySelector('p[data-substance-review="none"]')?.textContent,
    ).toBe("No review source exists in the database.");
  });

  it("404 on an unknown task renders the honest not-found state", async () => {
    await mountSubstanceTab(async () => {
      throw new ApiError(404, "no such task");
    });
    await settle();

    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      "Task not found — substance unavailable",
    );
    // The failure replaces the whole tab: no review line, no sections.
    expect(document.querySelector('p[data-substance-review="none"]')).toBeNull();
  });

  it("401 renders the no-access state (owner session required)", async () => {
    await mountSubstanceTab(async () => {
      throw new ApiError(401, "owner session required");
    });
    await settle();

    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      "No access to the task substance (owner session required)",
    );
  });

  it("a generic error (500) keeps the Retry escape; clicking it refetches and recovers", async () => {
    // Review tail task-substance-p3-tail (в): the failure classes the
    // contract pins (401/404) speak for themselves; everything else must
    // keep the retry leg LIVE — asserted here with a real second fetch.
    const payload = fullSubstance();
    let calls = 0;
    const taskSubstanceMock = await mountSubstanceTab(async () => {
      calls += 1;
      if (calls === 1) throw new ApiError(500, "transient collector failure");
      return payload;
    });
    await settle();

    expect(taskSubstanceMock).toHaveBeenCalledTimes(1);
    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Could not load the card substance");
    expect(alert?.textContent).toContain("transient collector failure");

    // The Retry button is the tab's only way forward — click it.
    const retry = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Retry",
    );
    expect(retry, "the generic error leg renders a Retry button").toBeDefined();
    await act(async () => {
      retry!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();

    // The refetch fired and the tab recovered into the full payload.
    expect(taskSubstanceMock).toHaveBeenCalledTimes(2);
    expect(
      document.querySelector('[role="alert"]'),
    ).toBeNull();
    expect(textOf(section("Plan"))).toContain("Fix the login redirect loop");
    expect(
      document.querySelector('p[data-substance-review="none"]')?.textContent,
    ).toBe("No review source exists in the database.");
  });

  it("sessions empty + memories linked: the sessions half states its emptiness in words, the memory ids still render", async () => {
    // Review tail task-substance-p3-tail (г): the BOTH-empty sentence must
    // not swallow the asymmetric case — an empty half is a stated fact,
    // never an omitted section (ME-062 §5 honesty).
    await mountSubstanceTab(async () => sessionsEmptyMemoriesLinked());
    await settle();

    const sessionsMemory = section("Sessions and memory");
    expect(sessionsMemory).not.toBeNull();
    const verbalEmpty = sessionsMemory!.querySelector(
      "p[data-substance-sessions-empty]",
    );
    expect(verbalEmpty?.textContent).toBe("No work sessions");
    // The linked memories (board-DB truth) render next to the words.
    expect(textOf(sessionsMemory)).toContain("Linked memories");
    expect(textOf(sessionsMemory)).toContain("m-7");
    // ...and NOT the BOTH-empty sentence (it names two absences, only one
    // is true here).
    expect(textOf(sessionsMemory)).not.toContain(
      "No data from agents: no work sessions, no linked memories.",
    );
  });
});
