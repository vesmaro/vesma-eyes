// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { Markdown } from "./Markdown";
import { extractHeadings } from "./headingSlug";

/**
 * D3 convention flow (owner directive 2026-10-22): «METHOD /path» headings
 * render as engine chips inside reference cards, reference-section h4s as
 * small-caps labels — on the DEFAULT docs path (upstream mirrors included),
 * with the anchor contract intact and zero DOM drift for endpoint-free
 * bodies.
 */

function render(source: string): string {
  return renderToString(
    <MemoryRouter>
      <Markdown source={source} />
    </MemoryRouter>,
  );
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

const ENDPOINT_BODY = [
  "Preamble paragraph.",
  "",
  "### `GET` `/api/memories`",
  "",
  "List memories.",
  "",
  "#### Параметры",
  "",
  "| Параметр | В |",
  "|---|---|",
  "| `limit` | запрос |",
  "",
  "#### Замечания",
  "",
  "Notes stay factory-styled.",
  "",
  "## Схемы",
  "",
  "### `GroupSpec`",
  "",
  "Schema appendix keeps the factory h3.",
].join("\n");

describe("convention flow rendering (Markdown, default docs path)", () => {
  it("wraps ONLY endpoint sections in cards; headers stay plain", () => {
    const dom = parseHtml(render(ENDPOINT_BODY));
    const cards = dom.querySelectorAll("section.rounded-md.border");
    expect(cards).toHaveLength(1);
    expect(cards[0].querySelector("h3")?.textContent).toContain("/api/memories");
  });

  it("renders the engine chip (method word + mono path, semantic colour)", () => {
    const dom = parseHtml(render(ENDPOINT_BODY));
    const chip = dom.querySelector("h3 span");
    expect(chip?.textContent).toBe("get");
    expect(chip?.className).toContain("border-iris-bright");
    // the heading textContent keeps the method + path (accessible name)
    const h3 = dom.querySelector("h3");
    expect(h3?.textContent).toBe("get /api/memories");
  });

  it("styles vocabulary h4s as labels and leaves other h4s factory", () => {
    const dom = parseHtml(render(ENDPOINT_BODY));
    const h4s = [...dom.querySelectorAll("h4")];
    const params = h4s.find((node) => node.textContent === "Параметры");
    const notes = h4s.find((node) => node.textContent === "Замечания");
    expect(params?.className).toContain("uppercase");
    expect(params?.className).toContain("tracking-wide");
    expect(notes?.className).not.toContain("uppercase");
    expect(notes?.className).toContain("text-base");
  });

  it("KEEPS THE ANCHOR CONTRACT: rendered ids equal extractHeadings ids", () => {
    const dom = parseHtml(render(ENDPOINT_BODY));
    const rendered = [...dom.querySelectorAll("h2[id], h3[id]")].map((node) => node.id);
    expect(rendered).toEqual(extractHeadings(ENDPOINT_BODY).map((item) => item.id));
  });

  it("vocabulary h4 OUTSIDE an endpoint section stays factory (review P2)", () => {
    // The mnemos architecture-overview case: «Configuration/Конфигурация»
    // h4s on an ordinary guide page carry no API semantics — the label
    // style is gated by the endpoint-section context, not page-wide.
    const body = [
      "## Overview",
      "",
      "#### Configuration",
      "",
      "Ordinary guide subsection — factory typography.",
      "",
      "#### Параметры",
      "",
      "Also factory: vocabulary alone is not API context.",
    ].join("\n");
    const dom = parseHtml(render(body));
    for (const h4 of [...dom.querySelectorAll("h4")]) {
      expect(h4.className).not.toContain("uppercase");
      expect(h4.className).toContain("text-base");
    }
  });

  it("renders enumerated h2 endpoints (mirror form) as cards with chips", () => {
    const body = [
      "## 1. `POST /v1/sessions`",
      "",
      "Create a session.",
      "",
      "#### Ответы",
      "",
      "Returns 201.",
    ].join("\n");
    const dom = parseHtml(render(body));
    const card = dom.querySelector("section.rounded-md.border");
    expect(card).not.toBeNull();
    const chip = card!.querySelector("h2 span");
    expect(chip?.textContent).toBe("post");
    expect(chip?.className).toContain("border-success");
    // review P3: the enumeration prefix stays in the accessible name
    const h2 = card!.querySelector("h2");
    expect(h2?.textContent).toBe("1. post /v1/sessions");
  });

  it("endpoint-free bodies render single-pass: no card wrapper", () => {
    const html = render("# Guide\n\n## Install\n\nRun `make install`.\n");
    expect(html).not.toContain("<section");
  });

  it("underscore paths: TOC ids equal rendered ids (anchor contract, D3)", () => {
    // The old blanket `[*_]` strip deleted underscores inside code spans,
    // so «`PATCH` `/api/automation/hooks/{rule_id}`» produced a TOC id
    // («…ruleid») that matched NO rendered heading — a dead TOC row on the
    // reference page itself. Code spans are now protected; the ids agree.
    const body = "### `PATCH` `/api/automation/hooks/{rule_id}`\n\nUpdate a hook.\n";
    const dom = parseHtml(render(body));
    const rendered = [...dom.querySelectorAll("h3[id]")].map((node) => node.id);
    expect(rendered).toEqual(extractHeadings(body).map((item) => item.id));
    expect(rendered[0]).toBe("patch-apiautomationhooksrule_id");
    // and the TOC display text keeps the real path
    expect(extractHeadings(body)[0].text).toBe("PATCH /api/automation/hooks/{rule_id}");
  });
});
