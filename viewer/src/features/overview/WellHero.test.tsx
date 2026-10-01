// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
  const start = html.indexOf("<svg");
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

describe("WellHero — counters only from sources that answered", () => {
  it("a failed health wire drops its counter; the answered tag wire keeps its own", async () => {
    const html = await renderHero(async (client, gateway) => {
      await client.prefetchQuery({
        queryKey: keys.status.boardHealth(),
        queryFn: () => Promise.reject(new Error("health down")),
      });
      await client.prefetchQuery({
        queryKey: keys.tags.list(),
        queryFn: () => gateway.listTags(),
      });
    });
    expect(html).not.toContain("records");
    expect(html).toMatch(/\d+ tags/);
  });

  it("both answered → both counters on the subtitle line", async () => {
    const html = await renderHero(async (client, gateway) => {
      await client.prefetchQuery({
        queryKey: keys.status.boardHealth(),
        queryFn: () => gateway.boardHealth(),
      });
      await client.prefetchQuery({
        queryKey: keys.tags.list(),
        queryFn: () => gateway.listTags(),
      });
    });
    expect(html).toMatch(/\d+ records/);
    expect(html).toMatch(/\d+ tags/);
  });
});

describe("WellHero — the waiting chip (one read with the cockpit)", () => {
  it("renders the chip from the settled waiting summary", async () => {
    const html = await renderHero(async (client, gateway) => {
      await seedMemories(client, gateway);
      await seedWaitingSources(client, gateway);
    });
    expect(html).toMatch(/Waiting for you: \d+/);
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
    expect(svg.slice(svg.indexOf("<svg"), svg.indexOf(">", svg.indexOf("<svg")) + 1)).toContain(
      'aria-hidden="true"',
    );
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
    expect((html.match(/well-substrate-strand/g) ?? []).length).toBeLessThanOrEqual(110);
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
