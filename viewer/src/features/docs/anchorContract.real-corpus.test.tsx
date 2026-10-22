// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";

import { I18nProvider } from "@/i18n";
import { ApiDocsBody } from "./apiPresentation";
import { extractHeadings } from "./headingSlug";
import automationEn from "./content/upstream/api/en/vesmaro-eyes/automation.md?raw";
import automationRu from "./content/upstream/api/ru/vesmaro-eyes/automation.md?raw";

/**
 * The ANCHOR CONTRACT pinned on the REAL reference corpus (review P3):
 * the automation board pages (the owner's reference pages, both locales)
 * must render every TOC id — the live-page guarantee («56/56 resolve»)
 * as a unit gate. The D3 underscore fix (code spans protected, intraword
 * `_` preserved) is what keeps {rule_id}-class rows alive here.
 */

function renderBody(body: string, slug: string): Document {
  const html = renderToString(
    <I18nProvider initialLang="ru">
      <ApiDocsBody body={body} pageSlug={slug} />
    </I18nProvider>,
  );
  return new DOMParser().parseFromString(html, "text/html");
}

for (const [locale, body] of [
  ["en", automationEn],
  ["ru", automationRu],
] as const) {
  describe(`anchor contract on the real ${locale} automation board page`, () => {
    const toc = extractHeadings(body);

    it("has a substantial TOC (the corpus fixture is the real reference page)", () => {
      expect(toc.length).toBeGreaterThan(20);
    });

    it("renders EVERY TOC id — zero dead TOC rows", () => {
      const dom = renderBody(body, "api/vesmaro-eyes/automation");
      const rendered = new Set(
        [...dom.querySelectorAll("h2[id], h3[id]")].map((node) => node.id),
      );
      const dead = toc.filter((item) => !rendered.has(item.id));
      expect(dead, `dead TOC rows: ${dead.map((d) => d.id).join(", ")}`).toEqual([]);
      // The DOM may carry ONE more id than the TOC: extractHeadings skips
      // headings whose inline-stripped text is empty, the renderer still
      // assigns them an id. Harmless (nothing links to it) — the contract
      // is directional: no TOC row may be dead.
    });
  });
}
