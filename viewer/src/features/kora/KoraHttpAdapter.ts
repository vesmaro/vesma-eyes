/**
 * Kora HTTP adapter — slice 1 backend integration (ADR 0019 rev.2).
 *
 * Implements the SAME KoraGateway interface the week-0 mock served, now
 * against the frozen docs/kora/openapi.yaml shapes over the board API:
 *
 * - listSessions      GET    /api/kora/sessions                 (slice 1 — LIVE)
 * - getSession        derived from the listing (contract helper)
 * - getTranscript     GET    /api/kora/sessions/{id}/transcript (slice 2 — the
 *                      board does not serve it yet; the call fails loud
 *                      with the server's honest verdict, never a mock body)
 * - createSession / sendMessage / step-up     (slice 3 — same honest 501
 *                      discipline while the relay is unbuilt)
 *
 * Auth discipline (owner complaint on prod 1.63.0, 2026-10-07 — «сразу
 * разлогинивает»): the server resolves identity HEADER-FIRST — any Bearer
 * present overrides the live `vesmaro_ui` cookie. Therefore:
 *
 * - READS never carry Authorization. The request ships bare and the
 *   same-origin cookie speaks. The old device `mnd_` fallback leg is
 *   GONE: Kora reads are owner-class, this adapter has no explicit
 *   device-mode, and a stale `mnd_`/ui bearer beside a live cookie used
 *   to 401 the entire page (a browser that held both identities could
 *   not read its own session). A paired device without an owner session
 *   now meets the honest 401 → the sign-in CTA.
 * - MUTATIONS attach the ui bearer ONLY when the token panel holds one;
 *   on a 401 the request REPLAYS ONCE headerless (the cookie leg) — a
 *   stale header token beside a live cookie must re-fly on the cookie,
 *   never demand a fresh paste (the login-flow replay canon reused).
 *
 * Non-2xx maps to ApiError with the Kora error vocabulary in `body.code`
 * when present (`metadata_only`, `step_up_required`, `session_not_found`, …).
 */
import type { KoraGateway } from "./koraGateway";
import type {
  KoraMessageAccepted,
  KoraSession,
  KoraSessionCreated,
  KoraSessionCreate,
  KoraSessionsList,
  KoraSessionsParams,
  KoraStepUpStatus,
  KoraTranscript,
  KoraTranscriptParams,
} from "./koraTypes";
import type { KoraErrorCode } from "./koraTypes";
import { ApiError } from "@/lib/errors";
import { DEFAULT_TIMEOUT_MS, buildUrl } from "@/gateway/http";
import { getUiToken } from "@/gateway/uiToken";

export interface KoraHttpAdapterOptions {
  /** Board API base URL. Default "/api" (same-origin; Vite dev-proxy). */
  baseUrl?: string;
  /** Test seam — defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Default per-request timeout. */
  timeoutMs?: number;
  /** Test seam for the ui-token source (BoardAdapter parity). */
  getUiTokenFn?: () => string;
}

interface KoraWireError {
  ok?: boolean;
  code?: string;
  message?: string;
}

export class KoraHttpAdapter implements KoraGateway {
  private readonly baseUrl: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly timeoutMs: number;
  private readonly getUiTokenFn: () => string;

  constructor(options: KoraHttpAdapterOptions = {}) {
    this.baseUrl = options.baseUrl ?? "/api";
    this.fetchImpl = options.fetchImpl;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.getUiTokenFn = options.getUiTokenFn ?? getUiToken;
  }

  async listSessions(
    params?: KoraSessionsParams,
    signal?: AbortSignal,
  ): Promise<KoraSessionsList> {
    // P4-7 (slice 2 load-more): additive query params; the frozen
    // response shape is untouched.
    const query: Record<string, number> = {};
    if (params?.limit !== undefined) query.limit = params.limit;
    if (params?.offset !== undefined) query.offset = params.offset;
    return this.request<KoraSessionsList>("/kora/sessions", {
      query,
      signal,
    });
  }

  async getSession(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<KoraSession | null> {
    // Registry-row helper derived from the listing (the week-0 mock kept
    // a map; the HTTP contract has no single-session GET in slice 1).
    const list = await this.listSessions(undefined, signal);
    return list.items.find((s) => s.id === sessionId) ?? null;
  }

  async getTranscript(
    sessionId: string,
    params?: KoraTranscriptParams,
    signal?: AbortSignal,
  ): Promise<KoraTranscript> {
    // Guard (owner complaint on prod 1.63.0): a forced refetch of the
    // disabled transcript query (TanStack `refetch()` bypasses `enabled`)
    // fired GET /api/kora/sessions/undefined/transcript — a garbage
    // request that could only 401/404 and noise the auth verdict. No id,
    // no request: the guard refuses BEFORE the wire.
    const id = typeof sessionId === "string" ? sessionId.trim() : "";
    if (id.length === 0) {
      throw new ApiError(
        400,
        "Kora getTranscript: no session id — the request was not sent",
      );
    }
    const query: Record<string, number> = {};
    if (params?.after_seq !== undefined) query.after_seq = params.after_seq;
    if (params?.limit !== undefined) query.limit = params.limit;
    return this.request<KoraTranscript>(
      `/kora/sessions/${encodeURIComponent(id)}/transcript`,
      { query, signal, timeoutMs: this.timeoutMs },
    );
  }

  async createSession(
    body: KoraSessionCreate,
    signal?: AbortSignal,
  ): Promise<KoraSessionCreated> {
    return this.request<KoraSessionCreated>("/kora/sessions", {
      method: "POST",
      body,
      auth: true,
      signal,
    });
  }

  async sendMessage(
    sessionId: string,
    text: string,
    signal?: AbortSignal,
  ): Promise<KoraMessageAccepted> {
    return this.request<KoraMessageAccepted>(
      `/kora/sessions/${encodeURIComponent(sessionId)}/messages`,
      { method: "POST", body: { text }, auth: true, signal },
    );
  }

  async stepUpStatus(signal?: AbortSignal): Promise<KoraStepUpStatus> {
    return this.request<KoraStepUpStatus>("/kora/steering/step-up", {
      auth: true,
      signal,
    });
  }

  async enableStepUp(pin: string, signal?: AbortSignal): Promise<KoraStepUpStatus> {
    return this.request<KoraStepUpStatus>("/kora/steering/step-up", {
      method: "POST",
      body: { pin },
      auth: true,
      signal,
    });
  }

  async revokeStepUp(signal?: AbortSignal): Promise<void> {
    await this.request<unknown>("/kora/steering/step-up", {
      method: "DELETE",
      auth: true,
      signal,
    });
  }

  /**
   * One JSON request: timeout composition, the class auth discipline
   * (bare reads; ui-bearer on mutations with a ONE headerless replay on
   * 401), and non-2xx → ApiError carrying the Kora error code (the frozen
   * vocabulary) when the body speaks it.
   */
  private async request<T>(
    path: string,
    config: {
      method?: string;
      query?: Record<string, number | string>;
      body?: unknown;
      auth?: boolean;
      signal?: AbortSignal;
      timeoutMs?: number;
    } = {},
  ): Promise<T> {
    const url = buildUrl(this.baseUrl, path, config.query);
    // The bearer rides ONLY an explicit mutation AND a token the panel
    // actually holds. Reads ship bare — the same-origin cookie is the
    // identity, and a stale header must never override it (header-first
    // server contract; the prod 1.63.0 complaint).
    const bearer = config.auth === true ? this.getUiTokenFn() : "";
    const headers: Record<string, string> = {};
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (config.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    let resp: Response = await this.send(url, path, config, headers);
    if (resp.status === 401 && bearer) {
      // Stale header token beside a (possibly live) cookie: strip the
      // Authorization and re-fly ONCE on the cookie leg. A bare request
      // has nothing to strip — its 401 is the honest verdict already.
      const replayHeaders = { ...headers };
      delete replayHeaders.Authorization;
      resp = await this.send(url, path, config, replayHeaders);
    }

    if (resp.status === 204) return undefined as T;
    let wire: unknown = null;
    try {
      wire = await resp.json();
    } catch {
      // non-JSON body — fall through to the status verdict
    }
    if (!resp.ok) {
      const errBody = (wire ?? {}) as KoraWireError;
      const message = errBody.message ?? `Kora ${path} failed: ${resp.status}`;
      throw new KoraHttpError(
        resp.status,
        message,
        errBody.code as KoraErrorCode | undefined,
        url,
      );
    }
    return wire as T;
  }

  /**
   * One wire attempt: timeout + external-abort composition around the
   * injected fetch. Transport/timeout failures map to ApiError(0); the
   * replay reuses this verbatim, so both legs fail with the same honesty.
   */
  private async send(
    url: string,
    path: string,
    config: {
      method?: string;
      body?: unknown;
      signal?: AbortSignal;
      timeoutMs?: number;
    },
    headers: Record<string, string>,
  ): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.timeoutMs ?? this.timeoutMs);
    if (config.signal) {
      if (config.signal.aborted) controller.abort();
      else config.signal.addEventListener("abort", () => controller.abort());
    }

    try {
      return await (this.fetchImpl ?? fetch)(url, {
        method: config.method ?? "GET",
        headers,
        body: config.body !== undefined ? JSON.stringify(config.body) : undefined,
        signal: controller.signal,
        credentials: "same-origin",
      });
    } catch (err) {
      if (timedOut) {
        throw new ApiError(0, `Kora request timed out: ${path}`, { url });
      }
      if (config.signal?.aborted) throw err;
      throw new ApiError(0, `Kora request failed: ${path}`, { url });
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * ApiError + the frozen Kora error code when the server sent one. The UI
 * reads the code through the seam helper `koraErrorCode(err)` (single
 * instanceof-free extraction point) — never a concrete adapter class.
 * A transport-level failure (no code from the server) answers undefined:
 * honest absence, not a fake code.
 */
export class KoraHttpError extends ApiError {
  constructor(
    status: number,
    message: string,
    readonly koraCode?: KoraErrorCode,
    url?: string,
  ) {
    super(status, message, url ? { url } : undefined);
    this.name = "KoraHttpError";
  }
}
