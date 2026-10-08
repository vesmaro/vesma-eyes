import { createContext, useContext } from "react";
import type { AuthState } from "./authState";
import type { PasswordUser } from "./passwordSession";
import type { AdapterKind } from "@/gateway/adapterConfig";
import type { PasswordSetInput } from "@/gateway/passwordAuth";

/**
 * DI context for the auth flow. `AuthProvider` owns the state machine and the
 * AuthClient; the overlay (AuthScreen) and the TopBar widget (AuthStatus)
 * consume it via `useAuth`.
 *
 * ME-080: alongside the vesma `mnk_` token flow the context carries the
 * password-session surface (board deployments) — login/register/logout for
 * the human `vesmaro_auth` cookie session. The person is mirrored from the
 * passwordSession store; the forms own their inline verdicts (these methods
 * REJECT with the wire error instead of painting machine state).
 */
export interface AuthContextValue {
  state: AuthState;
  /** Present an `mnk_` token (wire phase 1; may answer with a TOTP challenge). */
  login: (token: string) => Promise<void>;
  /** Complete a TOTP challenge (wire phase 2). */
  verify: (code: string) => Promise<void>;
  /** Invalidate the session server-side and reset to anonymous. */
  logout: () => Promise<void>;
  /**
   * ME-080: password sign-in (`POST /api/auth/login`) — the server sets the
   * HttpOnly session cookie; resolves with the confirmed person, rejects
   * with the wire error (401 neutral / 429 / …) for the form's verdict.
   */
  loginWithPassword: (username: string, password: string) => Promise<PasswordUser>;
  /**
   * ME-080: account creation (`POST /api/auth/register`) — success IS a
   * sign-in (the cookie rides the same response); resolves with the new
   * account, rejects with the wire error (409 taken / 403 closed / …).
   */
  registerAccount: (username: string, password: string) => Promise<PasswordUser>;
  /**
   * ME-080: password-session logout — the server row is deleted first; the
   * local mirror resets even when the wire failed (an HttpOnly cookie cannot
   * be cleared from JS anyway; the whoami on the next boot tells the truth).
   */
  logoutPassword: () => Promise<void>;
  /**
   * ME-080 follow-up: set/change a password (`POST /api/auth/password`,
   * 204). Two server legs: the `vesmaro_auth` session changes the OWN
   * password (current_password required); the `vesmaro_ui` token leg sets a
   * password for an owner account WITHOUT the current one (recovery).
   * Rejects with the wire error for the form's verdict — 429 rides
   * `PasswordRateLimitedError` with the server's Retry-After seconds.
   */
  setPassword: (input: PasswordSetInput) => Promise<void>;
  /** The confirmed password-session person, or null when anonymous. */
  passwordUser: PasswordUser | null;
  openOverlay: () => void;
  closeOverlay: () => void;
  /**
   * Which gateway is active — drives the TopBar "local (mock)"/"board"
   * labels; "board" has no session affordance at all (open reads, ADR 0011 §7).
   */
  adapterMode: AdapterKind;
  /** Backend endpoint label for the connection indicator. */
  endpoint: string;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Access the auth context. Throws when used outside the provider. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error(
      "useAuth: no auth context — wrap the tree in <AuthProvider> (see src/App.tsx).",
    );
  }
  return value;
}

/**
 * Fail-soft read for surfaces that make sense in BOTH wirings — the
 * password-session chip (ME-080) degrades to the plain token slot when a
 * bare harness (SSR render tests, legacy mounts) provides no AuthProvider.
 * The real app always mounts the provider above the tree.
 */
export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthContext);
}
