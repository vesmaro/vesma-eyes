import { describe, expect, it } from "vitest";
import { getManifest } from "./manifest";
import {
  docsActiveProject,
  docsCrumbsFor,
  docsLocationFor,
} from "./docsNav";
import { docSlugForPath } from "./docsNav";

/**
 * Docs navigation data (design spec §3/§5, W1c gate): 4-level crumbs for
 * imported articles, 3 for vesma-eyes (the default project is eliminated),
 * hub trails, and the pathname-derived sidebar context. Pure functions over
 * the hydrated manifest — exhaustively testable without a router.
 */

const DOCS_CRUMB = { to: "/docs/vesma-eyes", key: "nav.docs" };

describe("project/slug helpers", () => {
  it("derives the article slug from a project-scoped path (ours stay bare)", () => {
    expect(docSlugForPath("vesma-eyes", "tokens")).toBe("tokens");
    expect(docSlugForPath("mnemos", "user/getting-started")).toBe(
      "mnemos/user/getting-started",
    );
    expect(docSlugForPath("not-a-project", "x")).toBeNull();
  });

  it("defaults the active project for legacy and short pathnames", () => {
    expect(docsActiveProject("/docs/vesma-eyes")).toBe("vesma-eyes");
    expect(docsActiveProject("/docs/mnemos/user/sync")).toBe("mnemos");
    expect(docsActiveProject("/docs/tokens")).toBe("vesma-eyes"); // legacy frame
    expect(docsActiveProject("/docs/c/security")).toBe("vesma-eyes");
  });
});

describe("breadcrumbs (spec §5)", () => {
  it("vesma-eyes hub = section root: no trail", () => {
    expect(docsCrumbsFor("/docs")).toEqual([]);
    expect(docsCrumbsFor("/docs/vesma-eyes")).toEqual([]);
  });

  it("imported hub: Документация → Проект", () => {
    expect(docsCrumbsFor("/docs/mnemos")).toEqual([
      DOCS_CRUMB,
      { to: "/docs/mnemos", label: "Vesma" },
    ]);
    expect(docsCrumbsFor("/docs/mnemos-mesh")).toEqual([
      DOCS_CRUMB,
      { to: "/docs/mnemos-mesh", label: "vesma-mesh" },
    ]);
  });

  it("imported article: 4 levels — Документация → Проект → Категория → страница", async () => {
    await getManifest();
    const crumbs = docsCrumbsFor("/docs/mnemos/user/getting-started");
    expect(crumbs).toHaveLength(4);
    expect(crumbs[0]).toEqual(DOCS_CRUMB);
    expect(crumbs[1]).toEqual({ to: "/docs/mnemos", label: "Vesma" });
    expect(crumbs[2]).toEqual({
      to: "/docs/mnemos/c/mnemos-user",
      key: "docs.cat.mnemosUser",
    });
    expect(crumbs[3]?.label).toBe("Начало работы");
    expect(crumbs[3]?.to).toBeUndefined();
  });

  it("our article: 3 levels — the default project is eliminated (spec §5.1)", async () => {
    await getManifest();
    const crumbs = docsCrumbsFor("/docs/vesma-eyes/upgrade");
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]).toEqual(DOCS_CRUMB);
    expect(crumbs[1]).toEqual({
      to: "/docs/vesma-eyes/c/maintenance",
      key: "docs.cat.maintenance",
    });
    expect(crumbs[2]?.label).toBe("Обновление борда");
  });

  it("imported category: Документация → Проект → Категория", () => {
    const crumbs = docsCrumbsFor("/docs/mnemos/c/mnemos-admin");
    expect(crumbs).toEqual([
      DOCS_CRUMB,
      { to: "/docs/mnemos", label: "Vesma" },
      { key: "docs.cat.mnemosAdmin" },
    ]);
  });

  it("our category page keeps the legacy 2-level shape", () => {
    expect(docsCrumbsFor("/docs/vesma-eyes/c/security")).toEqual([
      DOCS_CRUMB,
      { key: "docs.cat.security" },
    ]);
    expect(docsCrumbsFor("/docs/c/security")).toEqual([
      DOCS_CRUMB,
      { key: "docs.cat.security" },
    ]);
  });

  it("unknown slugs keep a trail (the not-found page, spec §8)", async () => {
    await getManifest();
    const crumbs = docsCrumbsFor("/docs/vesma-eyes/ghost");
    expect(crumbs[crumbs.length - 1]?.label).toBe("ghost");
  });
});

describe("sidebar context (spec §3.2 — всё из pathname)", () => {
  it("resolves project + category + page for the active group rendering", async () => {
    await getManifest();
    expect(docsLocationFor("/docs/mnemos/user/sync")).toEqual({
      project: "mnemos",
      category: "mnemos-user",
      slug: "mnemos/user/sync",
    });
    expect(docsLocationFor("/docs/mnemos/c/mnemos-user")).toEqual({
      project: "mnemos",
      category: "mnemos-user",
      slug: null,
    });
    expect(docsLocationFor("/docs/mnemos-mesh")).toEqual({
      project: "mnemos-mesh",
      category: null,
      slug: null,
    });
    // A legacy article frame resolves through the manifest too.
    expect(docsLocationFor("/docs/upgrade")).toEqual({
      project: "vesma-eyes",
      category: "maintenance",
      slug: "upgrade",
    });
  });
});
