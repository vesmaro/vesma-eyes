// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { isRawFieldDump, TaskInboxPage } from "./TaskInboxPage";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import type { TaskInbox } from "@/gateway/boardTypes";
import type { Memory } from "@/gateway/types";

/**
 * W-B (D6, user-panel verdict): the inbox card is a human assignment —
 * the raw `id: … owner: … gates: …` field dump NEVER renders on the card
 * face (it lives under the «Raw record from memory» spoiler), free-form
 * excerpts stay visible, and the assignee line names to whom the work is
 * assigned (the specialist tag feeds task.specialists on adopt — review
 * P1: the DOER, never «the asker»).
 */

/** The corpus dump shape (prod task:queue records open like this). */
const DUMP_EXCERPT =
  "id: gcw-design-department-3d title: Дизайн-департамент · Design Lead + 3D Artist " +
  "owner: gcw-agent-architect (actionitems: kanban) gates: gcw-tech-lead priority: P1 " +
  "size: M status: in-progress created_at: 2026-10-06 depends_on: []";

/** The source record the expanded card fetches (content = the dump). */
const DUMP_MEMORY: Memory = {
  id: "dump-1",
  server: "laptop",
  title: "Дизайн-департамент · Design Lead + 3D Artist",
  content: DUMP_EXCERPT,
  tags: ["project:gcw", "task:queue"],
  created_at: "2026-10-06T07:00:00+00:00",
  status: "ok",
} as unknown as Memory;

/** A gateway serving one dump-shaped record on the face. */
class DumpInboxGateway extends MockAdapter {
  override async inbox(): Promise<TaskInbox> {
    return {
      items: [
        {
          memory_id: "dump-1",
          server: "laptop",
          project: "gcw",
          title: "Дизайн-департамент · Design Lead + 3D Artist",
          excerpt: DUMP_EXCERPT,
          tags: ["project:gcw", "task:queue"],
          priority: "high",
          specialist: "@GCW: Agent Architect",
          created_at: "2026-10-06T07:00:00+00:00",
          last_seen: "2026-10-08T09:00:00+00:00",
          stale: false,
          adopted: false,
          adopted_task_id: null,
        },
      ],
      count: 1,
      refreshed_at: "2026-10-08T09:00:00+00:00",
    };
  }

  override async getMemory(): Promise<Memory> {
    return DUMP_MEMORY;
  }
}

async function renderProviders(gateway: MockAdapter, container: HTMLElement): Promise<void> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await queryClient.prefetchQuery({
    queryKey: keys.tasks.inbox({ include_adopted: false }),
    queryFn: () => gateway.inbox({ include_adopted: false }),
  });
  createRoot(container).render(
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

async function waitFor(what: string, probe: () => boolean, html: () => string): Promise<void> {
  const deadline = Date.now() + 3000;
  for (;;) {
    if (probe()) return;
    if (Date.now() > deadline) {
      throw new Error(`waitFor(${what}) timed out; html: ${html().slice(0, 400)}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

async function click(target: Element | null | undefined): Promise<void> {
  expect(target, "interaction target must exist").toBeDefined();
  await act(async () => {
    target!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function renderSsr(gateway: MockAdapter): Promise<string> {
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

describe("isRawFieldDump (D6 face filter)", () => {
  it("flags the corpus id:/owner:/gates: dump shape", () => {
    expect(isRawFieldDump(DUMP_EXCERPT)).toBe(true);
  });

  it("keeps free-form human excerpts on the face", () => {
    expect(isRawFieldDump("Симптом: поиск отдаёт устаревшие сниппеты…")).toBe(false);
    expect(isRawFieldDump("manifest + theme-color + иконки 192/512…")).toBe(false);
  });

  it("is conservative: id: alone without a second field is not a dump", () => {
    expect(isRawFieldDump("id: 123 — просто текст про идентификатор")).toBe(false);
    expect(isRawFieldDump("")).toBe(false);
  });
});

describe("TaskInboxPage — D6 human assignment card", () => {
  it("a dump-shaped excerpt never reaches the card face", async () => {
    const html = await renderSsr(new DumpInboxGateway({ latency: false }));
    expect(html).not.toContain("id: gcw-design-department-3d");
    expect(html).not.toContain("gates: gcw-tech-lead");
    // The human layer of the same card stays.
    expect(html).toContain("Дизайн-департамент · Design Lead + 3D Artist");
  });

  it("the assignee line names who the work is FOR; the scan hint rides the button", async () => {
    const html = await renderSsr(new DumpInboxGateway({ latency: false }));
    expect(html).toContain("assignment for @GCW: Agent Architect");
    expect(html).not.toContain("assignment from");
    expect(html).toContain("records tagged task:queue land in the inbox");
  });

  it("the dump appears only under the spoiler, labelled «Raw record»", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const gateway = new DumpInboxGateway({ latency: false });
    await renderProviders(gateway, container);
    await act(async () => {});
    const html = () => container.innerHTML;
    await waitFor("the inbox card", () => html().includes("Дизайн-департамент"), html);

    // Face is clean before the expand…
    expect(html()).not.toContain("id: gcw-design-department-3d");
    // …the expand chevron opens the raw layer…
    const expander = [...container.querySelectorAll("button")].find((button) =>
      button.getAttribute("aria-label")?.includes("Record details"),
    );
    await click(expander);
    // The heading renders at once; wait for the fetched record body itself.
    await waitFor("the raw record body", () => html().includes("Raw record from memory") && html().includes("id: gcw-design-department-3d"), html);
    // …and the dump is THERE — under the spoiler, nowhere else.
    expect(html()).toContain("Raw record from memory");
    expect(html()).toContain("id: gcw-design-department-3d");
    const faceEnd = html().indexOf("Raw record from memory");
    expect(html().indexOf("id: gcw-design-department-3d")).toBeGreaterThan(faceEnd);
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
