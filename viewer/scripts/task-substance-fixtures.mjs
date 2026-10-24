/**
 * Wire-exact substance fixtures for the acceptance shots and the overflow
 * probe (board-openapi TaskSubstanceOut + Substance*Out); the content mirrors
 * TaskSubstance.test.tsx / tests/test_task_substance.py with ru report bodies
 * so the frames show the real human channel. Single corpus — the shot script
 * and the probe MUST see the same wire.
 */

export const TASK_ID = "TB-1";

export const boardRow = {
  id: TASK_ID,
  col: "in-progress",
  position: 0,
  title: "Достроить борд v0.3: центральные модалки, управление хранилищами, кластеры",
  summary:
    "Операционный кокпит vesmaro-программы: задачи × статусы × агенты × среды × живая память. " +
    "v0.3 = замечания владельца от 2026-09-15: модалка задачи по центру, полный CRUD хранилищ.",
  spec:
    "Контекст: владелец подтвердил подключение к vesmaro.abyss.lab.\n\n" +
    "Acceptance criteria:\n— [x] задача открывается центральным модальным окном\n" +
    "— [ ] CRUD хранилищ без перезагрузки\n— [ ] кластеры памяти как интерфейсная сущность",
  agents: ["zcode"],
  specialists: ["@GCW: Tech Lead"],
  env: "cluster",
  project: "vesma-eyes",
  memory_ids: ["25cdc0e9-1912-4217-aaf0-0e7c48912df1"],
  mnemos_tags: ["project:vesma-eyes", "agent:zcode", "mnemos:decision"],
  created_at: "2026-09-12T09:00:00+00:00",
  updated_at: "2026-09-18T14:30:00+00:00",
  archived: 0,
  status: "in-progress",
  priority: "critical",
  archived_from: "",
  validating_since: "",
  resolved_at: "",
  done_at: "",
  human_view: "",
};

export const board = {
  columns: ["backlog", "validating", "open", "in-progress", "blocked", "resolved", "done"],
  tasks: [boardRow],
  counts: {
    backlog: 0,
    validating: 0,
    open: 0,
    "in-progress": 1,
    blocked: 0,
    resolved: 0,
    done: 0,
  },
};

/** Header reports read (UI-8 «Вернуть в работу» decision + reports count). */
export const reports = {
  ok: true,
  task_id: TASK_ID,
  count: 3,
  items: [
    {
      id: 1,
      task_id: TASK_ID,
      kind: "intermediate",
      agent: "zcode",
      body: "Промежуточный отчёт: разведка завершена, роуты Tasks подтверждены.",
      human_body: "",
      superseded: false,
      created_at: "2026-09-18T14:20:00+00:00",
    },
    {
      id: 2,
      task_id: TASK_ID,
      kind: "final",
      agent: "zcode",
      body: "Финальный отчёт v1: список страниц свёрстан.",
      human_body: "",
      superseded: true,
      created_at: "2026-09-18T14:25:00+00:00",
    },
    {
      id: 3,
      task_id: TASK_ID,
      kind: "final",
      agent: "zcode",
      body: "Финальный отчёт v2: список + страница задачи готовы, правки внесены.",
      human_body: "",
      superseded: false,
      created_at: "2026-09-18T14:30:00+00:00",
    },
  ],
};

const queuedAssignment = {
  id: 7,
  state: "queued",
  harness: "zcode",
  specialist: "gcw-qa-engineer",
  specialist_slug: "gcw-qa-engineer",
  specialist_slug_ok: true,
  created_by: "owner",
  claimed_by: "",
  executor_id: "exec-1",
  claimed_by_executor: "",
  note: "",
  topics: [],
  attempts: 2,
  created_at: "2026-10-22T11:00:00Z",
  claimed_at: "",
  started_at: "",
  heartbeat_at: "",
  finished_at: "",
};

export function fullSubstance() {
  const liveFinal = {
    id: 3,
    kind: "final",
    agent: "gcw-tech-lead",
    agent_slug: "gcw-tech-lead",
    agent_slug_ok: true,
    body: "final draft v2: guard patched, regression test added",
    human_body: "Финал v2: guard залатан, регрессионный тест добавлен. Проверено на стенде.",
    superseded: false,
    created_at: "2026-10-22T12:00:00Z",
  };
  return {
    ok: true,
    task_id: TASK_ID,
    task: {
      id: TASK_ID,
      summary: "Починить цикл редиректа на логине",
      spec: "Шаги: воспроизвести, залатать guard, добавить регрессионный тест.",
    },
    reports: {
      count: 3,
      live_count: 2,
      final: liveFinal,
      items: [
        {
          id: 1,
          kind: "intermediate",
          agent: "@GCW: Tech Lead",
          agent_slug: "gcw-tech-lead",
          agent_slug_ok: true,
          body: "step one done: reproduced the loop",
          human_body: "Шаг один выполнен: цикл воспроизведён на стенде.",
          superseded: false,
          created_at: "2026-10-22T09:00:00Z",
        },
        {
          id: 2,
          kind: "final",
          agent: "Максим",
          agent_slug: "",
          agent_slug_ok: false,
          body: "final draft v1 (early attempt)",
          human_body: "Черновик финала v1 (ранняя попытка).",
          superseded: true,
          created_at: "2026-10-22T10:30:00Z",
        },
        liveFinal,
      ],
    },
    executors: {
      count: 2,
      active: queuedAssignment,
      items: [
        {
          id: 6,
          state: "cancelled",
          harness: "codex",
          specialist: "gcw-designer",
          specialist_slug: "",
          specialist_slug_ok: false,
          created_by: "owner",
          claimed_by: "",
          executor_id: "exec-2",
          claimed_by_executor: "",
          note: "",
          topics: [],
          attempts: 0,
          created_at: "2026-10-22T09:40:00Z",
          claimed_at: "",
          started_at: "",
          heartbeat_at: "",
          finished_at: "2026-10-22T10:00:00Z",
        },
        queuedAssignment,
      ],
    },
    sessions: {
      count: 1,
      items: [
        {
          session_id: "exec-1:sess_abc",
          executor_id: "exec-1",
          executor_name: "zcode worker",
          native_id: "sess_abc",
          task_id: TASK_ID,
          harness: "zcode",
          specialist: "gcw-tech-lead",
          path: "/home/u/sessions/sess_abc.jsonl",
          tool_calls: 12,
          duration_s: 340.2,
          started_at: "2026-10-22T10:04:11Z",
          ended_at: "",
          parent_native_id: "",
          first_seen_at: "2026-10-22T10:04:12Z",
          reported_at: "2026-10-22T10:09:52Z",
          reported_age_s: 42,
        },
      ],
    },
    memories: {
      count: 1,
      linked: ["m-1"],
      items: {},
      unresolved: [],
      sources: {},
    },
    review: null,
  };
}

/** The fresh-task answer: every source honestly empty, review explicit null. */
export function emptySubstance() {
  return {
    ok: true,
    task_id: TASK_ID,
    task: { id: TASK_ID, summary: "Карточка, которой цикл не касался" },
    reports: { count: 0, live_count: 0, final: null, items: [] },
    executors: { count: 0, active: null, items: [] },
    sessions: { count: 0, items: [] },
    memories: { count: 0, linked: [], items: {}, unresolved: [], sources: {} },
    review: null,
  };
}
