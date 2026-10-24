// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { KoraWorkspace } from "./KoraWorkspace";
import { KoraMockAdapter } from "./KoraMockAdapter";
import { KoraGatewayContext } from "./koraGatewayContext";
import { koraKeys } from "./useKora";
import {
  KORA_FIXTURE_COVERAGE,
  KORA_FIXTURE_HERMES_SESSIONS,
  KORA_FIXTURE_SESSIONS,
} from "./koraFixtures";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { I18nProvider } from "@/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * T004 slices 2–3 (hermes-bridge FE): the hermes source rides the ONE
 * registry leg as a first-class filter; the slice-3 legs add the LIVE
 * transcript (read-only) and the cluster chat. Behavioral contract under
 * test:
 *
 * - the mock registry starts WITHOUT hermes rows — the slice fills ONLY on
 *   a pull (the pull IS the ingest, the server's pull→upsert flow);
 * - KW4: the hermes context is ROUTE-driven (blueprint-kw4 §2, ТЛ verdict —
 *   the retired header select is gone): the cluster route /kora/hermes (or
 *   a deep-linked hermes session) mounts the panel's hermes furniture (the
 *   ONE refresh + the status line) and starts honestly clean;
 * - ONE manual refresh (button) ingests the hermes rows through the SAME
 *   registry leg — the workspace re-derives the anchor from it; never an
 *   auto-pull;
 * - the off mode (`?hermesBridge=off`) renders the honest off-slot with the
 *   human reason, and the pull throws the typed hermes_off error;
 * - KW2: a hermes session opens the SPLIT — the REAL chat (switcher,
 *   model select, the non-persistence note) + the «Все ходы» zone (the
 *   collapsed strip is the default; expanding deploys the SAME transcript
 *   grammar: roles/tool names/redaction, the seq-cursor load-more);
 * - KW2: the cluster route (/kora/hermes) opens the chat anchored to
 *   the last active api_server session: a REAL send (the reply carries the
 *   server's «hermes · real-time» marker), the composition contract
 *   (tool turns filtered, the new text last), the limiter/off/model-404
 *   verdicts in the server's own voice with the draft and the user's
 *   model choice kept.
 */

interface MountOptions {
  /** `?hermesBridge=off` — the mock demo knob. */
  hermesOff?: boolean;
  /** `?hermesChat=limited` — the chat limiter demo knob. */
  hermesLimited?: boolean;
  /** `?hermesChat=badmodel` — the model-rejection demo knob (MODEL-404). */
  hermesBadModel?: boolean;
  /** Mount the RESERVED /kora/hermes cluster-chat route (KW2) instead of
   * the bare /kora workspace. */
  cluster?: boolean;
  /** Prefill the registry cache WITHOUT the hermes rows — the honest
   * pre-pull board (the adapter serves none until a pull anyway). */
  noHermesRows?: boolean;
  /** Mount with a CALLER-OWNED adapter — e.g. one pre-pulled so the
   * adapter itself serves hermes rows post-mount-refetch (the pulled-state
   * board; the KoraSplitWiring canon). */
  adapter?: KoraMockAdapter;
}

function mountWorkspace(options: MountOptions = {}): {
  container: HTMLElement;
  root: Root;
  queryClient: QueryClient;
} {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Prefill the paged registry cache (the mock filters hermes rows until
  // the pull anyway; the point is a pending-free render). noHermesRows
  // models the honest pre-pull board instead.
  queryClient.setQueryData(koraKeys.sessionsPaged(50), {
    pages: [
      {
        ok: true as const,
        count: KORA_FIXTURE_SESSIONS.length,
        items: [
          ...(options.noHermesRows
            ? KORA_FIXTURE_SESSIONS.filter((s) => s.harness !== "hermes")
            : KORA_FIXTURE_SESSIONS),
        ],
        coverage: KORA_FIXTURE_COVERAGE,
        meta: { generated_at: "2026-09-24T11:45:00Z" },
      },
    ],
    pageParams: [0],
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  // The demo knobs read the SHARED window.location at construction — point
  // it at the demo param BEFORE the adapter exists (the MemoryRouter entry
  // is display-only: the mock reads the browser's location, not the
  // router's). The caller-owned adapter (pre-pulled) is constructed by the
  // caller — the knob options and it never co-occur.
  history.replaceState(
    null,
    "",
    options.hermesOff
      ? "/?hermesBridge=off"
      : options.hermesLimited
        ? "/?hermesChat=limited"
        : options.hermesBadModel
          ? "/?hermesChat=badmodel"
          : "/",
  );
  const koraAdapter = options.adapter ?? new KoraMockAdapter({ latency: false });
  const search = options.hermesOff ? "?hermesBridge=off" : "";
  act(() => {
    root.render(
      <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
        <KoraGatewayContext.Provider value={koraAdapter}>
          <QueryClientProvider client={queryClient}>
            <I18nProvider initialLang="ru">
              <MemoryRouter initialEntries={[`/kora${search}`]}>
                {options.cluster ? <KoraWorkspace cluster /> : <KoraWorkspace />}
              </MemoryRouter>
            </I18nProvider>
          </QueryClientProvider>
        </KoraGatewayContext.Provider>
      </GatewayContext.Provider>,
    );
  });
  return { container, root, queryClient };
}

/**
 * KW4: the hermes context is the ROUTE (the cluster mode or a hermes
 * session) — there is no filter to select anymore. The mounts below use
 * `cluster: true`; the hermes furniture (the ONE refresh + the status
 * line) rides the right panel whenever that mode is on stage.
 */

/** Fire the ONE manual refresh (the Блок 2 header button). */
async function clickRefresh(container: HTMLElement): Promise<void> {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (el) => el.textContent?.includes("Обновить"),
  );
  if (button === undefined) throw new Error("refresh button not rendered");
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}

/** Flush the pull/query promise chain inside act. */
async function settle(times = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/**
 * Wait (bounded, real timers) until the container shows the text. The query
 * notification beats can ride macrotasks — a microtask-only flush is a RACE,
 * so every async-arrival assertion polls instead of gambling on tick counts.
 */
async function waitText(
  container: HTMLElement,
  text: string,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (container.textContent?.includes(text)) return;
    if (Date.now() > deadline) {
      throw new Error(`waitText timeout: the text never arrived: ${text}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

afterEach(async () => {
  history.replaceState(null, "", "/");
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("Kora hermes bridge (T004 slice 2)", () => {
  it("the mock registry has no hermes rows before the first pull", async () => {
    const adapter = new KoraMockAdapter({ latency: false });
    const page = await adapter.listSessions({ limit: 50, offset: 0 });
    expect(
      page.items.filter((session) => session.harness === "hermes"),
    ).toHaveLength(0);
    // The frozen meta carries generated_at only — the hermes provenance
    // fields (source/upserted/dropped) ride the PULL response, not the
    // plain registry listing.
    expect((page.meta as Record<string, unknown>).source).toBeUndefined();
  });

  it("status reads ok (configured) without touching the pull", async () => {
    const adapter = new KoraMockAdapter({ latency: false });
    const status = await adapter.hermesStatus();
    expect(status.configured).toBe(true);
    expect(status.mode).toBe("ok");
    expect(status.detail).toBeNull();
  });

  it("the pull ingests hermes rows into the SAME registry leg", async () => {
    const adapter = new KoraMockAdapter({ latency: false });
    const pulled = await adapter.pullHermesSessions();
    // The pull's meta names its provenance (the server's additive fields).
    expect((pulled.meta as Record<string, unknown>).source).toBe("hermes-live");
    expect(pulled.items.every((session) => session.harness === "hermes")).toBe(true);
    // The registry now serves them through listSessions (one leg).
    const page = await adapter.listSessions({ limit: 50, offset: 0 });
    const hermes = page.items.filter((session) => session.harness === "hermes");
    expect(hermes).toHaveLength(KORA_FIXTURE_HERMES_SESSIONS.length);
    expect(hermes.every((session) => session.executor_id === "hermes")).toBe(true);
  });

  it("hermes transcript fixtures are a deliberate gap (404-shaped)", async () => {
    const adapter = new KoraMockAdapter({ latency: false });
    await expect(
      adapter.getTranscript(KORA_FIXTURE_HERMES_SESSIONS[0].id),
    ).rejects.toMatchObject({ code: "session_not_found" });
  });

  it("the hermes context (the cluster route) starts honestly clean (no auto-pull)", async () => {
    const { container } = mountWorkspace({ cluster: true, noHermesRows: true });
    await settle();
    // The ONE refresh button rides the right panel in the hermes mode…
    expect(
      [...container.querySelectorAll("button")].some((el) =>
        el.textContent?.includes("Обновить"),
      ),
    ).toBe(true);
    // …the status line reads the honest pre-pull zero (the status query
    // rides macrotasks — poll, per this file's own waitText canon)…
    await waitText(container, "сессий в реестре: 0");
    // …the chat starts from a clean slate (the honest no-anchor verdict,
    // not a skeleton)…
    expect(container.textContent).toContain("сессий api_server источника в реестре нет");
    expect(container.textContent).toContain("Пока пусто");
    // …and NO hermes row arrived (the auto-pull must not exist).
    expect(container.textContent).not.toContain("Hysteria прокси");
    expect(container.textContent).not.toContain("Confirm with OK");
  });

  it("one manual refresh fills the registry through the same leg — the anchor then resolves", async () => {
    const { container } = mountWorkspace({ cluster: true, noHermesRows: true });
    await settle();
    expect(container.textContent).toContain("сессий в реестре: 0");
    await clickRefresh(container);
    // The pull chain (mutate → onSuccess → invalidate → refetch → notify →
    // render) rides query-notification beats that can land on macrotasks —
    // a settle() gamble here went 2-of-3 red solo (TL triage 2026-10-24).
    // Async arrivals poll, per this file's own waitText canon.
    await waitText(container, "сессий в реестре: 2");
    // The status line reports the ok state (DATA, honest light).
    expect(container.textContent).toContain("подключён");
    // The SAME leg refilled: the workspace re-derived the cluster anchor
    // from the refreshed registry — the conversation continues.
    await waitText(container, "продолжение сессии hermes:api-server-main");
  });

  it("the off mode renders the honest off-slot with the human reason", async () => {
    const { container } = mountWorkspace({ hermesOff: true, cluster: true });
    await settle();
    expect(container.textContent).toContain("Hermes не подключён");
    expect(container.textContent).toContain("HERMES_API_KEY не задан");
    // Quiet slot, not an error wall: no error wording.
    expect(container.textContent).not.toContain("Не удалось");
  });

  it("the off mode's pull answers the typed hermes_off error", async () => {
    // The off knob reads location.search at CONSTRUCTION — set the param
    // before the adapter exists (the routes-mounted MemoryRouter pattern in
    // happy-dom resolves to the same shared location).
    history.replaceState(null, "", "/?hermesBridge=off");
    const adapter = new KoraMockAdapter({ latency: false });
    await expect(adapter.pullHermesSessions()).rejects.toMatchObject({
      code: "hermes_off",
    });
    history.replaceState(null, "", "/");
  });

  it("a clicked hermes session opens the SPLIT: real chat + «Все ходы» with today's grammar", async () => {
    // The pulled-state board: the adapter itself serves hermes rows, so the
    // mount refetch keeps them (the KoraSplitWiring canon — a bare cache
    // prefill is wiped by the staleTime-0 refetch).
    const adapter = new KoraMockAdapter({ latency: false });
    await adapter.pullHermesSessions();
    const { container, root, queryClient } = mountWorkspace({ adapter });
    await settle();
    // Open a hermes session (the route is the selection seam; the same
    // queryClient carries the post-pull registry so the session resolves).
    await act(async () => {
      root.render(
        <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
          <KoraGatewayContext.Provider value={new KoraMockAdapter({ latency: false })}>
            <QueryClientProvider client={queryClient}>
              <I18nProvider initialLang="ru">
                <MemoryRouter initialEntries={["/kora/hermes:api-server-main"]}>
                  <KoraWorkspace sessionId="hermes:api-server-main" />
                </MemoryRouter>
              </I18nProvider>
            </QueryClientProvider>
          </KoraGatewayContext.Provider>
        </GatewayContext.Provider>,
      );
    });
    await settle();
    // The chat half: the header carries the switcher + the model select +
    // the source badge (DATA), and the REAL composer with BOTH honest notes.
    expect(container.textContent).toContain("Чат с hermes");
    expect(container.textContent).toContain("hermes · real-time");
    expect(
      container.querySelector<HTMLSelectElement>("#kora-hermes-chat-session"),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLSelectElement>("#kora-hermes-chat-model"),
    ).not.toBeNull();
    expect(container.textContent).toContain("Ответы чата не записываются");
    expect(container.textContent).toContain("лимит чата — 12 сообщений в минуту");
    // The «Все ходы» strip: collapsed by default, honest count (the live
    // cursor beyond the loaded page is a «+», never an invented total).
    const strip = container.querySelector<HTMLButtonElement>(
      'button[aria-controls="kora-moves-body"]',
    );
    expect(strip).not.toBeNull();
    expect(strip?.getAttribute("aria-expanded")).toBe("false");
    await waitText(container, "Все ходы · 50+");
    // The transcript body is NOT mounted while folded (the canon: folds stay
    // folded; the zone deploys on demand).
    expect(container.querySelector("#kora-moves-body")).toBeNull();
    await act(async () => {
      strip?.click();
      await Promise.resolve();
    });
    // The deployed zone renders TODAY'S grammar unchanged: role chips…
    await waitText(container, "Разведай Hysteria прокси");
    expect(container.textContent).toContain("tool_result");
    // …the hermes passthrough renders honestly (reasoning collapsed, tool
    // names read out, the redaction mark on the masked row)…
    expect(container.textContent).toContain("Размышления");
    expect(container.textContent).toContain(
      "Вызовы инструментов: 2: hysteria_status, journal_tail",
    );
    expect(container.textContent).toContain("auth token: [REDACTED]");
    // …the zone carries its OWN reading tools (the separate follow-tail)…
    const zone = container.querySelector("#kora-moves-body");
    expect(zone).not.toBeNull();
    expect(zone?.textContent).toContain("Следить за хвостом");
    // …and the old read-only beat is GONE — the composer here is real, the
    // non-persistence note names what a send does and does not touch.
    expect(container.textContent).not.toContain("Транскрипт только для чтения");
  });

  it("load-more appends the cursor's remaining rows (the zone's own button)", async () => {
    // The pulled-state board (see the SPLIT case above).
    const adapter = new KoraMockAdapter({ latency: false });
    await adapter.pullHermesSessions();
    const { container, root, queryClient } = mountWorkspace({ adapter });
    await settle();
    await act(async () => {
      root.render(
        <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
          <KoraGatewayContext.Provider value={new KoraMockAdapter({ latency: false })}>
            <QueryClientProvider client={queryClient}>
              <I18nProvider initialLang="ru">
                <MemoryRouter initialEntries={["/kora/hermes:api-server-main"]}>
                  <KoraWorkspace sessionId="hermes:api-server-main" />
                </MemoryRouter>
              </I18nProvider>
            </QueryClientProvider>
          </KoraGatewayContext.Provider>
        </GatewayContext.Provider>,
      );
    });
    await settle();
    // Deploy the zone FIRST: the strip hides the body while folded.
    const strip = container.querySelector<HTMLButtonElement>(
      'button[aria-controls="kora-moves-body"]',
    );
    await act(async () => {
      strip?.click();
      await Promise.resolve();
    });
    await waitText(container, "Разведай Hysteria прокси");
    // Page 1 = 50 rows: the LAST fixture row (mesh-25) is not in yet…
    expect(container.textContent).not.toContain("mesh-25: зелёный");
    const zone = container.querySelector("#kora-moves-body");
    if (zone === null) throw new Error("moves zone body not rendered");
    const loadMore = [...zone.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Показать ещё"),
    );
    expect(loadMore).toBeDefined();
    await act(async () => {
      loadMore?.click();
      await Promise.resolve();
    });
    // …and the honest end: the full cursor served, no further invite.
    await waitText(container, "mesh-25: зелёный");
    expect(zone.textContent).not.toContain("Показать ещё");
  });

  it("/kora keeps the invitation with no hermes furniture; the CLUSTER route opens the chat", async () => {
    // KW2+KW4 (blueprint §5, blueprint-kw4 §2): the chat mode is
    // ROUTE-driven — the plain /kora invitation mounts NO hermes furniture
    // (the refresh + status line ride a hermes mode only); the tree's pin
    // names the way in.
    const { container } = mountWorkspace();
    await settle();
    expect(container.textContent).toContain("Выберите сессию — здесь откроется её ход");
    expect(container.textContent).toContain("Чат с кластером");
    // No chat in the center — the honest invitation instead…
    expect(
      container.querySelector("#kora-hermes-chat-input"),
    ).toBeNull();
    // …and no hermes furniture in the panel off a hermes mode.
    expect(
      [...container.querySelectorAll("button")].some((el) =>
        el.textContent?.includes("Обновить"),
      ),
    ).toBe(false);

    // The reserved /kora/hermes route IS the cluster chat.
    const cluster = mountWorkspace({ cluster: true });
    await settle();
    expect(cluster.container.textContent).toContain("Чат с hermes");
    expect(cluster.container.textContent).toContain("hermes · real-time");
    // Honest no-anchor state PRE-PULL (a registry without hermes rows yet —
    // the clean-slate chat, not a skeleton).
    const prePull = mountWorkspace({ cluster: true, noHermesRows: true });
    await settle();
    expect(prePull.container.textContent).toContain(
      "сессий api_server источника в реестре нет",
    );
    expect(prePull.container.textContent).toContain("Пока пусто");
    // …and a REAL send affordance (the chat leg is live, unlike the
    // zcode composer whose send is honestly deferred).
    expect(
      cluster.container.querySelector("#kora-hermes-chat-input"),
    ).not.toBeNull();
    expect(
      [...cluster.container.querySelectorAll("button")].some((el) =>
        el.textContent?.includes("Отправить"),
      ),
    ).toBe(true);
    // The «Все ходы» zone rides below the chat in the same split.
    expect(
      cluster.container.querySelector('button[aria-controls="kora-moves-body"]'),
    ).not.toBeNull();
  });

  it("one send appends the exchange with the server's real-time marker (cluster route)", async () => {
    // KW2: the chat lives on the RESERVED /kora/hermes route; the pulled
    // board (the adapter pre-pulled, see the SPLIT case) lets the anchor
    // resolve and the conversation continue.
    const adapter = new KoraMockAdapter({ latency: false });
    await adapter.pullHermesSessions();
    const { container } = mountWorkspace({ cluster: true, adapter });
    await settle();
    // The anchor line rides query beats that can land on macrotasks (the
    // waitText canon — a microtask-only settle is a RACE).
    await waitText(container, "продолжение сессии hermes:api-server-main");
    const input = container.querySelector<HTMLTextAreaElement>(
      "#kora-hermes-chat-input",
    );
    expect(input).not.toBeNull();
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      set?.call(input, "Проверить федерацию памяти Mnemos");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const send = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Отправить"),
    );
    expect(send).toBeDefined();
    await act(async () => {
      send?.click();
      await Promise.resolve();
    });
    // The reply rides the server's own provenance marker + model (DATA,
    // never decor) and the exchange stays visible.
    await waitText(container, "hermes · real-time");
    expect(container.textContent).toContain("Принял:");
    expect(container.textContent).toContain("hermes-4.5-405b");
    expect(input?.value).toBe("");
  });

  it("the send composition filters tool turns and caps the body at 20", async () => {
    const adapter = new KoraMockAdapter({ latency: false });
    await adapter.pullHermesSessions();
    const page = await adapter.hermesMessages("hermes:api-server-main", {
      after_seq: 0,
      limit: 200,
    });
    // The mock mirrors the server contract shape the UI composes within:
    // 63 fixture rows, roles beyond user/assistant exist in the transcript.
    expect(page.items.length).toBe(63);
    expect(page.items.some((item) => item.role === "tool")).toBe(true);
    expect(page.has_more).toBe(false);
    // Cursor honesty: a mid-transcript page continues the seq cleanly.
    const tail = await adapter.hermesMessages("hermes:api-server-main", {
      after_seq: 50,
      limit: 50,
    });
    expect(tail.items[0].seq).toBe(51);
    expect(tail.has_more).toBe(false);
    // The chat POST answers verbatim-shaped.
    const reply = await adapter.hermesChat({
      messages: [
        { role: "user" as const, content: "пинг" },
        { role: "assistant" as const, content: "понг" },
        { role: "user" as const, content: "статус туннеля" },
      ],
    });
    expect(reply.source).toBe("hermes · real-time");
    expect(reply.model).toBe("hermes-4.5-405b");
    const completion = reply.completion as {
      choices: Array<{ message: { role: string; content: string } }>;
    };
    expect(completion.choices[0].message.role).toBe("assistant");
    expect(completion.choices[0].message.content).toContain("Принял: «статус туннеля»");
    // The last body the adapter saw: 3 turns, no tool role, the new text
    // last (the composition contract the chat surface composes within).
    expect(adapter.lastChatMessages).not.toBeNull();
    expect(adapter.lastChatMessages?.length).toBe(3);
    expect(
      adapter.lastChatMessages?.every(
        (turn) => turn.role === "user" || turn.role === "assistant",
      ),
    ).toBe(true);
    expect(adapter.lastChatMessages?.[2].content).toBe("статус туннеля");
  });

  it("the limiter knob answers the bare verdict with the draft kept", async () => {
    // The knob rides the mount helper (it points location.search at the
    // demo param before any adapter exists — the hermesBridge=off pattern).
    const { container } = mountWorkspace({ hermesLimited: true, cluster: true });
    await settle();
    const input = container.querySelector<HTMLTextAreaElement>(
      "#kora-hermes-chat-input",
    );
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      set?.call(input, "проверка лимитера");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const send = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Отправить"),
    );
    await act(async () => {
      send?.click();
      await Promise.resolve();
    });
    // The bare 429 verdict, the server's human voice, never swallowed…
    await waitText(
      container,
      "Не доставлено: hermes chat rate limit exceeded (12 per 60s per client)",
    );
    // …and the draft STAYS — nothing is lost on a failed send.
    expect(input?.value).toBe("проверка лимитера");
    history.replaceState(null, "", "/");
  });

  it("the off mode's chat send answers the typed hermes_off reason", async () => {
    const { container } = mountWorkspace({ hermesOff: true, cluster: true });
    await settle();
    const input = container.querySelector<HTMLTextAreaElement>(
      "#kora-hermes-chat-input",
    );
    expect(input).not.toBeNull();
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      set?.call(input, "проверка офф-режима");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const send = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Отправить"),
    );
    await act(async () => {
      send?.click();
      await Promise.resolve();
    });
    await waitText(
      container,
      "Не доставлено: Мост hermes выключен: HERMES_API_KEY не задан на борде",
    );
  });
});