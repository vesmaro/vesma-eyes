// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  KoraIntentEntryPoint,
  KoraIntentEventPoints,
} from "./koraIntentEvents";
import { KoraComposer } from "./KoraComposer";
import type { KoraGateway } from "./koraGateway";
import type { KoraSpecialistsRoster } from "./koraTypes";
import { KoraGatewayContext } from "./koraGatewayContext";
import type { KoraSession } from "./koraTypes";
import type { KoraSlashCommands } from "./koraComposerSymbols";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/i18n";
import { actFlush, actUnmount } from "@/test/actTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The composer SYMBOL menus (В4; kora-ide contract §3.2, the zcode four
 * symbols, research §7.3): @ offers the cwd reference (the honest no-file-
 * list degradation), # searches the LOADED session registry, $ reads the
 * В2a roster, / carries the LOCAL commands (pin/view/filter — real
 * workspace actions; a refusal names its reason). The ANTI-ARGV PIN: «!»
 * opens nothing — the board never executes shell on the composer's
 * behalf (ADR-0019). While a menu is active Enter/Tab ACCEPT (never a
 * send), Escape dismisses the token instance.
 */

const mountedRoots: Root[] = [];

function rosterGateway(items: KoraSpecialistsRoster["items"]): KoraGateway {
  return {
    specialists: () =>
      Promise.resolve({
        ok: true,
        count: items.length,
        items,
        meta: { generated_at: "2026-10-30T00:00:00+00:00" },
      }),
  } as unknown as KoraGateway;
}

function session(patch: Partial<KoraSession> = {}): KoraSession {
  return {
    id: "exec-zc:live",
    executor_id: "exec-zc",
    native_id: "sess-live",
    harness: "zcode",
    project: "Тема",
    cwd: "/home/abyss/proj",
    state: "live",
    origin: "relay",
    steerable: true,
    started_at: "2026-09-24T09:12:00Z",
    last_activity_at: "2026-09-24T11:41:00Z",
    age_seconds: 6_000,
    last_line_preview: null,
    ...patch,
  };
}

const OTHERS: readonly KoraSession[] = [
  session({ id: "exec-zc:past", native_id: "sess-past", project: "Прошлый кейс" }),
  session({ id: "exec-vscode:x", native_id: "vx", project: "Другой", harness: "vscode" }),
];

function spyIntentEvents(): KoraIntentEventPoints {
  return {
    intentStarted: (_entryPoint: KoraEntryPoint) => {},
    intentAbandoned: (_payload: { hadText: boolean }) => {},
  };
}
type KoraEntryPoint = KoraIntentEntryPoint;

interface MountOptions {
  gateway?: KoraGateway;
  session?: KoraSession;
  registryItems?: readonly KoraSession[];
  slashCommands?: KoraSlashCommands | null;
  relayAlive?: boolean;
}

function mountComposer(opts: MountOptions = {}): { container: HTMLElement; root: Root } {
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
          <KoraGatewayContext.Provider value={opts.gateway ?? rosterGateway([])}>
            <KoraComposer
              session={opts.session ?? session()}
              intentEvents={spyIntentEvents()}
              relayAlive={opts.relayAlive}
              registryItems={opts.registryItems}
              slashCommands={opts.slashCommands}
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

/** Type with the caret parked at the end (the token reads the REAL
 * selection — the component tracks selectionStart). */
function typeText(field: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(field, value);
    field.selectionStart = field.selectionEnd = value.length;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  });
}

function pressKey(field: HTMLTextAreaElement, key: string): void {
  act(() => {
    field.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

const menu = (container: HTMLElement): HTMLElement | null =>
  container.querySelector<HTMLElement>('[data-testid="kora-symbol-menu"]');

const menuRows = (container: HTMLElement): HTMLElement[] =>
  [...container.querySelectorAll<HTMLElement>('[data-testid="kora-symbol-row"]')];

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) {
    await actUnmount(root);
  }
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("KoraComposer symbols (В4)", () => {
  it("@ opens with the cwd reference; Enter ACCEPTS the insert (never a send)", async () => {
    const send = vi.fn(() => new Promise<never>(() => {}));
    const { container } = mountComposer({
      relayAlive: true,
      gateway: {
        ...rosterGateway([]),
        sendMessage: send,
      } as unknown as KoraGateway,
    });
    typeText(input(container), "глянь @");
    expect(menu(container)).not.toBeNull();
    expect(container.textContent).toContain("/home/abyss/proj");
    // The honest degradation note: the registry reports no file list.
    expect(container.textContent).toContain("Реестр не сообщает файлы каталога");
    pressKey(input(container), "Enter");
    // The menu ate the Enter — the draft grew, the POST did not happen.
    expect(send).not.toHaveBeenCalled();
    expect(input(container).value).toBe("глянь @/home/abyss/proj ");
    expect(menu(container)).toBeNull();
  });

  it("@ without a cwd reads the honest empty note (no invented files)", () => {
    const { container } = mountComposer({
      session: session({ cwd: null }),
    });
    typeText(input(container), "@");
    expect(menu(container)).not.toBeNull();
    expect(container.querySelector('[data-testid="kora-symbol-empty"]')?.textContent).toBe(
      "Каталог сессии не сообщается",
    );
    expect(menuRows(container)).toHaveLength(0);
  });

  it("# fuzzy-searches the loaded registry and excludes the open session", () => {
    const { container } = mountComposer({ registryItems: OTHERS });
    typeText(input(container), "#");
    const rows = menuRows(container);
    expect(rows).toHaveLength(2);
    expect(container.textContent).toContain("Прошлый кейс");
    expect(container.textContent).toContain("Поиск по загруженному реестру");
    typeText(input(container), "#прош");
    expect(menuRows(container)).toHaveLength(1);
    pressKey(input(container), "Enter");
    expect(input(container).value).toBe("#Прошлый кейс ");
    // Zero-match reads honestly.
    typeText(input(container), "#чегонет ");
    typeText(input(container), "#чегонетсовсем");
    expect(
      container.querySelector('[data-testid="kora-symbol-empty"]')?.textContent,
    ).toBe("Сессий не найдено");
  });

  it("$ reads the В2a roster; without one — the honest note", async () => {
    const { container } = mountComposer({
      gateway: rosterGateway([
        { slug: "gcw-tech-lead", name: "tech-lead", profile_cached: true },
      ]),
    });
    await actFlush(); // the roster query settles into the cache
    typeText(input(container), "$");
    expect(menuRows(container)).toHaveLength(1);
    expect(container.textContent).toContain("tech-lead");
    pressKey(input(container), "Enter");
    expect(input(container).value).toBe("$tech-lead ");
    typeText(input(container), "$tech-lead ");
  });

  it("$ without a roster reads the honest note (the slot never invents)", async () => {
    const { container } = mountComposer({ gateway: rosterGateway([]) });
    await actFlush();
    typeText(input(container), "$");
    expect(
      container.querySelector('[data-testid="kora-symbol-empty"]')?.textContent,
    ).toBe("Ростер специалистов не сообщается");
  });

  it("/ carries the LOCAL commands; a run strips the token and announces", () => {
    const calls: string[] = [];
    const commands: KoraSlashCommands = {
      pin: () => {
        calls.push("pin");
        return { ok: true, note: "pin.on" };
      },
      view: () => {
        calls.push("view");
        return { ok: true, note: "view.open" };
      },
      filter: () => {
        calls.push("filter");
        return { ok: true, note: "filter.host" };
      },
    };
    const { container } = mountComposer({ slashCommands: commands });
    typeText(input(container), "/pi");
    const rows = menuRows(container);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("/pin");
    expect(container.textContent).toContain("релейные появятся вместе с реле");
    pressKey(input(container), "Enter");
    expect(calls).toEqual(["pin"]);
    // A command is an ACTION, not text — the draft returns to pre-token.
    expect(input(container).value).toBe("");
    // The workspace's real outcome is announced politely.
    expect(container.textContent).toContain("Закреплено локально");
  });

  it("/filter with an unknown host announces the honest refusal", () => {
    const commands: KoraSlashCommands = {
      pin: () => ({ ok: true, note: "pin.on" }),
      view: () => ({ ok: true, note: "view.open" }),
      filter: () => ({ ok: false, reason: "noHost" }),
    };
    const { container } = mountComposer({ slashCommands: commands });
    typeText(input(container), "/filter");
    pressKey(input(container), "Enter");
    expect(input(container).value).toBe("");
    expect(container.textContent).toContain(
      "Хост сессии не сообщается — фильтр недоступен",
    );
  });

  it("/ without workspace handlers renders honestly unavailable rows", () => {
    const { container } = mountComposer({ slashCommands: null });
    typeText(input(container), "/");
    const rows = menuRows(container);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.getAttribute("aria-disabled")).toBe("true");
    }
    expect(container.textContent).toContain("Команды доступны в рабочем пространстве Коры");
    // Enter over a disabled row is a silent no-op — nothing executes.
    pressKey(input(container), "Enter");
    expect(input(container).value).toBe("/");
  });

  it("«!» NEVER opens a menu (the anti-argv pin: no shell, ever)", () => {
    const { container } = mountComposer({ slashCommands: {
      pin: () => ({ ok: true, note: "pin.on" }),
      view: () => ({ ok: true, note: "view.open" }),
      filter: () => ({ ok: true, note: "filter.host" }),
    } });
    typeText(input(container), "!ls -la");
    expect(menu(container)).toBeNull();
    expect(input(container).value).toBe("!ls -la");
    // Not even a bare «!» at the input start.
    typeText(input(container), "");
    typeText(input(container), "!");
    expect(menu(container)).toBeNull();
    expect(container.textContent).not.toContain("Неизвестная команда");
  });

  it("Escape dismisses THIS token; a new token reopens; arrows move the highlight", () => {
    const { container } = mountComposer({ registryItems: OTHERS });
    const field = input(container);
    typeText(field, "#");
    pressKey(field, "ArrowDown");
    // The second row carries the highlight marker.
    const rows = () => menuRows(container);
    expect(rows()[0]?.getAttribute("data-highlight")).toBeNull();
    expect(rows()[1]?.getAttribute("data-highlight")).toBe("true");
    pressKey(field, "Escape");
    expect(menu(container)).toBeNull();
    // The same token instance stays dismissed while typing its body.
    typeText(field, "#п");
    expect(menu(container)).toBeNull();
    // A NEW token (different start) reopens the menu.
    typeText(field, "#прочее ");
    typeText(field, "#прочее #");
    expect(menu(container)).not.toBeNull();
  });
});
