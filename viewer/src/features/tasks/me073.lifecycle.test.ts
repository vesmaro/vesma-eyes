import { describe, expect, it } from "vitest";
import { translate } from "@/i18n";
import {
  columnHintKey,
  formatTaskTimestamp,
  humanDuration,
  taskLifecycleLabel,
} from "./taskStatus";
import {
  filterTasks,
  hasActiveTaskFilters,
  parseTaskListParams,
  serializeTaskListParams,
} from "./taskFilters";
import {
  isBoardColumnsMode,
  visibleColumnsFor,
} from "./tasksViewPrefs";
import type { BoardTask } from "@/gateway/boardTypes";

/**
 * ME-073..077 unit contour: lifecycle time helpers (ME-074), the date
 * filter dialect (ME-075) and the column-visibility projection (ME-077).
 * Pure functions only — the page-level behaviour lives in the component
 * tests.
 */

// ------------------------------------------------- ME-074: time helpers

// The REAL dictionary translate (ru) — the label composition is asserted
// against the actual copy, not a stub.
const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>): string =>
  translate("ru", key, vars);

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "T-1",
    col: "open",
    position: 0,
    title: "x",
    summary: "",
    spec: "",
    agents: [],
    specialists: [],
    env: "unknown",
    project: "",
    memory_ids: [],
    mnemos_tags: [],
    created_at: "2026-09-28T10:00:00+00:00",
    updated_at: "2026-09-28T10:00:00+00:00",
    archived: 0,
    status: "open",
    priority: "normal",
    archived_from: "",
    validating_since: "",
    resolved_at: "",
    done_at: "",
    ...overrides,
  } as BoardTask;
}

describe("humanDuration (ME-074 «висит N»)", () => {
  it("picks the largest whole unit", () => {
    expect(humanDuration(30 * 1000, "ru")).toBe("меньше минуты");
    expect(humanDuration(5 * 60_000, "ru")).toBe("5 минут");
    expect(humanDuration(90 * 60_000, "ru")).toBe("1 час");
    expect(humanDuration(2 * 24 * 3_600_000, "ru")).toBe("2 дня");
  });

  it("applies the ru plural forms (one/few/many)", () => {
    expect(humanDuration(1 * 24 * 3_600_000, "ru")).toBe("1 день");
    expect(humanDuration(3 * 24 * 3_600_000, "ru")).toBe("3 дня");
    expect(humanDuration(7 * 24 * 3_600_000, "ru")).toBe("7 дней");
    expect(humanDuration(2 * 3_600_000, "ru")).toBe("2 часа");
    expect(humanDuration(5 * 3_600_000, "ru")).toBe("5 часов");
  });

  it("speaks en", () => {
    expect(humanDuration(3_600_000, "en")).toBe("1 hour");
    expect(humanDuration(2 * 24 * 3_600_000, "en")).toBe("2 days");
  });
});

describe("formatTaskTimestamp (ME-074 «завершена …»)", () => {
  it("renders the ru human form", () => {
    expect(formatTaskTimestamp("2026-10-01T14:05:00+00:00", "ru"))
      .toBe("01.10 в 14:05");
  });

  it("renders the en human form", () => {
    expect(formatTaskTimestamp("2026-10-01T14:05:00+00:00", "en"))
      .toBe("1 Oct, 14:05");
  });

  it("degrades honestly on missing/unparsable stamps", () => {
    expect(formatTaskTimestamp("", "ru")).toBe("");
    expect(formatTaskTimestamp(null, "ru")).toBe("");
    expect(formatTaskTimestamp("not-a-date", "en")).toBe("");
  });
});

describe("taskLifecycleLabel (ME-074 card meta line)", () => {
  const NOW = Date.parse("2026-10-01T12:00:00+00:00");

  it("live column: arrival + hanging age", () => {
    const line = taskLifecycleLabel(
      task({ col: "open", created_at: "2026-09-29T10:00:00+00:00" }),
      "ru",
      NOW,
      t,
    );
    expect(line).toBe("поступила 29.09 · висит 2 дня");
  });

  it("resolved column: arrival + completion moment", () => {
    const line = taskLifecycleLabel(
      task({
        col: "resolved",
        resolved_at: "2026-10-01T09:30:00+00:00",
      }),
      "ru",
      NOW,
      t,
    );
    expect(line).toBe("поступила 28.09 · завершена 01.10 в 09:30");
  });

  it("done column prefers the acceptance stamp, falls back to resolved", () => {
    const line = taskLifecycleLabel(
      task({
        col: "done",
        done_at: "2026-10-01T11:00:00+00:00",
        resolved_at: "2026-10-01T09:30:00+00:00",
      }),
      "ru",
      NOW,
      t,
    );
    // done_at (acceptance) wins over resolved_at (completion moment)
    expect(line).toContain("завершена 01.10 в 11:00");
  });

  it("pre-ME-074 rows (empty stamps) degrade honestly", () => {
    // a completed task with no stamp is NOT "hanging" — arrival only
    const line = taskLifecycleLabel(
      task({ col: "done", resolved_at: "", done_at: "" }),
      "ru",
      NOW,
      t,
    );
    expect(line).toBe("поступила 28.09");
  });
});

describe("columnHintKey (ME-077)", () => {
  it("maps every wire column; unknown columns render no hint", () => {
    for (const column of ["backlog", "validating", "open", "in-progress", "blocked", "resolved", "done"]) {
      expect(columnHintKey(column)).toBe(`tasks.columnHint.${column}`);
    }
    expect(columnHintKey("mystery")).toBeNull();
  });
});

// ------------------------------------------------- ME-075: date filters

const NOW_STAMP = "2026-10-01T09:00:00+00:00";

const boardRows: BoardTask[] = [
  task({ id: "A", created_at: NOW_STAMP }),
  task({ id: "OLD", created_at: "2026-09-01T09:00:00+00:00" }),
  task({
    id: "DONE",
    col: "done",
    status: "done",
    done_at: "2026-09-20T09:00:00+00:00",
    resolved_at: "2026-09-19T09:00:00+00:00",
  }),
];

describe("date filter dialect (ME-075)", () => {
  it("parses only the YYYY-MM-DD shape", () => {
    const state = parseTaskListParams(new URLSearchParams(
      "created_from=2026-10-01&completed_to=2026-10-07&created_from2=x",
    ));
    expect(state.created_from).toBe("2026-10-01");
    expect(state.completed_to).toBe("2026-10-07");
    const garbage = parseTaskListParams(new URLSearchParams(
      "created_from=01.10.2026&completed_from=not-a-date",
    ));
    expect(garbage.created_from).toBeUndefined();
    expect(garbage.completed_from).toBeUndefined();
  });

  it("serializes the bounds back (clean URLs)", () => {
    const params = serializeTaskListParams({
      created_from: "2026-10-01",
      completed_to: "2026-10-07",
    });
    expect(params.get("created_from")).toBe("2026-10-01");
    expect(params.get("completed_to")).toBe("2026-10-07");
    expect(params.get("created_to")).toBeNull();
  });

  it("bounds the arrival period inclusively", () => {
    const filtered = filterTasks(boardRows, { created_from: "2026-09-15" });
    expect(filtered.map((row) => row.id)).toEqual(["A", "DONE"]);
    const toBounds = filterTasks(boardRows, { created_to: "2026-09-15" });
    expect(toBounds.map((row) => row.id)).toEqual(["OLD"]);
  });

  it("bounds the completion period; unstamped rows never match", () => {
    const filtered = filterTasks(boardRows, { completed_from: "2026-09-19" });
    expect(filtered.map((row) => row.id)).toEqual(["DONE"]);
    // the completion stamp is the FIRST completion (resolved_at) when set
    const early = filterTasks(boardRows, { completed_to: "2026-09-19" });
    expect(early.map((row) => row.id)).toEqual(["DONE"]);
  });

  it("an inverted range honestly matches nothing", () => {
    const filtered = filterTasks(boardRows, {
      created_from: "2026-10-31",
      created_to: "2026-10-01",
    });
    expect(filtered).toEqual([]);
  });

  it("date bounds count as active filters", () => {
    expect(hasActiveTaskFilters({ created_from: "2026-10-01" })).toBe(true);
    expect(hasActiveTaskFilters({ completed_to: "2026-10-01" })).toBe(true);
  });
});

// ------------------------------------------------- ME-077: column mode

describe("column visibility projection (ME-077)", () => {
  const wire = ["backlog", "validating", "open", "in-progress", "blocked", "resolved", "done"];

  it("compact keeps the 5 workflow lanes in wire order", () => {
    expect(visibleColumnsFor(wire, "compact")).toEqual([
      "open", "in-progress", "blocked", "resolved", "done",
    ]);
  });

  it("all keeps the full wire order", () => {
    expect(visibleColumnsFor(wire, "all")).toEqual(wire);
  });

  it("guards the persisted mode", () => {
    expect(isBoardColumnsMode("compact")).toBe(true);
    expect(isBoardColumnsMode("all")).toBe(true);
    expect(isBoardColumnsMode("7")).toBe(false);
  });
});
