// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CreateTaskDialog } from "./CreateTaskDialog";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { UiTokenProvider } from "@/features/ui-token/UiTokenProvider";
import { actFlush, actUnmount, actWaitUntil } from "@/test/actTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The task-formation conveyor (U8; the v12 wizard «Что → Кому → Проверка»
 * on the main engine). Covered:
 *
 * - the rail earns its steps: What (the Ф3 form) → Whom (radio cards with
 *   honest start promises) → Review (the summary of what will travel);
 * - the QUEUE path: create only — one POST /api/tasks, dialog closes;
 * - the EXECUTOR path: the engine's REAL fields revealed (specialist is
 *   min_length=1 on the wire — the gate is mirrored before anything
 *   travels), and the hand-off rides the SAME gated mutation the assign
 *   sheet uses (one implementation of the operation);
 * - the draft persists SAFE fields and restores with the NAMED banner;
 *   «Начать заново» clears it.
 */

interface Mount {
  root: Root;
  gateway: MockAdapter;
  container: HTMLElement;
  onOpenChange: ReturnType<typeof vi.fn>;
  createTaskSpy: ReturnType<typeof vi.spyOn>;
  createAssignmentSpy: ReturnType<typeof vi.spyOn>;
}

async function mountDialog(): Promise<Mount> {
  const gateway = new MockAdapter({ latency: false });
  const createTaskSpy = vi.spyOn(gateway, "createTask");
  const createAssignmentSpy = vi.spyOn(gateway, "createAssignment");
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onOpenChange = vi.fn();
  await act(async () => {
    root.render(
      <GatewayContext.Provider value={gateway}>
        <QueryClientProvider client={queryClient}>
          {/* The created-task toast carries a Link — the router context is
           * part of the REAL tree the dialog lives in. */}
          <MemoryRouter>
            <ToastProvider>
              <UiTokenProvider>
                <I18nProvider initialLang="en">
                  <CreateTaskDialog open onOpenChange={onOpenChange} />
                </I18nProvider>
              </UiTokenProvider>
            </ToastProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  await actWaitUntil(() => {
    expect(document.body.textContent).toContain("What to do");
  });
  // The boot auth probe + the board/executors reads settle on later tasks;
  // interacting before them makes the gated mutation defer mid-test.
  await actFlush(250);
  return { root, gateway, container, onOpenChange, createTaskSpy, createAssignmentSpy };
}

const buttonByText = (text: string): HTMLButtonElement =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  )!;

const inputById = (id: string): HTMLInputElement | HTMLTextAreaElement =>
  document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;

async function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  // React controlled inputs need the PROTOTYPE setter — a plain .value
  // assignment never reaches the onChange handler (ExecutorSheet pattern).
  const proto = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  await act(async () => {
    nativeSetter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const currentRailButton = (): HTMLButtonElement | undefined =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.getAttribute("aria-current") === "step",
  );

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("CreateTaskDialog — the formation conveyor (U8)", () => {
  it("the rail earns its steps What → Whom → Review; the queue path creates via one POST", async () => {
    const { root, gateway, onOpenChange, createTaskSpy } = await mountDialog();
    expect(currentRailButton()?.textContent).toContain("What");
    // The forward gate is REAL: an empty title (the wire refuses it) does
    // not earn step 2.
    await act(async () => {
      buttonByText("Next").click();
    });
    expect(currentRailButton()?.textContent).toContain("What");

    await type(inputById("create-text"), "Собрать отчёт волны 2\nитоги и метрики");
    await act(async () => {
      buttonByText("Next").click();
    });
    await actWaitUntil(() => {
      expect(currentRailButton()?.textContent).toContain("Whom");
      // The v12 equal first-class default: the queue card is lit.
      const queueRadio = document.querySelector<HTMLInputElement>(
        'input[name="create-assignee"]',
      )!;
      expect(queueRadio.checked).toBe(true);
    });

    await act(async () => {
      buttonByText("Next").click();
    });
    await actWaitUntil(() => {
      expect(currentRailButton()?.textContent).toContain("Review");
      expect(document.body.textContent).toContain("Собрать отчёт волны 2");
    });
    expect(document.body.textContent).toContain("Queue — no executor yet");

    buttonByText("Create task").click();
    await actFlush(500);
    await actWaitUntil(() => {
      expect(createTaskSpy).toHaveBeenCalledTimes(1);
    });
    const payload = createTaskSpy.mock.calls[0]![0]!;
    expect(payload.title).toBe("Собрать отчёт волны 2");
    expect(payload.summary).toBe("итоги и метрики");
    // The queue path stops at creation — no assignment travels.
    expect(gateway.createAssignment).not.toHaveBeenCalled();
    await actWaitUntil(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    await actUnmount(root);
  });

  it("the executor hand-off reveals the engine's REAL fields and rides the SAME assignment mutation", async () => {
    const { root, onOpenChange, createAssignmentSpy } = await mountDialog();
    await type(inputById("create-text"), "Починить поллер");
    await act(async () => {
      buttonByText("Next").click();
    });
    // A non-queue card reveals the fields the assignment POST truly needs.
    // The registry rows land with the executors query — wait for them.
    await actWaitUntil(() => {
      const radios = [
        ...document.querySelectorAll<HTMLInputElement>('input[name="create-assignee"]'),
      ];
      expect(radios.length).toBeGreaterThan(1);
    });
    const radios = [
      ...document.querySelectorAll<HTMLInputElement>('input[name="create-assignee"]'),
    ];
    const executorRadio = radios.find((radio) => !radio.disabled && radio !== radios[0]!)!;
    await act(async () => {
      executorRadio.click();
    });
    expect(document.getElementById("create-specialist")).not.toBeNull();

    // The wire refuses an empty specialist — the gate is mirrored BEFORE
    // the review step can be reached.
    await act(async () => {
      buttonByText("Next").click();
    });
    await actWaitUntil(() => {
      expect(currentRailButton()?.textContent).toContain("Whom");
      expect(document.body.textContent).toContain(
        "the assignment engine needs a specialist",
      );
    });

    await type(inputById("create-specialist"), "SFE");
    await act(async () => {
      buttonByText("Next").click();
    });
    await actWaitUntil(() => {
      expect(currentRailButton()?.textContent).toContain("Review");
      expect(document.body.textContent).toContain("specialist SFE");
    });
    // The honest verb: a direct hand-off is «Give the task», not «Create».
    expect(buttonByText("Give the task")).toBeDefined();

    await act(async () => {
      buttonByText("Give the task").click();
    });
    await actWaitUntil(() => {
      expect(createAssignmentSpy).toHaveBeenCalledTimes(1);
    });
    const payload = createAssignmentSpy.mock.calls[0]![0]!;
    expect(payload.specialist).toBe("SFE");
    expect(payload.executor_id).not.toBe("");
    await actWaitUntil(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    await actUnmount(root);
  });

  it("the draft persists SAFE fields, restores with the NAMED banner, and «Start over» clears", async () => {
    const first = await mountDialog();
    await type(inputById("create-text"), "Черновая задача");
    await type(inputById("create-project"), "vesma-eyes");
    const raw = localStorage.getItem("vesmaro.flow.taskcreate") ?? "";
    expect(raw).toContain("Черновая задача");
    await actUnmount(first.root);

    const second = await mountDialog();
    expect(document.body.textContent).toContain("Draft restored after reload");
    expect((inputById("create-text") as HTMLTextAreaElement).value).toBe(
      "Черновая задача",
    );
    expect((inputById("create-project") as HTMLInputElement).value).toBe("vesma-eyes");
    buttonByText("Start over").click();
    await actFlush(300);
    expect((inputById("create-text") as HTMLTextAreaElement).value).toBe("");
    expect(localStorage.getItem("vesmaro.flow.taskcreate")).toBeNull();
    await actUnmount(second.root);
  });
});
