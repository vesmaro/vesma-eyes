// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { DocCard, DocCardGrid } from "./DocCards";
import { HubCards, CategoryCards } from "./DocsHubPage";
import { DOC_PROJECTS, type DocProject } from "./projects";
import type { DocPage, DocsManifest } from "./manifest";
import { I18nProvider } from "@/i18n";
import { actUnmount } from "@/test/actTools";

/**
 * W1 docs-hubs-nav state gates over the ONE card grammar (blueprint
 * «Честные состояния»): D-CARD-CURRENT (aria-current + «вы здесь», no CTA),
 * D-CARD-NO-DESC (honest absence, nothing invented), D-CARD-LONG
 * (line-clamp-2 + title), D-CAT-EMPTY (the honest «0 страниц» card, never
 * hidden), and the every-hub gate (the book strip on a NON-default hub).
 * Pattern: DocsPage.test.tsx — happy-dom, createRoot + MemoryRouter; the
 * manifest arrives as a fabricated prop (the components are pure over it).
 */

async function mount(ui: React.ReactNode, lang: "ru" | "en" = "ru") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <I18nProvider initialLang={lang}>
        <MemoryRouter>{ui}</MemoryRouter>
      </I18nProvider>,
    );
  });
  return { root, container };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

function page(slug: string, project: string, category: string): DocPage {
  return {
    slug,
    project,
    titles: { ru: slug },
    category,
    order: 1,
    lastVerified: "2026-01-01",
    locales: ["ru"],
    originalLocale: "ru",
  };
}

const BOOK = DOC_PROJECTS[0] as DocProject;

describe("DocCard grammar (the ONE card, blueprint §3)", () => {
  it("D-CARD-CURRENT: aria-current=page + «Вы здесь», no CTA", async () => {
    const { root, container } = await mount(
      <DocCard
        to="/docs/vesma-eyes"
        icon={BOOK.icon}
        title="vesma-eyes"
        description="Справочник."
        current
        labels={{ here: "Вы здесь", open: "Открыть" }}
        meta={<span>3 страницы</span>}
      />,
    );
    const card = container.querySelector("a[aria-current='page']");
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Вы здесь");
    expect(card?.textContent).not.toContain("Открыть");
    await actUnmount(root);
  });

  it("a non-current card carries the CTA row and no aria-current", async () => {
    const { root, container } = await mount(
      <DocCard
        to="/docs/mnemos"
        icon={BOOK.icon}
        title="Vesma"
        labels={{ here: "Вы здесь", open: "Открыть" }}
        meta={<span>10 страниц</span>}
      />,
    );
    const card = container.querySelector("a");
    expect(card?.getAttribute("aria-current")).toBeNull();
    expect(card?.textContent).toContain("Открыть");
    await actUnmount(root);
  });

  it("D-CARD-NO-DESC: no description prop → no description element (honest absence)", async () => {
    const { root, container } = await mount(
      <DocCard
        to="/docs/vesma-eyes/quiet"
        icon={BOOK.icon}
        title="Тихая страница"
        labels={{ here: "Вы здесь", open: "Открыть" }}
        meta={<span>1 страница</span>}
      />,
    );
    // The only text nodes are the title, the meta and the CTA — no invented
    // description line anywhere in the card.
    expect(container.textContent).not.toContain("Описание");
    const card = container.querySelector("a");
    expect(card?.querySelectorAll("p")).toHaveLength(0); // no description paragraph
    await actUnmount(root);
  });

  it("D-CARD-LONG: long title and description carry the title tooltip", async () => {
    const long = "Очень длинный заголовок страницы про устройство подсистемы";
    const { root, container } = await mount(
      <DocCard
        to="/docs/vesma-eyes/long"
        icon={BOOK.icon}
        title={long}
        description={`${long} — и такое же длинное описание, которое зажимается двумя строками.`}
        labels={{ here: "Вы здесь", open: "Открыть" }}
        meta={<span>1 страница</span>}
      />,
    );
    expect(container.querySelector("h3[title]")?.getAttribute("title")).toBe(long);
    expect(
      container.querySelector("p[title]")?.getAttribute("title"),
    ).toContain("длинное описание");
    await actUnmount(root);
  });
});

describe("HubCards on every hub (W1)", () => {
  const manifest: DocsManifest = {
    pages: DOC_PROJECTS.map((project) => page(`p-${project.slug}`, project.slug, "c")),
  };

  it("renders the book strip on a NON-default hub with aria-current on itself", async () => {
    const { root, container } = await mount(
      <HubCards activeProject={DOC_PROJECTS[3]!} manifest={manifest} />,
    );
    const cards = [...container.querySelectorAll("section a")];
    expect(cards).toHaveLength(DOC_PROJECTS.length);
    const current = cards.find((card) => card.getAttribute("aria-current") === "page");
    expect(current?.getAttribute("href")).toBe("/docs/api");
    expect(current?.textContent).toContain("Вы здесь");
    await actUnmount(root);
  });

  it("every card carries its data counters (pages + stamp), not a bare tile", async () => {
    const { root, container } = await mount(
      <HubCards activeProject={BOOK} manifest={manifest} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("1 страница"); // ru plural, one page per project
    expect(text).toContain("обновлено"); // the freshness stamp line
    await actUnmount(root);
  });
});

describe("CategoryCards honest zero (D-CAT-EMPTY)", () => {
  it("a category without pages renders its card with «0 страниц» — never hidden", async () => {
    const { root, container } = await mount(
      // The empty manifest: every category counts 0 — the cards stay.
      <CategoryCards project={BOOK} manifest={{ pages: [] }} />,
    );
    const cards = [...container.querySelectorAll("section a")];
    expect(cards.length).toBeGreaterThan(0); // the TOC does not disappear
    expect(container.textContent).toContain("0 страниц");
    for (const card of cards) {
      expect(card.textContent).toContain("0 страниц");
    }
    await actUnmount(root);
  });

  it("counts the real manifest slice per category", async () => {
    const { root, container } = await mount(
      <CategoryCards
        project={BOOK}
        manifest={{ pages: [page("faq", "vesma-eyes", "faq")] }}
      />,
    );
    const faq = container.querySelector("a[href='/docs/vesma-eyes/c/faq']");
    expect(faq?.textContent).toContain("1 страница");
    await actUnmount(root);
  });
});

describe("DocCardGrid frame", () => {
  it("labels the section for assistive tech and lays the 1/2 grid", async () => {
    const { root, container } = await mount(
      <DocCardGrid label="Категории">
        <span>probe</span>
      </DocCardGrid>,
    );
    expect(container.querySelector("section[aria-label='Категории']")).not.toBeNull();
    expect(container.querySelector("section > div")?.className).toContain(
      "sm:grid-cols-2",
    );
    await actUnmount(root);
  });
});
