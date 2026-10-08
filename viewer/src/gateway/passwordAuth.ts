import { DEFAULT_TIMEOUT_MS, requestJson, buildUrl } from "./http";
import type { RequestConfig } from "./http";
import { ApiError } from "@/lib/errors";

/**
 * Wire client for the ME-080 password-session endpoints (board only — the
 * routes live on the board server, docs/design/2026-10-01-accounts-password-auth.md §5):
 *
 * - `POST /auth/register` body `{username, password}` → 201 `{username, role}`
 *   + `vesmaro_auth` session cookie (the first account becomes the owner;
 *   afterwards registration is closed unless the deploy flag opens it).
 * - `POST /auth/login`    body `{username, password}` → 200 `{ok, username, role}`
 *   + session cookie. 401 is NEUTRAL by contract (unknown name ≡ wrong
 *   password — status, detail and timing).
 * - `POST /auth/logout`  → 204, the server-side session row is deleted
 *   (revocation is immediate and authoritative), cookie cleared. No guard —
 *   a logout never 401s.
 * - `GET  /auth/me`      → 200 `{authenticated, username?, role?}` — always
 *   200 JSON (the ME-028 console-hygiene lesson); the FE boot read.
 * - `POST /auth/password` body `{username?, new_password, current_password?}`
 *   → 204 no body (ME-080 follow-up, the settings «Безопасность» form).
 *   Two server legs: the `vesmaro_auth` session changes the OWN password
 *   (`current_password` required); the `vesmaro_ui` leg (token sign-in)
 *   sets a password for an owner account WITHOUT the current one
 *   (recovery). Errors carry human `detail` (401/403/422; 429 with
 *   Retry-After — a nonexistent username answers the SAME 403 as a
 *   non-owner, no oracle). An unknown username on the token leg = the same 403.
 *
 * Deliberately NOT the shared `AuthClient` (gateway/auth.ts): that one talks
 * the vesma `mnk_` token flow and raises the gateway-wide 401 flag on every
 * unauthorized answer. A wrong password must surface as an inline form
 * verdict, never open the vesma sign-in overlay — so this client carries no
 * `onUnauthorized` and no bearer token; the session rides the HttpOnly
 * cookie the server sets.
 */

/** Role of a password-session account (the wire pins the enum). */
export type AccountRole = "owner" | "member";

/** `POST /auth/login` success payload. */
export interface PasswordLoginResult {
  ok: boolean;
  username: string;
  role: AccountRole;
}

/** `POST /auth/register` success payload (the session is already open). */
export interface PasswordRegisterResult {
  username: string;
  role: AccountRole;
}

/** `GET /auth/me` payload — always a 200 JSON. */
export interface AuthMeResult {
  authenticated: boolean;
  username?: string | null;
  role?: AccountRole | null;
}

/** `POST /auth/password` input (ME-080 follow-up). */
export interface PasswordSetInput {
  /**
   * Target account. On the `vesmaro_auth` session leg the server infers it
   * from the cookie — the field is the form's prefill, sent when held. On
   * the `vesmaro_ui` token leg it names the owner account to recover.
   */
  username?: string;
  /** The new password (server contract: 8..512 chars, NIST length-only). */
  newPassword: string;
  /**
   * The current password — REQUIRED on the session leg, deliberately absent
   * on the token-recovery leg (that is the whole point of recovery).
   */
  currentPassword?: string;
}

/**
 * The 429 verdict with the server's own Retry-After seconds (null when the
 * header is absent/garbage — the form falls back to its default wait copy).
 * A dedicated class, not a bare ApiError: the verdict line interpolates N.
 */
export class PasswordRateLimitedError extends ApiError {
  constructor(readonly retryAfterSeconds: number | null) {
    super(429, "too many attempts");
    this.name = "PasswordRateLimitedError";
  }
}

export interface PasswordAuthClientOptions {
  /** Same default as BoardAdapter: "/api" (same-origin proxy). */
  baseUrl?: string;
  /** Test seam. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class PasswordAuthClient {
  private readonly baseUrl: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: PasswordAuthClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "/api";
    this.fetchImpl = options.fetchImpl;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Password sign-in; the server answers with the session cookie set. */
  async login(username: string, password: string): Promise<PasswordLoginResult> {
    return this.request<PasswordLoginResult>("/auth/login", {
      method: "POST",
      body: { username, password },
    });
  }

  /** Account creation; success IS a sign-in (cookie set in the same response). */
  async register(username: string, password: string): Promise<PasswordRegisterResult> {
    return this.request<PasswordRegisterResult>("/auth/register", {
      method: "POST",
      body: { username, password },
    });
  }

  /** Server-side logout: the session row dies, the cookie is cleared. */
  async logout(): Promise<void> {
    await this.request<void>("/auth/logout", { method: "POST" });
  }

  /** Who am I — the boot read; never throws on "anonymous" (always 200). */
  async me(): Promise<AuthMeResult> {
    return this.request<AuthMeResult>("/auth/me", { method: "GET" });
  }

  /**
   * Set/change a password (`POST /auth/password`, 204 no body). Raw fetch on
   * purpose (the probeUiSession precedent): the 429 verdict must carry the
   * server's Retry-After SECONDS, which requestJson's ApiError normalisation
   * hides; a 204 has no body to parse either. Every refusal keeps the
   * server's human `detail` as the ApiError message for the form's verdict.
   */
  async setPassword(input: PasswordSetInput): Promise<void> {
    let response: Response;
    try {
      response = await (this.fetchImpl ?? fetch)(
        buildUrl(this.baseUrl, "/auth/password"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // The session leg may omit the name entirely; empty input ≡ omitted.
            ...(input.username && input.username.trim().length > 0
              ? { username: input.username.trim() }
              : {}),
            new_password: input.newPassword,
            ...(input.currentPassword ? { current_password: input.currentPassword } : {}),
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
    } catch {
      // Timeout/network — one honest transport verdict (the form shows the
      // networkFailed line; the cause stays a client-side detail).
      throw new ApiError(0, "password request failed (network/timeout)", {
        url: buildUrl(this.baseUrl, "/auth/password"),
      });
    }
    if (response.status === 204) return;
    if (response.status === 429) {
      const raw = response.headers.get("Retry-After");
      const trimmed = raw?.trim() ?? "";
      throw new PasswordRateLimitedError(
        /^\d+$/.test(trimmed) ? Number(trimmed) : null,
      );
    }
    throw new ApiError(response.status, await extractDetail(response), {
      url: buildUrl(this.baseUrl, "/auth/password"),
    });
  }

  private request<T>(path: string, config: RequestConfig): Promise<T> {
    return requestJson<T>(
      {
        baseUrl: this.baseUrl,
        fetchImpl: this.fetchImpl,
        // No getToken / onUnauthorized on purpose — see the module docblock.
        defaultTimeoutMs: this.timeoutMs,
      },
      path,
      config,
    );
  }
}

/** The server's human `detail` from a JSON error body, else a status line. */
async function extractDetail(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText || "Request failed"}`.trim();
  try {
    const parsed: unknown = await response.json();
    if (
      parsed &&
      typeof parsed === "object" &&
      "detail" in parsed &&
      typeof (parsed as { detail: unknown }).detail === "string" &&
      (parsed as { detail: string }).detail.length > 0
    ) {
      return (parsed as { detail: string }).detail;
    }
  } catch {
    // non-JSON body — the status line stands
  }
  return fallback;
}
