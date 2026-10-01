import { useCallback, useContext, useSyncExternalStore } from "react";
import { isUiTokenSessionSource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import {
  readAuthSessionStatus,
  subscribeAuthSession,
  type AuthSessionStatus,
} from "./authSession";
import { UiTokenContext } from "./UiTokenContext";

/**
 * The auth-session hook every v6 gate surface reads (union И1, 07k §5.1):
 * sidebar locks, the Shell content gate and the /auth route. It layers two
 * reactive sources into one paint-safe verdict:
 *
 * - the UiTokenGate's `tokenPresent` — the LIVE mirror that flips on login
 *   (dialog or /auth route), logout and the mid-flight 401 scrub, with no
 *   page reload anywhere;
 * - the boot store (authSession.ts) — the pre-paint verdict of the ME-028
 *   boot probe, which contributes exactly one bit after boot: whether the
 *   probe is still in flight ("pending").
 *
 * Derivation rules (with the provider in the tree — the real app):
 *   tokenPresent                       → "user" (a token IS present now);
 *   no token + boot probe in flight    → "pending" — gated content is HELD
 *                                        (neither the closed content nor the
 *                                        gate screen renders; 07k §5.1 p.3);
 *   no token + boot verdict settled    → "anonymous".
 * A boot "user" without a live tokenPresent (the token was cleared since
 * boot — logout, mid-flight 401) reads "anonymous": the live mirror wins
 * by construction. Bare trees without the provider (SSR harnesses) have no
 * such transitions — there the boot verdict itself is the answer.
 *
 * `gatesActive` — whether the v6 gates run in this deployment at all: only
 * the board adapter speaks the ui-token session wire. The mock playground
 * (no auth wall by design) and the mnemos L1 adapter (reads open by
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
  const gatesActive = isUiTokenSessionSource(gateway);
  // The LIVE mirror owns the verdict whenever the provider is in the tree:
  // login / logout / mid-flight-401 all flip tokenPresent and must override
  // a possibly-stale boot verdict (boot said "user", the session since
  // ended). Without a provider (bare SSR harnesses) no such transitions
  // exist — the boot verdict IS the live truth there.
  if (gate) {
    if (gate.tokenPresent) return { status: "user", gatesActive };
    return { status: bootStatus === "pending" ? "pending" : "anonymous", gatesActive };
  }
  return { status: bootStatus, gatesActive };
}
