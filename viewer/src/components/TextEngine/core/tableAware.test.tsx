// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { I18nProvider } from "@/i18n";
import { buildPipeline } from "./pipeline";
import { articleComponents, themeComponents } from "./theme";
import { tableOverflowState } from "./tableOverflow";

/**
 * The TABLE-AWARE render gate (design blueprint docs-tables-width §3, owner
 * acceptance verbatim: «АВТО-ТЕСТ на рендер "ни один th не разорван
 * посимвольно"»). Both themes are pinned against a mesh.yaml-reference-like
 * table — long headers, long dotted tokens, inline code in cells:
 *
 * - §3.1 th: `whitespace-nowrap`, and `overflow-wrap:anywhere` is GONE —
 *   a per-character header break is impossible by construction;
 * - §3.2 td: wraps by words (`overflow-wrap:break-word`), never per
 *   character; the spec-pinned 32ch ceiling is present;
 * - §3.3 table: `min-w-max` (content-sized) inside the live scroll wrapper;
 * - §3.4 the wrapper is a named keyboard-focusable region with a remainder
 *   affordance element;
 * - T-CODE: the td carries the cell-scope code override (wrap by words).
 */

const TABLE_MD = [
  "| Поле | Тип | По умолчанию | Описание |",
  "| --- | --- | --- | --- |",
  "| `mtls.peer_fingerprints` | map[string]string | `nil` | Зафиксированные отпечатки пиров, `peer_id → \"sha256:<hex>\"` |",
  "",
].join("\n");

const PIPELINE = buildPipeline({ mode: "escape-only" });

/** Minimal docs-owned hooks — the table rules never touch them. */
const HOOKS = {
  headingSlug: () => "slug",
  link: (_href: string | undefined, children: React.ReactNode) => <>{children}</>,
  imageSrc: (src: string | undefined) => src,
  mermaid: () => null,
  codeBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
};

function renderTable(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("table-aware themes (docs-tables-width §3)", () => {
  for (const [label, render] of [
    [
      "article",
      () =>
        renderToString(
          <I18nProvider initialLang="ru">
            <ReactMarkdown
              remarkPlugins={PIPELINE.remarkPlugins}
              rehypePlugins={PIPELINE.rehypePlugins}
              components={articleComponents(HOOKS)}
            >
              {TABLE_MD}
            </ReactMarkdown>
          </I18nProvider>,
        ),
    ],
    [
      "compact",
      () =>
        renderToString(
          <I18nProvider initialLang="ru">
            <ReactMarkdown
              remarkPlugins={PIPELINE.remarkPlugins}
              rehypePlugins={PIPELINE.rehypePlugins}
              components={themeComponents("compact")}
            >
              {TABLE_MD}
            </ReactMarkdown>
          </I18nProvider>,
        ),
    ],
  ] as const) {
    describe(label, () => {
      const dom = renderTable(render());

      it("§3.1 — no th may break per character: nowrap on, anywhere gone", () => {
        const headers = [...dom.querySelectorAll("th")];
        expect(headers.length).toBeGreaterThan(0);
        for (const th of headers) {
          expect(th.className).toContain("whitespace-nowrap");
          expect(th.className).not.toContain("anywhere");
        }
      });

      it("§3.2 — td wraps by words with the 32ch ceiling, anywhere gone", () => {
        const cells = [...dom.querySelectorAll("td")];
        expect(cells.length).toBeGreaterThan(0);
        for (const td of cells) {
          expect(td.className).toContain("[overflow-wrap:break-word]");
          expect(td.className).toContain("max-w-[32ch]");
          expect(td.className).not.toContain("anywhere");
          // T-CODE: inline code inside a cell is overridden to word wrap.
          expect(td.className).toContain("[&_code]:[overflow-wrap:break-word]");
        }
      });

      it("§3.3 — the table sizes to content inside the live scroll wrapper", () => {
        const table = dom.querySelector("table");
        expect(table?.className).toContain("min-w-max");
        const region = dom.querySelector('[role="region"]');
        expect(region).not.toBeNull();
        expect(region?.getAttribute("tabindex")).toBe("0");
        const label = region?.getAttribute("aria-label") ?? "";
        expect(label.length).toBeGreaterThan(0);
        expect(region?.querySelector("table")).not.toBeNull();
      });

      it("§3.4 — the remainder affordance element exists", () => {
        const region = dom.querySelector('[role="region"]');
        const parent = region?.parentElement;
        expect(parent?.getAttribute("class")).toContain("relative");
        const fade = parent?.querySelector('[aria-hidden="true"]');
        expect(fade?.getAttribute("class")).toContain("bg-gradient-to-l");
      });
    });
  }
});

describe("tableOverflowState (pure decision)", () => {
  it("fits — no overflow, no affordance", () => {
    expect(tableOverflowState(0, 500, 500)).toEqual({
      overflow: false,
      remainder: false,
    });
  });
  it("at rest with remainder — overflow, affordance on", () => {
    expect(tableOverflowState(0, 500, 900)).toEqual({
      overflow: true,
      remainder: true,
    });
  });
  it("scrolled to the end — overflow, affordance off", () => {
    expect(tableOverflowState(400, 500, 900)).toEqual({
      overflow: true,
      remainder: false,
    });
  });
  it("mid-scroll — overflow, affordance on", () => {
    expect(tableOverflowState(100, 500, 900)).toEqual({
      overflow: true,
      remainder: true,
    });
  });
});
