import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { SearchBar } from "./SearchBar";
import { I18nProvider } from "@/i18n";

function render(searchType: "auto" | "fts" | "semantic", lang: "ru" | "en" = "ru"): string {
  return renderToString(
    <I18nProvider initialLang={lang}>
      <SearchBar
        value="весма"
        onChange={() => undefined}
        onSubmit={() => undefined}
        searchType={searchType}
        onSearchTypeChange={() => undefined}
      />
    </I18nProvider>,
  );
}

describe("SearchBar (D7 — режимы подписаны по-русски с пояснением)", () => {
  it("labels the modes in plain words — no bare «FTS» jargon", () => {
    const html = render("auto");
    expect(html).toContain("Авто — сам выберет");
    expect(html).toContain("По словам");
    expect(html).toContain("По смыслу");
    expect(html).not.toContain("&gt;FTS&lt;");
    expect(html).not.toContain(">FTS<");
  });

  it("shows the ACTIVE mode explanation as a visible line (touch has no hover)", () => {
    expect(render("auto")).toContain("Сервер сам решает, как искать");
    expect(render("fts")).toContain("Буквальные совпадения слов");
    expect(render("semantic")).toContain("близкие по значению");
  });

  it("carries the same plain words in English", () => {
    const html = render("auto", "en");
    expect(html).toContain("Auto — it picks");
    expect(html).toContain("By words");
    expect(html).toContain("By meaning");
  });
});
