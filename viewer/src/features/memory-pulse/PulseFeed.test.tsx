import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { PulseFeed, PulseSkeleton } from "./PulseFeed";
import { I18nProvider } from "@/i18n";
import type { MemoryPulseItem } from "@/gateway/boardTypes";

/**
 * Ф1 state-matrix gate (QA verdict §3): the pulse feed covers the honest
 * states — recency feed with server provenance badges, degraded-store note,
 * the loading skeleton, and the token-bound airy row rhythm (§3.3).
 */
function renderFeed(ui: React.ReactElement): string {
  return renderToString(
    <I18nProvider initialLang="en">
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nProvider>,
  );
}

const ITEMS: MemoryPulseItem[] = [
  {
    id: "m-1",
    title: "Shell plan",
    tags: ["topic:convergence"],
    status: "published",
    created_at: "2026-09-19T10:00:00Z",
    server: "store-a",
  },
  {
    id: "m-2",
    title: "",
    tags: [],
    status: "processed",
    created_at: "2026-09-19T09:00:00Z",
    server: "store-b",
  },
];

const PLAIN_FRAGMENT = "Decision fragment, first line.\nSecond line stays verbatim.";
const WITH_CONTENT: MemoryPulseItem = {
  id: "m-3",
  title: "Fragmented",
  tags: ["topic:gateway"],
  status: "published",
  created_at: "2026-09-19T08:00:00Z",
  server: "store-a",
  content: PLAIN_FRAGMENT,
};

describe("PulseFeed", () => {
  it("renders every item with its provenance badge, status and detail link", () => {
    const html = renderFeed(<PulseFeed items={ITEMS} />);
    expect(html).toContain("store-a");
    expect(html).toContain("store-b");
    expect(html).toContain("Shell plan");
    expect(html).toContain('href="/memory/m-1"');
    // Untitled rows say so honestly; status words are localized per badge.
    expect(html).toContain("untitled");
    expect(html).toContain("published");
    expect(html).toContain("processed");
  });

  it("shows the degraded-stores note only when a store failed", () => {
    const healthy = renderFeed(
      <PulseFeed
        items={ITEMS}
        perServer={[{ server: "store-a", ok: true, items: 2, detail: null }]}
      />,
    );
    expect(healthy).not.toContain("did not answer");
    const degraded = renderFeed(
      <PulseFeed
        items={ITEMS}
        perServer={[
          { server: "store-a", ok: true, items: 2, detail: null },
          { server: "store-b", ok: false, items: 0, detail: "boom" },
        ]}
      />,
    );
    expect(degraded).toContain("Some stores did not answer");
    expect(degraded).toContain("store-b");
  });

  it("compact cut drops the tag row (Overview strip)", () => {
    const full = renderFeed(<PulseFeed items={ITEMS} />);
    const compact = renderFeed(<PulseFeed items={ITEMS} compact />);
    expect(full).toContain("topic:convergence");
    expect(compact).not.toContain("topic:convergence");
  });

  it("consumes the airy row token — rows never follow the density toggle", () => {
    const html = renderFeed(<PulseFeed items={ITEMS} />);
    expect(html).toContain("min-h-row-airy");
    // The density-driven operational token (exact class token) must NOT be
    // present: pulse is a contemplative surface (concept §3.3).
    expect(html).not.toMatch(/min-h-row(?!-)/);
    expect(html).toContain("space-y-list-gap");
  });

  it("renders a plain content fragment under the title in BOTH cuts, top-aligned", () => {
    const full = renderFeed(<PulseFeed items={[WITH_CONTENT]} />);
    const compact = renderFeed(<PulseFeed items={[WITH_CONTENT]} compact />);
    for (const html of [full, compact]) {
      // Plain path: the legacy pre-wrap div renders the fragment verbatim.
      expect(html).toContain("whitespace-pre-wrap");
      expect(html).toContain("Decision fragment, first line.");
      expect(html).toContain("Second line stays verbatim.");
      // A fragment turns the row into a title+body block → top-aligned chrome.
      expect(html).toContain("items-start");
    }
    // Compact drops tags, never the fragment (Overview keeps the preview).
    expect(full).toContain("topic:gateway");
    expect(compact).not.toContain("topic:gateway");
    // Fragment-less rows keep the centered single line.
    const bare = renderFeed(<PulseFeed items={ITEMS} />);
    expect(bare).toContain("items-center");
    expect(bare).not.toContain("items-start");
  });

  it("honest absence: null or empty fragment renders nothing extra", () => {
    const silent: MemoryPulseItem = { ...WITH_CONTENT, id: "m-4", content: null };
    const empty: MemoryPulseItem = { ...WITH_CONTENT, id: "m-5", content: "" };
    for (const item of [silent, empty]) {
      const html = renderFeed(<PulseFeed items={[item]} />);
      expect(html).not.toContain("whitespace-pre-wrap");
      expect(html).not.toContain("Decision fragment");
      // Centered single-line row (no body block → no top-align shift).
      expect(html).toContain("items-center");
    }
  });

  // ME-072 C: raw bodies often open with the title line — the card must not
  // read it twice. Exact prefix (case/whitespace-normalized) is stripped;
  // anything else passes verbatim — no smarter heuristics.
  it("strips a body that opens with the exact title (normalized case/whitespace)", () => {
    const doubled: MemoryPulseItem = {
      ...WITH_CONTENT,
      id: "m-6",
      title: "Shell plan",
      content: "shell  PLAN\nThe body continues after the duplicated heading.",
    };
    const html = renderFeed(<PulseFeed items={[doubled]} />);
    expect(html).toContain("Shell plan"); // the title link stays
    expect(html).toContain("The body continues after the duplicated heading.");
    expect(html).not.toContain("shell  PLAN");
  });

  it("renders the body verbatim when the title match is not a prefix", () => {
    const partial: MemoryPulseItem = {
      ...WITH_CONTENT,
      id: "m-7",
      title: "Shell plan",
      content: "Notes on the shell plan review.\nSecond line stays.",
    };
    const html = renderFeed(<PulseFeed items={[partial]} />);
    expect(html).toContain("Shell plan"); // title link
    expect(html).toContain("Notes on the shell plan review."); // body intact
    expect(html).toContain("Second line stays.");
  });

  it("a body equal to the title alone collapses to the honest single line", () => {
    const same: MemoryPulseItem = { ...WITH_CONTENT, id: "m-8", content: "Fragmented" };
    const html = renderFeed(<PulseFeed items={[same]} />);
    expect(html).not.toContain("whitespace-pre-wrap");
    expect(html).toContain("items-center");
  });

  it("pulse status badges explain processed/published in title/aria (no legend block)", () => {
    const html = renderFeed(
      <PulseFeed
        items={[
          { ...ITEMS[0], status: "published" },
          { ...ITEMS[1], status: "processed" },
        ]}
      />,
    );
    expect(html).toContain("visible in the well and in search");
    expect(html).toContain("parsed, waiting to be published");
    // aria-label carries status word + explanation.
    expect(html).toMatch(/aria-label="published: record published/);
    // Other statuses keep the bare word — no guessed explanations.
    expect(html).not.toMatch(/aria-label="raw:/);
  });
});

describe("PulseSkeleton", () => {
  it("mirrors the row rhythm and stays decorative", () => {
    const html = renderFeed(<PulseSkeleton rows={3} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/min-h-row-airy/g)?.length).toBe(3);
  });
});
