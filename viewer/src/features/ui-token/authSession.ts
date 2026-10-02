import type { MemoryGateway } from "@/gateway/MemoryGateway";
import { isTaskMutationSource, isUiTokenSessionSource } from "@/gateway/capabilities";
import { startVisit } from "@/telemetry/telemetry";

/**
 * Boot auth-session store (union И1, gates v6 — 07k §5.1): the ONE answer to
 * "is there an owner session in this browser right now?" that gated surfaces
 * (sidebar locks, gate screens, the /auth route) must know BEFORE the first
 * paint of gated content — a flash of closed content is forbidden (07k
 * §5.1 p.3) and so is guessing "user" without evidence.
 *
 * Truth sources, in order — the store only READS state, it never elevates
 * trust on the client:
 *
 * 1. The synchronous adapter read `hasUiToken()`: a ui token sitting in
 *    sessionStorage settles "user" pre-paint. The value was server-verified
 *    at submit time and stays server-verified on every use — a stale token
 *    degrades through the gate's mid-flight 401 path, not through this
 *    store.
 * 2. The EXISTING boot probe `probeUiSession()` (ME-028 contract): one
 *    `GET /api/auth/ui-token` per app boot. main.tsx fires it BEFORE the
 *    router mounts, so the first render of a gated route already knows the
 *    verdict. Verdict set:
 *      204                  → a live `vesmaro_ui` cookie → "user";
 *      200 {"live": false}  → anonymous — the server's honest none-answer,
 *                             NOT a 401 (ME-028: anonymous is a normal
 *                             state, not an error);
 *      503 / transport fail → fail-soft to "anonymous": no server
 *                             confirmation means no session is claimed.
 * 3. Gateways without the session wire resolve from their own capability,
 *    synchronously, with no probe: the mock playground answers "user" (no
 *    auth wall by design), the vesma L1 adapter "anonymous" (its reads are
 *    open, ADR 0011 §7, and the v6 gates stay inactive there — see
 *    useAuthSession).
 *
 * The store is per-gateway (WeakMap) and idempotent: whoever calls first —
 * main.tsx before render, a lazy read from a test harness — owns THE one
 * boot probe; later callers join the same promise. The probe verdict only
 * settles a "pending" boot: a synchronous "user" (stored token) is never
 * downgraded by a cookie-less probe — whether that token still works is
 * the server's call on the next request, not the probe's.
 *
 * Invalidation after boot is NOT this store's business: login / logout /
 * mid-flight-401 transitions flow through the UiTokenGate's reactive
 * `tokenPresent` and useAuthSession layers the two (see useAuthSession.ts).
 */

/** The paint-time session verdict. "pending" = the boot probe is in flight. */
export type AuthSessionStatus = "user" | "anonymous" | "pending";

interface AuthSessionEntry {
  status: AuthSessionStatus;
  listeners: Set<() => void>;
  /** The one boot probe in flight (session-wire gateways only); null when
   * the gateway has no session wire or the probe has already settled. */
  probe: Promise<boolean> | null;
}

const entries = new WeakMap<MemoryGateway, AuthSessionEntry>();

/** Settle a pending boot; a settled synchronous verdict is never overwritten. */
function settle(entry: AuthSessionEntry, status: "user" | "anonymous"): void {
  entry.probe = null;
  if (entry.status === "pending") {
    entry.status = status;
    for (const listener of [...entry.listeners]) listener();
  }
}

/**
 * The per-gateway store, created on first touch. Creation is idempotent and
 * side-effect-bounded: the only async side effect is the boot probe, whose
 * store mutation always lands post-render (a promise callback).
 */
function entryFor(gateway: MemoryGateway): AuthSessionEntry {
  const existing = entries.get(gateway);
  if (existing) return existing;

  const entry: AuthSessionEntry = {
    status: "anonymous",
    listeners: new Set(),
    probe: null,
  };
  entries.set(gateway, entry);

  if (!isUiTokenSessionSource(gateway)) {
    // No session wire ⇒ no boot probe. The adapter's own capability answers:
    // the mock playground has no auth wall (a genuine "user"), everything
    // else has no owner session to claim.
    entry.status =
      isTaskMutationSource(gateway) && gateway.hasUiToken() ? "user" : "anonymous";
    return entry;
  }

  // Session wire: the synchronous read settles the paint verdict; the probe
  // (always fired, matching the historical provider boot) refreshes the
  // adapter's cookie flag and settles "pending" boots.
  entry.status = gateway.hasUiToken() ? "user" : "pending";
  entry.probe = gateway.probeUiSession().then(
    (live) => {
      settle(entry, live ? "user" : "anonymous");
      // ME-041 (taxonomy §1.2 #1): the probe's LIVE answer — the
      // server-confirmed 204 — is the ONLY telemetry arm. ui.visit fires
      // here, at the single point that owns the boot probe (formerly the
      // provider's own probe call; the stitch moved the probe into this
      // store, so the arm travels with it). startVisit is idempotent and
      // anonymous/disarmed sessions never reach this line with live=true;
      // a sync stored token does NOT arm — only the cookie's 204 does.
      if (live) startVisit();
      return live;
    },
    // The adapter never rejects (it catches transport errors into `false`),
    // but a throwing test double must not leave the boot pending forever.
    () => {
      settle(entry, "anonymous");
      return false;
    },
  );
  return entry;
}

/**
 * Fire the boot session verdict for this gateway before the first render
 * (called from main.tsx). Reading the store anywhere also initializes it,
 * so harnesses that mount components directly cannot observe a stale boot.
 */
export function initAuthSession(gateway: MemoryGateway): void {
  entryFor(gateway);
}

/** The current boot verdict; reading initializes the store if needed. */
export function readAuthSessionStatus(gateway: MemoryGateway): AuthSessionStatus {
  return entryFor(gateway).status;
}

/** Subscribe to boot-verdict changes; returns the unsubscribe. */
export function subscribeAuthSession(
  gateway: MemoryGateway,
  listener: () => void,
): () => void {
  const entry = entryFor(gateway);
  entry.listeners.add(listener);
  return () => entry.listeners.delete(listener);
}

/**
 * The ONE boot probe promise for this gateway — the seam the UiTokenProvider
 * reuses for its post-probe `refreshPresence()` (one probe per gateway per
 * app boot, no matter who asked first). Null when the gateway has no session
 * wire or the probe has settled.
 */
export function authSessionProbe(gateway: MemoryGateway): Promise<boolean> | null {
  return entryFor(gateway).probe;
}
