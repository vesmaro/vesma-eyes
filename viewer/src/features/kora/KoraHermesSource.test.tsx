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
 * T004 slice 2 (hermes-bridge FE): the hermes source rides the ONE registry
 * leg as a first-class filter. Behavioral contract under test:
 *
 * - the mock registry starts WITHOUT hermes rows — the slice fills ONLY on
 *   a pull (the pull IS the ingest, the server's pull→upsert flow);
 * - the hermes filter context selects by harness and starts honestly empty
 *   («Сессий пока нет — нажмите Обновить»);
 * - ONE manual refresh (button) ingests the hermes rows and the SAME list
 *   re-renders with them — never an auto-pull;
 * - the off mode (`?hermesBridge=off`) renders the honest off-slot with the
 *   human reason, and the pull throws the typed hermes_off error;
 * - hermes transcript fixtures are the deliberate slice-3 gap (404-shaped).
 */

interface MountOptions {
  /** `?hermesBridge=off` — the mock demo knob. */
  hermesOff?: boolean;
}

function mountWorkspace(options: MountOptions = {}): {
  container: HTMLElement;
  root: Root;
  queryClient: QueryClient;
} {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Prefill the paged registry cache WITHOUT hermes rows (the mock filters
  // them until the pull anyway; the point is a pending-free render).
  queryClient.setQueryData(koraKeys.sessionsPaged(50), {
    pages: [
      {
        ok: true as const,
        count: KORA_FIXTURE_SESSIONS.length,
        items: [...KORA_FIXTURE_SESSIONS],
        coverage: KORA_FIXTURE_COVERAGE,
        meta: { generated_at: "2026-09-24T11:45:00Z" },
      },
    ],
    pageParams: [0],
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  // The off knob reads the SHARED window.location at construction — point
  // it at the demo param before any adapter exists (the MemoryRouter entry
  // is display-only: the mock reads the browser's location, not the router's).
  history.replaceState(null, "", options.hermesOff ? "/?hermesBridge=off" : "/");
  const search = options.hermesOff ? "?hermesBridge=off" : "";
  act(() => {
    root.render(
      <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
        <KoraGatewayContext.Provider value={new KoraMockAdapter({ latency: false })}>
          <QueryClientProvider client={queryClient}>
            <I18nProvider initialLang="ru">
              <MemoryRouter initialEntries={[`/kora${search}`]}>
                <KoraWorkspace />
              </MemoryRouter>
            </I18nProvider>
          </QueryClientProvider>
        </KoraGatewayContext.Provider>
      </GatewayContext.Provider>,
    );
  });
  return { container, root, queryClient };
}

/** Select the hermes source option in the ONE header filter. */
async function selectHermes(container: HTMLElement): Promise<void> {
  const select = container.querySelector<HTMLSelectElement>("#kora-host-filter");
  if (select === null) throw new Error("host filter select not rendered");
  const set = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    set?.call(select, "hermes");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

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

  it("the hermes filter context starts honestly empty (no auto-pull)", async () => {
    const { container } = mountWorkspace();
    await settle();
    await selectHermes(container);
    await settle();
    expect(container.textContent).toContain("Сессии · Hermes (кластер)");
    expect(container.textContent).toContain("Сессий пока нет");
    // The ONE refresh button exists in the hermes context…
    expect(
      [...container.querySelectorAll("button")].some((el) =>
        el.textContent?.includes("Обновить"),
      ),
    ).toBe(true);
    // …and NO hermes row arrived (the auto-pull must not exist).
    expect(container.textContent).not.toContain("Hysteria прокси");
    expect(container.textContent).not.toContain("Confirm with OK");
  });

  it("one manual refresh fills the list through the same registry leg", async () => {
    const { container } = mountWorkspace();
    await settle();
    await selectHermes(container);
    expect(container.textContent).toContain("Сессий пока нет");
    await clickRefresh(container);
    await settle();
    // The hermes rows land in Блок 2 (the display name is the project
    // field — `hermes:<source>`; the native id rides «О сессии»).
    expect(container.textContent).toContain("hermes:api_server");
    expect(container.textContent).toContain("hermes:telegram");
    // The status line reports the ok state (DATA, honest light).
    expect(container.textContent).toContain("подключён");
    expect(container.textContent).toContain("сессий в реестре: 2");
  });

  it("the off mode renders the honest off-slot with the human reason", async () => {
    const { container } = mountWorkspace({ hermesOff: true });
    await settle();
    await selectHermes(container);
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

  it("a clicked hermes session names the slice-3 gap, never an empty click", async () => {
    const { container, root, queryClient } = mountWorkspace();
    await settle();
    await selectHermes(container);
    await clickRefresh(container);
    await settle();
    // Open a hermes session (the route is the selection seam).
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
    // The honest placeholder names the gap…
    expect(container.textContent).toContain(
      "Просмотр транскриптов hermes — в следующем обновлении",
    );
    // …the transcript scroll never renders for hermes…
    expect(container.textContent).not.toContain("Следить за хвостом");
    // …and no composer (the send is a later slice too).
    expect(container.textContent).not.toContain("Написать агенту");
  });
});