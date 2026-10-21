import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

/**
 * i18n layer tests (owner feedback 1.40 pass 1). The project runs vitest in
 * the node environment (no DOM) — storage and document are stubbed globals,
 * and React pieces are asserted via renderToString, per the project pattern.
 */

/** Minimal Storage stand-in (node env has none). */
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("language detection and persistence", () => {
  it("defaults to ru with no stored choice (no navigator sniffing)", async () => {
    const { detectLang, DEFAULT_LANG } = await import("./index");
    expect(DEFAULT_LANG).toBe("ru");
    expect(detectLang()).toBe("ru");
  });

  it("restores a persisted valid choice and ignores garbage", async () => {
    const { readStoredLang, detectLang, LANG_STORAGE_KEY } = await import("./index");
    localStorage.setItem(LANG_STORAGE_KEY, "en");
    expect(readStoredLang()).toBe("en");
    expect(detectLang()).toBe("en");

    localStorage.setItem(LANG_STORAGE_KEY, "klingon");
    expect(readStoredLang()).toBeNull();
    expect(detectLang()).toBe("ru");
  });

  it("persists the choice under vesmaro.lang and reads it back", async () => {
    const { persistLang, readStoredLang, LANG_STORAGE_KEY } = await import("./index");
    persistLang("en");
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe("en");
    expect(readStoredLang()).toBe("en");
  });

  it("survives a storage that throws (private mode)", async () => {
    const throwing: Storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      get length() {
        return 0;
      },
    };
    const { readStoredLang, persistLang, detectLang } = await import("./index");
    expect(readStoredLang(throwing)).toBeNull();
    expect(() => persistLang("en", throwing)).not.toThrow();
    expect(detectLang()).toBe("ru");
  });
});

describe("document.lang mirroring", () => {
  it("sets documentElement.lang for the active language", async () => {
    const { applyDocumentLang } = await import("./index");
    const documentElement = { lang: "" };
    vi.stubGlobal("document", { documentElement });
    applyDocumentLang("en");
    expect(documentElement.lang).toBe("en");
    applyDocumentLang("ru");
    expect(documentElement.lang).toBe("ru");
  });

  it("is a no-op without a document (SSR/test env)", async () => {
    const { applyDocumentLang } = await import("./index");
    expect(() => applyDocumentLang("en")).not.toThrow();
  });
});

describe("translation", () => {
  it("translates a key in both languages and interpolates {{vars}}", async () => {
    const { translate } = await import("./index");
    expect(translate("ru", "nav.memories")).toBe("Записи");
    expect(translate("en", "nav.memories")).toBe("Records");
    expect(
      translate("en", "auth.connected", { backend: "board", endpoint: "/api" }),
    ).toBe("connected to board: /api");
    expect(translate("ru", "memories.showing", { from: 1, to: 20 })).toBe(
      "Показано 1–20",
    );
  });

  it("keeps unknown placeholders visible verbatim", async () => {
    const { interpolate } = await import("./index");
    expect(interpolate("{{a}} + {{missing}}", { a: 1 })).toBe("1 + {{missing}}");
  });

  it("interpolates the palette's noResults query (review P1-2: no raw {{ in the UI)", async () => {
    const { translate } = await import("./index");
    // The component must pass the live query; a raw «{{query}}» in the
    // rendered line is the regression this guards.
    for (const lang of ["en", "ru"] as const) {
      const line = translate(lang, "cmdk.noResults", { query: "zzz-drift" });
      expect(line).not.toContain("{{");
      expect(line).toContain("zzz-drift");
    }
  });

  it("en.ts implements every ru.ts key (dictionary parity)", async () => {
    const { ru } = await import("./ru");
    const { en } = await import("./en");
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
  });

  it("brain-zones Z1: the zone lore vocabulary exists in BOTH dictionaries", async () => {
    const { ru } = await import("./ru");
    const { en } = await import("./en");
    // The five lore words (BRAIN-ZONES-VISUAL-DOC §2): зона / сплетение /
    // нейрон / ядро / путь — the owner's hierarchy in the neuro analogy.
    const lore = ["zone", "plexus", "neuron", "core", "path"] as const;
    for (const word of lore) {
      const key = `agents.lore.${word}` as keyof typeof ru;
      expect(ru[key], key).toBeTruthy();
      expect(en[key as keyof typeof en], key).toBeTruthy();
    }
    // «Core» and «path» are Z2/Z3 groundwork: not rendered anywhere yet,
    // and their hints say so HONESTLY (no fake promises of presence).
    expect(ru["agents.lore.coreHint"]).toContain("не отображается");
    expect(ru["agents.lore.pathHint"]).toContain("не отображается");
    expect(en["agents.lore.coreHint"]).toContain("Not shown");
    expect(en["agents.lore.pathHint"]).toContain("Not shown");
  });

  it("the auth.* gates-v6 family interpolates the SAME placeholders in ru and en", async () => {
    const { ru } = await import("./ru");
    const { en } = await import("./en");
    const placeholder = (value: string) =>
      (value.match(/\{\{\w+\}\}/g) ?? []).sort().join(",");
    for (const [key, value] of Object.entries(ru)) {
      if (!key.startsWith("auth.")) continue;
      expect(placeholder(value), key).toBe(placeholder(en[key as keyof typeof en]));
    }
  });

  it("D8: the placeholder pages' honest keys + the ONE 404 pattern pair across ru/en", async () => {
    const { translate } = await import("./index");
    // The placeholder ROUTES stay alive for direct URLs; their honest lines
    // keep their keys even though the menu rows are gone (D8 2026-10-21).
    expect(translate("ru", "nav.soonSessions")).toBe("Сессии появятся позже");
    expect(translate("en", "nav.soonTraces")).toBe("Traces coming later");
    // The ONE 404 pattern: explain + an action, both dictionaries.
    expect(translate("ru", "app.notFoundTitle")).toBe("Нет такой страницы");
    expect(translate("en", "app.notFoundTitle")).toBe("Page not found");
    expect(translate("ru", "app.notFoundAction")).toBe("Вернуться к обзору");
    expect(translate("en", "app.notFoundAction")).toBe("Back to overview");
  });

  it("no dictionary string leaks internal phase codes (union review gate, карта И1 §1.3)", async () => {
    const { ru } = await import("./ru");
    const { en } = await import("./en");
    // «И1…И5», «срез», «slice», «ADR» are roadmap language — the user
    // sees «появится позже», never a phase code (07a §3.5).
    const banned = /И[1-5]|срез|slice|ADR/;
    for (const [key, value] of Object.entries({ ...ru, ...en })) {
      expect(banned.test(value), `${key}: ${value}`).toBe(false);
    }
  });
});

describe("React wiring (useT / useI18n / I18nProvider)", () => {
  it("useT falls back to ru without a provider (deterministic default)", async () => {
    const { useT } = await import("./index");
    function Probe() {
      const t = useT();
      return <p>{t("nav.memories")}</p>;
    }
    expect(renderToString(<Probe />)).toContain("Записи");
  });

  it("the provider switches the rendered copy (ru vs en render)", async () => {
    const { I18nProvider, useI18n } = await import("./index");
    function Probe() {
      const { lang, t } = useI18n();
      return (
        <p data-lang={lang}>
          {t("topbar.langLabel")} · {t("search.placeholder")}
        </p>
      );
    }
    const ru = renderToString(
      <I18nProvider initialLang="ru">
        <Probe />
      </I18nProvider>,
    );
    const en = renderToString(
      <I18nProvider initialLang="en">
        <Probe />
      </I18nProvider>,
    );
    expect(ru).toContain("Язык интерфейса");
    expect(ru).toContain("Поиск по колодцу…");
    expect(ru).toContain('data-lang="ru"');
    expect(en).toContain("Interface language");
    expect(en).toContain("Search the well…");
    expect(en).toContain('data-lang="en"');
  });

  it("setLang persists the choice for the next session", async () => {
    const { I18nProvider, useI18n, LANG_STORAGE_KEY } = await import("./index");
    // Array capture (TS does not narrow a let through nested closures).
    const captured: ReturnType<typeof useI18n>[] = [];
    function Probe() {
      captured.push(useI18n()); // capture the live context value, no effects
      return <p>probe</p>;
    }
    renderToString(
      <I18nProvider initialLang="ru">
        <Probe />
      </I18nProvider>,
    );
    const handle = captured[0];
    expect(handle).toBeDefined();
    expect(handle?.lang).toBe("ru");
    // The same call the LanguageToggle onClick makes.
    handle?.setLang("en");
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe("en");
  });
});
