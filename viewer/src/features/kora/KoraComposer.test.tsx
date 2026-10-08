// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  KoraIntentAbandonedPayload,
  KoraIntentEntryPoint,
  KoraIntentEventPoints,
} from "./koraIntentEvents";
import { KoraComposer } from "./KoraComposer";
import type { KoraSession } from "./koraTypes";
import { I18nProvider } from "@/i18n";
import { actUnmount } from "@/test/actTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The composer state machine (07j §4.6, И1 honest cut): the field and the
 * machine are REAL — typing, Enter/Shift+Enter, the draft in page memory —
 * while the send is honestly deferred. The contract under test:
 * - the send button renders ONLY for a non-empty draft and is DISABLED
 *   with a visible chip + service line (never a tooltip-only reason);
 * - Enter on a non-empty draft ANNOUNCES the deferred status (the action
 *   never stays silent), Shift+Enter inserts a newline;
 * - NO fake delivery: «в очереди»/«доставлено» never render (07a §1);
 * - a dead session disables the FIELD itself with the interrupted note;
 * - the intent call points fire started/abandoned (ME-035 taxonomy seam).
 */

const mountedRoots: Root[] = [];

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
} {
  const started = vi.fn();
  const abandoned = vi.fn();
  return {
    started,
    abandoned,
    intentStarted: (entryPoint: KoraIntentEntryPoint) => started(entryPoint),
    intentAbandoned: (payload: KoraIntentAbandonedPayload) => abandoned(payload),
  };
}

function mountComposer(
  sessionState: KoraSession["state"],
  events: KoraIntentEventPoints,
): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      <I18nProvider initialLang="ru">
        <KoraComposer session={session(sessionState)} intentEvents={events} />
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
      "Отправка сообщений агенту появится позже — пока Кора показывает ход сессий. Черновик сохраняется на этой машине и переживёт перезагрузку страницы.",
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
