// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";

import { DocsPage } from "./DocsPage";
import { DocsHubPage } from "./DocsHubPage";
import { DocsCategoryPage } from "./DocsCategoryPage";
import { withReturn } from "@/lib/returnParams";
import { I18nProvider } from "@/i18n";
import { actUnmount, actWaitUntil } from "@/test/actTools";

/**
 * W3 docs-hubs-nav gates over the UI-18 context back control on the docs
 * surfaces (blueprint «Честные состояния», rows D-RET-*): a VALID `?return=`
 * draws «← назад к …» above the breadcrumb trail and resolves EXACTLY (the
 * encode/decode round-trip through withReturn), every rejection is silent —
 * absent param (D-RET-NONE), garbage (schemes, protocol-relative), the
 * self-return — no control, never an error. Internal docs links (prev/next,
 * cards, trail) never carry the param, and the canonical URL without the
 * parameter works exactly as before (D-RET-NONE on all three surfaces).
 * Pattern: DocsPage.test.tsx — happy-dom, createRoot + MemoryRouter, the
 * real bundled manifest (docs is backend-independent).
 */

async function mountDocs(path: string, lang: "ru" | "en" = "ru") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <I18nProvider initialLang={lang}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/docs/c/:category" element={<DocsCategoryPage />} />
            <Route path="/docs/:project" element={<DocsHubPage />} />
            <Route path="/docs/:project/c/:category" element={<DocsCategoryPage />} />
            <Route path="/docs/:project/*" element={<DocsPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
  });
  return { root, container };
}

function backControl(container: HTMLElement): HTMLAnchorElement | null {
  return container.querySelector<HTMLAnchorElement>("a[aria-label^='Назад:']");
}

beforeEach(() => {
  localStorage.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("D-RET-VALID: the control renders and returns EXACTLY", () => {
  it("article: «назад к Задача» resolves the round-trip through withReturn", async () => {
    // The FULL entry path a Shell caller produces: withReturn builds the
    // URL, the page's resolveReturnTarget must decode it back exactly.
    const entry = withReturn("/docs/vesma-eyes/upgrade", "/tasks/TB-1", "?status=open");
    const { root, container } = await mountDocs(entry);
    await actWaitUntil(() => {
      expect(container.querySelector("h1")?.textContent).toBe("Обновление борда");
    });
    const control = backControl(container);
    expect(control).not.toBeNull();
    expect(control?.getAttribute("href")).toBe("/tasks/TB-1?status=open");
    expect(control?.getAttribute("aria-label")).toBe("Назад: Задача");
    expect(control?.textContent).toContain("назад к Задача");
    await actUnmount(root);
  });

  it("hub: the control rides ABOVE the trail on a non-default hub", async () => {
    const { root, container } = await mountDocs(
      withReturn("/docs/mnemos", "/tasks/TB-2"),
    );
    await actWaitUntil(() => {
      expect(container.querySelector("h1")?.textContent).toBe("Vesma");
    });
    expect(backControl(container)?.getAttribute("href")).toBe("/tasks/TB-2");
    await actUnmount(root);
  });

  it("category page: the control rides ABOVE the trail", async () => {
    const { root, container } = await mountDocs(
      withReturn("/docs/vesma-eyes/c/product", "/memory/m-1"),
    );
    await actWaitUntil(() => {
      expect(container.querySelector("h1")?.textContent).toBe("О продукте");
    });
    expect(backControl(container)?.getAttribute("href")).toBe("/memory/m-1");
    await actUnmount(root);
  });

  it("a return INTO docs is a valid Shell target (the palette case)", async () => {
    const { root, container } = await mountDocs(
      withReturn("/docs/mnemos", "/docs/vesma-eyes"),
    );
    await actWaitUntil(() => {
      expect(backControl(container)).not.toBeNull();
    });
    expect(backControl(container)?.getAttribute("href")).toBe("/docs/vesma-eyes");
    await actUnmount(root);
  });
});

describe("D-RET-NONE + silent fallback: rejections render NOTHING", () => {
  it("no param — the canonical URL works as before, no control (all three)", async () => {
    for (const path of [
      "/docs/vesma-eyes/upgrade",
      "/docs/mnemos",
      "/docs/vesma-eyes/c/product",
    ]) {
      const { root, container } = await mountDocs(path);
      await actWaitUntil(() => {
        expect(container.querySelector("h1")).not.toBeNull();
      });
      expect(backControl(container)).toBeNull();
      await actUnmount(root);
    }
  });

  it("garbage: a scheme and a protocol-relative value never render the control", async () => {
    for (const garbage of [
      encodeURIComponent("https://evil.example"),
      encodeURIComponent("//evil.example"),
      "not-a-path",
      encodeURIComponent("/unknown/nope"),
    ]) {
      const { root, container } = await mountDocs(
        `/docs/vesma-eyes/upgrade?return=${garbage}`,
      );
      await actWaitUntil(() => {
        expect(container.querySelector("h1")?.textContent).toBe("Обновление борда");
      });
      expect(backControl(container)).toBeNull();
      await actUnmount(root);
    }
  });

  it("self-return: the control never points the page at itself", async () => {
    const { root, container } = await mountDocs(
      "/docs/mnemos?return=%2Fdocs%2Fmnemos",
    );
    await actWaitUntil(() => {
      expect(container.querySelector("h1")?.textContent).toBe("Vesma");
    });
    expect(backControl(container)).toBeNull();
    await actUnmount(root);
  });
});

describe("the parameter never leaks into internal navigation", () => {
  it("with a live return, no internal docs link inherits it", async () => {
    const { root, container } = await mountDocs(
      withReturn("/docs/vesma-eyes/upgrade", "/tasks/TB-1"),
    );
    await actWaitUntil(() => {
      expect(container.querySelector("h1")?.textContent).toBe("Обновление борда");
    });
    await actWaitUntil(() => {
      // The article's body and prev/next settle with the manifest bodies.
      expect(
        (container.querySelector("article")?.textContent ?? "").length,
      ).toBeGreaterThan(200);
    });
    const hrefs = [...container.querySelectorAll("a")].map((link) =>
      link.getAttribute("href"),
    );
    expect(hrefs.length).toBeGreaterThan(2);
    for (const href of hrefs) {
      expect(href).not.toContain("return=");
    }
    await actUnmount(root);
  });
});
