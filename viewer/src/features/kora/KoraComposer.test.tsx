// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  KoraIntentAbandonedPayload,
  KoraIntentCompletedPayload,
  KoraIntentEntryPoint,
  KoraIntentEventPoints,
} from "./koraIntentEvents";
import { KoraComposer } from "./KoraComposer";
import { KoraError, type KoraGateway } from "./koraGateway";
import { KoraGatewayContext } from "./koraGatewayContext";
import { ApiError } from "@/lib/errors";
import type { KoraMessageAccepted, KoraSession } from "./koraTypes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/i18n";
import { actFlush, actUnmount } from "@/test/actTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The composer state machine (07j §4.6, И1 honest cut): the field and the
 * machine are REAL — typing, Enter/Shift+Enter, the draft in page memory.
 * The contract under test:
 * - WITHOUT the relay signal the send button renders ONLY for a non-empty
 *   draft and is DISABLED with a visible chip + service line (never a
 *   tooltip-only reason); Enter ANNOUNCES the deferred status politely;
 * - NO fake delivery: «в очереди»/«доставлено» never render without a
 *   REAL server verdict (07a §1);
 * - a dead session disables the FIELD itself with the interrupted note;
 * - the intent call points fire started/abandoned (ME-035 taxonomy seam).
 *
 * A1 (the relay leg): with `relayAlive` (the honest PER-SESSION
 * executors-registry derivation — the session's own executor qualifies)
 * + a steerable session the button LIVES — the POST goes out
 * and the REAL KoraDelivery verdict from the 202 body renders (queued /
 * delivered / failed-retryable «повторите» = a NEW POST; a refusal names
 * itself — the step-up plate, the 401 sign-in plate, the server's reason). Accepted verdicts
 * clear the draft; failures keep it (the retry resends the same text).
 *
 * В2: the composer carries the selector row (KoraComposerControls) — its
 * own behaviors live in KoraComposerControls.test.tsx; here the mount
 * wraps a STUB gateway with an EMPTY roster so the row renders without a
 * specialist slot and the original assertions stay exact.
 */

const mountedRoots: Root[] = [];

/** A gateway stub with an honest EMPTY roster — the specialist slot is
 * not drawn, the harness/model/mode slots need no wire. */
function emptyRosterGateway(): KoraGateway {
  return {
    specialists: () =>
      Promise.resolve({
        ok: true,
        count: 0,
        items: [],
        meta: { generated_at: "2026-10-29T00:00:00+00:00" },
      }),
  } as unknown as KoraGateway;
}

/** A roster stub + the send implementation under test (A1). */
function sendGateway(
  impl: (sessionId: string, text: string) => Promise<KoraMessageAccepted>,
): KoraGateway {
  return {
    ...emptyRosterGateway(),
    sendMessage: impl,
  } as unknown as KoraGateway;
}

function accepted(
  delivery: KoraMessageAccepted["delivery"],
): KoraMessageAccepted {
  return {
    ok: true,
    session_id: "exec-zc:live",
    delivery,
    confirm_required: true,
  };
}

function session(state: KoraSession["state"]): KoraSession {
  return {
    id: `exec-zc:${state}`,
    executor_id: "exec-zc",
    native_id: `sess-${state}`,
    harness: "zcode",
    project: "Тема",
    cwd: null,
    state,
    origin: "relay",
    steerable: true,
    started_at: "2026-09-24T09:12:00Z",
    last_activity_at: "2026-09-24T11:41:00Z",
    age_seconds: 6_000,
    last_line_preview: null,
  };
}

function spyIntentEvents(): KoraIntentEventPoints & {
  started: ReturnType<typeof vi.fn>;
  abandoned: ReturnType<typeof vi.fn>;
  completed: ReturnType<typeof vi.fn>;
} {
  const started = vi.fn();
  const abandoned = vi.fn();
  const completed = vi.fn();
  return {
    started,
    abandoned,
    completed,
    intentStarted: (entryPoint: KoraIntentEntryPoint) => started(entryPoint),
    intentAbandoned: (payload: KoraIntentAbandonedPayload) => abandoned(payload),
    intentCompleted: (payload: KoraIntentCompletedPayload) => completed(payload),
  };
}

function mountComposer(
  sessionState: KoraSession["state"],
  events: KoraIntentEventPoints,
  opts: { relayAlive?: boolean; gateway?: KoraGateway; session?: KoraSession } = {},
): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  act(() => {
    root.render(
      <I18nProvider initialLang="ru">
        <QueryClientProvider client={queryClient}>
          <KoraGatewayContext.Provider
            value={opts.gateway ?? emptyRosterGateway()}
          >
            <KoraComposer
              session={opts.session ?? session(sessionState)}
              intentEvents={events}
              relayAlive={opts.relayAlive}
            />
          </KoraGatewayContext.Provider>
        </QueryClientProvider>
      </I18nProvider>,
    );
  });
  return { container, root };
}

const input = (container: HTMLElement): HTMLTextAreaElement => {
  const found = container.querySelector<HTMLTextAreaElement>("#kora-composer-input");
  if (found === null) throw new Error("composer input not rendered");
  return found;
};

/** React 18 value-tracker-safe typing (the project's DOM-free tests never
 * go through React's synthetic onChange otherwise). */
function typeInto(field: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) {
    await actUnmount(root);
  }
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("KoraComposer (07j §4.6, И1 honest cut)", () => {
  it("renders the field with the sr-only label and the visible deferred-send note", () => {
    const events = spyIntentEvents();
    const { container } = mountComposer("live", events);
    const html = container.innerHTML;
    expect(html).toContain("Написать агенту в эту сессию");
    expect(input(container).placeholder).toBe("Написать агенту…");
    expect(html).toContain(
      "Отправка через реле появится позже: реле-транспорт не подключён или исполнитель выключен. Черновик сохраняется на этой машине и переживёт перезагрузку страницы.",
    );
    // Empty draft ⇒ no send button at all (07j §4.6).
    expect(html).not.toContain(">Отправить<");
  });

  it("shows the DISABLED send button + the «позже» chip only for a non-empty draft", () => {
    const events = spyIntentEvents();
    const { container } = mountComposer("live", events);
    act(() => {
      typeInto(input(container), "доделай кейс");
    });
    const html = container.innerHTML;
    expect(html).toContain(">Отправить<");
    expect(html).toContain("Отправка появится позже");
    const send = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Отправить"),
    );
    expect(send?.disabled).toBe(true);
    // FORBIDDEN (07a §1): no fake delivery statuses ever.
    expect(html).not.toContain("в очереди");
    expect(html).not.toContain("доставлено");
  });

  it("Enter announces the deferred status; Shift+Enter inserts a newline", async () => {
    const events = spyIntentEvents();
    const { container } = mountComposer("live", events);
    const field = input(container);
    act(() => {
      typeInto(field, "доделай кейс");
    });
    await act(async () => {
      field.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    // The acknowledged intent is announced politely (4.1.3).
    expect(container.textContent).toContain("Отправка появится позже");

    await act(async () => {
      field.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    // Shift+Enter is NOT intercepted (the textarea keeps its newline).
    expect(container.querySelector("textarea")).not.toBeNull();
  });

  it("disables the FIELD itself for a dead session with the interrupted note", () => {
    const events = spyIntentEvents();
    const { container } = mountComposer("dead", events);
    expect(input(container).disabled).toBe(true);
    expect(container.textContent).toContain(
      "Сессия прервана — агент здесь уже не слушает",
    );
    // No deferred-send chip on a dead session: there is no one to write to.
    expect(container.innerHTML).not.toContain("Отправка появится позже");
  });

  it("fires the intent call points: started on first character, abandoned on blur with text", async () => {
    const events = spyIntentEvents();
    const { container } = mountComposer("live", events);
    const field = input(container);
    expect(events.started).not.toHaveBeenCalled();

    act(() => {
      typeInto(field, "а");
    });
    expect(events.started).toHaveBeenCalledTimes(1);
    expect(events.started).toHaveBeenCalledWith("input");
    expect(events.abandoned).not.toHaveBeenCalled();

    // React normalizes onBlur onto the BUBBLING focusout (a raw "blur"
    // never reaches React's root listeners) — dispatch the native form.
    await act(async () => {
      field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(events.abandoned).toHaveBeenCalledTimes(1);
    expect(events.abandoned).toHaveBeenCalledWith({ hadText: true });
  });

  it("does not fire abandoned when the intent never started (no text ever)", async () => {
    const events = spyIntentEvents();
    const { container } = mountComposer("live", events);
    await act(async () => {
      input(container).dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(events.started).not.toHaveBeenCalled();
    expect(events.abandoned).not.toHaveBeenCalled();
  });
});

describe("KoraComposer draft persistence (U5, vesmaro.koraDraft:{sessionId})", () => {
  it("keeps the honest save beat: «сохранён» only after the real write, never before", async () => {
    vi.useFakeTimers();
    try {
      const events = spyIntentEvents();
      const { container } = mountComposer("live", events);
      const field = input(container);
      act(() => {
        typeInto(field, "доделай кейс");
      });
      // Before the debounce fires: no claim (no phantom «сохранено»).
      expect(container.textContent).not.toContain("Черновик сохранён");
      await act(async () => {
        vi.advanceTimersByTime(700);
      });
      expect(container.textContent).toContain("Черновик сохранён");
      expect(localStorage.getItem("vesmaro.koraDraft:exec-zc:live")).toBe(
        "доделай кейс",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores the draft on a remount (reload/session-switch survival)", async () => {
    localStorage.setItem("vesmaro.koraDraft:exec-zc:live", "черновик из прошлого");
    const events = spyIntentEvents();
    const { container } = mountComposer("live", events);
    expect(input(container).value).toBe("черновик из прошлого");
  });

  it("an emptied field removes the key and clears the saved claim", async () => {
    vi.useFakeTimers();
    try {
      const events = spyIntentEvents();
      const { container } = mountComposer("live", events);
      const field = input(container);
      act(() => {
        typeInto(field, "текст");
      });
      await act(async () => {
        vi.advanceTimersByTime(700);
      });
      expect(localStorage.getItem("vesmaro.koraDraft:exec-zc:live")).toBe("текст");
      act(() => {
        typeInto(field, "");
      });
      expect(localStorage.getItem("vesmaro.koraDraft:exec-zc:live")).toBeNull();
      expect(container.textContent).not.toContain("Черновик сохранён");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a failed write names itself («не сохранился») instead of lying", async () => {
    vi.useFakeTimers();
    // A storage whose writes fail (private mode / quota): the honest beat
    // names the failure instead of claiming a save.
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    });
    try {
      const events = spyIntentEvents();
      const { container } = mountComposer("live", events);
      act(() => {
        typeInto(input(container), "не сохранится");
      });
      await act(async () => {
        vi.advanceTimersByTime(700);
      });
      expect(container.textContent).toContain("Черновик не сохранился");
      expect(container.textContent).not.toContain("Черновик сохранён");
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("unmount flushes the pending write (a quick session switch loses nothing)", async () => {
    vi.useFakeTimers();
    try {
      const events = spyIntentEvents();
      const mounted = mountComposer("live", events);
      act(() => {
        typeInto(input(mounted.container), "успей сохранить");
      });
      // Unmount BEFORE the debounce fires.
      await actUnmount(mounted.root);
      expect(localStorage.getItem("vesmaro.koraDraft:exec-zc:live")).toBe(
        "успей сохранить",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

/** The deferred-answer handle for the A1 send tests: the stub gateway
 * holds the POST until the test resolves the REAL 202 body it wants. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("KoraComposer relay send (A1 FE leg — the live button + the REAL verdict)", () => {
  it("relay-off (no signal): the button stays DISABLED with the deferred chip — no invented send", () => {
    const events = spyIntentEvents();
    const gateway = sendGateway(() => {
      throw new Error("send must not fire without the relay signal");
    });
    const { container } = mountComposer("live", events, { gateway });
    act(() => {
      typeInto(input(container), "доделай кейс");
    });
    const send = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Отправить"),
    );
    expect(send?.disabled).toBe(true);
    expect(container.textContent).toContain("Отправка появится позже");
    // The honest relay-off service line (the derivation said no).
    expect(container.textContent).toContain(
      "Отправка через реле появится позже",
    );
  });

  it("relay-alive steerable session: the button LIVES, the POST rides the draft, the QUEUED verdict renders verbatim", async () => {
    const events = spyIntentEvents();
    const gate = deferred<KoraMessageAccepted>();
    const send = vi.fn(() => gate.promise);
    const { container } = mountComposer("live", events, {
      relayAlive: true,
      gateway: sendGateway(send),
    });
    act(() => {
      typeInto(input(container), "доделай кейс");
    });
    const button = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Отправить"),
    );
    expect(button?.disabled).toBe(false);
    // No deferred chip on a live send path.
    expect(container.textContent).not.toContain("Отправка появится позже");
    // The honest relay service line replaced the deferred one.
    expect(container.textContent).toContain("Отправка через реле");

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(send).toHaveBeenCalledWith("exec-zc:live", "доделай кейс");
    // In flight: the polite sending status, the button paused.
    expect(container.textContent).toContain("Отправляем…");

    await act(async () => {
      gate.resolve(
        accepted({
          status: "queued",
          queued_at: "2026-10-29T12:00:00+00:00",
          delivered_at: null,
          retryable: true,
          error: null,
        }),
      );
    });
    // Suite canon (actTools): TanStack mutation settlements land on
    // LATER tasks — flush inside act before asserting the verdict.
    await actFlush();
    // The REAL verdict (07a §1 allows the server's own words).
    const verdict = container.querySelector('[data-testid="kora-delivery-verdict"]');
    expect(verdict?.textContent).toContain("В очереди реле");
    // The honest real-time limit is NAMED in the line itself.
    expect(verdict?.textContent).toContain("живых обновлений статуса нет");
    // An ACCEPTED verdict clears the draft (the text left for the queue).
    expect(input(container).value).toBe("");
    expect(localStorage.getItem("vesmaro.koraDraft:exec-zc:live")).toBeNull();
    // И4 completion point fired with the REAL delivery status.
    expect(events.completed).toHaveBeenCalledTimes(1);
    expect(events.completed).toHaveBeenCalledWith({ deliveryStatus: "queued" });
  });

  it("DELIVERED verdict renders and fires the completion point", async () => {
    const events = spyIntentEvents();
    const gate = deferred<KoraMessageAccepted>();
    const { container } = mountComposer("live", events, {
      relayAlive: true,
      gateway: sendGateway(() => gate.promise),
    });
    act(() => {
      typeInto(input(container), "статусный отчёт");
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent?.includes("Отправить"))
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      gate.resolve(
        accepted({
          status: "delivered",
          queued_at: "2026-10-29T12:00:00+00:00",
          delivered_at: "2026-10-29T12:00:05+00:00",
          retryable: false,
          error: null,
        }),
      );
    });
    // Suite canon (actTools): TanStack mutation settlements land on
    // LATER tasks — flush inside act before asserting the verdict.
    await actFlush();
    expect(
      container.querySelector('[data-testid="kora-delivery-verdict"]')
        ?.textContent,
    ).toContain("Доставлено агенту");
    expect(events.completed).toHaveBeenCalledWith({
      deliveryStatus: "delivered",
    });
    expect(input(container).value).toBe("");
  });

  it("FAILED retryable: «не доставлено — повторите» + the retry is a NEW POST with the KEPT draft", async () => {
    const events = spyIntentEvents();
    const gates = [deferred<KoraMessageAccepted>(), deferred<KoraMessageAccepted>()];
    let call = 0;
    const send = vi.fn(() => {
      call += 1;
      return (call === 1 ? gates[0] : gates[1]).promise;
    });
    const { container } = mountComposer("live", events, {
      relayAlive: true,
      gateway: sendGateway(send),
    });
    act(() => {
      typeInto(input(container), "доделай кейс");
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent?.includes("Отправить"))
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      gates[0].resolve(
        accepted({
          status: "failed",
          queued_at: "2026-10-29T12:00:00+00:00",
          delivered_at: null,
          retryable: true,
          error: "исполнитель не забрал ход",
        }),
      );
    });
    // Suite canon (actTools): TanStack mutation settlements land on
    // LATER tasks — flush inside act before asserting the verdict.
    await actFlush();
    const verdict = container.querySelector('[data-testid="kora-delivery-verdict"]');
    expect(verdict?.textContent).toContain("Не доставлено — повторите");
    // The server's human reason rides alongside (honest diagnostics).
    expect(verdict?.textContent).toContain("исполнитель не забрал ход");
    // A FAILED verdict KEEPS the draft — the retry resends the same text.
    expect(input(container).value).toBe("доделай кейс");
    expect(events.completed).toHaveBeenCalledWith({ deliveryStatus: "failed" });

    // The retry = a NEW POST (not a client-side pretend).
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="kora-delivery-retry"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith("exec-zc:live", "доделай кейс");
    await act(async () => {
      gates[1].resolve(
        accepted({
          status: "delivered",
          queued_at: "2026-10-29T12:01:00+00:00",
          delivered_at: "2026-10-29T12:01:02+00:00",
          retryable: false,
          error: null,
        }),
      );
    });
    // Suite canon (actTools): TanStack mutation settlements land on
    // LATER tasks — flush inside act before asserting the verdict.
    await actFlush();
    expect(
      container.querySelector('[data-testid="kora-delivery-verdict"]')
        ?.textContent,
    ).toContain("Доставлено агенту");
  });

  it("FAILED non-retryable (the dead-session race): the refusal renders, NO retry control", async () => {
    const events = spyIntentEvents();
    const gate = deferred<KoraMessageAccepted>();
    const { container } = mountComposer("live", events, {
      relayAlive: true,
      gateway: sendGateway(() => gate.promise),
    });
    act(() => {
      typeInto(input(container), "поздний ход");
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent?.includes("Отправить"))
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      gate.resolve(
        accepted({
          status: "failed",
          queued_at: "2026-10-29T12:00:00+00:00",
          delivered_at: null,
          retryable: false,
          error: "сессия прервана",
        }),
      );
    });
    // Suite canon (actTools): TanStack mutation settlements land on
    // LATER tasks — flush inside act before asserting the verdict.
    await actFlush();
    const verdict = container.querySelector('[data-testid="kora-delivery-verdict"]');
    expect(verdict?.textContent).toContain("Не доставлено");
    expect(verdict?.textContent).not.toContain("повторите");
    expect(
      container.querySelector('[data-testid="kora-delivery-retry"]'),
    ).toBeNull();
  });

  it("the frozen 403 step_up_required gets its own honest plate, not a raw dump", async () => {
    const events = spyIntentEvents();
    const { container } = mountComposer("live", events, {
      relayAlive: true,
      gateway: sendGateway(() =>
        Promise.reject(
          new KoraError(
            "step_up_required",
            "Руление требует подтверждения step-up",
          ),
        ),
      ),
    });
    act(() => {
      typeInto(input(container), "без пина");
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent?.includes("Отправить"))
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // Suite canon (actTools): TanStack mutation settlements land on
    // LATER tasks — flush inside act before asserting the refusal.
    await actFlush();
    const plate = container.querySelector('[data-testid="kora-send-step-up"]');
    expect(plate?.textContent).toContain("step-up-ритуалом");
    expect(plate?.getAttribute("role")).toBe("alert");
    // The draft survives a refusal — the retry after the PIN ritual
    // resends the same text.
    expect(input(container).value).toBe("без пина");
    expect(events.completed).not.toHaveBeenCalled();
  });

  it("401 (the owner session rotted) names itself: the sign-in plate, not a raw dump", async () => {
    const events = spyIntentEvents();
    const { container } = mountComposer("live", events, {
      relayAlive: true,
      gateway: sendGateway(() =>
        Promise.reject(new ApiError(401, "session expired")),
      ),
    });
    act(() => {
      typeInto(input(container), "после истёкшей сессии");
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent?.includes("Отправить"))
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // Suite canon (actTools): TanStack mutation settlements land on
    // LATER tasks — flush inside act before asserting the refusal.
    await actFlush();
    const plate = container.querySelector('[data-testid="kora-send-error"]');
    expect(plate?.textContent).toContain("Сессия владельца истекла");
    expect(plate?.getAttribute("role")).toBe("alert");
    // A 401 is NOT the step-up ritual — the plates do not blur.
    expect(
      container.querySelector('[data-testid="kora-send-step-up"]'),
    ).toBeNull();
    // The draft survives the refusal; the intent never completed.
    expect(input(container).value).toBe("после истёкшей сессии");
    expect(events.completed).not.toHaveBeenCalled();
  });

  it("a generic failure renders the server's own reason verbatim — no invented cause", async () => {
    const events = spyIntentEvents();
    const { container } = mountComposer("live", events, {
      relayAlive: true,
      gateway: sendGateway(() =>
        Promise.reject(
          new KoraError("session_not_found", "сессия не найдена в реестре"),
        ),
      ),
    });
    act(() => {
      typeInto(input(container), "в неизвестную сессию");
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent?.includes("Отправить"))
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // Suite canon (actTools): TanStack mutation settlements land on
    // LATER tasks — flush inside act before asserting the refusal.
    await actFlush();
    const plate = container.querySelector('[data-testid="kora-send-error"]');
    expect(plate?.textContent).toContain(
      "Не отправилось: сессия не найдена в реестре",
    );
    expect(plate?.getAttribute("role")).toBe("alert");
    expect(input(container).value).toBe("в неизвестную сессию");
    expect(events.completed).not.toHaveBeenCalled();
  });

  it("a non-steerable session stays read-only even with the relay alive", () => {
    const events = spyIntentEvents();
    const gateway = sendGateway(() => {
      throw new Error("send must not fire for a non-steerable session");
    });
    const { container } = mountComposer("live", events, {
      relayAlive: true,
      gateway,
      session: {
        ...session("live"),
        origin: "local",
        steerable: false,
      },
    });
    act(() => {
      typeInto(input(container), "чужая сессия");
    });
    const sendButton = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Отправить"),
    );
    expect(sendButton?.disabled).toBe(true);
    expect(container.textContent).toContain("Чужая сессия — только чтение");
  });

  it("a dead session keeps the whole composer dark even with the relay alive", () => {
    const { container } = mountComposer("dead", spyIntentEvents(), {
      relayAlive: true,
    });
    expect(input(container).disabled).toBe(true);
    // No send button node at all for a dead session (hasDraft && !dead).
    expect(container.innerHTML).not.toContain(">Отправить<");
    expect(container.textContent).toContain(
      "Сессия прервана — агент здесь уже не слушает",
    );
  });

  it("Enter SENDS when the relay path is live (the same action as the button)", async () => {
    const events = spyIntentEvents();
    const gate = deferred<KoraMessageAccepted>();
    const send = vi.fn(() => gate.promise);
    const { container } = mountComposer("live", events, {
      relayAlive: true,
      gateway: sendGateway(send),
    });
    const field = input(container);
    act(() => {
      typeInto(field, "ход по Enter");
    });
    await act(async () => {
      field.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("exec-zc:live", "ход по Enter");
    await act(async () => {
      gate.resolve(
        accepted({
          status: "delivered",
          queued_at: "2026-10-29T12:00:00+00:00",
          delivered_at: "2026-10-29T12:00:01+00:00",
          retryable: false,
          error: null,
        }),
      );
    });
    // Suite canon (actTools): TanStack mutation settlements land on
    // LATER tasks — flush inside act before asserting the verdict.
    await actFlush();
    expect(
      container.querySelector('[data-testid="kora-delivery-verdict"]')
        ?.textContent,
    ).toContain("Доставлено агенту");
  });
});
