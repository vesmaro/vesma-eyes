// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { KoraHostField } from "./KoraHostField";
import type { KoraSession } from "./koraTypes";
import {
  buildKoraTree,
  type KoraQuickFilter,
  type KoraWorkspaceModel,
} from "./koraWorkspaceModel";
import type { ExecutorItem } from "@/gateway/boardTypes";
import { I18nProvider } from "@/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The KW4 host field (blueprint-kw4 §2–3, states-kw4 §1–2): the host
 * headline (registry derivatives only), the light agent chips, the grouped
 * sessions of the selected agent with the persisted open-set
 * (vesmaro.koraGroups), the honest empty states and the K-GRP-MORE leg.
 * The component is PURE over its props — no gateway, no new requests (§9.2).
 */

function executor(
  id: string,
  harness: string,
  host: string,
  presence: ExecutorItem["presence"] = "online",
): ExecutorItem {
  return {
    id,
    name: `${harness}@${host}`,
    harness,
    host,
    transport: "local-poll",
    capabilities: [],
    version: "1.0.0",
    enabled: true,
    state: "approved",
    last_seen: "2026-09-24T11:00:00Z",
    presence,
    registered_via: "",
    registered_at: "2026-09-20T09:00:00Z",
    updated_at: "2026-09-24T11:00:00Z",
  };
}

function session(
  partial: Partial<KoraSession> &
    Pick<KoraSession, "id" | "executor_id" | "state" | "harness">,
): KoraSession {
  return {
    native_id: partial.id,
    origin: "local",
    steerable: false,
    project: null,
    cwd: null,
    started_at: null,
    last_activity_at: null,
    age_seconds: 0,
    last_line_preview: null,
    ...partial,
  };
}

/** Two agents on abyss-laptop: zcode owns 4 sessions across TWO cwds with
 * the SAME basename? No — distinct dirs + one no-cwd row; pi owns one
 * no-cwd row. zcode is the freshest agent (age 60) → the default. */
const FIXTURE_EXECUTORS = [
  executor("exec-zcode-main", "zcode", "abyss-laptop"),
  executor("exec-pi-edge", "pi", "abyss-laptop", "stale"),
];

const FIXTURE_SESSIONS: readonly KoraSession[] = [
  session({
    id: "s1",
    executor_id: "exec-zcode-main",
    state: "live",
    harness: "zcode",
    project: "proj",
    cwd: "/home/a/proj",
    age_seconds: 60,
    last_line_preview: "правлю тесты",
  }),
  session({
    id: "s2",
    executor_id: "exec-zcode-main",
    state: "idle",
    harness: "zcode",
    project: "proj",
    cwd: "/home/a/proj",
    age_seconds: 3600,
  }),
  session({
    id: "s3",
    executor_id: "exec-zcode-main",
    state: "idle",
    harness: "zcode",
    project: "other",
    cwd: "/home/b/proj",
    age_seconds: 7200,
  }),
  session({
    id: "s4",
    executor_id: "exec-zcode-main",
    state: "dead",
    harness: "zcode",
    age_seconds: 100_000,
  }),
  session({
    id: "s5",
    executor_id: "exec-pi-edge",
    state: "idle",
    harness: "pi",
    age_seconds: 500,
  }),
];

function buildModel(): KoraWorkspaceModel {
  return buildKoraTree(FIXTURE_SESSIONS, FIXTURE_EXECUTORS);
}

function mountField(
  props: Partial<Parameters<typeof KoraHostField>[0]> = {},
): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <I18nProvider initialLang="ru">
        <MemoryRouter initialEntries={["/kora/host/abyss-laptop"]}>
          <KoraHostField
            host="abyss-laptop"
            model={buildModel()}
            quickFilter={null}
            onQuickFilter={() => undefined}
            onSelectAgent={() => undefined}
            {...props}
          />
        </MemoryRouter>
      </I18nProvider>,
    );
  });
  return { container, root };
}

const buttonByText = (container: HTMLElement, text: string): HTMLElement => {
  const found = [...container.querySelectorAll("button")].find((el) =>
    el.textContent?.includes(text),
  );
  if (found === undefined) throw new Error(`button «${text}» not rendered`);
  return found;
};

afterEach(async () => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("KoraHostField (KW4, blueprint-kw4 §3 / states-kw4 §1–2)", () => {
  it("the headline carries the registry derivatives only", () => {
    const { container } = mountField();
    const headline = container.querySelector("h2");
    expect(headline?.textContent).toBe("abyss-laptop");
    expect(container.textContent).toContain(
      "агентов: 2 · идёт: 1 / всего: 5 · за 24 ч: 4",
    );
  });

  it("the agent chips: light grammar, presence as text, counts; no operation menus", () => {
    const { container } = mountField();
    const zcode = buttonByText(container, "zcode@abyss-laptop");
    expect(zcode.getAttribute("aria-pressed")).toBe("true"); // the default agent
    expect(zcode.textContent).toContain("· 4"); // session count
    expect(zcode.textContent).toContain("· 1 мин"); // freshest activity (age 60)
    expect(zcode.querySelector(".sr-only")?.textContent).toContain("онлайн");
    const pi = buttonByText(container, "pi@abyss-laptop");
    expect(pi.getAttribute("aria-pressed")).toBe("false");
    expect(pi.querySelector(".sr-only")?.textContent).toContain("пульс пропущен");
    // Кора = журнал: no operation menus on the chips (§9.8).
    expect(container.innerHTML).not.toContain("menu");
  });

  it("the default agent is the FRESHEST one; a chip click selects that agent", () => {
    const selected: string[] = [];
    const { container } = mountField({
      onSelectAgent: (executorId) => selected.push(executorId),
    });
    // The default: zcode (its freshest row, age 60, beats pi's 500).
    expect(container.textContent).toContain("proj"); // zcode's cwd basename
    act(() => {
      buttonByText(container, "pi@abyss-laptop").click();
    });
    expect(selected).toEqual(["exec-pi-edge"]);
  });

  it("an explicit ?agent= overrides the default; an unknown id falls back", () => {
    const { container } = mountField({ selectedAgentId: "exec-pi-edge" });
    // pi owns one no-cwd session — its (folded) group renders.
    expect(container.textContent).toContain("Без каталога· 1");
    const pressed = [...container.querySelectorAll("button[aria-pressed='true']")];
    expect(pressed.some((el) => el.textContent?.includes("pi@abyss-laptop"))).toBe(
      true,
    );
    // An unknown executor id falls back to the freshest default (zcode).
    const fallback = mountField({ selectedAgentId: "exec-ghost" });
    expect(fallback.container.textContent).toContain("proj"); // default again
  });

  it("groups by cwd basename; the live group is open, the others stay folded", () => {
    const { container } = mountField();
    // The default agent is zcode: groups /home/a/proj (live → open),
    // /home/b/proj (idle → folded), __nocwd__ (dead → folded).
    expect(container.textContent).toContain("proj· 2");
    expect(container.querySelector('a[href="/kora/s1"]')).not.toBeNull();
    expect(container.querySelector('a[href="/kora/s3"]')).toBeNull();
    expect(container.textContent).toContain("proj· 1"); // the folded b group
    expect(container.textContent).toContain("Без каталога· 1");
    expect(container.querySelector('a[href="/kora/s4"]')).toBeNull();
  });

  it("basename collisions stay apart: two full-cwd groups, one title each", () => {
    const sessions = [
      session({
        id: "c1",
        executor_id: "exec-zcode-main",
        state: "idle",
        harness: "zcode",
        cwd: "/home/a/same",
        age_seconds: 100,
      }),
      session({
        id: "c2",
        executor_id: "exec-zcode-main",
        state: "idle",
        harness: "zcode",
        cwd: "/home/b/same",
        age_seconds: 200,
      }),
    ];
    const model = buildKoraTree(sessions, [FIXTURE_EXECUTORS[0]!]);
    const { container } = mountField({ model });
    const titles = [...container.querySelectorAll("button[aria-expanded]")].map(
      (el) => el.textContent,
    );
    expect(titles.filter((title) => title?.includes("same"))).toHaveLength(2);
  });

  it("a group toggle persists the open-set (vesmaro.koraGroups)", () => {
    const { container } = mountField();
    expect(localStorage.getItem("vesmaro.koraGroups")).toBeNull();
    act(() => {
      buttonByText(container, "proj· 1").click(); // open the b group
    });
    const stored = JSON.parse(localStorage.getItem("vesmaro.koraGroups") ?? "[]");
    expect(stored).toContain("/home/b/proj");
    expect(container.querySelector('a[href="/kora/s3"]')).not.toBeNull();
  });

  it("a persisted open-set seeds the mount VERBATIM (the user's toggles win)", () => {
    localStorage.setItem("vesmaro.koraGroups", JSON.stringify(["/home/b/proj"]));
    const { container } = mountField();
    expect(container.querySelector('a[href="/kora/s3"]')).not.toBeNull();
    expect(container.querySelector('a[href="/kora/s1"]')).toBeNull(); // live default loses
  });

  it("the quick filter runs BEFORE grouping — empty groups do not render", () => {
    const { container } = mountField({ quickFilter: "running" as KoraQuickFilter });
    // Only s1 (live) survives → only its group renders.
    expect(container.textContent).toContain("proj· 1");
    expect(container.textContent).not.toContain("Без каталога");
    expect(container.querySelector('a[href="/kora/s2"]')).toBeNull();
  });

  it("K-GRP-MORE: the load-more leg shows while the registry may hold more", () => {
    const loads: number[] = [];
    const { container } = mountField({
      hasMore: true,
      onLoadMore: () => loads.push(1),
    });
    act(() => {
      buttonByText(container, "Показать ещё").click();
    });
    expect(loads).toHaveLength(1);
    const quiet = mountField({});
    expect(quiet.container.textContent).not.toContain("Показать ещё");
  });

  it("K-CTX-HOST-UNKNOWN: the honest empty with one way back", () => {
    const { container } = mountField({ host: "nowhere" });
    expect(container.textContent).toContain("Такого хоста нет в реестре");
    const back = container.querySelector<HTMLAnchorElement>('a[href="/kora"]');
    expect(back?.textContent).toContain("К Коре");
  });

  it("K-CTX-NO-AGENTS: the constatation without a CTA (ME-072)", () => {
    // buildKoraTree never builds an agent-less NAMED host (a named host
    // exists only because an executor enrolled) — the degenerate model is
    // constructed literally; the branch stays an honest guard.
    const model: KoraWorkspaceModel = {
      hosts: [
        { host: "abyss-laptop", agents: [], state: null, sessionCount: 0 },
      ],
      unknown: [],
    };
    const { container } = mountField({ model });
    expect(container.textContent).toContain("На этом хосте пока нет агентов");
    expect(container.querySelector("a[href='/agents/harnesses']")).toBeNull();
  });

  it("hermes groups read «источник: <source>»", () => {
    const sessions = [
      session({
        id: "h1",
        executor_id: "hermes-x",
        state: "live",
        harness: "hermes",
        project: "hermes:api_server",
        cwd: null,
      }),
    ];
    const exec = executor("hermes-x", "hermes", "cluster");
    const model = buildKoraTree(sessions, [exec]);
    const { container } = mountField({ model, host: "cluster" });
    expect(container.textContent).toContain("источник: api_server");
  });

  it("K-CTX-AGENT-EMPTY: the honest line for a session-less agent", () => {
    const sessions = [
      session({
        id: "s1",
        executor_id: "exec-zcode-main",
        state: "live",
        harness: "zcode",
        cwd: "/p",
      }),
    ];
    const model = buildKoraTree(sessions, [
      FIXTURE_EXECUTORS[0]!,
      executor("exec-fresh", "vscode", "abyss-laptop"),
    ]);
    const { container } = mountField({ model, selectedAgentId: "exec-fresh" });
    expect(container.textContent).toContain("У этого агента сессий нет");
  });

  it("a11y: a host/agent route change moves the focus to the field's h2 (§7); the first mount never steals it", () => {
    const { container, root } = mountField();
    const headline = container.querySelector("h2");
    // The fresh mount must not grab the reading focus.
    expect(document.activeElement).not.toBe(headline);
    // The route change (?agent= writes a new selectedAgentId) → the h2
    // receives the focus — the reading position follows the selection.
    act(() => {
      root.render(
        <I18nProvider initialLang="ru">
          <MemoryRouter initialEntries={["/kora/host/abyss-laptop"]}>
            <KoraHostField
              host="abyss-laptop"
              model={buildModel()}
              quickFilter={null}
              onQuickFilter={() => undefined}
              onSelectAgent={() => undefined}
              selectedAgentId="exec-pi-edge"
            />
          </MemoryRouter>
        </I18nProvider>,
      );
    });
    expect(document.activeElement).toBe(headline);
    // The focusable headline carries the visible focus outline contract.
    expect(headline?.getAttribute("tabindex")).toBe("-1");
  });
});
