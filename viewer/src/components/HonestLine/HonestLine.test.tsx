import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Link } from "react-router";
import { MemoryRouter } from "react-router";

import { HonestLine } from "./HonestLine";
import { I18nProvider, type Lang } from "@/i18n";

/**
 * HonestLine (UX-overhaul spec §7.1) — honest incompleteness as ONE line,
 * not a screen (П1). The contract under test:
 * - semantics: `role="status"` (an announcement, never an alert);
 * - the info icon is decorative (aria-hidden — the text carries the meaning);
 * - `tone="warning"` switches to the existing warning token, no new colours;
 * - the action slot renders inline (Link/compact Button) without wrapping
 *   the line text;
 * - both languages render (the copy is dictionary-borne).
 */

function renderLine(
  lang: Lang,
  tone?: "status" | "warning",
  action?: React.ReactNode,
): string {
  return renderToString(
    <I18nProvider initialLang={lang}>
      <MemoryRouter>
        <HonestLine tone={tone} action={action}>
          {lang === "ru" ? "Метрики появятся позже" : "Metrics will come later"}
        </HonestLine>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("HonestLine (UX-overhaul §7.1)", () => {
  it("announces as a status, never an alert", () => {
    const html = renderLine("ru");
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    expect(html).toContain("Метрики появятся позже");
  });

  it("renders the decorative info icon aria-hidden (text carries the meaning)", () => {
    const html = renderLine("ru");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toContain("lucide-info");
  });

  it("uses the subtle border in the neutral tone and the warning token in the warning tone", () => {
    const neutral = renderLine("ru");
    // Neutral incompleteness: the quiet border-subtle line.
    expect(neutral).toContain("border-border-subtle");
    expect(neutral).not.toContain("border-warning/40");
    const warning = renderLine("ru", "warning");
    // Something live but not everything — the EXISTING warning token.
    expect(warning).toContain("border-warning/40");
    expect(warning).toContain("text-warning");
  });

  it("renders the action slot inline with the line text", () => {
    const html = renderLine(
      "ru",
      undefined,
      <Link to="/system/status">Открыть статус</Link>,
    );
    expect(html).toContain('href="/system/status"');
    expect(html).toContain("Открыть статус");
    expect(html).toContain("Метрики появятся позже");
  });

  it("renders both languages (dictionary copy)", () => {
    expect(renderLine("ru")).toContain("Метрики появятся позже");
    expect(renderLine("en")).toContain("Metrics will come later");
  });
});