import { describe, expect, it } from "vitest";
import {
  NAV_DOMAINS,
  activeDomain,
  crumbsFor,
  domainCounterIds,
  isPathActive,
  routeTitle,
  routeTitleKey,
} from "./navItems";
import { docsLocationFor } from "@/features/docs/docsNav";
import { getManifest } from "@/features/docs/manifest";

/**
 * Ф1 IA gates: the domain map (§2.1), breadcrumb matrix (§2.2 — last crumb
 * is never a link) and TopBar titles, pure over pathnames.
 */
describe("domain map", () => {
  it("is the concept IA: Overview root + Memory + Tasks/Agents + Kora + Docs + Stores slot + System", () => {
    // ADR 0015: the docs domain slots in after «Агенты», before «Хранилища».
    // ADR 0019 rev.2: «Кора» slots in after «Агенты» — live from week 0
    // (the section IS the early-UI-contact deliverable, mock-backed).
    expect(NAV_DOMAINS.map((d) => d.to)).toEqual([
      "/",
      "/memory",
      "/tasks",
      "/agents",
      "/kora",
      "/docs",
      "/stores",
      "/system",
    ]);
  });

  it("marks only the phase-4+ domains as soon-slots (AGW-3 activates Agents)", () => {
    const slots = NAV_DOMAINS.filter((d) => d.soonKey).map((d) => d.to);
    expect(slots).toEqual(["/stores"]);
  });

  it("never links a domain at a path without a route (no dead links)", () => {
    // Every domain link target must own breadcrumbs — a page that exists.
    // System has no /system index in Ф1, so its domain link targets the
    // first live section while matching on the /system prefix. The root "/"
    // is the Overview itself and /docs is its own live index route (both
    // legitimately carry no trail). ADR 0015.
    for (const domain of NAV_DOMAINS) {
      if (domain.soonKey || domain.to === "/" || domain.to === "/docs") continue;
      const target = domain.linkTo ?? domain.to;
      expect(
        crumbsFor(target).length,
        `${domain.to} links to ${target} (no route)`,
      ).toBeGreaterThan(0);
    }
    const system = NAV_DOMAINS.find((d) => d.to === "/system");
    expect(system?.linkTo).toBe("/system/status");
  });

  it("prefix-matches domains; the root matches exactly", () => {
    expect(isPathActive("/", "/", true)).toBe(true);
    expect(isPathActive("/memory/x", "/memory")).toBe(true);
    expect(isPathActive("/memory", "/memory", true)).toBe(true);
    expect(isPathActive("/memoryx", "/memory")).toBe(false);
    expect(activeDomain("/memory/pulse")?.to).toBe("/memory");
    expect(activeDomain("/system/status")?.to).toBe("/system");
    // Ф2: the task domain is live — its pages resolve the domain.
    expect(activeDomain("/tasks")?.to).toBe("/tasks");
    expect(activeDomain("/tasks/TB-1")?.to).toBe("/tasks");
    // AGW-3: the agents domain is live — its pages resolve the domain.
    expect(activeDomain("/agents")?.to).toBe("/agents");
    expect(activeDomain("/agents/execution")?.to).toBe("/agents");
    // ADR 0015: the docs domain covers index, categories and articles.
    expect(activeDomain("/docs")?.to).toBe("/docs");
    expect(activeDomain("/docs/c/maintenance")?.to).toBe("/docs");
    expect(activeDomain("/docs/upgrade")?.to).toBe("/docs");
  });

  it("gives the task domain its Ф2–Ф3 sections (kanban / list / activity / inbox / archive)", () => {
    const tasks = NAV_DOMAINS.find((d) => d.to === "/tasks");
    expect(tasks?.soonKey).toBeUndefined();
    // UI-28 (spec §1/§8.1): «Активность» sits between the list and the inbox.
    expect(tasks?.sections?.map((s) => s.to)).toEqual([
      "/tasks",
      "/tasks/list",
      "/tasks/activity",
      "/tasks/inbox",
      "/tasks/archive",
    ]);
    expect(tasks?.sections?.find((s) => s.to === "/tasks/activity")?.key).toBe(
      "nav.taskActivity",
    );
    // The inbox section carries the live counter wiring.
    expect(tasks?.sections?.find((s) => s.to === "/tasks/inbox")?.counter).toBe(
      "inbox",
    );
  });

  it("UI-30: only the tasks domain aggregates its section counters, derived from the sections", () => {
    // The flag is declared exactly once — on «Задачи».
    const aggregating = NAV_DOMAINS.filter((d) => d.aggregateCounters).map((d) => d.to);
    expect(aggregating).toEqual(["/tasks"]);
    // The aggregate inputs are DERIVED from the sections (no duplicate list
    // to forget): today the inbox counter, every future section counter
    // joins the sum automatically, deduped, in section order.
    const tasks = NAV_DOMAINS.find((d) => d.to === "/tasks");
    expect(domainCounterIds(tasks!)).toEqual(["inbox"]);
    // Domains without counters aggregate nothing (no badge is rendered).
    const memory = NAV_DOMAINS.find((d) => d.to === "/memory");
    expect(domainCounterIds(memory!)).toEqual([]);
    expect(domainCounterIds(NAV_DOMAINS[0]!)).toEqual([]); // root: no sections
  });

  it("gives the agents domain its AGW-3/ME-014 sections (root = hosts roster)", () => {
    const agents = NAV_DOMAINS.find((d) => d.to === "/agents");
    expect(agents?.soonKey).toBeUndefined();
    // ME-014: the domain root has no index route — the domain link goes to
    // the host roster (the section's default landing).
    expect(agents?.linkTo).toBe("/agents/hosts");
    // The roster leads; execution and the AGW-4 registry keep their paths.
    expect(agents?.sections?.map((s) => s.to)).toEqual([
      "/agents/hosts",
      "/agents/execution",
      "/agents/harnesses",
    ]);
  });
});

describe("breadcrumbs (last crumb is not a link)", () => {
  it("has no trail on the root", () => {
    expect(crumbsFor("/")).toEqual([]);
  });

  it("trails every level-2 page with a non-link tail", () => {
    expect(crumbsFor("/memory")).toEqual([
      { to: "/memory", key: "nav.memory" },
      { key: "nav.records" },
    ]);
    expect(crumbsFor("/memory/search")).toEqual([
      { to: "/memory", key: "nav.memory" },
      { key: "nav.search" },
    ]);
    expect(crumbsFor("/memory/pulse")[1]).toEqual({ key: "nav.pulse" });
    expect(crumbsFor("/memory/tags")[1]).toEqual({ key: "nav.tags" });
    expect(crumbsFor("/system/status")[1]).toEqual({ key: "nav.status" });
    expect(crumbsFor("/system/traces")[1]).toEqual({ key: "nav.traces" });
  });

  it("trails detail pages one level deeper (level 3)", () => {
    expect(crumbsFor("/memory/m-42")).toEqual([
      { to: "/memory", key: "nav.memory" },
      { to: "/memory", key: "nav.records" },
      { key: "nav.record" },
    ]);
    expect(crumbsFor("/system/sessions/s-7")).toEqual([
      { to: "/system", key: "nav.system" },
      { to: "/system/sessions", key: "nav.sessions" },
      { key: "nav.session" },
    ]);
    expect(crumbsFor("/tasks/TB-1")).toEqual([
      { to: "/tasks", key: "nav.tasks" },
      { to: "/tasks", key: "nav.taskList" },
      { key: "nav.task" },
    ]);
  });

  it("trails the Ф2–Ф3 task pages (board / list / inbox / archive)", () => {
    expect(crumbsFor("/tasks")).toEqual([
      { to: "/tasks", key: "nav.tasks" },
      { key: "nav.taskBoard" },
    ]);
    expect(crumbsFor("/tasks/list")).toEqual([
      { to: "/tasks", key: "nav.tasks" },
      { key: "nav.taskList" },
    ]);
    expect(crumbsFor("/tasks/inbox")).toEqual([
      { to: "/tasks", key: "nav.tasks" },
      { key: "nav.taskInbox" },
    ]);
    expect(crumbsFor("/tasks/archive")).toEqual([
      { to: "/tasks", key: "nav.tasks" },
      { key: "nav.taskArchive" },
    ]);
  });

  it("keeps known subpaths above the :id catch-all", () => {
    // /memory/search is a page, not a record id — the trail proves it.
    expect(crumbsFor("/memory/search")[1].key).toBe("nav.search");
  });
});

describe("routeTitleKey (TopBar label = deepest crumb)", () => {
  it("returns the last crumb key, null for unknowns", () => {
    expect(routeTitleKey("/")).toBe("nav.overview");
    expect(routeTitleKey("/memory")).toBe("nav.records");
    expect(routeTitleKey("/memory/m-1")).toBe("nav.record");
    expect(routeTitleKey("/system/sessions")).toBe("nav.sessions");
    expect(routeTitleKey("/nope")).toBeNull();
  });
});

describe("docs domain (ADR 0015 + ADR 0016)", () => {
  it("links the domain at the default hub; sections moved to project groups", () => {
    const docs = NAV_DOMAINS.find((d) => d.to === "/docs");
    expect(docs?.soonKey).toBeUndefined();
    expect(docs?.key).toBe("nav.docs");
    // ADR 0016: the flat section list is replaced by THREE project groups
    // rendered by DocsSidebarGroups; the domain link enters at the hub.
    expect(docs?.linkTo).toBe("/docs/vesmaro-eyes");
    expect(docs?.sections).toBeUndefined();
  });

  it("the index has no trail (section root) but keeps its title key", () => {
    expect(crumbsFor("/docs")).toEqual([]);
    expect(routeTitleKey("/docs")).toBe("nav.docs");
  });

  it("article trail: Документация → категория → заголовок (legacy frame)", async () => {
    await getManifest(); // hydrate the lazy docs manifest
    const crumbs = crumbsFor("/docs/upgrade");
    expect(crumbs[0]).toEqual({ to: "/docs/vesmaro-eyes", key: "nav.docs" });
    expect(crumbs[1]).toEqual({
      to: "/docs/vesmaro-eyes/c/maintenance",
      key: "docs.cat.maintenance",
    });
    // The page title is CONTENT (frontmatter), not a dictionary key.
    expect(crumbs[2]?.label).toBe("Обновление борда");
    expect(crumbs[2]?.key).toBeUndefined();
    expect(routeTitle("/docs/upgrade", (key) => `t:${key}`)).toBe("Обновление борда");
  });

  it("imported article trail gains the project level (4 crumbs, ADR 0016)", async () => {
    await getManifest();
    const crumbs = crumbsFor("/docs/mnemos/user/getting-started");
    expect(crumbs).toHaveLength(4);
    expect(routeTitle("/docs/mnemos/user/getting-started", (key) => `t:${key}`)).toBe(
      "Начало работы",
    );
  });

  it("the default hub has no trail (section root), imported hubs keep one", () => {
    expect(crumbsFor("/docs/vesmaro-eyes")).toEqual([]);
    const mnemos = crumbsFor("/docs/mnemos");
    expect(mnemos[0]).toEqual({ to: "/docs/vesmaro-eyes", key: "nav.docs" });
    expect(mnemos[1]?.label).toBe("Mnemos");
  });

  it("category trail: Документация → категория (project-scoped and legacy)", () => {
    expect(crumbsFor("/docs/vesmaro-eyes/c/maintenance")).toEqual([
      { to: "/docs/vesmaro-eyes", key: "nav.docs" },
      { key: "docs.cat.maintenance" },
    ]);
    expect(crumbsFor("/docs/c/maintenance")).toEqual([
      { to: "/docs/vesmaro-eyes", key: "nav.docs" },
      { key: "docs.cat.maintenance" },
    ]);
  });

  it("unknown slug keeps a trail with the raw slug as the label", () => {
    const crumbs = crumbsFor("/docs/ghost");
    expect(crumbs[crumbs.length - 1]?.label).toBe("ghost");
    // Label-only crumb: no dictionary key — routeTitle falls through to it.
    expect(routeTitleKey("/docs/ghost")).toBeNull();
    expect(routeTitle("/docs/ghost", (key) => `t:${key}`)).toBe("ghost");
  });

  it("a docs group lights on its own hub; the category of the active article is current", async () => {
    await getManifest();
    expect(docsLocationFor("/docs/vesmaro-eyes")).toEqual({
      project: "vesmaro-eyes",
      category: null,
      slug: null,
    });
    expect(docsLocationFor("/docs/upgrade")).toEqual({
      project: "vesmaro-eyes",
      category: "maintenance",
      slug: "upgrade",
    });
    expect(docsLocationFor("/docs/mnemos/user/getting-started")).toEqual({
      project: "mnemos",
      category: "mnemos-user",
      slug: "mnemos/user/getting-started",
    });
  });
});
