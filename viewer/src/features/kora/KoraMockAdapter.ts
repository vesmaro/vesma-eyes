/**
 * Kora mock adapter — the ONLY KoraGateway implementation of week 0
 * (ADR 0019 rev.2 «Неделя 0 — контракт-first»: UI mocks, NO backend).
 *
 * Beyond serving fixtures it models the two behaviours the ADR pins, so the
 * UI mocks exercise the real interaction contract:
 *
 * - STORE-TAIL semantics (§3): sendMessage appends to an in-memory per-
 *   session store and bumps the seq cursor — the transcript is then re-read
 *   via getTranscript(after_seq), exactly how chat v1 works against the
 *   future backend («перечитывание хвоста стора»).
 * - STEP-UP PIN (§4 / gate 7): steering calls throw KoraStepUpRequired
 *   while the PIN is inactive; enableStepUp opens a TTL window (~15 min).
 */
import { KoraError, type KoraGateway } from "./koraGateway";
import { ApiError } from "@/lib/errors";
import {
  KORA_FIXTURE_HERMES_MESSAGES,
  KORA_FIXTURE_HERMES_SESSIONS,
  KORA_FIXTURE_HERMES_STATUS,
  KORA_FIXTURE_MODELS,
  KORA_FIXTURE_SESSIONS,
  KORA_FIXTURE_SPECIALISTS,
  KORA_FIXTURE_TRANSCRIPT,
  KORA_FIXTURE_COVERAGE,
  koraFixtureHermesChatReply,
} from "./koraFixtures";
import type {
  HermesBridgeStatus,
  HermesChatReply,
  HermesChatRequest,
  HermesChatTurn,
  HermesMessage,
  HermesMessagesPage,
  HermesMessagesParams,
  KoraMessageAccepted,
  KoraModelsRoster,
  KoraSession,
  KoraSessionCreate,
  KoraSessionCreated,
  KoraSessionsList,
  KoraSessionsParams,
  KoraSpecialistsRoster,
  KoraStepUpStatus,
  KoraTranscript,
  KoraTranscriptItem,
} from "./koraTypes";

/**
 * Typed error carrying the frozen KoraErrorCode vocabulary (KoraErrorOut).
 * P4-4: extends the SEAM's KoraError (koraGateway.ts) so the UI branches
 * on the contract class, never on the concrete adapter — the HTTP swap
 * keeps the PIN/step-up screens intact.
 */
export class KoraMockError extends KoraError {
  constructor(
    code:
      | "unauthorized"
      | "metadata_only"
      | "step_up_required"
      | "step_up_denied"
      | "session_not_found"
      | "host_conflict"
      | "validation",
    message: string,
  ) {
    super(code, message);
    this.name = "KoraMockError";
  }
}

/** Step-up window length in the mock (the contract caps TTL at 900s). */
const STEP_UP_TTL_SECONDS = 900;

/** The synthetic corpus behind `?hermesMessages=big` (mock builds, the
 * KW3 perf stand): 720 deterministic hermes rows — dialog anchors plus
 * raw-walk tool rows with multi-line contents — so the «Все ходы» zone
 * expansion is timed against a transcript far beyond the 500-visible-line
 * mark (kora-rethink blueprint §8: virtualization is decided on NUMBERS).
 * Fixture rows are never mutated; the corpus exists only in this branch. */
function bigHermesCorpus(): HermesMessage[] {
  const tools = [
    "bash",
    "read_file",
    "grep",
    "write_file",
    "list_dir",
  ];
  const topics = [
    "разбор журнала кластера",
    "проверка репликации памяти",
    "правка тестов транскрипта",
    "аудит конфига туннеля",
    "ревью волны полировки",
  ];
  const rows: HermesMessage[] = [];
  let seq = 0;
  const ts = (i: number): string =>
    new Date(Date.UTC(2026, 9, 20, 8, 0, i * 30)).toISOString();
  for (let block = 0; block < 90; block += 1) {
    const topic = topics[block % topics.length];
    const filler = `Строка разбора ${block + 1}: ${topic}. `.repeat(4);
    rows.push({
      seq: (seq += 1),
      role: "user",
      kind: null,
      ts: ts(seq),
      content: `Блок ${block + 1}: ${topic} — покажи состояние и журнал.`,
      redaction_applied: false,
    });
    for (let step = 0; step < 6; step += 1) {
      const tool = tools[(block + step) % tools.length];
      rows.push({
        seq: (seq += 1),
        role: "tool",
        kind: step % 2 === 0 ? "tool_call" : "tool_result",
        ts: ts(seq),
        content: `${tool} → ${filler}`,
        redaction_applied: false,
      });
    }
    rows.push({
      seq: (seq += 1),
      role: "assistant",
      kind: null,
      ts: ts(seq),
      content: `${topic}: состояние зелёное. ${filler}`,
      redaction_applied: false,
    });
  }
  return rows;
}
const BIG_HERMES_CORPUS: readonly HermesMessage[] = bigHermesCorpus();

export interface KoraMockAdapterOptions {
  /** Disable the artificial latency for snapshot/renderToString tests. */
  latency?: boolean;
  /** Start with steering already unlocked (status-page mock). */
  stepUpActive?: boolean;
}

export class KoraMockAdapter implements KoraGateway {
  private readonly latency: boolean;
  /** The mock "store tail": per-session transcript + seq cursor. */
  private readonly store: Map<string, KoraTranscriptItem[]>;
  private readonly sessions: Map<string, KoraSession>;
  private stepUpUntil: number | null;
  /** `?koraAuth=locked` (mock builds): reads answer transport 401. */
  private readonly authLocked: boolean;
  /**
   * `?hermesBridge=off` (mock builds): the hermes leg answers honestly off
   * (status mode off + the pull 503 hermes_off) so the OFF frames are
   * exercisable without a board — the same location-param demo-knob pattern
   * as `koraAuth=locked`.
   */
  private readonly hermesBridgeOff: boolean;
  /**
   * `?hermesChat=limited` (mock builds): the chat POST answers the bare
   * limiter verdict (429, FastAPI {detail} voice) so the limiter frame is
   * exercisable without hammering a real budget — the same demo-knob
   * pattern as `hermesBridge=off`.
   */
  private readonly hermesChatLimited: boolean;
  /**
   * The hermes registry slice: populated by pullHermesSessions (the pull IS
   * the ingest) so the mock models the server's pull→upsert→serve flow —
   * hermes sessions do NOT appear in the registry until a pull happens.
   */
  private hermesIngested: boolean;
  /**
   * The chat body the LAST hermesChat call rode with (a test seam for the
   * history-composition contract: tool roles filtered, ≤20 turns, the new
   * user text last). Null until the first chat call.
   */
  lastChatMessages: HermesChatTurn[] | null = null;
  /** The model the LAST hermesChat call rode with (the KW2 select seam). */
  lastChatModel: string | null = null;
  /**
   * The hermes messages-read counter (KW2 gate §10.6: ONE messages read
   * per session — the workspace hoists the hook, the chat and the «Все
   * ходы» zone consume the same pages; a load-more = exactly one request).
   * Test seam only. Per-session: an anchor change legitimately opens a NEW
   * session's read — the gate is «the SAME session is never read twice by
   * two surfaces».
   */
  hermesMessagesCalls = 0;
  hermesMessagesCallsBySession: Record<string, number> = {};
  /**
   * `?hermesChat=badmodel` (mock builds): the chat POST answers the typed
   * hermes rejection of the REQUESTED model (the 502-shaped verdict the
   * real bridge raises when the cluster refuses the model) so the
   * K-CHAT-MODEL-404 frame — the human reason named, the user's choice
   * KEPT — is exercisable without a live cluster.
   */
  private readonly hermesChatBadModel: boolean;

  /** `?hermesMessages=big` (mock builds only, KW3 perf stand): the anchor
   * session's transcript serves a SYNTHETIC large corpus (~720 rows,
   * multi-line contents → well over 500 visible lines) instead of the
   * fixture — the «Все ходы» expansion timing and the virtualization
   * backlog numbers are measured against it (blueprint §8: decide on
   * numbers, not taste). Registry/other sessions stay untouched. */
  private readonly hermesMessagesBig: boolean;

  constructor(options: KoraMockAdapterOptions = {}) {
    this.latency = options.latency ?? true;
    this.store = new Map(
      Object.entries(KORA_FIXTURE_TRANSCRIPT).map(([id, items]) => [id, [...items]]),
    );
    this.sessions = new Map(KORA_FIXTURE_SESSIONS.map((s) => [s.id, { ...s }]));
    this.stepUpUntil = options.stepUpActive
      ? Date.now() + STEP_UP_TTL_SECONDS * 1000
      : null;
    // The demo lock (`?koraAuth=locked`, mock builds only — the same
    // location-param pattern as the main MockAdapter's `?bus=demo`):
    // reads answer transport-shaped 401 (ApiError, NOT KoraError — the
    // honest 401-CTA branch keys on the transport class) so the sign-in
    // verdict «Кора ждёт входа на борт» is exercisable without a board.
    this.authLocked =
      typeof location !== "undefined" &&
      new URLSearchParams(location.search).get("koraAuth") === "locked";
    this.hermesBridgeOff =
      typeof location !== "undefined" &&
      new URLSearchParams(location.search).get("hermesBridge") === "off";
    this.hermesChatLimited =
      typeof location !== "undefined" &&
      new URLSearchParams(location.search).get("hermesChat") === "limited";
    this.hermesChatBadModel =
      typeof location !== "undefined" &&
      new URLSearchParams(location.search).get("hermesChat") === "badmodel";
    this.hermesMessagesBig =
      typeof location !== "undefined" &&
      new URLSearchParams(location.search).get("hermesMessages") === "big";
    // `?hermesBridge=pulled` (mock builds only): the registry slice starts
    // ALREADY ingested — visual stands (we-shots) frame the host card's
    // live-session list without driving the pull UI first. The knob ALSO
    // injects a SECOND live `hermes:api_server` row under the laptop host
    // at RUNTIME (fixtures stay untouched): the D9 homonym frame — two
    // same-project sessions the card must tell apart. The default stays
    // un-ingested and duplicate-free: the honest «empty until a pull» flow.
    if (
      typeof location !== "undefined" &&
      new URLSearchParams(location.search).get("hermesBridge") === "pulled"
    ) {
      this.hermesIngested = true;
      const main = this.sessions.get("hermes:api-server-main");
      if (main) {
        this.sessions.set("hermes:api-63cc1ab78057f124", {
          ...main,
          id: "hermes:api-63cc1ab78057f124",
          executor_id: "exec-laptop-hermes",
          native_id: "api-63cc1ab78057f124",
          state: "live",
          started_at: "2026-09-24T06:15:00Z",
          last_activity_at: "2026-09-24T09:40:00Z",
          age_seconds: 4200,
        });
        this.sessions.set("hermes:api-server-main", {
          ...main,
          executor_id: "exec-laptop-hermes",
        });
      }
    } else {
      this.hermesIngested = false;
    }
  }

  /** The `?koraAuth=locked` gate: throw before any read answers. */
  private requireUnlocked(): void {
    if (this.authLocked) {
      throw new ApiError(
        401,
        "Кора ждёт входа на борт (мок-режим: koraAuth=locked).",
      );
    }
  }

  private delay(): Promise<void> {
    return this.latency
      ? new Promise((resolve) => setTimeout(resolve, 120))
      : Promise.resolve();
  }

  private requireStepUp(): void {
    if (this.stepUpUntil === null || this.stepUpUntil <= Date.now()) {
      this.stepUpUntil = null;
      throw new KoraMockError(
        "step_up_required",
        "Руление заблокировано: введите PIN, чтобы включить руление (TTL ≤ 15 минут).",
      );
    }
  }

  listSessions(params?: KoraSessionsParams): Promise<KoraSessionsList> {
    return this.delay().then(() => {
      this.requireUnlocked();
      // P4-7 (slice 2 load-more): the same limit/offset semantics the
      // board serves — page slicing over the registry order, no
      // pagination fields in the response (has_more = count === limit
      // on the caller side). T004 slice 2: hermes rows enter the mock
      // registry only after a pull (the pull IS the ingest — the server's
      // pull→upsert flow), so the untouched page shows the honest empty.
      const all = [...this.sessions.values()].filter(
        (session) =>
          session.harness !== "hermes" || this.hermesIngested,
      );
      const offset = Math.max(params?.offset ?? 0, 0);
      const items =
        params?.limit !== undefined
          ? all.slice(offset, offset + Math.max(params.limit, 0))
          : all.slice(offset);
      return {
        ok: true as const,
        count: items.length,
        items,
        coverage: structuredClone(KORA_FIXTURE_COVERAGE),
        meta: { generated_at: "2026-09-24T11:45:00Z" },
      };
    });
  }

  async getSession(sessionId: string): Promise<KoraSession | null> {
    await this.delay();
    this.requireUnlocked();
    return this.sessions.get(sessionId) ?? null;
  }

  async getTranscript(
    sessionId: string,
    params?: { after_seq?: number; limit?: number },
  ): Promise<KoraTranscript> {
    await this.delay();
    this.requireUnlocked();
    const items = this.store.get(sessionId);
    if (items === undefined) {
      // Unknown session resolves as 404-shaped (provenance-safe absence).
      // T004 slice 2: hermes transcript fixtures are a DELIBERATE gap
      // (slice 3 serves them) — the honest «транскрипты hermes позже»
      // story rides the same 404 shape with its dedicated copy.
      throw new KoraMockError(
        "session_not_found",
        `Сессия ${sessionId} не найдена в реестре.`,
      );
    }
    const afterSeq = params?.after_seq ?? 0;
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    const tail = items.filter((item) => item.seq > afterSeq);
    const page = tail.slice(0, limit);
    return {
      session_id: sessionId,
      items: page,
      next_after_seq: page.length > 0 ? page[page.length - 1].seq : afterSeq,
      has_more: tail.length > page.length,
    };
  }

  async createSession(body: KoraSessionCreate): Promise<KoraSessionCreated> {
    await this.delay();
    this.requireStepUp();
    if (!body.executor_id || !body.project || !body.prompt) {
      throw new KoraMockError("validation", "Нужны executor, проект и первый промпт.");
    }
    const now = new Date().toISOString();
    const nativeId = `sess_${Math.random().toString(16).slice(2, 9)}`;
    const id = `${body.executor_id}:${nativeId}`;
    const session: KoraSession = {
      id,
      executor_id: body.executor_id,
      native_id: nativeId,
      harness: "zcode",
      project: body.project,
      cwd: null,
      state: "live",
      origin: "relay", // new-from-phone = relay origin by construction
      steerable: true,
      started_at: now,
      last_activity_at: now,
      age_seconds: 0,
      last_line_preview: body.prompt.slice(0, 160),
    };
    this.sessions.set(id, session);
    this.store.set(id, [
      {
        seq: 1,
        role: "user",
        kind: null,
        ts: now,
        content: body.prompt,
        redaction_applied: false,
      },
    ]);
    return {
      ok: true,
      session,
      delivery: {
        status: "delivered",
        queued_at: now,
        delivered_at: now,
        retryable: false,
        error: null,
      },
    };
  }

  async sendMessage(sessionId: string, text: string): Promise<KoraMessageAccepted> {
    await this.delay();
    this.requireStepUp();
    const session = this.sessions.get(sessionId);
    const items = this.store.get(sessionId);
    if (!session || !items) {
      // Foreign triple → 404, server-side honesty (ADR gate 1).
      throw new KoraMockError(
        "session_not_found",
        `Сессия ${sessionId} не найдена в реестре.`,
      );
    }
    if (!session.steerable) {
      throw new KoraMockError(
        "session_not_found",
        `Сессия ${sessionId} не доступна для руления.`,
      );
    }
    // STORE-TAIL: the harness (mocked) appends; the UI re-reads the tail.
    const now = new Date().toISOString();
    const seq = (items.at(-1)?.seq ?? 0) + 1;
    items.push({
      seq,
      role: "user",
      kind: null,
      ts: now,
      content: text,
      redaction_applied: false,
    });
    // The generated contract types are immutable (--immutable codegen), so
    // the row update is a replace, not a property mutation.
    this.sessions.set(sessionId, {
      ...session,
      last_activity_at: now,
      last_line_preview: text.slice(0, 160),
    });
    // Simulated harness turn — the tail grows again after the prompt.
    items.push({
      seq: seq + 1,
      role: "assistant",
      kind: null,
      ts: now,
      content: "Промпт принят релеем: продолжаю в headless-сессии (мок недели 0).",
      redaction_applied: false,
    });
    return {
      ok: true,
      session_id: sessionId,
      delivery: {
        status: "delivered",
        queued_at: now,
        delivered_at: now,
        retryable: false,
        error: null,
      },
      confirm_required: true, // confirm-mode is the default
    };
  }

  async stepUpStatus(): Promise<KoraStepUpStatus> {
    await this.delay();
    const remaining = this.stepUpRemainingSeconds();
    return {
      active: remaining !== null,
      granted_until:
        remaining !== null
          ? new Date(Date.now() + remaining * 1000).toISOString()
          : null,
      ttl_remaining_seconds: remaining,
    };
  }

  async enableStepUp(pin: string): Promise<KoraStepUpStatus> {
    await this.delay();
    if (pin !== "4321") {
      throw new KoraMockError("step_up_denied", "Неверный PIN.");
    }
    this.stepUpUntil = Date.now() + STEP_UP_TTL_SECONDS * 1000;
    return this.stepUpStatus();
  }

  async revokeStepUp(): Promise<void> {
    await this.delay();
    this.stepUpUntil = null;
  }

  private stepUpRemainingSeconds(): number | null {
    if (this.stepUpUntil === null) return null;
    const remaining = Math.ceil((this.stepUpUntil - Date.now()) / 1000);
    if (remaining <= 0) {
      this.stepUpUntil = null;
      return null;
    }
    return Math.min(remaining, STEP_UP_TTL_SECONDS);
  }

  hermesStatus(): Promise<HermesBridgeStatus> {
    return this.delay().then(() => {
      this.requireUnlocked();
      if (this.hermesBridgeOff) {
        // The honest OFF (the server's honest-off wording, mirrored):
        // config fact + the human reason, zero egress. The KW2 model
        // roster rides in BOTH modes (the server serves it off too).
        return {
          configured: false,
          endpoint: KORA_FIXTURE_HERMES_STATUS.endpoint,
          mode: "off",
          registry_sessions: 0,
          detail:
            "HERMES_API_KEY не задан — мост честно выключен. " +
            "Ключ передаётся через deploy-канал (env пода борда), после чего " +
            "источник включится без изменения кода.",
          models: [...KORA_FIXTURE_HERMES_STATUS.models],
          default_model: KORA_FIXTURE_HERMES_STATUS.default_model,
        } satisfies HermesBridgeStatus;
      }
      const registry = [...this.sessions.values()].filter(
        (session) => session.harness === "hermes" && this.hermesIngested,
      ).length;
      return {
        ...KORA_FIXTURE_HERMES_STATUS,
        registry_sessions: registry,
        models: [...KORA_FIXTURE_HERMES_STATUS.models],
        default_model: KORA_FIXTURE_HERMES_STATUS.default_model,
      } satisfies HermesBridgeStatus;
    });
  }

  pullHermesSessions(): Promise<KoraSessionsList> {
    return this.delay().then(() => {
      this.requireUnlocked();
      if (this.hermesBridgeOff) {
        // 503-shaped honest-off — the typed KoraError vocabulary (the
        // error code the HTTP adapter's KoraHttpError would carry).
        throw new KoraError(
          "hermes_off",
          "Мост hermes выключен: HERMES_API_KEY не задан на борде. " +
            "Ключ передаётся через deploy-канал (env пода борда), после " +
            "чего leg включится без изменения кода.",
        );
      }
      // The pull IS the ingest: hermes rows upsert under the reserved
      // executor id and start serving through the SAME registry leg.
      this.hermesIngested = true;
      for (const row of KORA_FIXTURE_HERMES_SESSIONS) {
        this.sessions.set(row.id, { ...row });
      }
      return {
        ok: true as const,
        count: KORA_FIXTURE_HERMES_SESSIONS.length,
        items: [...KORA_FIXTURE_HERMES_SESSIONS] as KoraSession[],
        coverage: structuredClone(KORA_FIXTURE_COVERAGE),
        meta: {
          generated_at: "2026-09-24T11:45:00Z",
          source: "hermes-live",
          upserted: "2",
          dropped: "0",
        },
      };
    });
  }

  hermesMessages(
    sessionId: string,
    params?: HermesMessagesParams,
  ): Promise<HermesMessagesPage> {
    return this.delay().then(() => {
      this.requireUnlocked();
      this.hermesMessagesCalls += 1;
      this.hermesMessagesCallsBySession[sessionId] =
        (this.hermesMessagesCallsBySession[sessionId] ?? 0) + 1;
      if (this.hermesBridgeOff) {
        // The honest OFF (the server's typed verdict, mirrored): 503
        // hermes_off with the human reason.
        throw new KoraError(
          "hermes_off",
          "Мост hermes выключен: HERMES_API_KEY не задан на борде. " +
            "Ключ передаётся через deploy-канал (env пода борда), после " +
            "чего leg включится без изменения кода.",
        );
      }
      const rows =
        this.hermesMessagesBig && sessionId === "hermes:api-server-main"
          ? BIG_HERMES_CORPUS
          : KORA_FIXTURE_HERMES_MESSAGES[sessionId];
      if (rows === undefined) {
        // The server does NOT re-validate the registry (hermes IS the
        // authority) — an unknown id answers hermes' own 404 verbatim.
        throw new KoraMockError(
          "session_not_found",
          `Сессия ${sessionId} не найдена в hermes.`,
        );
      }
      // The frozen seq-cursor form: items with seq > after_seq, one page,
      // next_after_seq / has_more — the live proxy view (the server's
      // «hermes may append between reads» honesty rides unchanged).
      const afterSeq = Math.max(params?.after_seq ?? 0, 0);
      const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
      const page = rows.filter((row) => row.seq > afterSeq).slice(0, limit);
      const nextAfterSeq = page.length > 0 ? page[page.length - 1].seq : afterSeq;
      return {
        session_id: sessionId,
        items: [...page],
        next_after_seq: nextAfterSeq,
        has_more: page.length > 0 && nextAfterSeq < rows.length,
      };
    });
  }

  hermesChat(body: HermesChatRequest): Promise<HermesChatReply> {
    return this.delay().then(() => {
      this.requireUnlocked();
      if (this.hermesBridgeOff) {
        throw new KoraError(
          "hermes_off",
          "Мост hermes выключен: HERMES_API_KEY не задан на борде. " +
            "Ключ передаётся через deploy-канал (env пода борда), после " +
            "чего leg включится без изменения кода.",
        );
      }
      if (this.hermesChatLimited) {
        // `?hermesChat=limited` demo knob: the bare limiter verdict the
        // real server raises (HTTPException 429 — FastAPI's {detail}
        // envelope; the adapter's detail extraction surfaces the string).
        throw new ApiError(
          429,
          "hermes chat rate limit exceeded (12 per 60s per client)",
        );
      }
      if (this.hermesChatBadModel) {
        // `?hermesChat=badmodel` demo knob: the typed rejection the real
        // bridge raises when the cluster refuses the REQUESTED model (the
        // hermes 404-on-model → the 502-shaped HermesUnavailableError
        // verdict, hermes's own reason inside). The choice stays the
        // user's — the mock does not decide the select's value.
        const asked = body.model !== undefined && body.model !== ""
          ? body.model
          : "hermes-4.5-405b";
        throw new ApiError(
          502,
          `hermes недоступен или отказал: the model «${asked}» does not exist (404)`,
        );
      }
      // The last user turn drives the canned reply (deterministic).
      const lastUser = [...body.messages]
        .reverse()
        .find((turn) => turn.role === "user")?.content;
      this.lastChatMessages = [...body.messages];
      this.lastChatModel =
        body.model !== undefined && body.model !== ""
          ? body.model
          : "hermes-4.5-405b";
      return {
        ok: true,
        source: "hermes · real-time",
        model: body.model !== undefined && body.model !== "" ? body.model : "hermes-4.5-405b",
        completion: {
          id: "chatcmpl-mock-hermes",
          object: "chat.completion",
          model: body.model !== undefined && body.model !== "" ? body.model : "hermes-4.5-405b",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: koraFixtureHermesChatReply(lastUser ?? ""),
              },
            },
          ],
        },
      };
    });
  }

  specialists(): Promise<KoraSpecialistsRoster> {
    // В2a — the read-only roster (open facts; no unlock gate, no demo
    // knob: the real route is a plain authed read for both owner
    // classes, a cheap store projection with no outbound calls).
    return this.delay().then(() => ({
      ...KORA_FIXTURE_SPECIALISTS,
      items: [...KORA_FIXTURE_SPECIALISTS.items],
    }));
  }

  models(): Promise<KoraModelsRoster> {
    // В3a — the read-only per-executor models roster (open facts; no
    // unlock gate, no demo knob — the real route is a plain authed read
    // for both owner classes, a cheap store projection). The fixture's
    // stories: zcode/vscode report, pi does NOT — the honest
    // K-TREE-MODEL-UNKNOWN is exercised in the mock itself.
    return this.delay().then(() => ({
      ...KORA_FIXTURE_MODELS,
      executors: KORA_FIXTURE_MODELS.executors.map((row) => ({
        ...row,
        installations: row.installations.map((installation) => ({
          ...installation,
          models: [...installation.models],
        })),
      })),
    }));
  }
}
