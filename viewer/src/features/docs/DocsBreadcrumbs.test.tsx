// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { DocsBreadcrumbs } from "./DocsBreadcrumbs";
import { docCategoriesForProject } from "./categories";
import { DOC_PROJECTS, type DocProject } from "./projects";
import { FOCUS_RING } from "@/components/TextEngine/core/constants";
import { I18nProvider } from "@/i18n";
import { actUnmount } from "@/test/actTools";

/**
 * W2 docs-hubs-nav gates over the unified in-page trail (blueprint-hubs-
 * nav-intro §4 W2): «Книга › Категория › Страница» on every surface, the
 * first crumb = the book's TOC (1 click to the hub from any depth), the
 * last crumb never a link (aria-current), the article's category crumb
 * replacing the old chip, and the <lg verdict — the parent ONLY («‹
 * Категория» / «‹ Книга»; the hub has no docs parent). The keyboard gate:
 * every crumb link carries the shared FOCUS_RING constant.
 * Pattern: DocCards.test.tsx — happy-dom, createRoot + MemoryRouter.
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

const BOOK = DOC_PROJECTS[0] as DocProject;
const CATEGORY = docCategoriesForProject(BOOK.slug)[0];

/** The ≥lg trail is the first nav; the <lg parent line is the second. */
function navs(container: HTMLElement) {
  const trails = container.querySelectorAll("nav");
  return {
    full: trails[0],
    narrow: trails.length > 1 ? trails[1] : null,
  };
}

describe("DocsBreadcrumbs — the ONE trail grammar (blueprint W2)", () => {
  it("article: Книга › Категория › Страница — book crumb first, title aria-current, no chip", async () => {
    const { root, container } = await mount(
      <DocsBreadcrumbs
        project={BOOK}
        category={CATEGORY}
        pageTitle="Обновление борда"
      />,
    );
    const { full, narrow } = navs(container);
    const links = full?.querySelectorAll("a") ?? [];
    // Two links only: the book TOC + the category. The page title is text.
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe(`/docs/${BOOK.slug}`);
    expect(links[0].textContent).toBe(BOOK.name);
    expect(links[1].getAttribute("href")).toBe(
      `/docs/${BOOK.slug}/c/${CATEGORY.slug}`,
    );
    const current = full?.querySelector("[aria-current='page']");
    expect(current?.textContent).toBe("Обновление борда");
    expect(current?.tagName).toBe("SPAN");
    // The <lg verdict: the parent ONLY — «‹ Категория» to the category.
    const narrowLink = narrow?.querySelector("a");
    expect(narrowLink?.getAttribute("href")).toBe(
      `/docs/${BOOK.slug}/c/${CATEGORY.slug}`,
    );
    expect(narrowLink?.textContent).toContain("О продукте");
    await actUnmount(root);
  });

  it("category page: Книга › Категория; <lg parent is the book TOC", async () => {
    const { root, container } = await mount(
      <DocsBreadcrumbs project={BOOK} category={CATEGORY} />,
    );
    const { full, narrow } = navs(container);
    const links = full?.querySelectorAll("a") ?? [];
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe(`/docs/${BOOK.slug}`);
    const current = full?.querySelector("[aria-current='page']");
    expect(current?.textContent).toBe("О продукте");
    expect(narrow?.querySelector("a")?.getAttribute("href")).toBe(
      `/docs/${BOOK.slug}`,
    );
    await actUnmount(root);
  });

  it("hub: a lone aria-current book crumb; <lg renders nothing (no docs parent)", async () => {
    const { root, container } = await mount(
      <DocsBreadcrumbs project={BOOK} category={null} />,
    );
    const { full, narrow } = navs(container);
    expect(full?.querySelectorAll("a")).toHaveLength(0);
    const current = full?.querySelector("[aria-current='page']");
    expect(current?.textContent).toBe(BOOK.name);
    expect(narrow).toBeNull();
    await actUnmount(root);
  });

  it("article without a category degrades honestly: Книга › Страница", async () => {
    const { root, container } = await mount(
      <DocsBreadcrumbs project={BOOK} category={null} pageTitle="Страница" />,
    );
    const { full } = navs(container);
    expect(full?.querySelectorAll("a")).toHaveLength(1);
    expect(full?.querySelector("[aria-current='page']")?.textContent).toBe(
      "Страница",
    );
    await actUnmount(root);
  });

  it("keyboard gate: every crumb link carries the shared FOCUS_RING", async () => {
    const { root, container } = await mount(
      <DocsBreadcrumbs
        project={BOOK}
        category={CATEGORY}
        pageTitle="Страница"
      />,
    );
    for (const link of container.querySelectorAll("nav a")) {
      for (const token of FOCUS_RING.split(" ")) {
        expect(link.className).toContain(token);
      }
    }
    await actUnmount(root);
  });

  it("i18n en: the trail landmark reads Book navigation", async () => {
    const { root, container } = await mount(
      <DocsBreadcrumbs project={BOOK} category={CATEGORY} />,
      "en",
    );
    expect(
      container.querySelectorAll("nav[aria-label='Book navigation']"),
    ).toHaveLength(2);
    await actUnmount(root);
  });
});
