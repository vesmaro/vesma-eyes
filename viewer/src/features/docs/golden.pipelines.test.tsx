// @vitest-environment happy-dom
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { Markdown } from "./Markdown";
import { parseFrontmatter, stripLeadingH1 } from "./manifest";
import goldenRaw from "./__fixtures__/golden.md?raw";
import { MarkdownView } from "@/components/TextEngine/MarkdownView";
import { I18nProvider } from "@/i18n";

/**
 * ME-011 / ADR 0020 Ф0 — GOLDEN RENDER GATES for both pipelines.
 *
 * Snapshot-style: the CURRENT full HTML output of each pipeline on the
 * representative corpus (`__fixtures__/golden.md`) is pinned to a golden
 * file. Phase Ф1 (text-engine/core extraction) is accepted ONLY on a ZERO
 * behavioral diff — these files are its gate: an F1 PR must show the golden
 * files byte-identical (or, for a ratified render change, re-baselined in a
 * dedicated commit with the ADR reference in the message).
 *
 * Pinned here:
 * - the CURATED pipeline (`features/docs/Markdown.tsx` — raw-HTML → sanitize,
 *   mermaid component, heading slugs, banner cut);
 * - the UNTRUSTED pipeline (`components/TextEngine/MarkdownView` — escape-only,
 *   no slugs, mermaid fence = inert code block, schemes whitelisted).
 *
 * Negative control: a MUTATED render must fail the golden gate — proves the
 * comparison is load-bearing (an always-green gate would let an F1 regression
 * through silently).
 *
 * Baselining: GOLDEN_UPDATE=1 npx vitest run src/features/docs/golden.pipelines.test.tsx
 * rewrites the goldens. Never mix a render-behavior change and a golden
 * update into an unrelated commit.
 */

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "__snapshots__",
);

/**
 * Compare against the golden file.
 *
 * `GOLDEN_UPDATE=1` rewrites the baseline (deliberate, explicit).
 * `{ force: true }` ALWAYS compares — the negative controls use it so a
 * baselining run can never silently accept a mutated render (and an
 * update run cannot corrupt the golden with mutant output).
 */
function expectGolden(
  actual: string,
  name: string,
  options: { force?: boolean } = {},
): void {
  const goldenPath = join(FIXTURE_DIR, name);
  if (process.env.GOLDEN_UPDATE === "1" && !options.force) {
    writeFileSync(goldenPath, actual, "utf8");
    return;
  }
  let golden: string;
  try {
    golden = readFileSync(goldenPath, "utf8");
  } catch {
    throw new Error(
      `golden file missing: ${goldenPath} — baseline with GOLDEN_UPDATE=1`,
    );
  }
  expect(actual, `golden diff vs ${name} (F1 must be a ZERO diff)`).toBe(
    golden,
  );
}

// --- curated pipeline (features/docs/Markdown.tsx) ---------------------------

/** Same preparation as a real page: frontmatter off, leading h1 off. */
const corpusBody = stripLeadingH1(parseFrontmatter(goldenRaw)!.body);

function renderDocs(source: string): string {
  return renderToString(
    <MemoryRouter>
      <Markdown source={source} />
    </MemoryRouter>,
  );
}

// --- untrusted pipeline (TextEngine → MarkdownView) --------------------------

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(ui: React.ReactElement): Promise<HTMLDivElement> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<I18nProvider initialLang="en">{ui}</I18nProvider>);
  });
  return container;
}

beforeEach(() => {
  container = null;
  root = null;
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

describe("golden — curated pipeline (Markdown.tsx)", () => {
  // SSR (renderToString): effects never run → mermaid fences stay in their
  // loader-fallback form (source visible, no svg) — deterministic goldens.
  const html = renderDocs(corpusBody);
  const doc = new DOMParser().parseFromString(html, "text/html");

  it("pins the CURRENT full HTML (golden gate)", () => {
    expectGolden(html, "golden.docs-render.html");
  });

  it("renders the representative element classes (headings/lists/tables/links)", () => {
    expect(doc.querySelector("h2")?.textContent).toBe("Headings");
    expect(doc.querySelector("h3")?.textContent).toBe("Level three");
    expect(doc.querySelectorAll("ul > li").length).toBeGreaterThanOrEqual(3);
    expect(doc.querySelector("ol > li")).not.toBeNull();
    expect(doc.querySelector("blockquote")).not.toBeNull();
    expect(doc.querySelector("table > tbody > tr > td")).not.toBeNull();
    expect(doc.querySelector("hr")).not.toBeNull();
    // Heading slugs are curated-profile-only.
    expect(doc.querySelector('h2[id="headings"]')).not.toBeNull();
  });

  it("classes external links (noopener + new tab)", () => {
    const anchor = [...doc.querySelectorAll("a")].find(
      (a) => a.getAttribute("href") === "https://example.com/ok",
    );
    expect(anchor?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(anchor?.getAttribute("target")).toBe("_blank");
  });

  it("keeps curated parity elements (details/kbd/sub/sup) and code label", () => {
    expect(doc.querySelector("details > summary")?.textContent).toBe(
      "parity details",
    );
    expect(doc.querySelector("kbd")?.textContent).toBe("Ctrl");
    expect(doc.querySelector("sub")?.textContent).toBe("low");
    expect(doc.querySelector("sup")?.textContent).toBe("high");
    expect(doc.body.textContent).toContain("lang token survives");
  });

  it("keeps the mermaid fence in loader-fallback form (SSR): source visible, NO svg", () => {
    // Real browser svg render is the Playwright smoke's job (ME-011 part b);
    // the unit golden pins the SSR-safe fallback shape.
    const figures = [...doc.querySelectorAll("figure")];
    expect(figures.length).toBeGreaterThanOrEqual(1);
    const contentSvgs = [...doc.querySelectorAll("svg")].filter(
      (svg) => !(svg.getAttribute("class") ?? "").includes("lucide"),
    );
    expect(contentSvgs).toEqual([]);
    expect(doc.body.textContent).toContain("flowchart LR");
    expect(doc.body.textContent).toContain("B -->|ok| C[Corpus]");
  });

  it("neutralizes every hostile vector (script/iframe/handlers/schemes)", () => {
    for (const tag of ["script", "iframe", "object", "embed", "form", "style"]) {
      expect(doc.querySelector(tag), `<${tag}> reached the DOM`).toBeNull();
    }
    const withHandlers = [...doc.querySelectorAll("*")].filter((element) =>
      [...element.attributes].some((attribute) =>
        attribute.name.startsWith("on"),
      ),
    );
    expect(withHandlers).toEqual([]);
    const hrefs = [...doc.querySelectorAll("a[href]")].map((a) =>
      a.getAttribute("href"),
    );
    for (const href of hrefs) {
      expect(href === "" || /^(https?:|mailto:|#|\/)/.test(href ?? "")).toBe(
        true,
      );
    }
    expect(doc.body.textContent).not.toContain("hostile-injected-style");
    // Class injections land nowhere.
    expect(doc.body.textContent).not.toContain("evil-token");
    const injected = [...doc.querySelectorAll("span, p")].find(
      (element) => element.textContent === "class injection outside code",
    );
    expect(injected?.getAttribute("class")).toBeNull();
    // The banner comment is cut by the renderer (leading-banner rule).
    expect(doc.body.textContent).not.toContain("GENERATED");
  });

  it("negative control: a MUTATED render must fail the golden gate", () => {
    // Simulate the class of regression Ф1 must catch (a dropped element
    // class, a lost attribute): the mutated HTML must NOT pass the gate.
    const mutant = html.replace("<table", "<table-mutated");
    expect(() => expectGolden(mutant, "golden.docs-render.html", { force: true })).toThrow();
    const mutant2 = html.replace('target="_blank"', 'target="_self"');
    expect(() => expectGolden(mutant2, "golden.docs-render.html", { force: true })).toThrow();
    // And a DROPPED node (an F1 extraction loss) trips it too.
    const mutant3 = html.replace(/<blockquote[\s\S]*?<\/blockquote>/, "");
    expect(() => expectGolden(mutant3, "golden.docs-render.html", { force: true })).toThrow();
  });
});

describe("golden — untrusted pipeline (TextEngine/MarkdownView)", () => {
  it("pins the CURRENT full HTML (golden gate)", async () => {
    const el = await mount(<MarkdownView source={corpusBody} />);
    expectGolden(el.innerHTML, "golden.text-engine.html");
  });

  it("renders structural markdown WITHOUT curated capabilities", async () => {
    const el = await mount(<MarkdownView source={corpusBody} />);
    // Structural parity with the curated profile.
    expect(el.querySelector("h2")?.textContent).toBe("Headings");
    expect(el.querySelector("strong")?.textContent).toBe("strong");
    expect(el.querySelector("table > tbody > tr > td")).not.toBeNull();
    // NO heading slugs on the untrusted profile.
    expect(el.querySelector("h2[id]")).toBeNull();
    // Mermaid fence = INERT CODE BLOCK (current contract; Amendment 1 moves
    // this to svg in Ф2 — the Playwright smoke carries the flippable assert).
    const mermaidPre = [...el.querySelectorAll("pre")].find((pre) =>
      (pre.querySelector("code")?.textContent ?? "").includes("flowchart LR"),
    );
    expect(mermaidPre, "mermaid fence must be an inert code block").not.toBeNull();
    expect(el.querySelector("svg")).toBeNull();
    expect(el.querySelector("figure")).toBeNull();
  });

  it("degrades raw HTML to ESCAPED TEXT — no elements, no handlers, no schemes", async () => {
    const el = await mount(<MarkdownView source={corpusBody} />);
    for (const tag of [
      "script",
      "iframe",
      "object",
      "embed",
      "form",
      "style",
      "details",
      "kbd",
      "sub",
      "sup",
      "svg",
    ]) {
      expect(el.querySelector(tag), `<${tag}> became an element`).toBeNull();
    }
    // The dangerous vectors are inert text; nothing executes.
    expect(el.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(el.querySelector('a[href^="data:"]')).toBeNull();
    const badLink = [...el.querySelectorAll("a")].find(
      (a) => a.textContent === "bad link",
    );
    expect(badLink).toBeUndefined(); // rendered as span, not as an anchor
    const goodLink = [...el.querySelectorAll("a")].find(
      (a) => a.getAttribute("href") === "https://example.com/ok",
    );
    expect(goodLink?.getAttribute("rel")).toContain("noopener");
    // No event handler anywhere.
    const withHandlers = [...el.querySelectorAll("*")].filter((element) =>
      [...element.attributes].some((attribute) =>
        attribute.name.startsWith("on"),
      ),
    );
    expect(withHandlers).toEqual([]);
  });

  it("keeps GFM task-list semantics (disabled checkboxes)", async () => {
    const el = await mount(<MarkdownView source={corpusBody} />);
    const inputs = [...el.querySelectorAll("input")];
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    for (const input of inputs) {
      expect(input.getAttribute("type")).toBe("checkbox");
      expect(input.hasAttribute("disabled")).toBe(true);
    }
  });

  it("negative control: a MUTATED render must fail the golden gate", async () => {
    const el = await mount(<MarkdownView source={corpusBody} />);
    const mutant = el.innerHTML.replace(/<ul[\s\S]*?<\/ul>/, "");
    expect(() => expectGolden(mutant, "golden.text-engine.html", { force: true })).toThrow();
    const mutant2 = el.innerHTML.replace(
      'rel="noopener noreferrer nofollow"',
      'rel="noopener"',
    );
    expect(() => expectGolden(mutant2, "golden.text-engine.html", { force: true })).toThrow();
  });
});