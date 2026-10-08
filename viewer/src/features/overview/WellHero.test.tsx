// @vitest-environment happy-dom
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { normalizeTickerTitle } from "./busTicker";
import { WellHero } from "./WellHero";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { I18nProvider } from "@/i18n";

/**
 * W1b hero gates: honest states (pending → nothing; error names itself;
 * empty invites), counters only from sources that answered, the waiting
 * chip, the organ's HUD readout slot, and the a11y shape of the scene
 * (aria-hidden decorative canvas, no per-node semantics). The organ itself
 * is lazy — here we assert the STATIC contract it mounts into.
 */

async function renderHero(
  seed: (client: QueryClient, gateway: MockAdapter) => Promise<void>,
  gateway = new MockAdapter({ latency: false }),
): Promise<string> {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // renderToString snapshots the seeded cache: an ERRORED query (no
        // data) would retry-on-mount and optimistically flip to pending,
        // hiding the very lines these gates pin.
        retryOnMount: false,
        refetchOnMount: false,
      },
    },
  });
  await seed(client, gateway);
  return renderToString(
    <GatewayContext.Provider value={gateway}>
      <QueryClientProvider client={client}>
        <I18nProvider initialLang="en">
          <MemoryRouter>
            <WellHero />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>,
  );
}

const seedMemories = (client: QueryClient, gateway: MockAdapter) =>
  client.prefetchQuery({
    queryKey: keys.memories.list({ limit: 42 }),
    queryFn: () => gateway.listMemories({ limit: 42 }),
  });

const seedWaitingSources = (client: QueryClient, gateway: MockAdapter) =>
  Promise.all([
    client.prefetchQuery({
      queryKey: keys.tasks.inbox({}),
      queryFn: () => gateway.inbox({}),
    }),
    client.prefetchQuery({
      queryKey: keys.tasks.board(),
      queryFn: () => gateway.board(),
    }),
    client.prefetchQuery({
      queryKey: keys.agents.assignments.list({}),
      queryFn: () => gateway.listAssignments({}),
    }),
  ]);

function wellSvg(html: string): string {
  // The U2 share button carries a lucide icon svg — anchor on the CANVAS
  // svg (the only one with a viewBox).
  const start = html.indexOf("<svg viewBox=");
  const end = html.indexOf("</svg>", start);
  return html.slice(start, end);
}

describe("WellHero — the honest states (P1-1)", () => {
  it("pending wire renders neither the error line nor the empty invitation", async () => {
    const html = await renderHero(async () => undefined); // nothing answered
    expect(html).not.toContain("The well awaits its first record");
    expect(html).not.toContain("The well is unreachable");
    // ...and no fabricated data: the data node layer stays empty
    expect(wellSvg(html)).not.toContain('class="well-node fill-iris"');
  });

  it("a failed wire names the failure; the empty invitation is absent", async () => {
    // Client-side mount: react-query's SSR optimistic result flips an
    // errored (always-stale) query back to pending, which would hide the
    // very line this gate pins — the real browser path shows it.
    const gateway = new MockAdapter({ latency: false });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, retryOnMount: false, refetchOnMount: false },
      },
    });
    await client
      .fetchQuery({
        queryKey: keys.memories.list({ limit: 42 }),
        queryFn: () => Promise.reject(new Error("wire down")),
      })
      .catch(() => undefined);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <GatewayContext.Provider value={gateway}>
          <QueryClientProvider client={client}>
            <I18nProvider initialLang="en">
              <MemoryRouter>
                <WellHero />
              </MemoryRouter>
            </I18nProvider>
          </QueryClientProvider>
        </GatewayContext.Provider>,
      );
    });
    expect(container.innerHTML).toContain("The well is unreachable");
    expect(container.innerHTML).not.toContain("The well awaits its first record");
    root.unmount();
  });

  it("an answered empty wire shows the invitation, never an error", async () => {
    const gateway = new MockAdapter({ latency: false });
    // The wire answered and found nothing — seed the honest [] on the exact
    // component key (SSR-optimistic-safe; prefetch semantics need not apply).
    const data = await gateway.listMemories({ limit: 42, tags: "vesmaro:nothing" });
    expect(data).toEqual([]);
    const html = await renderHero(async (client) => {
      client.setQueryData(keys.memories.list({ limit: 42 }), data);
      void gateway;
    });
    expect(html).toContain("The well awaits its first record");
    expect(html).not.toContain("The well is unreachable");
  });
});

describe("WellHero — the honesty counter (fix round: replaces the pair)", () => {
  it("both wires: the drawn sample of the answered total", async () => {
    const html = await renderHero(async (client, gateway) => {
      await seedMemories(client, gateway);
      await client.prefetchQuery({
        queryKey: keys.status.boardHealth(),
        queryFn: () => gateway.boardHealth(),
      });
    });
    // shown = graph.nodes.length (the drawn sample), total from the health
    // wire; the mock fixtures hold 18 memories — shown of total, honestly.
    expect(html).toMatch(/showing 18 most recent of 18/);
    expect(html).not.toContain("tags");
  });

  it("list wire only: no total claimed without the health wire", async () => {
    const html = await renderHero(seedMemories);
    expect(html).toMatch(/showing 18/);
    expect(html).not.toContain("most recent of");
  });

  it("health wire only (the list pending): today's fallback, nothing invented", async () => {
    const html = await renderHero(async (client, gateway) => {
      await client.prefetchQuery({
        queryKey: keys.status.boardHealth(),
        queryFn: () => gateway.boardHealth(),
      });
    });
    expect(html).toMatch(/18 records/);
    expect(html).not.toContain("showing");
  });

  it("pending wires render no segment at all", async () => {
    const html = await renderHero(async () => undefined);
    expect(html).not.toContain("showing");
    expect(html).not.toContain("records");
  });

  it("an answered empty well: the invitation, never a zero counter", async () => {
    const html = await renderHero(async (client, gateway) => {
      const empty = await gateway.listMemories({ limit: 42, tags: "vesmaro:nothing" });
      client.setQueryData(keys.memories.list({ limit: 42 }), empty);
      client.setQueryData(keys.status.boardHealth(), { servers: [] });
    });
    expect(html).toContain("The well awaits its first record");
    expect(html).not.toContain("showing");
    expect(html).not.toContain("records");
  });
});

describe("WellHero — ticker normalization (fix round)", () => {
  it("unit: ISO stamps cut — Z, offset and space-separated wire shapes", () => {
    expect(
      normalizeTickerTitle("Session checkpoint — 2026-10-01T21:23:58Z done", "x")
        .display,
    ).toBe("Session checkpoint — done");
    expect(
      normalizeTickerTitle("Report 2026-10-01T21:23:58.279460+00:00 shipped", "x")
        .display,
    ).toBe("Report shipped");
    expect(normalizeTickerTitle("Note 2026-10-01 21:23:58 kept", "x").display).toBe(
      "Note kept",
    );
  });

  it("unit: a title that is only a stamp falls back to id.slice(0,8)", () => {
    const out = normalizeTickerTitle("2026-10-01T21:23:58Z", "abcdef12-3333");
    expect(out.display).toBe("abcdef12");
    expect(out.full).toBe("abcdef12");
  });

  it("unit: display caps at 64 chars with «…»; the full text survives", () => {
    const long = "x".repeat(70);
    const out = normalizeTickerTitle(long, "id");
    expect(out.display).toHaveLength(65);
    expect(out.display.endsWith("…")).toBe(true);
    expect(out.full).toBe(long);
  });

  it("integration (U2): the BUS rides the ticker; a silent bus stays empty", async () => {
    // Client render — the ticker lives in an effect-owned subscription; the
    // mock bus is SILENT by default (the honesty gate's premise).
    const gateway = new MockAdapter({ latency: false });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, retryOnMount: false, refetchOnMount: false },
      },
    });
    await seedMemories(client, gateway);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <GatewayContext.Provider value={gateway}>
          <QueryClientProvider client={client}>
            <I18nProvider initialLang="en">
              <MemoryRouter>
                <WellHero />
              </MemoryRouter>
            </I18nProvider>
          </QueryClientProvider>
        </GatewayContext.Provider>,
      );
    });
    const log = (): string =>
      container.querySelector<HTMLElement>('[role="log"]')?.textContent ?? "";
    expect(log()).toBe(""); // silent bus = honest silence, never a placeholder

    await act(async () => {
      gateway.emitBusEvent("task.created", {
        task: { id: "TB-901", title: "Проверка живого слоя" },
      });
    });
    // Local receipt time + the meaning-mapped line, no raw kind codes.
    expect(log()).toMatch(/^\d{2}:\d{2} · New task: Проверка живого слоя$/);

    // A service frame never reaches the line (and never awakens).
    const before = log();
    await act(async () => {
      gateway.emitBusEvent("hello", { last_event_id: 0 });
    });
    expect(log()).toBe(before);
    root.unmount();
  });

  it("U2: the awakening waits for the FIRST bus frame, once per session", async () => {
    sessionStorage.removeItem("vesmaro.awakened");
    const gateway = new MockAdapter({ latency: false });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, retryOnMount: false, refetchOnMount: false },
      },
    });
    await seedMemories(client, gateway);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <GatewayContext.Provider value={gateway}>
          <QueryClientProvider client={client}>
            <I18nProvider initialLang="en">
              <MemoryRouter>
                <WellHero />
              </MemoryRouter>
            </I18nProvider>
          </QueryClientProvider>
        </GatewayContext.Provider>,
      );
    });
    const hero = container.querySelector("[data-well-window]")!;
    expect(hero.getAttribute("data-awaken")).toBe("false"); // still, fully drawn

    await act(async () => {
      gateway.emitBusEvent("hello", { last_event_id: 0 });
    });
    expect(hero.getAttribute("data-awaken")).toBe("false"); // hello is not an event

    await act(async () => {
      gateway.emitBusEvent("task.created", {
        task: { id: "TB-1", title: "Первое дыхание" },
      });
    });
    expect(hero.getAttribute("data-awaken")).toBe("true"); // the wave rides the bus

    // Any input cancels the wave…
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(hero.getAttribute("data-awaken")).toBe("false");

    // …and the session flag holds: a later frame never waves again.
    await act(async () => {
      gateway.emitBusEvent("report", { task_id: "TB-1", report: {} });
    });
    expect(hero.getAttribute("data-awaken")).toBe("false");
    expect(sessionStorage.getItem("vesmaro.awakened")).toBe("1");
    root.unmount();
  });

  it("U2 HUD: «Поделиться» copies the address; vitals come only from answered wires", async () => {
    const gateway = new MockAdapter({ latency: false });
    const executorsPage = await gateway.listExecutors();
    const tags = await gateway.listTags();
    const html = await renderHero(async (client, gw) => {
      await seedMemories(client, gw);
      await client.prefetchQuery({
        queryKey: keys.agents.executors.list(),
        queryFn: () => gw.listExecutors(),
      });
      await client.prefetchQuery({
        queryKey: keys.tags.list(),
        queryFn: () => gw.listTags(),
      });
      void executorsPage;
      void tags;
    });
    // The share action (v12 HUD-top; the stand stubs it — here it acts).
    expect(html).toContain("Share");
    // The vital cluster (HUD-bottom right): both wires answered.
    expect(html).toContain(`agents — ${executorsPage.count}`);
    expect(html).toContain(`tags — ${tags.length}`);
  });

  it("U2 HUD: pending wires render no vital segment", async () => {
    const html = await renderHero(seedMemories);
    expect(html).not.toContain("agents — ");
    expect(html).not.toContain("tags — ");
  });
});

describe("WellHero — the waiting chip (one read with the cockpit)", () => {
  it("renders the chip from the settled waiting summary", async () => {
    const html = await renderHero(async (client, gateway) => {
      await seedMemories(client, gateway);
      await seedWaitingSources(client, gateway);
    });
    // ME-072 C: the hero chip is the TOTAL readout («ждут всего»).
    expect(html).toMatch(/Waiting in total: \d+/);
    expect(html).toMatch(/href="\/(tasks\/inbox|tasks|agents\/execution)"/);
  });
});

describe("WellHero — scene shape: substrate first, decorative, organ slots", () => {
  it("renders the substrate as the FIRST layer, aria-hidden, before any data", async () => {
    const html = await renderHero(seedMemories);
    const svg = wellSvg(html);
    const substrateAt = svg.indexOf('class="well-substrate"');
    const dataAt = svg.indexOf('class="well-node fill-iris');
    expect(substrateAt).toBeGreaterThan(-1);
    expect(dataAt).toBeGreaterThan(substrateAt);
    expect(svg.indexOf("<svg")).toBeGreaterThanOrEqual(0);
    // aria-hidden on the group (explicit) and on the whole svg
    expect(
      svg.slice(svg.indexOf("<svg"), svg.indexOf(">", svg.indexOf("<svg")) + 1),
    ).toContain('aria-hidden="true"');
  });

  it("the substrate is sized by the constant, independent of the data layer", async () => {
    const html = await renderHero(async (client, gateway) => {
      await client.prefetchQuery({
        queryKey: keys.memories.list({ limit: 42 }),
        queryFn: () => gateway.listMemories({ limit: 42 }),
      });
    });
    // 96 substrate points even when the data wire brought memories too
    expect((html.match(/well-substrate-node/g) ?? []).length).toBe(96);
    expect((html.match(/well-substrate-strand/g) ?? []).length).toBeLessThanOrEqual(
      110,
    );
  });

  it("nodes carry no interactive semantics; readout slot is empty, aria-hidden", async () => {
    const html = await renderHero(seedMemories);
    const svg = wellSvg(html);
    expect(svg).not.toContain("role=");
    expect(svg).not.toContain("tabindex");
    const readout = /<p[^>]*data-well-readout[^>]*><\/p>/.exec(html)?.[0] ?? "";
    expect(readout).not.toBe("");
    expect(readout).toContain('aria-hidden="true"');
    expect(readout).toContain("pointer-events-none");
    // the organ, not React, owns the tone state — none at rest
    expect(html).not.toContain("data-well-tone=");
  });

  it("nodes expose the honest readout fields to the organ (data-title/date)", async () => {
    const html = await renderHero(seedMemories);
    expect(html).toContain('data-title="ADR: gateway via same-origin /api proxy"');
    expect(html).toContain('data-date="2026-09-14"');
  });
});

describe("WellHero — the tone legend (fix round, two tiers)", () => {
  it("surface strip: exactly three marks, the disclosure button, no panel at rest", async () => {
    const html = await renderHero(seedMemories);
    expect((html.match(/well-legend-dot/g) ?? []).length).toBe(3);
    // AA verdict (designer): the markers keep the dark well column, the
    // strip copy and the button are page chrome — the container carries
    // no scope marker, each dot does.
    expect((html.match(/data-well-legend=""/g) ?? []).length).toBe(3);
    expect(html).not.toMatch(/data-well-legend=""[^>]*class="relative flex/);
    expect(html).toContain("About the colors");
    expect(html).toContain("problem");
    expect(html).toContain("attention");
    expect(html).toContain("update");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="well-legend-panel"');
    expect(html).not.toContain('id="well-legend-panel"');
  });

  it("disclosure: the six-colour dictionary + sampling note, Esc returns focus, outside closes", async () => {
    const gateway = new MockAdapter({ latency: false });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, retryOnMount: false, refetchOnMount: false },
      },
    });
    await seedMemories(client, gateway);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <GatewayContext.Provider value={gateway}>
          <QueryClientProvider client={client}>
            <I18nProvider initialLang="en">
              <MemoryRouter>
                <WellHero />
              </MemoryRouter>
            </I18nProvider>
          </QueryClientProvider>
        </GatewayContext.Provider>,
      );
    });
    const button = container.querySelector<HTMLButtonElement>("#well-legend-button")!;
    const click = (): Promise<void> =>
      act(async () => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

    await click();
    const panel = container.querySelector("#well-legend-panel")!;
    expect(panel).toBeTruthy();
    expect(panel.getAttribute("role")).toBe("region");
    expect(panel.getAttribute("aria-labelledby")).toBe("well-legend-button");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll(".well-legend-swatch")).toHaveLength(6);
    expect(container.querySelectorAll(".well-legend-dot")).toHaveLength(3); // surface intact
    // the PANEL keeps the dark column marker; the strip container does not
    expect(panel.hasAttribute("data-well-legend")).toBe(true);
    expect((container.innerHTML.match(/data-well-legend=""/g) ?? []).length).toBe(4);
    expect(panel.textContent).toContain("at rest · memory read");
    expect(panel.textContent).toContain("until accepted or dismissed");
    expect(panel.textContent).toContain("most recent records and their links");
    expect(panel.textContent).toContain("only between displayed records");

    // Esc closes and returns focus to the disclosure button (2.1.2/3.2.1).
    button.focus();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(container.querySelector("#well-legend-panel")).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");

    // Re-open, then an outside pointer closes it.
    await click();
    expect(container.querySelector("#well-legend-panel")).toBeTruthy();
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(container.querySelector("#well-legend-panel")).toBeNull();

    root.unmount();
  });
});
