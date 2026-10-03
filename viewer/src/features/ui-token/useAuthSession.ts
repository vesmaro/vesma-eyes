import { useCallback, useContext, useSyncExternalStore } from "react";
import { isUiTokenSessionSource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import {
  readPasswordSession,
  subscribePasswordSession,
} from "@/features/auth/passwordSession";
import {
  readAuthSessionStatus,
  subscribeAuthSession,
  type AuthSessionStatus,
} from "./authSession";
import { UiTokenContext } from "./UiTokenContext";

/**
 * The auth-session hook every v6 gate surface reads (union И1, 07k §5.1):
 * sidebar locks, the Shell content gate and the /auth route. It layers three
 * reactive sources into one paint-safe verdict:
 *
 * - the UiTokenGate's `tokenPresent` — the LIVE mirror that flips on login
 *   (dialog or /auth route), logout and the mid-flight 401 scrub, with no
 *   page reload anywhere;
 * - the boot store (authSession.ts) — the pre-paint verdict of the ME-028
 *   boot probe, which contributes exactly one bit after boot: whether the
 *   probe is still in flight ("pending");
 * - the password-session mirror (ME-080, passwordSession.ts) — the confirmed
 *   `vesmaro_auth` person and the boot whoami's pending bit; both count as
 *   the same ui-class admission the server grants the cookie.
 *
 * Derivation rules (with the provider in the tree — the real app):
 *   tokenPresent or password person    → "user" (a session IS present now);
 *   neither + a boot read in flight    → "pending" — gated content is HELD
 *                                        (neither the closed content nor the
 *                                        gate screen renders; 07k §5.1 p.3);
 *   neither + boot verdicts settled    → "anonymous".
 * A boot "user" without a live mirror (the token was cleared since boot —
 * logout, mid-flight 401) reads "anonymous": the live mirror wins by
 * construction. Bare trees without the provider (SSR harnesses) have no
 * such transitions — there the boot verdict itself is the answer.
 *
 * `gatesActive` — whether the v6 gates run in this deployment at all: only
 * the board adapter speaks the ui-token session wire. The mock playground
 * (no auth wall by design) and the vesma L1 adapter (reads open by
 * ADR 0011 §7, a different auth model) render NO locks and NO gate screens —
 * a lock that lies about a deployment that genuinely serves anonymous reads
 * is the blocker the dressing map §1.1.6 forbids.
 */
export interface AuthSession {
  /** The paint-time session verdict (see above). */
  status: AuthSessionStatus;
  /** Do the v6 gates run here? Board adapter only. */
  gatesActive: boolean;
}

export function useAuthSession(): AuthSession {
  const gateway = useGateway();
  const gate = useContext(UiTokenContext);
  const bootStatus = useSyncExternalStore(
    useCallback((onChange: () => void) => subscribeAuthSession(gateway, onChange), [gateway]),
    // The lazy read initializes the store (and with it the boot probe) —
    // idempotent per gateway, so this stays a one-time network touch.
    () => readAuthSessionStatus(gateway),
    () => readAuthSessionStatus(gateway),
  );
  // ME-080: the password-session mirror — the boot whoami's pending bit and
  // the confirmed person. The store is settled-anonymous in harnesses that
  // never called initPasswordSession, so bare trees see no change at all.
  const password = useSyncExternalStore(
    subscribePasswordSession,
    readPasswordSession,
    readPasswordSession,
  );
  const gatesActive = isUiTokenSessionSource(gateway);
  // The LIVE mirrors own the verdict whenever the provider is in the tree:
  // login / logout / mid-flight-401 all flip tokenPresent (and the password
  // login/register/logout flips the person mirror) and must override a
  // possibly-stale boot verdict (boot said "user", the session since ended).
  // Without a provider (bare SSR harnesses) no such transitions exist — the
  // boot verdict IS the live truth there.
  if (gate) {
    if (gate.tokenPresent || password.user) return { status: "user", gatesActive };
    const pending = bootStatus === "pending" || password.pending;
    return { status: pending ? "pending" : "anonymous", gatesActive };
  }
  return { status: bootStatus, gatesActive };
}
