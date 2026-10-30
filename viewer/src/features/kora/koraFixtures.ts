import type { components } from "./koraContract";
import type { HermesMessage, KoraModelsRoster, KoraSpecialistsRoster } from "./koraTypes";

type SpecSession = components["schemas"]["KoraSessionOut"];
type SpecTranscriptItem = components["schemas"]["KoraTranscriptItemOut"];

/**
 * Kora week-0 fixtures (ADR 0019 rev.2).
 *
 * Mock data for the slice 1–3 UI mocks. The objects are TYPED BY THE
 * GENERATED CONTRACT TYPES (satisfies against koraContract.d.ts, generated
 * from the frozen docs/kora/openapi.yaml) — if the artifact and the
 * fixtures drift apart in either direction, typecheck fails. The fixtures
 * tell the three product stories of the section: a live zcode relay session
 * (steerable), an idle vscode session (lists-only coverage, known gap), and
 * a dead pi session (recovery semantics — dead process, session stays in
 * the registry).
 *
 * T004 slice 2 (hermes-bridge, 2026-10-10): the registry rides ONE leg —
 * hermes sessions are KoraSessionOut rows under the RESERVED synthetic
 * executor id `hermes` (server: KORA_HERMES_EXECUTOR_ID), origin relay,
 * project prefix `hermes:<source>`; the FE tells sources apart by
 * `harness: "hermes"`. The hermes fixture models a live cluster session
 * arriving after a pull; its transcript is a DELIBERATE gap (slice 3) —
 * the mock throws session_not_found for it, the honest «transcripts later».
 */

export const KORA_FIXTURE_COVERAGE: components["schemas"]["KoraCoverageOut"] = {
  harnesses: [
    {
      harness: "zcode",
      support: "full",
      note: "Списки и read-only транскрипты (mode=ro + WAL-snapshot-fallback, redaction choke-point)",
    },
    {
      harness: "vscode",
      support: "lists-only",
      note: "Списки и превью; полный транскрипт — известный пробел (kind:1)",
    },
    {
      harness: "pi",
      support: "lists-only",
      note: "Списки с превью; транскрипты pi пока не отдаются",
    },
    {
      harness: "hermes",
      support: "full",
      note: "Живые списки, транскрипты и чат (не-потоковый) через мост (ClusterIP API-сервер, pull по запросу владельца); стиринга у hermes-сессий нет, SSE-стрим чата — будущий срез",
    },
  ],
  gaps: [
    "Полные транскрипты vscode — известный пробел среза 2 (kind:1)",
    "Транскрипты pi не отдаются (срез 2 даёт только списки)",
    "Транскрипты сессий удалённых хостов ждут расписания W4 loopback-ingress",
    "Чат hermes отвечает не-потоково (SSE-стрим — будущий срез); стиринг hermes-сессий мостом не предусмотрен",
  ],
};

/** The reserved synthetic executor id for hermes-bridge sessions
 * (server/app.py KORA_HERMES_EXECUTOR_ID — the FE mirrors it only for the
 * mock fixture shape; all UI logic branches on harness=hermes). */
export const KORA_FIXTURE_HERMES_EXECUTOR_ID = "hermes";

/** The hermes sessions the mock serves in the registry after a pull.
 * TYPED BY THE GENERATED CONTRACT (satisfies): one live relay session and
 * one idle one — the two states the status frames show. The sources mirror
 * the hermes разведка (api_server + telegram): the project prefix carries
 * the source name and the previews are the real session-header shapes
 * («Hysteria прокси…», «Confirm with OK…»). */
export const KORA_FIXTURE_HERMES_SESSIONS: readonly (components["schemas"]["KoraSessionOut"] & {
  harness: "hermes";
})[] = [
  {
    id: "hermes:api-server-main",
    executor_id: "hermes",
    native_id: "api-server-main",
    harness: "hermes",
    project: "hermes:api_server",
    cwd: null,
    state: "live",
    origin: "relay",
    steerable: false,
    started_at: "2026-09-24T08:02:00Z",
    last_activity_at: "2026-09-24T11:30:00Z",
    age_seconds: 12480,
    last_line_preview: "Hysteria прокси: перечитал конфиг, туннель слушает 443…",
  },
  {
    id: "hermes:telegram-bridge",
    executor_id: "hermes",
    native_id: "telegram-bridge",
    harness: "hermes",
    project: "hermes:telegram",
    cwd: null,
    state: "idle",
    origin: "relay",
    steerable: false,
    started_at: "2026-09-23T14:40:00Z",
    last_activity_at: "2026-09-23T18:05:00Z",
    age_seconds: 79200,
    last_line_preview: "Confirm with OK to resume the deploy train…",
  },
] as const satisfies readonly (components["schemas"]["KoraSessionOut"] & {
  harness: "hermes";
})[];

/**
 * The honest hermes bridge status (GET /api/kora/hermes/status mock):
 * configured + ok, registry slice = the fixture count. The OFF mode is a
 * runtime mock knob (`hermesBridge=off` location param, same pattern as
 * `koraAuth=locked`), not a second fixture set.
 */
export const KORA_FIXTURE_HERMES_STATUS = {
  configured: true,
  endpoint: "http://agentsnode-hermes-clusterip.kube-agents.svc.cluster.local:8642",
  mode: "ok" as const,
  registry_sessions: KORA_FIXTURE_HERMES_SESSIONS.length,
  detail: null,
  // KW2 «Живой чат»: the static verified roster (the server's single
  // source hermes_client.HERMES_MODELS, mirrored in the mock).
  models: ["hermes-4.5-405b", "hermes-4.5-70b"],
  default_model: "hermes-4.5-405b",
};

/**
 * The specialist roster (В2a — GET /api/kora/specialists mock, KORA-
 * SPECIALISTS-1): open facts only — the board's declared names, the
 * profile-route slugs, the read-only profile-cache bit. TYPED BY THE
 * SEAM TYPE (mirrored from KoraSpecialistsOut in server/app.py — the
 * route is an additive wave, outside the frozen artifact). The composer's
 * specialist selector renders FROM the roster or not at all (§5.3).
 */
export const KORA_FIXTURE_SPECIALISTS: KoraSpecialistsRoster = {
  ok: true,
  count: 2,
  items: [
    {
      name: "@GCW: Tech Lead",
      slug: "gcw-tech-lead",
      profile_cached: true,
    },
    {
      name: "@GCW: Senior Frontend Developer",
      slug: "gcw-senior-frontend-developer",
      profile_cached: false,
    },
  ],
  meta: { generated_at: "2026-10-29T00:00:00+00:00" },
};

/**
 * The per-executor models roster (В3a — GET /api/kora/models mock,
 * KORA-MODELS-1). TYPED BY THE SEAM TYPE (mirrored from KoraModelsOut in
 * server/app.py — the additive wave, outside the frozen artifact). The
 * executor ids match the BOARD mock's registry (MOCK_EXECUTORS — the tree
 * joins the roster against THAT registry, so the built mock playground
 * demonstrates the model level: the laptop zcode executor reports two
 * providers (configured + anonymous — the availability bits), the mesh-2
 * zcode executor reports one; every executor absent here (old-laptop,
 * the copilots) reads the honest «модели не сообщаются»,
 * K-TREE-MODEL-UNKNOWN, and hermes keeps its OWN single source — the
 * /status roster. NO context-limit field anywhere — no source reports
 * one today, the mock does not invent it (§4: ни одно состояние не
 * выдумывает данные).
 */
export const KORA_FIXTURE_MODELS: KoraModelsRoster = {
  ok: true,
  count: 2,
  executors: [
    {
      executor_id: "exec-laptop-zcode",
      reported_at: "2026-10-28T18:20:00+00:00",
      installations: [
        {
          harness: "zcode",
          provider: "z-ai",
          auth: "configured",
          source: "config",
          models: ["glm-5.3", "glm-4.6"],
        },
        {
          harness: "zcode",
          provider: "openrouter",
          auth: "anonymous",
          source: "probe",
          models: ["anthropic/claude-sonnet-4.5"],
        },
      ],
    },
    {
      executor_id: "exec-mesh-qa",
      reported_at: "2026-10-27T09:05:00+00:00",
      installations: [
        {
          harness: "zcode",
          provider: "ollama",
          auth: "anonymous",
          source: "probe",
          models: ["qwen3:32b"],
        },
      ],
    },
  ],
  meta: { generated_at: "2026-10-29T00:00:00+00:00" },
};

/**
 * The hermes transcript rows (T004 slice 3 — GET /api/kora/hermes/sessions/
 * {id}/messages mock). TYPED BY THE UI-ONLY SEAM TYPE: the frozen
 * KoraTranscriptItemOut base + the hermes passthrough (reasoning, tool_calls;
 * display_kind rides the base `kind`). Served regardless of the registry
 * pull state — the server proxies hermes LIVE for messages (hermes IS the
 * authority; the registry is a derived cache) — but a pre-pull session page
 * never renders (the registry-derived session row is absent), so the gap
 * stays honest.
 *
 * The api-server transcript is a LONG session (63 rows): the seq-cursor
 * paging story («Показать ещё» over has_more) needs a full first page at
 * the default limit 50. Content mirrors the TL recon headers: the Hysteria
 * proxy for Telegram in the cluster, the Mnemos memory federation checks,
 * the deploy-train «Confirm with OK» protocol. The telegram session stays
 * small (6 rows — a short honest transcript, no load-more).
 */

/** Fixed UTC minute grid — deterministic RFC 3339 stamps, no Date.now(). */
function hermesTs(minute: number): string {
  return new Date(Date.UTC(2026, 8, 24, 8, minute, 0)).toISOString();
}

/** One OpenAI-shaped tool call (the shape hermes passes through verbatim). */
function hermesToolCall(
  name: string,
  args: string,
): Record<string, unknown> {
  return {
    id: `call_${name}`,
    type: "function",
    function: { name, arguments: args },
  };
}

type HermesFixtureMessage = Omit<HermesMessage, "seq" | "ts">;

const KORA_HERMES_API_SERVER_OPENERS: readonly HermesFixtureMessage[] = [
  {
    role: "user",
    kind: null,
    content:
      "Разведай Hysteria прокси для Telegram в кластере: туннель живой, порт слушает?",
    redaction_applied: false,
  },
  {
    role: "assistant",
    kind: null,
    content:
      "Да: agentsnode-hermes держит hysteria на 443/udp, Telegram-нога ходит через него. Конфиг перечитал после правок — план Apply без ошибок.",
    redaction_applied: false,
  },
  {
    role: "user",
    kind: null,
    content: "Покажи статус туннеля и последние строки журнала.",
    redaction_applied: false,
  },
  {
    role: "assistant",
    kind: "tool_call",
    content: "Снимаю статус сервиса и хвост журнала одним проходом.",
    redaction_applied: false,
    reasoning:
      "Статус и журнал отвечают на разные вопросы (живость + свежие ошибки) — два вызова подряд, потом сводка.",
    tool_calls: [
      hermesToolCall("hysteria_status", '{"node":"agentsnode-hermes"}'),
      hermesToolCall("journal_tail", '{"unit":"hysteria","lines":40}'),
    ],
  },
  {
    role: "tool",
    kind: "tool_result",
    content:
      "hysteria_status → up (uptime 4d 2h); journal_tail → 40 строк, ошибок нет",
    redaction_applied: false,
  },
  {
    role: "assistant",
    kind: null,
    content:
      "Туннель зелёный четвёртые сутки, в журнале ошибок нет — Telegram-трафик ходит стабильно.",
    redaction_applied: false,
  },
  {
    role: "user",
    kind: null,
    content:
      "Проверить работу федерации памяти Mnemos: пинг соседей и хвост репликации.",
    redaction_applied: false,
  },
  {
    role: "assistant",
    kind: "tool_call",
    content: "Федерация — это связность плюс отставание репликации; снимаю оба показателя.",
    redaction_applied: false,
    reasoning:
      "Пинг показывает связность, lag репликации — целостность; оба нужны для вердикта «порядок».",
    tool_calls: [
      hermesToolCall("mesh_ping", '{"peers":3}'),
      hermesToolCall("replication_status", '{"lag":true}'),
    ],
  },
  {
    role: "tool",
    kind: "tool_result",
    content: "mesh_ping → 3/3 peers отвечают; replication_status → lag 0s (полная)",
    redaction_applied: false,
  },
  {
    role: "assistant",
    kind: null,
    content:
      "Федерация в порядке: 3 из 3 соседей отвечают, отставание репликации нулевое.",
    redaction_applied: false,
  },
  {
    role: "user",
    kind: null,
    content: "В журнале мелькнул ключ доступа — покажи хвост ещё раз.",
    redaction_applied: false,
  },
  {
    role: "tool",
    kind: "tool_result",
    content: "journal_tail → …auth token: [REDACTED] upstream=443",
    redaction_applied: true,
  },
  {
    role: "assistant",
    kind: null,
    content:
      "Хвост отдал 40 строк; секрет борд маскирует до отдачи — в транскрипте его нет, стоит честная пометка о редактуре.",
    redaction_applied: false,
  },
];

const KORA_HERMES_API_SERVER_CHECKINS: readonly HermesFixtureMessage[] =
  Array.from({ length: 25 }, (_, i) => {
    const node = `mesh-${i + 1}`;
    return [
      {
        role: "user",
        kind: null,
        content: `Проверить узел ${node}: пинг и хвост журнала, ответь коротко.`,
        redaction_applied: false,
      },
      {
        role: "assistant",
        kind: null,
        content: `${node}: зелёный — пинг 12 мс, туннель слушает, ошибок в журнале нет.`,
        redaction_applied: false,
      },
    ] satisfies HermesFixtureMessage[];
  }).flat();

const KORA_HERMES_TELEGRAM_MESSAGES: readonly HermesFixtureMessage[] = [
  {
    role: "user",
    kind: null,
    content: "Сводка по деплой-поезду vesma: что ждёт подтверждения?",
    redaction_applied: false,
  },
  {
    role: "assistant",
    kind: null,
    content:
      "Релиз 1.72.0 опубликован; ждёт Confirm with OK — тег и release-object на месте, осталось закрыть приёмку.",
    redaction_applied: false,
  },
  {
    role: "user",
    kind: null,
    content: "Confirm with OK to resume the deploy train… — это что?",
    redaction_applied: false,
  },
  {
    role: "assistant",
    kind: null,
    content:
      "Это протокольная строка поезда: без явного OK следующие шаги не стартуют — защита от гонок с daily main.",
    redaction_applied: false,
  },
  {
    role: "user",
    kind: null,
    content: "Дай OK на паузу поезда до вечера.",
    redaction_applied: false,
  },
  {
    role: "assistant",
    kind: null,
    content:
      "Принято: поезд на паузе до 18:00 UTC; реестр сессий обновится следующим pull.",
    redaction_applied: false,
  },
];

/** The hermes transcripts the messages route serves (hermes IS the
 * authority — served regardless of the registry pull, like the server). */
export const KORA_FIXTURE_HERMES_MESSAGES: Record<
  string,
  readonly HermesMessage[]
> = {
  "hermes:api-server-main": [
    ...KORA_HERMES_API_SERVER_OPENERS,
    ...KORA_HERMES_API_SERVER_CHECKINS,
  ].map((message, index) => ({
    ...message,
    seq: index + 1,
    ts: hermesTs(2 + index * 3),
  })),
  "hermes:telegram-bridge": KORA_HERMES_TELEGRAM_MESSAGES.map(
    (message, index) => ({
      ...message,
      seq: index + 1,
      ts: hermesTs(5 + index * 4),
    }),
  ),
};

/** The canned mock chat reply: deterministic, references the last user
 * turn (a mock, honestly labelled «hermes · real-time» by the adapter). */
export function koraFixtureHermesChatReply(lastUser: string): string {
  const topic = lastUser.length > 0 ? lastUser.slice(0, 80) : "пустой вопрос";
  return (
    `Принял: «${topic}». По кластеру: туннель Hysteria слушает 443, ` +
    "федерация Mnemos отвечает 3/3, отставания репликации нет. " +
    "Что проверяем дальше?"
  );
}

export const KORA_FIXTURE_SESSIONS: readonly SpecSession[] = [
  {
    id: "exec-zcode-main:sess_7f3a91",
    executor_id: "exec-zcode-main",
    native_id: "sess_7f3a91",
    harness: "zcode",
    project: "mnemos-mesh",
    cwd: "/var/home/abyss/LABs/Projects/Project-Mnemos/mnemos-mesh",
    state: "live",
    origin: "relay",
    steerable: true,
    started_at: "2026-09-24T09:12:00Z",
    last_activity_at: "2026-09-24T11:41:00Z",
    age_seconds: 8940,
    last_line_preview:
      "Тесты транскрипта зелёные, осталось добавить anti-write кейс для ридера zcode…",
  },
  {
    id: "exec-vscode-lab:a83f1c22",
    executor_id: "exec-vscode-lab",
    native_id: "a83f1c22",
    harness: "vscode",
    project: "sealbox-ui",
    cwd: "/var/home/abyss/LABs/Projects/sealbox/ui",
    state: "idle",
    origin: "local",
    steerable: false,
    started_at: "2026-09-23T16:05:00Z",
    last_activity_at: "2026-09-23T19:47:00Z",
    age_seconds: 64920,
    last_line_preview: "Refactor settings hub: v2 grid layout, spacing tokens…",
  },
  {
    id: "exec-pi-edge:pi-2209-04",
    executor_id: "exec-pi-edge",
    native_id: "pi-2209-04",
    harness: "pi",
    project: null,
    cwd: null,
    state: "dead",
    origin: "local",
    steerable: false,
    started_at: "2026-09-22T07:30:00Z",
    last_activity_at: "2026-09-22T21:02:00Z",
    age_seconds: 169200,
    last_line_preview: null,
  },
  ...KORA_FIXTURE_HERMES_SESSIONS,
] as const satisfies readonly SpecSession[];

export const KORA_FIXTURE_TRANSCRIPT: Record<string, readonly SpecTranscriptItem[]> = {
  "exec-zcode-main:sess_7f3a91": [
    {
      seq: 1,
      role: "user",
      kind: null,
      ts: "2026-09-24T09:12:20Z",
      content:
        "Разведай структуру ридера zcode-стора: что нужно для чтения mode=ro и WAL-snapshot-fallback.",
      redaction_applied: false,
    },
    {
      seq: 2,
      role: "assistant",
      kind: null,
      ts: "2026-09-24T09:13:02Z",
      content:
        "Стор — db.sqlite в ~/.local/share/zcode/sessions; ридеру достаточно mode=ro; на холодном старте открываем через снапшот. Анти-write-тест закрывает rollback/model-io.",
      redaction_applied: false,
    },
    {
      seq: 3,
      role: "tool",
      kind: "file_read",
      ts: "2026-09-24T09:13:40Z",
      content:
        "read server/kora/zcode_reader.py (128 lines) — [redacted: path inside ~/private]",
      redaction_applied: true,
    },
    {
      seq: 4,
      role: "user",
      kind: null,
      ts: "2026-09-24T11:40:10Z",
      content: "Тесты транскрипта зелёные? Добавь anti-write кейс.",
      redaction_applied: false,
    },
    {
      seq: 5,
      role: "assistant",
      kind: null,
      ts: "2026-09-24T11:41:00Z",
      content:
        "Да, 12 passed. Anti-write кейс добавил: попытка записи через ридер падает с ошибкой «database is opened read-only».",
      redaction_applied: false,
    },
  ],
  "exec-vscode-lab:a83f1c22": [
    {
      seq: 1,
      role: "user",
      kind: null,
      ts: "2026-09-23T16:05:00Z",
      content: "Refactor settings hub: v2 grid layout, spacing tokens…",
      redaction_applied: false,
    },
  ],
  "exec-pi-edge:pi-2209-04": [],
};
