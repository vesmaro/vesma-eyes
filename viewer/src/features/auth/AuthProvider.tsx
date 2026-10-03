import { useEffect, useMemo, useReducer, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthClient, clearToken, getToken, onUnauthorized } from "@/gateway/auth";
import type { AdapterKind } from "@/gateway/adapterConfig";
import { PasswordAuthClient } from "@/gateway/passwordAuth";
import type { PasswordUser } from "./passwordSession";
import {
  clearPasswordUser,
  readPasswordSession,
  setPasswordUser,
  subscribePasswordSession,
} from "./passwordSession";
import { isApiError, toError } from "@/lib/errors";
import { AuthContext } from "./AuthContext";
import type { AuthContextValue } from "./AuthContext";
import { authReducer, initialAuthState } from "./authState";
import { refetchAfterLogin } from "./refetchAfterLogin";

/**
 * Owns the auth state machine (authState.ts) and the wire client. Subscribes
 * to the gateway-wide 401 flag: every unauthorized response (data query,
 * /auth/me, a rejected login) re-opens the sign-in overlay while read-only
 * pages stay mounted underneath — on a permissive loopback deployment the
 * user can dismiss the overlay and keep browsing without a session.
 *
 * A stored session is restored optimistically on mount and confirmed via
 * `GET /auth/me`; a 401 there flows back through the same unauthorized flag.
 */
export interface AuthProviderProps {
  children: React.ReactNode;
  /** Active gateway mode — surfaced for the TopBar indicator. */
  adapterMode: AdapterKind;
  /** Backend endpoint label for the TopBar indicator. */
  endpoint: string;
  /** Test seam; defaults to the real wire client. */
  client?: AuthClient;
}

export function AuthProvider({
  children,
  adapterMode,
  endpoint,
  client,
}: AuthProviderProps) {
  const authClient = useMemo(() => client ?? new AuthClient(), [client]);
  // ME-080: the password-session wire client (board endpoints; deliberately
  // NOT the shared `client` prop — that seam carries the vesma mnk_ flow and
  // raises the gateway-wide 401 flag a wrong password must never trip).
  const passwordClient = useMemo(() => new PasswordAuthClient(), []);
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const sessionExpired = state.sessionExpired;
  // Mirror of the password-session store (the same module the boot whoami
  // hydrates and `useAuthSession` reads — one source of truth).
  const passwordUser = useSyncExternalStore(
    subscribePasswordSession,
    () => readPasswordSession().user,
    () => readPasswordSession().user,
  );

  // Confirm a restored token against /auth/me. On 401 the shared flag fires
  // and the reducer moves to anonymous + re-opens the overlay. Skipped for
  // mock and board modes: board reads are token-free through Ф0–Ф2 (ADR
  // 0011 §7) — no session to confirm, no overlay to open.
  useEffect(() => {
    if (adapterMode !== "vesma" || !getToken()) return;
    let cancelled = false;
    dispatch({ type: "SESSION_RESTORED" });
    authClient.me().catch((error: unknown) => {
      if (cancelled) return;
      // Non-auth failures (offline vesma, timeout) keep the optimistic
      // session — the pages themselves surface the offline state.
      if (isApiError(error) && error.status === 401) return; // flag already dispatched
      if (!getToken()) dispatch({ type: "LOGOUT" });
    });
    return () => {
      cancelled = true;
    };
  }, [adapterMode, authClient]);

  // A 401 invalidated the session — drop the stale token so subsequent
  // requests stop carrying (and re-triggering) it.
  useEffect(() => {
    if (sessionExpired) clearToken();
  }, [sessionExpired]);

  // Gateway-wide unauthorized flag → state machine (the reducer suppresses
  // it while a login/verify round-trip is in flight).
  useEffect(() => onUnauthorized(() => dispatch({ type: "UNAUTHORIZED" })), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      adapterMode,
      endpoint,
      async login(token) {
        dispatch({ type: "SUBMIT" });
        try {
          const result = await authClient.login(token);
          if (result.mode === "challenge") {
            dispatch({ type: "CHALLENGE", challengeId: result.challenge_id });
          } else {
            dispatch({ type: "SUCCESS" });
            // Session established — retry the queries that 401'd earlier.
            void refetchAfterLogin(queryClient);
          }
        } catch (error) {
          dispatch({ type: "FAILURE", message: toError(error).message });
        }
      },
      async verify(code) {
        if (!state.challengeId) return;
        dispatch({ type: "SUBMIT" });
        try {
          await authClient.verify(state.challengeId, code);
          dispatch({ type: "SUCCESS" });
          // Phase-2 success invalidates the cache just like a direct login.
          void refetchAfterLogin(queryClient);
        } catch (error) {
          dispatch({ type: "FAILURE", message: toError(error).message });
        }
      },
      async logout() {
        try {
          await authClient.logout();
        } finally {
          dispatch({ type: "LOGOUT" });
        }
      },
      async loginWithPassword(username, password) {
        // No SUBMIT dispatch on purpose: the mnk_ machine stays out of the
        // password round-trip (its UNAUTHORIZED suppression is keyed on the
        // authenticating phase, and the password 401 must not touch the
        // overlay). The form owns the pending flag and the verdict.
        const result = await passwordClient.login(username, password);
        const user: PasswordUser = {
          username: result.username,
          role: result.role,
        };
        setPasswordUser(user);
        // Session established — retry the queries that 401'd earlier.
        void refetchAfterLogin(queryClient);
        return user;
      },
      async registerAccount(username, password) {
        const result = await passwordClient.register(username, password);
        const user: PasswordUser = {
          username: result.username,
          role: result.role,
        };
        setPasswordUser(user);
        // The registration response opened the session — same refetch.
        void refetchAfterLogin(queryClient);
        return user;
      },
      async logoutPassword() {
        try {
          await passwordClient.logout();
        } finally {
          // The server row is the authority; a failed POST still resets the
          // mirror (an HttpOnly cookie cannot be cleared from JS — the next
          // boot whoami re-states the truth if the wire lied).
          clearPasswordUser();
        }
      },
      passwordUser,
      openOverlay: () => dispatch({ type: "OPEN_OVERLAY" }),
      closeOverlay: () => dispatch({ type: "CLOSE_OVERLAY" }),
    }),
    [state, adapterMode, endpoint, authClient, passwordClient, passwordUser, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
