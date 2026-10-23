import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { SearchResultCard } from "./SearchResultCard";
import { I18nProvider } from "@/i18n";
import type { SearchResult } from "@/gateway/types";

const hit: SearchResult = {
  id: "mem-0001",
  title: "ADR: gateway proxy",
  content: "Viewer talks to vesma through the same-origin /api prefix.",
  tags: ["project:vesma-eyes"],
  score: 0.01,
  search_type: "hybrid",
};

function render(lang: "ru" | "en" = "ru"): string {
  return renderToString(
    <MemoryRouter>
      <I18nProvider initialLang={lang}>
        <SearchResultCard result={hit} />
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe("SearchResultCard (D7 — «hybrid · 0.01 без объяснения»)", () => {
  it("names the hit type in human words — the raw wire word is gone", () => {
    expect(render()).toContain("слова + смысл");
    expect(render()).not.toContain(">hybrid<");
  });

  it("keeps the server score under the fold: tooltip + aria explain it", () => {
    const html = render();
    expect(html).toContain("нашёл комбинированный поиск");
    expect(html).toContain("оценка сервера 0.01");
    expect(html).not.toMatch(/>\s*0\.01\s*</); // no naked number as content
  });

  it("explains the other hit types in plain words too", () => {
    const fts = renderToString(
      <MemoryRouter>
        <I18nProvider initialLang="ru">
          <SearchResultCard result={{ ...hit, search_type: "fts" }} />
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(fts).toContain("по словам");
    expect(fts).toContain("нашёл поиск по словам");

    const semantic = renderToString(
      <MemoryRouter>
        <I18nProvider initialLang="ru">
          <SearchResultCard result={{ ...hit, search_type: "semantic" }} />
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(semantic).toContain("по смыслу");
    expect(semantic).toContain("близка по значению");
  });

  // ux-palette-memory-results, page-side leg (TL ruling): the same row-title
  // rule as the palette — a bare speaker-word title never faces the search
  // page, mined prose or (for all-dump bodies) the content head instead.
  it("never renders the «User» role word as the title — mined headline or the content head", () => {
    const user = renderToString(
      <MemoryRouter>
        <I18nProvider initialLang="ru">
          <SearchResultCard
            result={{
              ...hit,
              title: "User",
              content:
                "## User: Сборка падает на этапе линковки webview.\nАгент ответил.",
            }}
          />
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(user).toContain("Сборка падает на этапе линковки webview.");

    const dump = renderToString(
      <MemoryRouter>
        <I18nProvider initialLang="ru">
          <SearchResultCard
            result={{ ...hit, title: "User", content: "/tmp/audio_3be0bd9e76.ogg" }}
          />
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(dump).toContain("/tmp/audio_3be0bd9e76.ogg");
    // Neither row shows the bare role word as its title.
    expect(user).not.toMatch(/>\s*User\s*</);
    expect(dump).not.toMatch(/>\s*User\s*</);
  });
});
