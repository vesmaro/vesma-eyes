// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { KoraHermesChat, KORA_CLUSTER_OPTION } from "./KoraHermesChat";
import { KoraMockAdapter } from "./KoraMockAdapter";
import { KoraGatewayContext } from "./koraGatewayContext";
import { KORA_FIXTURE_HERMES_MESSAGES } from "./koraFixtures";
import type {
  HermesChatReply,
  HermesMessage,
  KoraSession,
} from "./koraTypes";
import type { KoraHermesTranscriptPages } from "./useKora";
import { I18nProvider } from "@/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The KW2 chat statuses (states.md §3) + the chat HEADER (kora-rethink
 * blueprint §4), component-level: the session switcher writes the route
 * seam, the model select preselects the verified default and rides the
 * POST, and EVERY send status keeps its honest shape — PENDING without a
 * fake typing indicator, the draft kept through every error, the human
 * reason named, and MODEL-404 answered by the USER (the select never
 * resets itself).
 */

const ANCHOR: KoraSession = {
  id: "hermes:api-server-main",
  executor_id: "hermes",
  native_id: "api-server-main",
  harness: "hermes",
  project: "hermes:api_server",
  cwd: null,
  state: "live",
  origin: "relay",
  steerable: false,
  started_at: "2026-09-24T08:02:00Z",
  last_activity_at: "2026-09-24T11:30:00Z",
  age_seconds: 12480,
  last_line_preview: null,
};

const OTHER: KoraSession = {
  ...ANCHOR,
  id: "hermes:telegram-bridge",
  native_id: "telegram-bridge",
  project: "hermes:telegram",
  state: "idle",
};

const ROSTER = ["hermes-4.5-405b", "hermes-4.5-70b"];

function pagesOf(
  items: readonly HermesMessage[],
  overrides: Partial<KoraHermesTranscriptPages> = {},
): KoraHermesTranscriptPages {
  return {
    items: [...items],
    hasMore: false,
    isPending: false,
    isLoadingMore: false,
    error: null,
    loadMore: async () => {},
    refetch: async () => {},
    ...overrides,
  };
}

const fixtureItems = KORA_FIXTURE_HERMES_MESSAGES["hermes:api-server-main"] ?? [];

interface MountChatOptions {
  items?: readonly HermesMessage[];
  activeSessionId?: string | null;
  models?: readonly string[];
  defaultModel?: string | null;
}

function mountChat(
  adapter: KoraMockAdapter,
  options: MountChatOptions = {},
): {
  container: HTMLElement;
  root: Root;
  rerender: (session: KoraSession | null) => Promise<void>;
} {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let currentSession: KoraSession | null = options.activeSessionId === null
    ? null
    : ANCHOR;
  const render = (): void => {
    root.render(
      <KoraGatewayContext.Provider value={adapter}>
        <QueryClientProvider client={queryClient}>
          <I18nProvider initialLang="ru">
            <KoraHermesChat
              session={currentSession}
              pages={pagesOf(options.items ?? fixtureItems)}
              models={options.models ?? ROSTER}
              defaultModel={options.defaultModel ?? ROSTER[0]}
              sessions={[ANCHOR, OTHER]}
              activeSessionId={currentSession?.id ?? null}
              onNavigateSession={() => {}}
            />
          </I18nProvider>
        </QueryClientProvider>
      </KoraGatewayContext.Provider>,
    );
  };
  // Flush the initial commit (sync act — createRoot render is asynchronous
  // by default, every other mount in the suite rides act too).
  act(() => {
    render();
  });
  const rerender = async (session: KoraSession | null): Promise<void> => {
    currentSession = session;
    await act(async () => {
      render();
      await Promise.resolve();
    });
  };
  return { container, root, rerender };
}

async function typeDraft(container: HTMLElement, text: string): Promise<void> {
  const input = container.querySelector<HTMLTextAreaElement>(
    "#kora-hermes-chat-input",
  );
  if (input === null) throw new Error("chat input not rendered");
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function sendButton(container: HTMLElement): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((el) =>
    el.textContent?.includes("Отправить"),
  );
  if (found === undefined) throw new Error("send button not rendered");
  return found;
}

afterEach(async () => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("KoraHermesChat — the KW2 chat header (blueprint §4)", () => {
  it("renders the switcher (cluster option + context sessions), the preselected default model and the source badge", () => {
    const { container } = mountChat(new KoraMockAdapter({ latency: false }));
    const switcher = container.querySelector<HTMLSelectElement>(
      "#kora-hermes-chat-session",
    );
    expect(switcher).not.toBeNull();
    expect(switcher?.value).toBe("hermes:api-server-main"); // the active session
    const values = [...(switcher?.options ?? [])].map((o) => o.value);
    expect(values).toContain(KORA_CLUSTER_OPTION);
    expect(values).toContain("hermes:telegram-bridge");
    const model = container.querySelector<HTMLSelectElement>(
      "#kora-hermes-chat-model",
    );
    expect(model?.value).toBe("hermes-4.5-405b"); // the default preselected
    expect([...(model?.options ?? [])].map((o) => o.value)).toEqual(ROSTER);
    expect(container.textContent).toContain("hermes · real-time");
    // BOTH honest notes ride the idle state (K-CHAT-IDLE).
    expect(container.textContent).toContain("лимит чата — 12 сообщений в минуту");
    expect(container.textContent).toContain("Ответы чата не записываются");
  });

  it("the roster fallback: an absent /status roster degrades to the default constant, honestly labelled", async () => {
    const adapter = new KoraMockAdapter({ latency: false });
    const { container } = mountChat(adapter, {
      models: [],
      defaultModel: null,
    });
    const model = container.querySelector<HTMLSelectElement>(
      "#kora-hermes-chat-model",
    );
    expect(model?.value).toBe("hermes-4.5-405b");
    // The fallback choice still RIDES the POST.
    await typeDraft(container, "пинг");
    await act(async () => {
      sendButton(container).click();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(adapter.lastChatModel).toBe("hermes-4.5-405b");
  });

  it("the switcher writes the route seam: a session id or the reserved cluster value", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const navigated: Array<string | null> = [];
    await act(async () => {
      root.render(
        <KoraGatewayContext.Provider value={new KoraMockAdapter({ latency: false })}>
          <QueryClientProvider client={queryClient}>
            <I18nProvider initialLang="ru">
              <KoraHermesChat
                session={ANCHOR}
                pages={pagesOf([])}
                models={ROSTER}
                defaultModel={ROSTER[0]}
                sessions={[ANCHOR, OTHER]}
                activeSessionId={ANCHOR.id}
                onNavigateSession={(id) => navigated.push(id)}
              />
            </I18nProvider>
          </QueryClientProvider>
        </KoraGatewayContext.Provider>,
      );
      await Promise.resolve();
    });
    const switcher = container.querySelector<HTMLSelectElement>(
      "#kora-hermes-chat-session",
    );
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")
      ?.set;
    await act(async () => {
      set?.call(switcher, "hermes:telegram-bridge");
      switcher?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(navigated).toEqual(["hermes:telegram-bridge"]);
    await act(async () => {
      set?.call(switcher, KORA_CLUSTER_OPTION);
      switcher?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(navigated).toEqual(["hermes:telegram-bridge", null]);
  });

  it("a session switch moves FOCUS to the chat heading (a11y §10.7)", async () => {
    const { container, rerender } = mountChat(
      new KoraMockAdapter({ latency: false }),
    );
    const heading = container.querySelector<HTMLHeadingElement>("h2");
    expect(document.activeElement).not.toBe(heading);
    await rerender(OTHER);
    expect(document.activeElement).toBe(
      container.querySelector<HTMLHeadingElement>("h2"),
    );
  });

  it("the chosen model rides the POST (not just the select)", async () => {
    const adapter = new KoraMockAdapter({ latency: false });
    const { container } = mountChat(adapter);
    const model = container.querySelector<HTMLSelectElement>(
      "#kora-hermes-chat-model",
    );
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")
      ?.set;
    await act(async () => {
      set?.call(model, "hermes-4.5-70b");
      model?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await typeDraft(container, "статус туннеля");
    await act(async () => {
      sendButton(container).click();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(adapter.lastChatModel).toBe("hermes-4.5-70b");
  });
});

describe("KoraHermesChat — the send statuses (states.md §3)", () => {
  it("K-CHAT-PENDING: the composer and the button disable, the honest line shows, NO fake typing", async () => {
    const adapter = new KoraMockAdapter({ latency: false });
    // Hold the reply in flight: the chat must render the pending state.
    let release: ((value: HermesChatReply) => void) | null =
      null;
    const held = new Promise<HermesChatReply>((resolve) => {
      release = resolve;
    });
    adapter.hermesChat = () => held;
    const { container } = mountChat(adapter, { items: [] });
    await typeDraft(container, "держим ответ");
    await act(async () => {
      sendButton(container).click();
      await Promise.resolve();
    });
    const input = container.querySelector<HTMLTextAreaElement>(
      "#kora-hermes-chat-input",
    );
    expect(input?.disabled).toBe(true);
    expect(sendButton(container).disabled).toBe(true);
    expect(container.textContent).toContain("Отправляем…");
    // The canon: a non-stream answer arrives whole or not at all — no
    // invented typing indicator anywhere.
    expect(container.textContent).not.toContain("печатает");
    await act(async () => {
      release?.({
        ok: true,
        source: "hermes · real-time",
        model: "hermes-4.5-405b",
        completion: { choices: [{ message: { role: "assistant", content: "Принял." } }] },
      });
      await held;
    });
    // The answer appended, the draft cleared, the field back.
    expect(container.textContent).toContain("Принял.");
    expect(input?.disabled).toBe(false);
    expect(input?.value).toBe("");
  });

  it("K-CHAT-ERR-TRANSPORT: the human reason rides the error line, the draft STAYS", async () => {
    const adapter = new KoraMockAdapter({ latency: false });
    adapter.hermesChat = () =>
      Promise.reject(
        new Error("hermes недоступен или отказал: connection refused"),
      );
    const { container } = mountChat(adapter, { items: [] });
    await typeDraft(container, "черновик переживёт");
    await act(async () => {
      sendButton(container).click();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain(
      "Не доставлено: hermes недоступен или отказал: connection refused",
    );
    const input = container.querySelector<HTMLTextAreaElement>(
      "#kora-hermes-chat-input",
    );
    expect(input?.value).toBe("черновик переживёт");
  });

  it("K-CHAT-ERR-RATE: the server's own limiter verdict, no invented timer", async () => {
    const adapter = new KoraMockAdapter({ latency: false });
    adapter.hermesChat = () =>
      Promise.reject(
        new Error("hermes chat rate limit exceeded (12 per 60s per client)"),
      );
    const { container } = mountChat(adapter, { items: [] });
    await typeDraft(container, "проверка темпа");
    await act(async () => {
      sendButton(container).click();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    // The human reason verbatim; NO fabricated countdown/Retry-After timer —
    // the board's transport carries none, the UI invents none.
    expect(container.textContent).toContain(
      "Не доставлено: hermes chat rate limit exceeded (12 per 60s per client)",
    );
    expect(container.textContent).not.toContain("повтор через");
    const input = container.querySelector<HTMLTextAreaElement>(
      "#kora-hermes-chat-input",
    );
    expect(input?.value).toBe("проверка темпа");
  });

  it("K-CHAT-ERR-VALID: the client cap lives in the field (maxLength 8000)", () => {
    const { container } = mountChat(new KoraMockAdapter({ latency: false }));
    const input = container.querySelector<HTMLTextAreaElement>(
      "#kora-hermes-chat-input",
    );
    expect(input?.getAttribute("maxlength")).toBe("8000");
    // The ARIA link resolves: the describedby target EXISTS in the markup
    // (K2-1 review fix — the honest note is the field's description).
    expect(input?.getAttribute("aria-describedby")).toBe("kora-hermes-chat-note");
    expect(document.getElementById("kora-hermes-chat-note")).not.toBeNull();
    const send = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Отправить"),
    );
    expect(send?.getAttribute("aria-describedby")).toBe("kora-hermes-chat-note");
  });

  it("K-CHAT-MODEL-404: the human reason names the refusal, the select KEEPS the user's choice", async () => {
    const adapter = new KoraMockAdapter({ latency: false });
    adapter.hermesChat = (body) =>
      Promise.reject(
        new Error(
          `hermes недоступен или отказал: the model «${body.model}» does not exist (404)`,
        ),
      );
    const { container } = mountChat(adapter, { items: [] });
    const model = container.querySelector<HTMLSelectElement>(
      "#kora-hermes-chat-model",
    );
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")
      ?.set;
    // The USER moves to 70b…
    await act(async () => {
      set?.call(model, "hermes-4.5-70b");
      model?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await typeDraft(container, "на новой модели");
    await act(async () => {
      sendButton(container).click();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    // …the refusal is named with hermes's own words…
    expect(container.textContent).toContain(
      "the model «hermes-4.5-70b» does not exist (404)",
    );
    // …and the choice is the USER's to revisit — no silent reset to the
    // default (K-CHAT-MODEL-404).
    expect(model?.value).toBe("hermes-4.5-70b");
    expect(container.textContent).toContain("на новой модели");
  });

  it("K-CHAT-UNKNOWN-FORMAT: an unparsable reply is named, never faked", async () => {
    const adapter = new KoraMockAdapter({ latency: false });
    adapter.hermesChat = () =>
      Promise.resolve({
        ok: true,
        source: "hermes · real-time",
        model: "hermes-4.5-405b",
        completion: { unexpected: "shape" },
      });
    const { container } = mountChat(adapter, { items: [] });
    await typeDraft(container, "проверка формата");
    await act(async () => {
      sendButton(container).click();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain(
      "Ответ получен, но текст в нём не распознан",
    );
    // The honest turn does NOT carry the provenance badge (no reply rode).
    expect(container.textContent).toContain("проверка формата");
  });
});
