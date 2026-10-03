import { isUiTokenSessionSource } from "@/gateway/capabilities";
import type { MemoryGateway } from "@/gateway/MemoryGateway";
import { PasswordAuthClient } from "@/gateway/passwordAuth";
import type { AccountRole } from "@/gateway/passwordAuth";

/**
 * The password-session store (ME-080 FE slice) — the one module-level answer
 * to "which person is signed in with login+password right now?". The session
 * itself is an HttpOnly `vesmaro_auth` cookie the FE can neither read nor
 * forge; this store mirrors ONLY what the server told us:
 *
 * - boot: `initPasswordSession` fires ONE `GET /api/auth/me` (always 200
 *   JSON, board deployments only — the capability guard keeps the mock
 *   playground and the vesma L1 adapter untouched) before the first render;
 * - login / register: the AuthProvider writes the answer it just received;
 * - logout: reset to anonymous after the server confirmed the teardown.
 *
 * The store is deliberate about its two-state pending bit: while the boot
 * whoami is in flight the gated surfaces HOLD (the same 07k §5.1 p.3 rule
 * the ui-token boot probe follows — no flash of closed content for a person
 * whose session is about to be confirmed), and never claim a user without
 * evidence. Harnesses that never call `initPasswordSession` (tests, SSR)
 * read a settled anonymous store and fire no network at all.
 */

/** The person the server confirmed, or null when anonymous. */
export interface PasswordUser {
  username: string;
  role: AccountRole;
}

interface PasswordSessionState {
  /** The confirmed person; null = anonymous (or not yet confirmed). */
  user: PasswordUser | null;
  /** True while the boot whoami read is in flight. */
  pending: boolean;
}

// The snapshot is IMMUTABLE (useSyncExternalStore compares by Object.is —
// a mutated-in-place object would read as "no change" forever): every set
// replaces the object.
let state: PasswordSessionState = { user: null, pending: false };

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) listener();
}

function sameUser(a: PasswordUser | null, b: PasswordUser | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.username === b.username && a.role === b.role;
}

function set(patch: Partial<PasswordSessionState>): void {
  const nextUser = patch.user !== undefined ? patch.user : state.user;
  const nextPending = patch.pending !== undefined ? patch.pending : state.pending;
  if (sameUser(state.user, nextUser) && state.pending === nextPending) return;
  state = { user: nextUser, pending: nextPending };
  notify();
}

/** The current snapshot (stable reference until the state actually changes). */
export function readPasswordSession(): PasswordSessionState {
  return state;
}

/** Subscribe to store changes; returns the unsubscribe. */
export function subscribePasswordSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Login/register success — the server already set the cookie. */
export function setPasswordUser(user: PasswordUser): void {
  set({ user, pending: false });
}

/** Password logout — reset to anonymous (the server confirmed first). */
export function clearPasswordUser(): void {
  set({ user: null, pending: false });
}

let booted = false;

/**
 * Fire THE one boot whoami read (main.tsx, before the first render — the
 * same slot as `initAuthSession`). Board deployments only: the capability
 * guard means the mock playground and the vesma adapter never see the
 * request. Idempotent per app boot; failures degrade to anonymous silently
 * (the whoami is a 200-JSON by contract — anything else is transport noise,
 * not an auth verdict).
 */
export function initPasswordSession(gateway: MemoryGateway): void {
  if (booted || !isUiTokenSessionSource(gateway)) return;
  booted = true;
  set({ pending: true });
  void new PasswordAuthClient()
    .me()
    .then((me) => {
      set({
        user:
          me.authenticated && me.username
            ? { username: me.username, role: me.role === "member" ? "member" : "owner" }
            : null,
        pending: false,
      });
    })
    .catch(() => {
      set({ user: null, pending: false });
    });
}

/** Test seam: reset the module store (the boot guard included). */
export function resetPasswordSessionForTests(): void {
  booted = false;
  state = { user: null, pending: false };
  listeners.clear();
}
