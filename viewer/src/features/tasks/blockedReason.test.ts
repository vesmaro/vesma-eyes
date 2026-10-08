import { describe, expect, it } from "vitest";
import type { AssignmentItem } from "@/gateway/boardTypes";
import type { TranslationKey } from "@/i18n";
import { terminalReasonAssignmentOf } from "@/features/agents/assignmentStatus";
import { blockedReasonOf } from "./blockedReason";

/**
 * U3 blocked-reason dictionary (15-WOW §3.4 п.4): the reason is DERIVED from
 * the task's own data — the failed/expired assignment outcome first (the
 * server's own fail→blocked move), then the unrouted queue, then the absent
 * assignees, then the generic v11 line. Never invented, never guessed.
 */

/** The dictionary under test speaks the ru pack (the key source of truth). */
const ru = new Map<string, string>([
  ["tasks.blocked.failed", "попытка исполнения не удалась"],
  ["tasks.blocked.expired", "исполнение истекло: агент перестал отвечать"],
  ["tasks.blocked.unrouted", "нет доступного исполнителя"],
  ["tasks.blocked.unassigned", "исполнитель не назначен"],
  ["tasks.board.blockedReason", "агент не может взять задачу"],
]);
const t = (key: TranslationKey): string => ru.get(key) ?? key;

const ASSIGNMENT_BASE = {
  id: 108,
  task_id: "RB-2",
  specialist: "@GCW: Senior Security Engineer",
  harness: "copilot",
  created_by: "owner",
  claimed_by: "copilot:old-host",
  spec_hash: "6a8e1d3f0c7b",
  executor_id: "",
  claimed_by_executor: "exec-copilot-revoked",
  created_at: "2026-09-18T15:00:00+00:00",
  claimed_at: "2026-09-18T15:02:00+00:00",
  started_at: "2026-09-18T15:05:00+00:00",
  heartbeat_at: "2026-09-18T17:40:00+00:00",
  finished_at: "2026-09-18T17:55:00+00:00",
  topics: [],
  routing: { resolved: null, reason: "unmatched" },
} as const;

const assignment = (
  over: Partial<AssignmentItem>,
): AssignmentItem =>
  ({
    ...ASSIGNMENT_BASE,
    state: "failed",
    note: "",
    ...over,
  }) as AssignmentItem;

describe("terminalReasonAssignmentOf — the projection", () => {
  it("returns the task's latest failed/expired row (highest id wins)", () => {
    const items = [
      assignment({ id: 5, state: "failed", note: "старая" }),
      assignment({ id: 2, task_id: "other", state: "expired" }),
      assignment({ id: 9, state: "expired", note: "свежая" }),
      assignment({ id: 11, state: "done", note: "терминальный, но не reason" }),
    ];
    expect(terminalReasonAssignmentOf(items, "RB-2")?.id).toBe(9);
  });

  it("undefined for a task with no terminal attempt", () => {
    const items = [
      assignment({ id: 5, state: "running" }),
      assignment({ id: 6, state: "queued" }),
    ];
    expect(terminalReasonAssignmentOf(items, "RB-2")).toBeUndefined();
  });
});

describe("blockedReasonOf — the dictionary", () => {
  it("failed + note → the server's own human line (the note IS the reason)", () => {
    const reason = blockedReasonOf(
      { agents: ["zcode"] },
      assignment({ state: "failed", note: "причина из fail-отчёта: 403" }),
      false,
      t,
    );
    expect(reason).toEqual({ text: "причина из fail-отчёта: 403" });
  });

  it("failed without a note → the dictionary line", () => {
    expect(
      blockedReasonOf({ agents: ["zcode"] }, assignment({ state: "failed" }), false, t),
    ).toEqual({ text: "попытка исполнения не удалась" });
  });

  it("expired → the dictionary line; the reaper's note rides as the tooltip", () => {
    const reason = blockedReasonOf(
      { agents: ["zcode"] },
      assignment({ state: "expired", note: "reaper: 30 мин без пульса" }),
      false,
      t,
    );
    expect(reason.text).toBe("исполнение истекло: агент перестал отвечать");
    expect(reason.note).toBe("reaper: 30 мин без пульса");
  });

  it("queued + unmatched route → no eligible executor (fixture TB-5's truth)", () => {
    expect(blockedReasonOf({ agents: ["zcode"] }, undefined, true, t)).toEqual({
      text: "нет доступного исполнителя",
    });
  });

  it("no agents at all → executor never assigned", () => {
    expect(blockedReasonOf({ agents: [] }, undefined, false, t)).toEqual({
      text: "исполнитель не назначен",
    });
  });

  it("terminal beats unrouted beats unassigned (precedence is data-first)", () => {
    expect(
      blockedReasonOf(
        { agents: [] },
        assignment({ state: "failed", note: "403" }),
        true,
        t,
      ).text,
    ).toBe("403");
  });

  it("nothing derivable → the generic v11 line (never silence, never a guess)", () => {
    expect(blockedReasonOf({ agents: ["zcode"] }, undefined, false, t)).toEqual({
      text: "агент не может взять задачу",
    });
  });
});
