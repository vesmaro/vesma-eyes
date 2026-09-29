// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import {
  __resetForTests,
  __stateForTests,
  markPaletteNavigation,
  startVisit,
} from "./telemetry";
import { TelemetryRouteObserver } from "./TelemetryRouteObserver";

/**
 * The ui.nav emitter over a real (memory) router: the first location is
 * silent (ui.visit owns the load), every committed pathname change emits
 * once with its surface slug, and the via attribution reads palette /
 * link / route in that priority.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let router: ReturnType<typeof createMemoryRouter> | null = null;

function pendingEvents(): Array<Record<string, unknown>> {
  return __stateForTests().pending as Array<Record<string, unknown>>;
}

function navEvents(): Array<Record<string, unknown>> {
  return pendingEvents().filter((event) => event.kind === "ui.nav");
}

beforeEach(() => {
  __resetForTests();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  __resetForTests();
});

async function mountAt(path: string): Promise<void> {
  router = createMemoryRouter(
    [
      {
        element: <TelemetryRouteObserver />,
        children: [
          { path: "/", element: <p>overview</p> },
          { path: "/memory", element: <p>memory</p> },
          { path: "/tasks/activity", element: <p>activity</p> },
          { path: "/kora", element: <p>kora</p> },
          { path: "/kora/:sessionId", element: <p>session</p> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<RouterProvider router={router!} />);
  });
}

async function navigate(to: string): Promise<void> {
  await act(async () => {
    await router!.navigate(to);
  });
}

describe("TelemetryRouteObserver: ui.nav on committed route changes (§1.2 #2)", () => {
  it("the first (load) location emits NOTHING — ui.visit owns it", async () => {
    startVisit();
    await mountAt("/memory");
    expect(navEvents()).toHaveLength(0);
    expect(pendingEvents().map((event) => event.kind)).toEqual(["ui.visit"]);
  });

  it("a route change emits one ui.nav with the surface slug, via=route", async () => {
    startVisit();
    await mountAt("/");
    await navigate("/memory");
    expect(navEvents()).toHaveLength(1);
    expect(navEvents()[0]).toMatchObject({ kind: "ui.nav", surface: "memory", via: "route" });
    // The promoted activity surface (baseline number 6).
    await navigate("/tasks/activity");
    expect(navEvents()[1]).toMatchObject({ surface: "activity", via: "route" });
  });

  it("a real activation right before the change attributes via=link", async () => {
    startVisit();
    await mountAt("/");
    await act(async () => {
      document.body.click(); // the capture listener on window sees it
    });
    await navigate("/memory");
    expect(navEvents()[0]).toMatchObject({ via: "link" });
  });

  it("a palette-initiated change attributes via=palette (and only once)", async () => {
    startVisit();
    await mountAt("/");
    markPaletteNavigation();
    await navigate("/kora");
    expect(navEvents()[0]).toMatchObject({ surface: "kora", via: "palette" });
    await navigate("/memory");
    expect(navEvents()[1]).toMatchObject({ via: "route" });
  });

  it("a kora→kora move is still a nav (same surface, no phantom suppression)", async () => {
    startVisit();
    await mountAt("/kora");
    await navigate("/kora/session-1");
    expect(navEvents()).toHaveLength(1);
    expect(navEvents()[0]).toMatchObject({ surface: "kora", via: "route" });
  });

  it("a disarmed (anonymous) session never emits ui.nav", async () => {
    await mountAt("/");
    await navigate("/memory");
    expect(__stateForTests().pending).toHaveLength(0);
  });
});
