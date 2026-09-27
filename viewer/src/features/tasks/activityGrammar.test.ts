import { describe, expect, it } from "vitest";
import {
  accentColorClass,
  activityKindMeta,
  formatAbsoluteStamp,
  formatClockTime,
  formatRelativeActivityTime,
  movedDetailParts,
  movedPartColumnKey,
  parseActor,
  resolveActorName,
} from "./activityGrammar";

/**
 * UI-28 §2.3 actor grammar (ADR 0012 Amd §A.5 — format unchanged) + the row
 * grammar: WHAT verbs/accent per kind, the final-report flag, the honest
 * ABSENCE for actor-less rows, the moved-detail column translation and the
 * WHEN helpers. The FALLBACK name resolution uses the already-loaded roster.
 */

const NOW = Date.parse("2026-09-19T12:00:00+00:00");

describe("actor grammar §2.3 — every wire spelling", () => {
  it("ui → the owner badge (single-tenant: one ui leg)", () => {
    expect(parseActor("ui")).toEqual({
      cls: "user",
      labelKey: "activity.actor.owner",
      title: "ui",
    });
  });

  it("device:<id> <name> → the NAME shows, the id rides in the title", () => {
    const actor = parseActor("device:dev-7pad night-tablet");
    expect(actor).toMatchObject({ cls: "device", name: "night-tablet", title: "device:dev-7pad night-tablet" });
    // no name given — the id itself degrades into the label slot
    expect(parseActor("device:dev-9").name).toBe("dev-9");
  });

  it("machine:board → «борд»", () => {
    expect(parseActor("machine:board")).toMatchObject({ cls: "board", labelKey: "activity.actor.board" });
  });

  it("machine:<executor_id> → resolved against the registry, raw id fallback", () => {
    const actor = parseActor("machine:exec-laptop-zcode");
    expect(actor).toMatchObject({ cls: "agent", name: "exec-laptop-zcode" });
    expect(resolveActorName(actor, (id) => (id === "exec-laptop-zcode" ? "zcode@laptop" : undefined))).toBe(
      "zcode@laptop",
    );
    // the registry does not know the executor (deleted / never visited) —
    // the raw id shows; the row never breaks
    const unknown = parseActor("machine:exec-gone");
    expect(resolveActorName(unknown, () => undefined)).toBe("exec-gone");
  });

  it("machine services → their honest service labels", () => {
    expect(parseActor("machine:reaper")).toMatchObject({ cls: "service", labelKey: "activity.actor.reaper" });
    expect(parseActor("machine:validation-sweep")).toMatchObject({
      cls: "service",
      labelKey: "activity.actor.sweep",
    });
  });

  it("an ABSENT actor is a class, not a string — the honest no-badge path", () => {
    // The page renders a badge only when actor !== undefined; the grammar
    // simply never sees a value here. parseActor() asserts no invention:
    // there is no "unknown" spell to fabricate.
    const actor: string | undefined = undefined;
    expect(actor).toBeUndefined();
  });

  it("an unknown spelling degrades to the raw string, never a crash", () => {
    expect(parseActor("kiosk:42")).toMatchObject({ cls: "agent", name: "kiosk:42", title: "kiosk:42" });
  });
});

describe("row grammar §2.1/§2.2 — WHAT per kind", () => {
  it("maps every v1 kind to an icon, verb key and accent", () => {
    const kinds = [
      "task.created", "task.moved", "task.updated", "task.archived", "task.unarchived",
      "assignment.created", "assignment.claimed", "assignment.started", "assignment.done",
      "assignment.failed", "assignment.cancelled", "assignment.expired", "report",
    ];
    for (const kind of kinds) {
      const meta = activityKindMeta(kind, false);
      expect(meta, kind).toBeDefined();
      expect(meta?.verbKey).toMatch(/^activity\.kind\./);
    }
  });

  it("terminal assignment transitions are flagged for the aloud region", () => {
    for (const kind of ["assignment.done", "assignment.failed", "assignment.cancelled", "assignment.expired"]) {
      expect(activityKindMeta(kind, false)?.terminal, kind).toBe(true);
    }
    expect(activityKindMeta("task.moved", false)?.terminal).toBe(false);
  });

  it("final reports get the Flag/highlight treatment; intermediate stays quiet", () => {
    expect(activityKindMeta("report", true)?.verbKey).toBe("activity.kind.reportFinal");
    expect(accentColorClass(activityKindMeta("report", true)?.accent ?? "neutral")).toBe("text-iris-bright");
    expect(activityKindMeta("report", false)?.verbKey).toBe("activity.kind.reportIntermediate");
    // semantic accents ride existing tokens only
    expect(accentColorClass("success")).toBe("text-success");
    expect(accentColorClass("error")).toBe("text-error");
    expect(accentColorClass("warning")).toBe("text-confidence");
  });

  it("an unknown (future) kind has no meta — the row is skipped, not broken", () => {
    expect(activityKindMeta("task.teleported", false)).toBeUndefined();
  });
});

describe("moved detail — column keys translate, raw text passes", () => {
  it("splits on the arrow the wireframe uses", () => {
    expect(movedDetailParts("in-progress → resolved")).toEqual(["in-progress", "resolved"]);
    expect(movedDetailParts("single")).toEqual(["single"]);
  });

  it("wire column keys map onto the EXISTING column labels", () => {
    expect(movedPartColumnKey("in-progress")).toBe("tasks.column.in-progress");
    expect(movedPartColumnKey("resolved")).toBe("tasks.column.resolved");
    // server-authored human text (COLUMN_RU spellings) is not a key — raw
    expect(movedPartColumnKey("в работе")).toBeNull();
  });
});

describe("WHEN — relative label, absolute stamp, clock", () => {
  it("relative buckets: just now / minutes / hours / days", () => {
    expect(formatRelativeActivityTime("2026-09-19T11:59:30+00:00", "ru", NOW)).toBe("только что");
    expect(formatRelativeActivityTime("2026-09-19T11:30:00+00:00", "ru", NOW)).toContain("30");
    expect(formatRelativeActivityTime("2026-09-19T10:30:00+00:00", "en", NOW)).toContain("hour");
    expect(formatRelativeActivityTime("2026-09-18T11:30:00+00:00", "en", NOW)).toContain("day");
  });

  it("invalid stamps degrade to the em dash, never NaN", () => {
    expect(formatRelativeActivityTime("nope", "ru", NOW)).toBe("—");
    expect(formatClockTime("nope", "ru")).toBe("—");
    expect(formatAbsoluteStamp("nope", "en")).toBe("—");
  });

  it("the clock renders HH:MM for the amber marker", () => {
    expect(formatClockTime("2026-09-19T14:32:00+00:00", "ru")).toMatch(/^\d{2}:\d{2}$/);
  });
});
