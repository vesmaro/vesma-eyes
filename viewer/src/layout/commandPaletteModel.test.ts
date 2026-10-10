import { describe, expect, it } from "vitest";
import type { BoardTask } from "@/gateway/boardTypes";
import type { ExecutorItem } from "@/gateway/boardTypes";
import type { SearchResult } from "@/gateway/types";
import {
  clampSelection,
  filterExecutorItems,
  hostPaletteItems,
  filterTaskItems,
  flattenGroups,
  groupItems,
  memoryHitItems,
  moveSelection,
} from "./commandPaletteModel";

/**
 * Pure model gates for the command palette (UX-overhaul §7.3, Ф2): the
 * honest section order (memory first — the old `/` promise), the empty-
 * query rules (local indexes stay out until typed), the approved-only
 * executor slice, the provenance hint on memory hits and the wrap-around
 * selection walk.
 */

const TASKS: BoardTask[] = [
  { id: "TB-1", title: "Снять corpus", col: "in-progress" },
  { id: "TB-3", title: "Review UI palette", col: "validating" },
  { id: "TB-5", title: "Deploy board", col: "queued" },
].map((partial) => partial as BoardTask);

const EXECUTORS: ExecutorItem[] = [
  { id: "exec-a", name: "zcode@laptop", host: "laptop", harness: "zcode", state: "approved" },
  { id: "exec-b", name: "hermes@laptop", host: "laptop", harness: "hermes", state: "pending" },
  { id: "exec-c", name: "zcode@mesh", host: "mesh-2", harness: "zcode", state: "approved" },
].map((partial) => partial as ExecutorItem);

const HITS: SearchResult[] = [
  {
    id: "mem-1",
    title: "Architecture note",
    content: "",
    tags: [],
    score: 0.9,
    search_type: "fts",
    server: "mnemos-main",
  },
  {
    id: "mem-2",
    title: "Unnamed store hit",
    content: "",
    tags: [],
    score: 0.5,
    search_type: "fts",
  },
];

describe("filterTaskItems", () => {
  it("returns nothing on the empty query (the palette opens on navigation)", () => {
    expect(filterTaskItems(TASKS, "", (id) => `/tasks/${id}`)).toEqual([]);
  });

  it("matches id and title case-insensitively, caps the rows", () => {
    const items = filterTaskItems(TASKS, "tb", (id) => `/tasks/${id}`, 2);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ group: "tasks", label: "Снять corpus", hint: "TB-1" });
    expect(items[0].to).toBe("/tasks/TB-1");
  });

  it("falls back to the id when the title is empty", () => {
    const items = filterTaskItems(
      [{ id: "TB-9", title: "" } as BoardTask],
      "tb-9",
      (id) => `/tasks/${id}`,
    );
    expect(items[0].label).toBe("TB-9");
  });
});

describe("filterExecutorItems", () => {
  it("returns nothing on the empty query", () => {
    expect(filterExecutorItems(EXECUTORS, "")).toEqual([]);
  });

  it("lists APPROVED executors only, matched by name/host/id/harness", () => {
    expect(filterExecutorItems(EXECUTORS, "laptop").map((item) => item.label)).toEqual([
      "zcode@laptop",
    ]);
    expect(filterExecutorItems(EXECUTORS, "zcode").map((item) => item.id)).toEqual([
      "agents:exec-a",
      "agents:exec-c",
    ]);
    // The pending row never surfaces — the roster is the promise.
    expect(filterExecutorItems(EXECUTORS, "hermes")).toEqual([]);
  });

  it("leads to the executor's HOST page (B1: the field workbench)", () => {
    expect(filterExecutorItems(EXECUTORS, "mesh")[0].to).toBe("/agents/hosts/mesh-2");
  });

  it("routes the never-reported host to the sentinel bucket id (C2: hostRouteId)", () => {
    const unreported = [
      { id: "exec-u", name: "zcode@?", host: "", harness: "zcode", state: "approved" },
    ] as ExecutorItem[];
    expect(filterExecutorItems(unreported, "zcode")[0].to).toBe(
      `/agents/hosts/__unreported__`,
    );
  });
});

describe("memoryHitItems", () => {
  it("carries the store provenance when the wire names it", () => {
    const items = memoryHitItems(HITS, (id) => `/memory/${id}`);
    expect(items[0].hint).toBe("mnemos-main");
    expect(items[0].to).toBe("/memory/mem-1");
  });

  it("keeps the hint empty when the adapter serves no store name (honest absence)", () => {
    const items = memoryHitItems(HITS, (id) => `/memory/${id}`);
    expect(items[1].hint).toBeUndefined();
  });

  it("caps the rows to keep the palette one screen tall", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...HITS[0],
      id: `mem-${i}`,
    }));
    expect(memoryHitItems(many, (id) => id)).toHaveLength(5);
  });
});

describe("groupItems / flattenGroups", () => {
  const items = [
    { id: "n1", group: "nav" as const, label: "Overview", to: "/" },
    { id: "m1", group: "memory" as const, label: "Hit", to: "/memory/mem-1" },
    { id: "t1", group: "tasks" as const, label: "Task", to: "/tasks/TB-1" },
    { id: "n2", group: "nav" as const, label: "Memory", to: "/memory" },
    { id: "a1", group: "agents" as const, label: "Agent", to: "/agents/hosts" },
  ];

  it("orders sections memory → tasks → agents → nav and drops empty ones", () => {
    const groups = groupItems(items);
    expect(groups.map((entry) => entry.group)).toEqual([
      "memory",
      "tasks",
      "agents",
      "nav",
    ]);
  });

  it("flattens in the section order for the keyboard walk", () => {
    expect(flattenGroups(items).map((item) => item.id)).toEqual([
      "m1",
      "t1",
      "a1",
      "n1",
      "n2",
    ]);
  });
});

describe("selection walk", () => {
  it("wraps around both ends (the palette is a ring)", () => {
    expect(moveSelection(0, -1, 4)).toBe(3);
    expect(moveSelection(3, 1, 4)).toBe(0);
    expect(moveSelection(1, 1, 4)).toBe(2);
  });

  it("returns 0 for an empty list and clamps after the list shrinks", () => {
    expect(moveSelection(0, 1, 0)).toBe(0);
    expect(clampSelection(9, 4)).toBe(3);
    expect(clampSelection(2, 4)).toBe(2);
    expect(clampSelection(5, 0)).toBe(0);
  });
});


describe("hostPaletteItems — the «хост <имя>» commands (agents-redesign C2)", () => {
  const hosts = [
    { id: "laptop", host: "laptop", online: 2, total: 2 },
    { id: "__unreported__", host: "__unreported__", online: 0, total: 1 },
  ];

  it("one row per host, matched by the «хост <имя>» query form, capped", () => {
    const items = hostPaletteItems(hosts, "хост laptop", "Хост {{host}}");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "agents:host:laptop",
      group: "agents",
      label: "Хост laptop",
      hint: "2/2",
      to: "/agents/hosts/laptop",
    });
    // The sentinel host routes under its reserved id.
    const all = hostPaletteItems(hosts, "хост", "Хост {{host}}");
    expect(all.map((item) => item.to)).toEqual([
      "/agents/hosts/laptop",
      "/agents/hosts/__unreported__",
    ]);
    expect(hostPaletteItems(hosts, "хост", "Хост {{host}}", 1)).toHaveLength(1);
  });

  it("the empty query keeps local indexes out (the palette opens on navigation)", () => {
    expect(hostPaletteItems(hosts, "", "Хост {{host}}")).toEqual([]);
  });

  it("the RU command form works over the latin host id («хост lap» → laptop)", () => {
    // The command word localizes («хост»), the name stays the wire id —
    // the mixed-alphabet query is a substring of the localized row.
    const items = hostPaletteItems(hosts, "хост lap", "Хост {{host}}");
    expect(items.map((item) => item.to)).toEqual(["/agents/hosts/laptop"]);
  });
});
