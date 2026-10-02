import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { NotFound } from "@/app/routeElements";
import { buildRoutes } from "@/app/routes";
import { I18nProvider } from "@/i18n";

/**
 * ME-072 A: the System domain root stops being a 404 dead-end and the app
 * answers EVERY unknown path with the ONE not-found pattern (the tasks 404
 * is the reference: explain + an action). The redirect is asserted on the
 * route table's JSON shape (structural, the agentsRoute.test pattern); the
 * 404 pattern on its rendered output in both dictionaries.
 */

type RouteJson = {
  path?: string;
  index?: boolean;
  element?: unknown;
  children?: RouteJson[];
};

function findRoutes(routes: RouteJson[], path: string): RouteJson[] {
  const found: RouteJson[] = [];
  for (const route of routes) {
    if (route.path === path) found.push(route);
    if (route.children) found.push(...findRoutes(route.children, path));
  }
  return found;
}

describe("routes — /system alias + the ONE not-found pattern (ME-072 A)", () => {
  it("declares /system EXACTLY once as a replace-redirect to /system/status", () => {
    const system = findRoutes(buildRoutes() as RouteJson[], "/system");
    expect(system).toHaveLength(1);
    // The route element is <Page><Navigate to replace /></Page> — the
    // Navigate sits in Page's children slot (the /docs alias shape).
    const page = system[0]?.element as ReactElement<{ children?: ReactElement }>;
    expect(isValidElement(page)).toBe(true);
    const navigate = page.props.children as ReactElement<{
      to?: string;
      replace?: boolean;
    }>;
    expect(isValidElement(navigate)).toBe(true);
    expect(navigate.props.to).toBe("/system/status");
    expect(navigate.props.replace).toBe(true);
  });

  it("every unknown path falls through to the NotFound element (structural `*`)", () => {
    const wildcard = findRoutes(buildRoutes() as RouteJson[], "*");
    expect(wildcard).toHaveLength(1);
    expect(wildcard[0]?.element).toBeDefined();
  });

  it("the 404 pattern explains + acts — no bare «404» dead-end — in ru AND en", () => {
    for (const lang of ["ru", "en"] as const) {
      const html = renderToString(
        <I18nProvider initialLang={lang}>
          <MemoryRouter initialEntries={["/no-such-page"]}>
            <NotFound />
          </MemoryRouter>
        </I18nProvider>,
      );
      expect(html).toContain(
        lang === "ru" ? "Нет такой страницы" : "Page not found",
      );
      // A human reason, not just a code.
      expect(html).not.toContain(">404<");
      // The way home (the action slot of the tasks-404 pattern).
      expect(html).toContain('href="/"');
      expect(html).toContain(
        lang === "ru" ? "Вернуться к обзору" : "Back to overview",
      );
    }
  });
});
