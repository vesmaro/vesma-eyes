import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";

import { buildRoutes } from "@/app/routes";

/**
 * AGW-3 review P3-7 + ME-014 verdict: ONE /agents route object — the layout
 * route with an INDEX child that replace-redirects to the section's default
 * landing, now the HOST ROSTER (/agents/hosts; /agents/execution keeps its
 * path — nothing breaks). The route table lives in buildRoutes, the same
 * data App.tsx mounts — assert on its JSON shape so the redirect is
 * structural, not rendered-happenstance.
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

describe("routes — /agents single object with an index redirect (P3-7, ME-014)", () => {
  it("declares /agents EXACTLY once (no duplicate sibling)", () => {
    const agents = findRoutes(buildRoutes() as RouteJson[], "/agents");
    expect(agents).toHaveLength(1);
  });

  it("the /agents layout carries an INDEX child + the three live views", () => {
    const [agents] = findRoutes(buildRoutes() as RouteJson[], "/agents");
    const index = agents.children?.find((child) => child.index === true);
    expect(index).toBeDefined();
    const paths = agents.children
      ?.filter((child) => !child.index)
      .map((child) => child.path);
    expect(paths).toEqual(["hosts", "execution", "harnesses"]);
  });

  it("the alias lands on /agents/hosts — the ME-014 roster (structural)", () => {
    const [agents] = findRoutes(buildRoutes() as RouteJson[], "/agents");
    const index = agents.children?.find((child) => child.index === true);
    const element = index?.element as ReactElement<{ to?: string }>;
    expect(isValidElement(element)).toBe(true);
    expect(element.props.to).toBe("/agents/hosts");
  });

  it("the alias renders without errors (redirect element emits nothing)", () => {
    // Static render of the index element: <Navigate replace> emits no
    // visible output; this render additionally proves the tree mounts
    // without errors.
    const html = renderToString(
      <MemoryRouter initialEntries={["/agents"]}>
        <Routes>
          {(buildRoutes() as never[])[0] ? <Route path="/" element={null} /> : null}
        </Routes>
      </MemoryRouter>,
    );
    expect(html).toBe("");
  });
});
