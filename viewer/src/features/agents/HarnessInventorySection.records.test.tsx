// @vitest-environment happy-dom
import { describe, expect, it, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { HarnessInventorySection } from "./HarnessInventorySection";
import { I18nProvider } from "@/i18n";
import type {
  ExecutorItem,
  HarnessInventoryEnvironment,
} from "@/gateway/boardTypes";
import { actUnmount } from "@/test/actTools";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * specialists-interactive-cards (owner directive 2026-10-21): the inventory
 * names are INTERACTIVE record cards. Covered: the disclosure grammar
 * (counter collapsed → record rows → the record card), the human record
 * structure (name / type / environment facts / the honest no-description
 * line), the actions riding EXISTING routes only (the specialist's two
 * drilldowns; the mention search + the honest «no other actions» line for
 * the rest), the raw name list surviving under its own cut («сырой ход под
 * катом»), and the defensive narrowing of absent environment fields.
 */

function executorWith(env: HarnessInventoryEnvironment): ExecutorItem {
  return {
    id: "exec-laptop-zcode",
    name: "zcode@laptop",
    harness: "zcode",
    host: "laptop",
    transport: "local-poll",
    capabilities: [],
    version: "1.11.3",
    enabled: true,
    state: "approved",
    last_seen: "2026-09-19T08:59:30+00:00",
    presence: "online",
    registered_via: "",
    registered_at: "",
    updated_at: "2026-09-19T08:00:00+00:00",
    harness_inventory: [env],
  };
}

/** The spec-§3.2-shaped snapshot: overflow counts, all four categories. */
const RICH_FIXTURE = executorWith({
  name: "zcode",
  kind: "cli",
  home_path: "/home/u/.zcode",
  exec_env: "metal",
  version: "v0.9.1",
  capabilities: {
    specialists: ["bathys-researcher", "gcw-tech-lead"],
    specialists_count: 39,
    skills: ["a11y-audit"],
    skills_count: 121,
    plugins: [],
    instructions: ["architectural-committee.md"],
    instructions_count: 24,
  },
});

/** A buggy/old agent: kind, path, surface and version all absent. */
const DEGRADED_FIXTURE = executorWith({
  name: "zcode",
  capabilities: {
    instructions: ["architectural-committee.md"],
    instructions_count: 1,
  },
});

interface Mount {
  root: Root;
  container: HTMLElement;
  text: () => string;
  buttons: () => HTMLButtonElement[];
  links: () => HTMLAnchorElement[];
}

async function mountSection(executor: ExecutorItem): Promise<Mount> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <I18nProvider initialLang="ru">
        <MemoryRouter>
          <HarnessInventorySection executor={executor} />
        </MemoryRouter>
      </I18nProvider>,
    );
  });
  return {
    root,
    container,
    text: () => container.textContent ?? "",
    buttons: () => [...container.querySelectorAll<HTMLButtonElement>("button")],
    links: () => [...container.querySelectorAll<HTMLAnchorElement>("a")],
  };
}

function buttonByText(mount: Mount, label: string): HTMLButtonElement {
  const hit = mount
    .buttons()
    .filter((button) => button.textContent?.includes(label));
  if (hit.length === 0) throw new Error(`button «${label}» not found`);
  return hit[0];
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
  });
}

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("HarnessInventorySection — interactive record cards", () => {
  it("collapsed: the counters are visible, no names and no cards yet", async () => {
    const mount = await mountSection(RICH_FIXTURE);
    expect(mount.text()).toContain("специалисты");
    expect(mount.text()).toContain("39");
    expect(mount.text()).not.toContain("bathys-researcher");
    expect(mount.text()).not.toContain("Тип записи");
    await actUnmount(mount.root);
  });

  it("opening a category renders record ROWS (buttons); the raw list survives under its own collapsed cut", async () => {
    const mount = await mountSection(RICH_FIXTURE);
    await click(buttonByText(mount, "специалисты"));
    expect(mount.text()).toContain("bathys-researcher");
    // The names are disclosure ROWS now — buttons, not a bare list.
    const recordRow = mount
      .buttons()
      .find((button) => button.textContent?.includes("bathys-researcher"));
    expect(recordRow).toBeDefined();
    expect(recordRow!.getAttribute("aria-expanded")).toBe("false");
    // The raw view survives, collapsed by default.
    const raw = buttonByText(mount, "сырой список имён");
    expect(raw.getAttribute("aria-expanded")).toBe("false");
    await click(raw);
    // The raw list renders the SAME names one cut deeper (2nd occurrence).
    expect(countOf(mount.text(), "bathys-researcher")).toBe(2);
    await actUnmount(mount.root);
  });

  it("a specialist record card: human structure + honest no-description + both drilldowns", async () => {
    const mount = await mountSection(RICH_FIXTURE);
    await click(buttonByText(mount, "специалисты"));
    await click(buttonByText(mount, "bathys-researcher"));
    const text = mount.text();
    // The structured facts — not a raw dump.
    expect(text).toContain("Имя");
    expect(text).toContain("Тип записи");
    expect(text).toContain("Окружение");
    expect(text).toContain("zcode · cli");
    expect(text).toContain("/home/u/.zcode");
    expect(text).toContain("Версия окружения");
    expect(text).toContain("metal");
    // The honest absence: the wire carries no description.
    expect(text).toContain("Описание");
    expect(text).toContain("нет — агент присылает только имена");
    // Actions ride EXISTING routes: the task ?agent= filter and the
    // execution page's ?specialist= seed.
    const hrefs = mount.links().map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/tasks/list?agent=bathys-researcher");
    expect(hrefs).toContain("/agents/execution?specialist=bathys-researcher");
    // The aria grammar: the row is expanded, the card is wired by id.
    const row = mount
      .buttons()
      .find((button) => button.textContent?.includes("bathys-researcher"));
    expect(row!.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(row!.getAttribute("aria-controls")!)).not.toBeNull();
    await actUnmount(mount.root);
  });

  it("a skill record card: the mention search plus the honest «no other actions» line", async () => {
    const mount = await mountSection(RICH_FIXTURE);
    await click(buttonByText(mount, "скиллы"));
    await click(buttonByText(mount, "a11y-audit"));
    const hrefs = mount.links().map((link) => link.getAttribute("href"));
    expect(hrefs).toContain(`/tasks/list?q=${encodeURIComponent("a11y-audit")}`);
    expect(mount.text()).toContain(
      "других действий у записи нет — она известна только из отчёта агента",
    );
    await actUnmount(mount.root);
  });

  it("an empty category (plugins) stays the honest «no names» line — no rows, no raw cut", async () => {
    const mount = await mountSection(RICH_FIXTURE);
    await click(buttonByText(mount, "плагины"));
    expect(mount.text()).toContain("имён нет — только счётчик");
    expect(mount.text()).not.toContain("сырой список имён");
    await actUnmount(mount.root);
  });

  it("a degraded environment (no kind/path/surface/version): the card renders with fewer facts, never a crash", async () => {
    const mount = await mountSection(DEGRADED_FIXTURE);
    await click(buttonByText(mount, "инструкции"));
    await click(buttonByText(mount, "architectural-committee.md"));
    const text = mount.text();
    expect(text).toContain("Имя");
    expect(text).toContain("architectural-committee.md");
    // Absent env facts are ABSENT (honest narrowing), the card stands.
    expect(text).not.toContain("Путь окружения");
    expect(text).not.toContain("Версия окружения");
    expect(text).not.toContain("Среда");
    expect(mount.links().map((link) => link.getAttribute("href"))).toContain(
      `/tasks/list?q=${encodeURIComponent("architectural-committee.md")}`,
    );
    await actUnmount(mount.root);
  });
});
