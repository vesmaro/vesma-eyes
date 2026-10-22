// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/i18n";
import { actUnmount } from "@/test/actTools";
import { KoraMetaPanel } from "./KoraMetaPanel";
import { resetEtherForTests, type KoraEtherRow } from "./koraEtherStore";
import { KORA_FIXTURE_COVERAGE } from "./koraFixtures";
import type { KoraSession } from "./koraTypes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The RIGHT meta panel (kora-rethink blueprint §4, KW1): the states.md §5
 * defaults — О СЕССИИ expanded with a selected session (collapsed with the
 * honest line otherwise), ЭФИР expanded, ДАЙДЖЕСТ + ПОКРЫТИЕ collapsed;
 * the honest empties inside; the Эфир renders the real ring rows.
 */

const SESSION: KoraSession = {
  id: "exec-zcode-main:sess_7f3a91",
  executor_id: "exec-zcode-main",
  native_id: "sess_7f3a91",
  harness: "zcode",
  project: "mnemos-mesh",
  state: "live",
  origin: "local",
  steerable: false,
  age_seconds: 8940,
  started_at: "2026-09-24T09:15:00Z",
  last_activity_at: "2026-09-24T11:30:00Z",
  last_line_preview: "разобрал 3 падения",
} as unknown as KoraSession;

const ETHER_ROWS: readonly KoraEtherRow[] = [
  {
    id: 1,
    ts: Date.parse("2026-10-08T10:00:00Z"),
    host: "gpu-box",
    key: "kora.ether.online",
    params: { name: "zcode@box", host: "gpu-box" },
  },
];

const mountedRoots: Root[] = [];

function mountPanel(options: {
  session?: KoraSession | null;
  coverage?: typeof KORA_FIXTURE_COVERAGE | null;
  etherRows?: readonly KoraEtherRow[];
}): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      <I18nProvider initialLang="ru">
        <KoraMetaPanel
          session={options.session ?? null}
          coverage={
            options.coverage === undefined ? KORA_FIXTURE_COVERAGE : options.coverage
          }
          etherRows={options.etherRows ?? []}
        />
      </I18nProvider>,
    );
  });
  return container;
}

const disclosure = (
  container: HTMLElement,
  id: string,
): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>(
    `button[aria-controls="${id}"]`,
  );
  if (found === null) throw new Error(`disclosure ${id} not rendered`);
  return found;
};

afterEach(async () => {
  while (mountedRoots.length > 0) {
    await actUnmount(mountedRoots.pop()!);
  }
  document.body.innerHTML = "";
  resetEtherForTests();
});

describe("KoraMetaPanel — the states.md §5 defaults", () => {
  it("with a session: О СЕССИИ expanded (fields + copy link), ЭФИР expanded, ДАЙДЖЕСТ + ПОКРЫТИЕ collapsed", () => {
    const container = mountPanel({ session: SESSION });
    expect(disclosure(container, "kora-meta-about-body").getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(disclosure(container, "kora-meta-ether-body").getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(disclosure(container, "kora-meta-digest-body").getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(disclosure(container, "kora-legend-body").getAttribute("aria-expanded")).toBe(
      "false",
    );
    // The About body is really there: the registry fields + the ONE link.
    expect(container.textContent).toContain("Начало");
    expect(container.textContent).toContain("Скопировать ссылку на сессию");
    // The digest stays folded — no wing content leaks.
    expect(container.textContent).not.toContain(
      "Разбор сессии собирается автоматически — появится позже",
    );
  });

  it("without a session: О СЕССИИ collapsed with the honest line; the digest names its empty", () => {
    const container = mountPanel({ session: null });
    expect(disclosure(container, "kora-meta-about-body").getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(container.textContent).toContain(
      "Сессия не выбрана — свойства появятся здесь",
    );
    // The digest's folded body still opens on the honest empty (no session
    // → the invitation, never a fake digest).
    act(() => {
      disclosure(container, "kora-meta-digest-body").click();
    });
    expect(container.textContent).toContain(
      "Выберите сессию — её разбор появится здесь",
    );
  });

  it("a session flips the digest to the honest building note + transcript action", () => {
    const container = mountPanel({ session: SESSION });
    act(() => {
      disclosure(container, "kora-meta-digest-body").click();
    });
    expect(container.textContent).toContain(
      "Разбор сессии собирается автоматически — появится позже",
    );
    expect(container.textContent).toContain("Читать транскрипт");
  });

  it("the Эфир block renders the REAL ring rows and the honest empty (a silent bus)", () => {
    const fed = mountPanel({ etherRows: ETHER_ROWS });
    expect(fed.textContent).toContain("zcode@box на gpu-box — на связи");
    const silent = mountPanel({ etherRows: [] });
    expect(silent.textContent).toContain(
      "Событий пока нет — лента собирает то, что происходит в сессиях, пока вы на странице",
    );
  });

  it("no coverage named by the server → the ПОКРЫТИЕ block is hidden honestly", () => {
    const container = mountPanel({ coverage: null });
    expect(container.textContent).not.toContain("Что мы видим с ваших машин");
  });
});
