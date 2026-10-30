/**
 * Kora gateway seam (ADR 0019 rev.2 — week-0 contract-first; slice 1 live).
 *
 * Same discipline as gateway/MemoryGateway.ts (architecture.md §4 — the
 * single data-access seam): every Kora component reads through this
 * interface. Week 0 shipped the mock; slice 1 added the HTTP adapter —
 * both implement the same contract and swap via the context provider.
 *
 * Every method takes an optional AbortSignal (TanStack Query cancellation).
 *
 * P4-4: the frozen error vocabulary (KoraErrorOut: code + message) lives
 * HERE, on the seam — the UI branches on `KoraError.code` (e.g. the
 * step_up_required chat plate and the PIN-failure message), so an adapter
 * that does not surface the code would silently degrade the screens.
 * Both adapters (mock + HTTP) throw subclasses of this type; consumers
 * must check `instanceof KoraError`, never a concrete adapter's class.
 */
import { isApiError } from "@/lib/errors";
import type {
  HermesBridgeStatus,
  HermesChatRequest,
  HermesChatReply,
  HermesMessagesPage,
  HermesMessagesParams,
  KoraErrorCode,
  KoraMessageAccepted,
  KoraModelsRoster,
  KoraSession,
  KoraSessionCreated,
  KoraSessionCreate,
  KoraSessionsList,
  KoraSessionsParams,
  KoraSpecialistsRoster,
  KoraStepUpStatus,
  KoraTranscript,
  KoraTranscriptParams,
} from "./koraTypes";

/** Contract error: the frozen KoraErrorOut vocabulary on the seam. */
export class KoraError extends Error {
  constructor(
    readonly code: KoraErrorCode | KoraHermesErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "KoraError";
  }
}

/**
 * The hermes-bridge error codes (T004 slice 1). The hermes routes are
 * ui-only board reads OUTSIDE the frozen week-0 artifact — their error
 * vocabulary (`hermes_off`, `hermes_unavailable`) rides the same
 * KoraErrorOut ENVELOPE but is not part of the frozen enum, so the seam
 * names it separately (additive-only, no frozen-vocabulary edit).
 */
export type KoraHermesErrorCode = "hermes_off" | "hermes_unavailable";

/**
 * Extract the frozen error code from ANY gateway failure (P4-4): the
 * mock's KoraError subclasses carry `.code`; the HTTP adapter's
 * KoraHttpError carries `.koraCode`; anything else (transport ApiError)
 * answers undefined. ONE extraction point — the UI never imports a
 * concrete adapter's error class.
 */
export function koraErrorCode(
  err: unknown,
): KoraErrorCode | KoraHermesErrorCode | undefined {
  if (err instanceof KoraError) return err.code;
  const code = (err as { koraCode?: KoraErrorCode } | null)?.koraCode;
  return typeof code === "string" ? code : undefined;
}

/**
 * True when the failure is an HTTP 401 — the browser THOUGHT it had a
 * session, the server disagrees (the cookie was born on https and is
 * withheld on http, or the 6h idle TTL rotted). Owner-feedback hotfix
 * branch point: the kora screens answer with the sign-in CTA instead of
 * the raw error block; 5xx / transport keeps the honest retry state. A
 * 403 `metadata_only` is NOT this — its explaining wall is its own
 * verdict and stays untouched.
 */
export function isKoraUnauthorized(err: unknown): boolean {
  return isApiError(err) && err.status === 401;
}

export interface KoraGateway {
  /**
   * Slice 1 — GET /api/kora/sessions (list + coverage).
   * P4-7 (slice 2): optional limit/offset for the UI load-more. The
   * frozen RESPONSE shape has no pagination fields — the caller derives
   * has_more from `count === limit`; without params the adapter serves
   * the legacy full listing.
   */
  listSessions(
    params?: KoraSessionsParams,
    signal?: AbortSignal,
  ): Promise<KoraSessionsList>;

  /** Slice 1 helper — one registry row (derived from the listing). */
  getSession(sessionId: string, signal?: AbortSignal): Promise<KoraSession | null>;

  /** Slice 2 — GET /api/kora/sessions/{id}/transcript (seq cursor tail). */
  getTranscript(
    sessionId: string,
    params?: KoraTranscriptParams,
    signal?: AbortSignal,
  ): Promise<KoraTranscript>;

  /** Slice 3 — POST /api/kora/sessions (new relay session from the phone). */
  createSession(
    body: KoraSessionCreate,
    signal?: AbortSignal,
  ): Promise<KoraSessionCreated>;

  /** Slice 3 — POST /api/kora/sessions/{id}/messages (prompt via relay). */
  sendMessage(
    sessionId: string,
    text: string,
    signal?: AbortSignal,
  ): Promise<KoraMessageAccepted>;

  /** Slice 3 — GET /api/kora/steering/step-up (status). */
  stepUpStatus(signal?: AbortSignal): Promise<KoraStepUpStatus>;

  /** Slice 3 — POST /api/kora/steering/step-up (enable steering, TTL ≤15m). */
  enableStepUp(pin: string, signal?: AbortSignal): Promise<KoraStepUpStatus>;

  /** Slice 3 — DELETE /api/kora/steering/step-up (revoke now). */
  revokeStepUp(signal?: AbortSignal): Promise<void>;

  /**
   * T004 slice 2 — GET /api/kora/hermes/status (DATA, no live probe on
   * the server side: config facts + the registry slice count). The UI
   * renders the status line from this; `mode: "off"` carries the human
   * reason in `detail`.
   */
  hermesStatus(signal?: AbortSignal): Promise<HermesBridgeStatus>;

  /**
   * T004 slice 2 — GET /api/kora/hermes/sessions: ONE live pull on
   * EXPLICIT user action only (upserts into the registry; 12/60s limiter
   * server-side). NEVER called on a timer — the refresh button is the
   * only trigger.
   */
  pullHermesSessions(signal?: AbortSignal): Promise<KoraSessionsList>;

  /**
   * T004 slice 3 — GET /api/kora/hermes/sessions/{id}/messages: the LIVE
   * hermes transcript through the frozen transcript form (seq cursor:
   * after_seq / limit → items, next_after_seq, has_more). The handle is
   * the canonical «hermes:<native_id>» (a bare native id works too; a
   * foreign prefix answers 404). Shares the live-pull limiter (12/60s).
   */
  hermesMessages(
    sessionId: string,
    params?: HermesMessagesParams,
    signal?: AbortSignal,
  ): Promise<HermesMessagesPage>;

  /**
   * T004 slice 3 — POST /api/kora/hermes/chat: ONE non-stream chat call
   * (ui-only; its OWN 12/60s budget — a generation is a different cost
   * class from the cheap pulls). The reply carries the honest source
   * marker «hermes · real-time» and the completion VERBATIM.
   */
  hermesChat(
    body: HermesChatRequest,
    signal?: AbortSignal,
  ): Promise<HermesChatReply>;

  /**
   * В2a (KORA-SPECIALISTS-1) — GET /api/kora/specialists: the read-only
   * specialist roster over the board's ACTIVE tasks. A cheap store
   * projection (no live probe, no content) — the specialist selector
   * renders FROM IT or not at all (contract §5.3). An empty roster or a
   * failed read is honest absence: no invented rows, no retry loop.
   */
  specialists(signal?: AbortSignal): Promise<KoraSpecialistsRoster>;

  /**
   * В3a (KORA-MODELS-1) — GET /api/kora/models: the read-only per-executor
   * models roster (the FC-6 discovery mirror projection). A cheap store
   * projection (no live probe, no content) — the tree's model level
   * renders FROM IT (plus the hermes /status roster) or reads the honest
   * «модели не сообщаются» (contract §5.3). A missing executor row or a
   * failed read is honest absence: no invented models.
   */
  models(signal?: AbortSignal): Promise<KoraModelsRoster>;
}
