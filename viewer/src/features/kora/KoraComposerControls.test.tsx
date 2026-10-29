// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KoraComposerControls } from "./KoraComposerControls";
import type { KoraGateway } from "./koraGateway";
import { KoraGatewayContext } from "./koraGatewayContext";
import { resetSpecialistAnnotationsForTests } from "./koraSpecialistStore";
import { SPECIALIST_PREFIX } from "./koraFrameStorage";
import type { KoraSession, KoraSpecialistsRoster } from "./koraTypes";
import { I18nProvider } from "@/i18n";
import { actUnmount } from "@/test/actTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The composer SELECTOR ROW (В2, kora-ide contract §3.2 + §7 acceptance):
 * every selector draws REAL data or does not draw at all —
 * - харнес = context (display + the loaded registry's real harnesses,
 *   the current one marked, NO invented navigation);
 * - специалист renders ONLY from the В2a roster (empty/failed read →
 *   the slot is absent, §5.3); a choice is an honest LOCAL per-session
 *   annotation (the footer says so), never a relay bind;
 * - модель = read-only honest «модели не сообщаются» (Q3; no invented
 *   value for local sessions);
 * - режим = the resolver's real confirm default; yolo is a DISABLED row
 *   whose visible reason names whichever gate is missing (relay-origin,
 *   the derived transport signal, or the opt-in wire);
 * - a dead session disables the whole row (K-COMPOSER-DEAD);
 * - K-COMPOSER-RELAY-OFF: the default (no relay signal) — nothing here
 *   pretends to send.
 */

const mountedRoots: Root[] = [];

const ROSTER: KoraSpecialistsRoster = {
  ok: true,
  count: 2,
  items: [
    { name: "@GCW: Tech Lead", slug: "gcw-tech-lead", profile_cached: true },
    {
      name: "@GCW: Senior Frontend Developer",
      slug: "gcw-senior-frontend-developer",
      profile_cached: false,
    },
  ],
  meta: { generated_at: "2026-10-29T00:00:00+00:00" },
};

function rosterGateway(roster: KoraSpecialistsRoster | "fail"): KoraGateway {
  return {
    specialists: (signal?: AbortSignal) =>
      roster === "fail"
        ? Promise.reject(new Error("roster read failed"))
        : (signal?.aborted
            ? Promise.reject(new DOMException("aborted", "AbortError"))
            : Promise.resolve(roster)),
  } as unknown as KoraGateway;
}

function session(overrides: Partial<KoraSession> = {}): KoraSession {
  return {
    id: "exec-zc:sess-1",
    executor_id: "exec-zc",
    native_id: "sess-1",
    harness: "zcode",
    project: "Тема",
    cwd: null,
    state: "live",
    origin: "local",
    steerable: false,
    started_at: "2026-09-24T09:12:00Z",
    last_activity_at: "2026-09-24T11:41:00Z",
    age_seconds: 6_000,
    last_line_preview: null,
    ...overrides,
  };
}

function mount(
  sessionRow: KoraSession,
  gateway: KoraGateway,
  harnessOptions: readonly { harness: string; count: number | null }[] = [
    { harness: "pi", count: 1 },
    { harness: "zcode", count: 3 },
  ],
  resolvedModel: string | null = null,
  relayAlive = false,
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
          <KoraGatewayContext.Provider value={gateway}>
            <KoraComposerControls
              session={sessionRow}
              harnessOptions={harnessOptions}
              resolvedModel={resolvedModel}
              relayAlive={relayAlive}
            />
          </KoraGatewayContext.Provider>
        </QueryClientProvider>
      </I18nProvider>,
    );
  });
  return { container, root };
}

const trigger = (container: HTMLElement, id: string): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>(`#${id}-trigger`);
  if (found === null) throw new Error(`trigger ${id} not rendered`);
  return found;
};

/** Poll (bounded, real timers) until the predicate holds — the query
 * beats ride macrotasks, a microtask-only flush is a race (the suite
 * canon, KoraSplitWiring). */
async function waitFor(
  predicate: () => boolean,
  label: string,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return;
    if (Date.now() > deadline) throw new Error(`waitFor timeout: ${label}`);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
}

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) {
    await actUnmount(root);
  }
  document.body.innerHTML = "";
  localStorage.clear();
  resetSpecialistAnnotationsForTests();
});

describe("KoraComposerControls (В2 selector row)", () => {
  it("renders the honest baseline: harness from the session, model «не сообщаются», mode confirm", () => {
    const { container } = mount(session(), rosterGateway(ROSTER));
    const html = container.innerHTML;
    // Harness = the session's context fact.
    expect(trigger(container, "kora-sel-harness").textContent).toContain("zcode");
    // Model: local sessions get the honest no-roster wording, no value invented.
    expect(html).toContain("модели не сообщаются");
    // Mode: the resolver's real default.
    expect(trigger(container, "kora-sel-mode").textContent).toContain("confirm");
    // No send furniture here (K-COMPOSER-RELAY-OFF lives in the composer).
    expect(html).not.toContain("Отправить");
  });

  it("omits the specialist slot when the roster is empty or the read fails", async () => {
    const empty = mount(session(), rosterGateway({ ...ROSTER, count: 0, items: [] }));
    // Let the query settle (macrotask flush), then assert the slot never
    // rendered.
    await waitFor(() => true, "empty-roster flush");
    expect(empty.container.querySelector("#kora-sel-specialist-trigger")).toBeNull();

    const failing = mount(session(), rosterGateway("fail"));
    await waitFor(() => true, "failed-read flush");
    expect(
      failing.container.querySelector("#kora-sel-specialist-trigger"),
    ).toBeNull();
  });

  it("opens the harness menu: real registry harnesses with counts, current marked, no commands", async () => {
    const { container } = mount(session(), rosterGateway(ROSTER));
    const t = trigger(container, "kora-sel-harness");
    expect(t.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      t.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const menu = container.querySelector("#kora-sel-harness-menu");
    expect(menu).not.toBeNull();
    expect(t.getAttribute("aria-expanded")).toBe("true");
    const text = menu?.textContent ?? "";
    // Only the loaded registry's harnesses, with their real counts.
    expect(text).toContain("pi");
    expect(text).toContain("zcode");
    expect(text).toContain("сессий: 3");
    expect(text).not.toContain("сессий: 2"); // vscode is not in the registry
    expect(text).not.toContain("vscode");
    // The current context harness is marked, others are informational
    // rows (aria-disabled, no buttons to «switch» with — 07j disclosure
    // discipline: no menu roles, honest aria markers only).
    const current = menu?.querySelector('[aria-current="true"]');
    expect(current?.textContent).toContain("zcode");
    expect(menu?.querySelectorAll("button").length).toBe(0);
    // The honest context note: harness changes in the dock/tree, not here.
    expect(text).toContain("Харнес живёт в контексте сессии");
    // Escape closes; focus returns to the trigger (the disclosure pair).
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(container.querySelector("#kora-sel-harness-menu")).toBeNull();
    expect(document.activeElement).toBe(t);
  });

  it("renders the specialist selector FROM the roster and annotates locally per session", async () => {
    const { container } = mount(session(), rosterGateway(ROSTER));
    await waitFor(
      () => container.querySelector("#kora-sel-specialist-trigger") !== null,
      "roster arrives",
    );
    const t = container.querySelector<HTMLButtonElement>(
      "#kora-sel-specialist-trigger",
    );
    expect(t).not.toBeNull();
    expect(t?.textContent).toContain("не выбран");
    await act(async () => {
      t?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const menu = container.querySelector("#kora-sel-specialist-menu");
    expect(menu).not.toBeNull();
    // Real roster names only.
    expect(menu?.textContent).toContain("@GCW: Tech Lead");
    expect(menu?.textContent).toContain("@GCW: Senior Frontend Developer");
    // The honest local-overlay note (no relay bind pretending): the mark
    // stays local until the relay line carries specialists.
    expect(menu?.textContent).toContain(
      "Локальная пометка на этой машине — останется локальной, пока линия реле не начнёт нести специалистов",
    );
    const techLead = [...(menu?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent?.includes("@GCW: Tech Lead"),
    );
    expect(techLead).toBeDefined();
    await act(async () => {
      techLead?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // The choice is the LOCAL per-session annotation: trigger + storage.
    expect(trigger(container, "kora-sel-specialist").textContent).toContain(
      "@GCW: Tech Lead",
    );
    expect(localStorage.getItem(`${SPECIALIST_PREFIX}exec-zc:sess-1`)).toBe(
      "@GCW: Tech Lead",
    );
    // A second click on the chosen row clears the annotation.
    await act(async () => {
      trigger(container, "kora-sel-specialist").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    const checked = container.querySelector('[aria-pressed="true"]');
    expect(checked?.textContent).toContain("@GCW: Tech Lead");
    await act(async () => {
      checked?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(localStorage.getItem(`${SPECIALIST_PREFIX}exec-zc:sess-1`)).toBeNull();
    expect(trigger(container, "kora-sel-specialist").textContent).toContain(
      "не выбран",
    );
  });

  it("mode menu: confirm marked current, yolo disabled with the honest reason", async () => {
    const local = mount(session({ origin: "local" }), rosterGateway(ROSTER));
    await act(async () => {
      trigger(local.container, "kora-sel-mode").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    const menu = local.container.querySelector("#kora-sel-mode-menu");
    expect(menu?.textContent).toContain("confirm");
    const yolo = menu?.querySelector('[aria-disabled="true"]');
    expect(yolo?.textContent).toContain("yolo");
    // Local origin: the yolo refusal names the relay-origin invariant.
    expect(menu?.textContent).toContain(
      "yolo — только для relay-сессий; эта сессия локальная",
    );
    await actUnmount(local.root);

    // A relay-origin row: the reason names the transport line instead.
    const relay = mount(session({ origin: "relay" }), rosterGateway(ROSTER));
    await act(async () => {
      trigger(relay.container, "kora-sel-mode").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(
      relay.container.querySelector("#kora-sel-mode-menu")?.textContent,
    ).toContain("yolo откроется после подключения реле-транспорта");
    // Yolo never renders as an enabled control (no fake toggle).
    const relayYolo = relay.container
      .querySelector("#kora-sel-mode-menu")
      ?.querySelector('[aria-disabled="true"]');
    expect(relayYolo?.tagName.toLowerCase()).toBe("div");
  });

  it("mode menu with the relay ALIVE (A1): yolo still disabled — the reason names the missing opt-in wire, and the local-origin reason is unchanged", async () => {
    // A relay-origin row + the derived relay signal: the transport gate
    // has PASSED — the honest refusal now names the opt-in wire (the
    // frozen contract carries no per-session toggle route yet).
    const relay = mount(session({ origin: "relay" }), rosterGateway(ROSTER), undefined, null, true);
    await act(async () => {
      trigger(relay.container, "kora-sel-mode").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    const menu = relay.container.querySelector("#kora-sel-mode-menu");
    expect(menu?.textContent).toContain(
      "yolo включается вручную для сессии (opt-in)",
    );
    // Yolo STAYS a disabled informational row — the signal never fakes a
    // toggle the server cannot honor.
    const yolo = menu?.querySelector('[aria-disabled="true"]');
    expect(yolo?.textContent).toContain("yolo");
    expect(yolo?.tagName.toLowerCase()).toBe("div");
    await actUnmount(relay.root);

    // A local-origin row with the relay alive: the origin gate still
    // refuses first — the reason is unchanged.
    const local = mount(session({ origin: "local" }), rosterGateway(ROSTER), undefined, null, true);
    await act(async () => {
      trigger(local.container, "kora-sel-mode").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(
      local.container.querySelector("#kora-sel-mode-menu")?.textContent,
    ).toContain("yolo — только для relay-сессий; эта сессия локальная");
  });

  it("dead session: the whole row is disabled (K-COMPOSER-DEAD ties the selectors to the field)", () => {
    const { container } = mount(
      session({ state: "dead" }),
      rosterGateway(ROSTER),
    );
    expect(trigger(container, "kora-sel-harness").disabled).toBe(true);
    expect(trigger(container, "kora-sel-mode").disabled).toBe(true);
    expect(
      container.querySelector('[data-testid="kora-composer-controls"]')?.getAttribute(
        "aria-disabled",
      ),
    ).toBe("true");
  });

  it("model slot: the workspace's real fact replaces the honest unknown wording (P3)", async () => {
    // Without a fact: the read-only honest wording, no value invented.
    const unknown = mount(session(), rosterGateway(ROSTER));
    expect(
      unknown.container.querySelector('[data-testid="kora-sel-model"]')
        ?.textContent,
    ).toContain("модели не сообщаются");
    await actUnmount(unknown.root);

    // With the workspace's resolved fact (the hermes roster's default):
    // the real value — the slot never contradicts the context bar.
    const resolved = mount(session(), rosterGateway(ROSTER), undefined, "qwen3:32b");
    expect(
      resolved.container.querySelector('[data-testid="kora-sel-model"]')
        ?.textContent,
    ).toContain("qwen3:32b");
    expect(
      resolved.container.querySelector('[data-testid="kora-sel-model"]')
        ?.textContent,
    ).not.toContain("модели не сообщаются");
  });

  it("a refused annotation write shows the honest persist-fail note; a later success clears it (K-PERSIST-FAIL)", async () => {
    const { container } = mount(session(), rosterGateway(ROSTER));
    await waitFor(
      () => container.querySelector("#kora-sel-specialist-trigger") !== null,
      "roster arrives",
    );
    // Private mode: every setItem refuses (removeItem still works — only
    // the annotation write is under test). The instance spy: happy-dom's
    // localStorage does not route through Storage.prototype.
    const setItem = vi
      .spyOn(localStorage, "setItem")
      .mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });
    await act(async () => {
      trigger(container, "kora-sel-specialist").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    const techLead = [...(container.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent?.includes("@GCW: Tech Lead"),
    );
    await act(async () => {
      techLead?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // The in-memory choice still works this visit (the trigger shows it),
    // but the write is NAMED — visible without opening the disclosure.
    expect(trigger(container, "kora-sel-specialist").textContent).toContain(
      "@GCW: Tech Lead",
    );
    const note = container.querySelector(
      '[data-testid="kora-specialist-persist-fail"]',
    );
    expect(note?.textContent).toContain("Не сохранилось");
    expect(localStorage.getItem(`${SPECIALIST_PREFIX}exec-zc:sess-1`)).toBeNull();
    setItem.mockRestore();
    // A later successful write clears the bit: the note goes, storage
    // carries the choice.
    await act(async () => {
      trigger(container, "kora-sel-specialist").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    const senior = [...(container.querySelectorAll("button") ?? [])].find(
      (button) =>
        button.textContent?.includes("@GCW: Senior Frontend Developer"),
    );
    await act(async () => {
      senior?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      container.querySelector('[data-testid="kora-specialist-persist-fail"]'),
    ).toBeNull();
    expect(localStorage.getItem(`${SPECIALIST_PREFIX}exec-zc:sess-1`)).toBe(
      "@GCW: Senior Frontend Developer",
    );
  });
});
