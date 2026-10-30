/**
 * Kora week-0 contract types (ADR 0019 rev.2 — «Неделя 0 — контракт-first»).
 *
 * Re-exported from the GENERATED src/features/kora/koraContract.d.ts
 * (openapi-typescript over the frozen artifact docs/kora/openapi.yaml —
 * `npm run codegen:kora`). The generated file is the single source of truth,
 * same discipline as gateway/types.ts; these aliases keep the feature code
 * readable and give the mock/HTTP adapters one import surface. When slice 1
 * lands, the board's own /openapi.json takes over via codegen:board.
 */
import type { components } from "./koraContract";

type Schemas = components["schemas"];

/** KoraHarness — harness families wired in phase 1 (hermes → T004 is a gap). */
export type KoraHarness = Schemas["KoraHarness"];

/**
 * KoraSessionState — session liveness (presence ≠ liveness). `dead` keeps
 * the session in the registry (recovery semantics, ADR 0019 §2).
 */
export type KoraSessionState = Schemas["KoraSessionState"];

/** KoraOrigin — relay sessions are steerable from birth; local are not. */
export type KoraOrigin = Schemas["KoraOrigin"];

/** KoraSessionOut — one derived-registry row (PK: executor_id + native_id). */
export type KoraSession = Schemas["KoraSessionOut"];

/** KoraCoverageHarness — one row of the «что вижу / чего нет» screen data. */
export type KoraCoverageHarness = Schemas["KoraCoverageHarness"];

/** KoraCoverageOut — honest per-harness visibility + explicit gaps. */
export type KoraCoverage = Schemas["KoraCoverageOut"];

/** KoraSessionsOut — GET /api/kora/sessions response body. */
export type KoraSessionsList = Schemas["KoraSessionsOut"];

/** KoraTranscriptItemOut — one redacted transcript entry. */
export type KoraTranscriptItem = Schemas["KoraTranscriptItemOut"];

/** KoraTranscriptOut — cursor page of the ONE transcript-serving path. */
export type KoraTranscript = Schemas["KoraTranscriptOut"];

/** Transcript cursor params (GET ?after_seq=&limit=). */
export interface KoraTranscriptParams {
  after_seq?: number;
  limit?: number;
}

/**
 * Session-list pagination params (P4-7, slice 2 load-more):
 * GET /api/kora/sessions?limit=&offset=. Additive QUERY surface — the
 * frozen KoraSessionsOut carries no pagination fields; has_more is
 * derived client-side from count === limit.
 */
export interface KoraSessionsParams {
  limit?: number;
  offset?: number;
}

/** KoraDeliveryOut — honest relay queue state («не доставлено — повторите»). */
export type KoraDelivery = Schemas["KoraDeliveryOut"];

/** KoraSessionCreate — POST /api/kora/sessions body (executor+project+prompt). */
export type KoraSessionCreate = Schemas["KoraSessionCreate"];

/** KoraSessionCreatedOut — POST /api/kora/sessions 201 body. */
export type KoraSessionCreated = Schemas["KoraSessionCreatedOut"];

/** KoraMessageAcceptedOut — POST .../messages 202 body. */
export type KoraMessageAccepted = Schemas["KoraMessageAcceptedOut"];

/** KoraStepUpStatusOut — GET /api/kora/steering/step-up body. */
export type KoraStepUpStatus = Schemas["KoraStepUpStatusOut"];

/** KoraErrorOut codes — the frozen error vocabulary. */
export type KoraErrorCode = NonNullable<Schemas["KoraErrorOut"]["code"]>;

/**
 * HermesBridgeStatus — GET /api/kora/hermes/status (T004 slice 1, ui-only).
 * The board's honest leg report: configured/deploy facts, never secrets.
 * `mode` mirrors the server's vocabulary (off = no key; ok = configured);
 * `detail` carries the HUMAN reason when the leg is off/unreachable.
 * NOTE: this route lives OUTSIDE the frozen week-0 artifact by design
 * (a board-ops read, not a Kora contract line) — hand-typed on the seam,
 * mirrored from HermesBridgeStatusOut in server/app.py.
 */
export interface HermesBridgeStatus {
  configured: boolean;
  endpoint: string;
  mode: "off" | "ok";
  registry_sessions: number;
  detail: string | null;
  /**
   * KW2 «Живой чат»: the STATIC verified chat model roster + its default
   * (server/app.py serves hermes_client.HERMES_MODELS in BOTH modes — an
   * off bridge still names the roster so the select degrades honestly).
   * An empty array means the field did not arrive (an older board) — the
   * select falls back to the FE's single default constant.
   */
  models?: string[];
  default_model?: string;
}

/**
 * HermesMessage — one hermes transcript row (T004 slice 3, ui-only). The
 * frozen KoraTranscriptItemOut base (seq/role/kind/ts/content/redaction —
 * the display_kind maps into `kind` server-side) + the hermes passthrough
 * fields (additive, optional), mirrored from HermesTranscriptItemOut in
 * server/app.py. Like the status type: hand-typed on the seam, the routes
 * live OUTSIDE the frozen week-0 artifact by design.
 */
export interface HermesMessage {
  seq: number;
  role: string;
  kind: string | null;
  ts: string | null;
  content: string;
  redaction_applied: boolean;
  reasoning?: string | null;
  tool_calls?: readonly Record<string, unknown>[] | null;
}

/**
 * HermesMessagesPage — GET /api/kora/hermes/sessions/{id}/messages: the
 * frozen transcript form (seq cursor: items with seq > after_seq) over the
 * LIVE hermes transcript. `session_id` echoes the requested handle.
 */
export interface HermesMessagesPage {
  session_id: string;
  items: HermesMessage[];
  next_after_seq: number;
  has_more: boolean;
}

/** Transcript cursor params for the hermes messages route. */
export interface HermesMessagesParams {
  after_seq?: number;
  limit?: number;
}

/**
 * HermesChatTurn — one POST /api/kora/hermes/chat turn. The server forbids
 * role "tool" (extra='forbid', Literal system|user|assistant) and caps the
 * body at 20 turns x 8000 chars — the UI composes within those caps.
 */
export interface HermesChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface HermesChatRequest {
  messages: HermesChatTurn[];
  /** Omitted → the server's live-verified default (hermes-4.5-405b). */
  model?: string;
}

/**
 * HermesChatReply — the chat answer. `completion` rides VERBATIM (the
 * OpenAI-compatible hermes body); the FE extracts choices[0].message.content
 * defensively and names the unknown-format case honestly instead of faking.
 * `source` («hermes · real-time») is the honest provenance marker — rendered
 * as DATA on the reply, never as decor.
 */
export interface HermesChatReply {
  ok: boolean;
  source: string;
  model: string;
  completion: unknown;
}

/**
 * KoraSpecialist — one roster row (В2a, KORA-SPECIALISTS-1; kora-ide
 * contract §5.3). Mirrored from KoraSpecialistItem in server/app.py —
 * hand-typed on the seam: the route is an ADDITIVE server wave and lives
 * OUTSIDE the frozen week-0 artifact by design (the HermesBridgeStatus
 * precedent). Open facts only: the declared name, the profile-route slug
 * and the read-only honesty bit about the profile cache.
 */
export interface KoraSpecialist {
  name: string;
  slug: string;
  profile_cached: boolean;
}

/**
 * KoraSpecialistsRoster — GET /api/kora/specialists (В2a). The composer's
 * specialist selector renders FROM THIS ROSTER only (contract §5.3: the
 * selector draws real data or does not draw at all). Hand-typed on the
 * seam, mirrored from KoraSpecialistsOut in server/app.py.
 */
export interface KoraSpecialistsRoster {
  ok: boolean;
  count: number;
  items: KoraSpecialist[];
  meta: { generated_at: string };
}

/**
 * KoraModelInstallation — one models-mirror installation row projected for
 * the tree (В3a, KORA-MODELS-1; kora-ide contract §5.3). Mirrored from
 * KoraModelInstallation in server/app.py — hand-typed on the seam, the
 * HermesBridgeStatus precedent: the route is an ADDITIVE server wave and
 * lives OUTSIDE the frozen week-0 artifact by design. Open facts only:
 * the harness the installation serves, the provider, the honest auth/
 * source bits, the reported model ids. Deliberately narrower than the
 * mirror (no base_url, no notes) — and NO context-limit field: no source
 * reports one today, absent is never invented (§4).
 */
export interface KoraModelInstallation {
  harness: string;
  provider: string;
  auth: string;
  source: string;
  models: string[];
}

/**
 * KoraExecutorModels — one executor's models snapshot (executor_id + the
 * snapshot's own reported_at + the projected installations). An executor
 * without a snapshot is NOT listed — the FE reads the miss as
 * «модели не сообщаются» (K-TREE-MODEL-UNKNOWN).
 */
export interface KoraExecutorModels {
  executor_id: string;
  reported_at: string | null;
  installations: KoraModelInstallation[];
}

/**
 * KoraModelsRoster — GET /api/kora/models (В3a). The tree's model level
 * renders FROM THIS ROSTER and the hermes /status roster only (contract
 * §5.3: real data or the honest «не сообщаются»). Hand-typed on the seam,
 * mirrored from KoraModelsOut in server/app.py.
 */
export interface KoraModelsRoster {
  ok: boolean;
  count: number;
  executors: KoraExecutorModels[];
  meta: { generated_at: string };
}
