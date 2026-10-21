// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

import { ApiDocsBody, ApiTocTree } from "./apiPresentation";
import {
  groupToc,
  parseEndpointHeading,
  splitApiBody,
} from "./apiDocs";
import { extractHeadings, type TocItem } from "./headingSlug";
import { I18nProvider } from "@/i18n";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

/**
 * The api-board presentation (docs-api-readability): body splitting,
 * endpoint-heading parsing, card rendering with method chips, labeled
 * subsections, and the grouped TOC — plus the ONE load-bearing invariant:
 * heading ids rendered through the chunked body MUST equal the TOC
 * extractor's ids (the anchors die if they drift).
 */

const BODY = [
  "Intro paragraph before any heading.",
  "",
  "## Память",
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
  "#### Пример запроса",
  "",
  "```bash",
  "curl 'http://localhost:8090/api/memories'",
  "```",
  "",
  "### `POST` `/api/memories/groups`",
  "",
  "Save a group.",
  "",
  "## Теги",
  "",
  "### `GET` `/api/tags`",
  "",
  "#### Пример ответа",
  "",
  "```json",
  '{"ok": true}',
  "```",
  "",
  "## Схемы, используемые на странице",
  "",
  "### `GroupSpec`",
  "",
  "| Поле | Тип |",
  "|---|---|",
].join("\n");

describe("parseEndpointHeading", () => {
  it("parses METHOD + absolute path pairs", () => {
    expect(parseEndpointHeading("GET /api/memories")).toEqual({
      method: "get",
      path: "/api/memories",
    });
    expect(parseEndpointHeading("DELETE /api/memories/groups/{name}")).toEqual({
      method: "delete",
      path: "/api/memories/groups/{name}",
    });
  });

  it("rejects non-endpoint headings and non-HTTP words", () => {
    expect(parseEndpointHeading("GroupSpec")).toBeNull();
    expect(parseEndpointHeading("Memory /api/memories")).toBeNull();
    expect(parseEndpointHeading("GET not-a-path")).toBeNull();
    expect(parseEndpointHeading("")).toBeNull();
  });
});

describe("splitApiBody", () => {
  it("splits into preamble, h2 plain sections, and endpoint cards", () => {
    const chunks = splitApiBody(BODY);
    expect(chunks[0]).toMatchObject({ kind: "plain" });
    expect(chunks[0].markdown).toContain("Intro paragraph");
    const h2 = chunks.find((chunk) => chunk.markdown.startsWith("## Память"));
    expect(h2).toMatchObject({ kind: "plain", heading: null });
    const get = chunks.find((chunk) => chunk.heading !== null);
    expect(get).toMatchObject({
      kind: "card",
      heading: { method: "get", path: "/api/memories" },
    });
    // the schema appendix h3 is a card WITHOUT an endpoint heading
    const schema = chunks.find((chunk) => chunk.markdown.startsWith("### `GroupSpec`"));
    expect(schema).toMatchObject({ kind: "card", heading: null });
  });

  it("keeps ## and ### inside fences out of the split", () => {
    const body = [
      "### `GET` `/api/one`",
      "",
      "```text",
      "## not a heading",
      "### not a heading",
      "```",
      "",
      "### `GET` `/api/two`",
    ].join("\n");
    const chunks = splitApiBody(body);
    const cards = chunks.filter((chunk) => chunk.kind === "card");
    expect(cards).toHaveLength(2);
    expect(cards[1].heading).toEqual({ method: "get", path: "/api/two" });
    // the fence lines survive inside the first card
    expect(cards[0].markdown).toContain("## not a heading");
  });

  it("keeps heading order stable for the slugger (document order)", () => {
    const chunks = splitApiBody(BODY);
    const headings = chunks
      .filter((chunk) => chunk.markdown.startsWith("#"))
      .map((chunk) => chunk.markdown.split("\n")[0]);
    expect(headings).toEqual([
      "## Память",
      "### `GET` `/api/memories`",
      "### `POST` `/api/memories/groups`",
      "## Теги",
      "### `GET` `/api/tags`",
      "## Схемы, используемые на странице",
      "### `GroupSpec`",
    ]);
  });
});

describe("groupToc", () => {
  const items: TocItem[] = [
    { depth: 2, text: "Память", id: "память" },
    { depth: 3, text: "GET /api/memories", id: "get-apimemories" },
    { depth: 3, text: "POST /api/memories/groups", id: "post-apimemoriesgroups" },
    { depth: 2, text: "Схемы", id: "схемы" },
    { depth: 3, text: "GroupSpec", id: "groupspec" },
  ];

  it("nests h3 items under their h2 group in document order", () => {
    const groups = groupToc(items);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ title: "Память", id: "память" });
    expect(groups[0].items.map((item) => item.id)).toEqual([
      "get-apimemories",
      "post-apimemoriesgroups",
    ]);
  });

  it("collects items before the first h2 into a headerless group", () => {
    const groups = groupToc(items.slice(1, 3));
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBeNull();
    expect(groups[0].items).toHaveLength(2);
  });
});

describe("ApiDocsBody rendering", () => {
  async function renderBody(body: string) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <I18nProvider initialLang="ru">
          <ApiDocsBody body={body} pageSlug="api/vesmaro-eyes/memories" />
        </I18nProvider>,
      );
    });
    return { container, root };
  }

  it("renders endpoint cards with method chips + mono paths and h4 sections", async () => {
    const { container, root } = await renderBody(BODY);
    const cards = container.querySelectorAll("section.rounded-md");
    expect(cards.length).toBeGreaterThanOrEqual(3);

    const chip = container.querySelector("h3 span");
    expect(chip?.textContent).toBe("get");
    expect(chip?.className).toContain("border-iris-bright");

    const headingText = container.querySelector("h3")?.textContent;
    expect(headingText).toBe("get /api/memories");

    const h4 = [...container.querySelectorAll("h4")].map((node) => node.textContent);
    expect(h4).toContain("Параметры");
    expect(h4).toContain("Пример запроса");
    await act(async () => root.unmount());
  });

  it("colors the method chips from the semantic token map", async () => {
    const { container, root } = await renderBody(BODY);
    const chips = [...container.querySelectorAll("h3 span")];
    const classes = chips.map((chip) => chip.className);
    expect(classes.some((value) => value.includes("border-success"))).toBe(true);
    await act(async () => root.unmount());
  });

  it("KEEPS THE ANCHOR CONTRACT: rendered h3 ids equal extractHeadings ids", async () => {
    const { container, root } = await renderBody(BODY);
    const rendered = [...container.querySelectorAll("h2[id], h3[id]")].map(
      (node) => node.id,
    );
    const toc = extractHeadings(BODY).map((item) => item.id);
    expect(rendered).toEqual(toc);
    await act(async () => root.unmount());
  });

  it("renders a non-endpoint h3 (schema) with its children intact", async () => {
    const { container, root } = await renderBody(BODY);
    const schemaHeading = [...container.querySelectorAll("h3")].find((node) =>
      node.textContent?.includes("GroupSpec"),
    );
    expect(schemaHeading?.querySelector("code")?.textContent).toBe("GroupSpec");
    expect(schemaHeading?.className).not.toContain("flex");
    await act(async () => root.unmount());
  });
});

describe("ApiTocTree", () => {
  const items: TocItem[] = [
    { depth: 2, text: "Память", id: "память" },
    { depth: 3, text: "GET /api/memories", id: "get-apimemories" },
    { depth: 3, text: "DELETE /api/tags", id: "delete-apitags" },
  ];

  async function renderTree(activeId: string | null) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <I18nProvider initialLang="ru">
          <ApiTocTree items={items} activeId={activeId} />
        </I18nProvider>,
      );
    });
    return { container, root };
  }

  it("renders collapsible group headers open by default", async () => {
    const { container, root } = await renderTree(null);
    const details = container.querySelector("details");
    expect(details?.open).toBe(true);
    expect(details?.querySelector("summary")?.textContent).toContain("Память");
    await act(async () => root.unmount());
  });

  it("marks the active endpoint with aria-current", async () => {
    const { container, root } = await renderTree("get-apimemories");
    const active = container.querySelector("a[aria-current='location']");
    expect(active?.getAttribute("href")).toBe("#get-apimemories");
    await act(async () => root.unmount());
  });

  it("dots every endpoint row with a method colour (shape, not colour-only)", async () => {
    const { container, root } = await renderTree(null);
    const dot = container.querySelector("a span[aria-hidden]");
    expect(dot?.className).toContain("bg-iris-bright");
    // the method text stays visible next to the dot — colour is never the
    // sole carrier (WCAG 1.4.1)
    expect(container.querySelector("a")?.textContent).toContain("GET");
    await act(async () => root.unmount());
  });
});
