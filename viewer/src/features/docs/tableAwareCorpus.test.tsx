// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { I18nProvider } from "@/i18n";
import { docModuleEntries } from "./markdownModules";
import { Markdown } from "./Markdown";

/**
 * The WHOLE-CORPUS table gate (docs-tables-width W1, owner acceptance
 * verbatim: «букво-столбиков нет НИГДЕ (прогон по всем докам: ни один
 * заголовок не разорван посимвольно — авто-тест на рендер)»). EVERY docs
 * page that carries a markdown table renders through the ONE render site
 * (`Markdown`), and every rendered header/cell is checked:
 *
 * - th: `overflow-wrap:anywhere` is gone corpus-wide (per-character header
 *   break impossible) and `whitespace-nowrap` is present (§3.1);
 * - td: `overflow-wrap:anywhere` is gone corpus-wide (§3.2);
 * - every table sits inside the named focusable scroll region (§3.4).
 */

const HAS_TABLE_ROW = /^\|.*\|/m;

interface RenderedPage {
  path: string;
  dom: Document;
  tables: number;
}

const pages: RenderedPage[] = [];

beforeAll(async () => {
  for (const [path, load] of docModuleEntries()) {
    const body = await load();
    if (!HAS_TABLE_ROW.test(body)) continue;
    const html = renderToString(
      <I18nProvider initialLang="ru">
        <Markdown source={body} />
      </I18nProvider>,
    );
    const dom = new DOMParser().parseFromString(html, "text/html");
    pages.push({ path, dom, tables: dom.querySelectorAll("table").length });
  }
}, 120_000);

describe("whole-corpus table render (docs-tables-width W1 gate)", () => {
  it("the corpus actually exercises tables (the gate is not vacuous)", () => {
    expect(pages.length).toBeGreaterThan(20);
    const tableCount = pages.reduce((sum, page) => sum + page.tables, 0);
    expect(tableCount).toBeGreaterThan(50);
  });

  it("no th anywhere in the corpus may break per character", () => {
    const broken: string[] = [];
    for (const page of pages) {
      for (const th of page.dom.querySelectorAll("th")) {
        if (th.className.includes("anywhere")) broken.push(`th anywhere: ${page.path}`);
        if (!th.className.includes("whitespace-nowrap")) {
          broken.push(`th not nowrap: ${page.path}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("no td anywhere in the corpus may break per character", () => {
    const broken: string[] = [];
    for (const page of pages) {
      for (const td of page.dom.querySelectorAll("td")) {
        if (td.className.includes("anywhere")) broken.push(`td anywhere: ${page.path}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("every corpus table lives in a named focusable scroll region", () => {
    const orphan: string[] = [];
    for (const page of pages) {
      for (const table of page.dom.querySelectorAll("table")) {
        const region = table.closest('[role="region"]');
        if (
          region === null ||
          region.getAttribute("tabindex") !== "0" ||
          (region.getAttribute("aria-label") ?? "").length === 0
        ) {
          orphan.push(page.path);
        }
      }
    }
    expect(orphan).toEqual([]);
  });
});
