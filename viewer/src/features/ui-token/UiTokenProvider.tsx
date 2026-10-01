import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { QueryClientContext } from "@tanstack/react-query";
import {
  isTaskMutationSource,
  isUiTokenSessionSource,
} from "@/gateway/capabilities";
import { getDeviceScope, hasDeviceToken } from "@/gateway/deviceToken";
import { useGateway } from "@/gateway/GatewayContext";
import { isApiError } from "@/lib/errors";
import { useToast } from "@/components/Toast/toastContext";
import { useT } from "@/i18n";
import { authSessionProbe } from "./authSession";
import { UiTokenContext } from "./UiTokenContext";
import { LoginDialog } from "./LoginDialog";
import { UiTokenGate } from "./uiTokenGate";

/**
 * React wrapper around the UiTokenGate state machine (see uiTokenGate.ts —
 * the whole flow is unit-tested there, provider-free). Owns the ONE login
 * window of the app (LoginDialog — the TopBar «Войти» and every
 * mutation-driven prompt share it) and exposes the gate through context:
 * tokenPresent (reactive TopBar), openLogin, runAuthorized, logout. No page
 * reloads anywhere — the store transition re-renders the consumers.
 *
 * ADR 0014 owner session: when the gateway speaks the session wire
 * (BoardAdapter), the gate verifies at the door (`verifyUiToken`), the
 * provider boot-probes the live `vesmaro_ui` cookie once per mount
 * (hydrating `hasUiToken()` — a fresh tab must not re-prompt) and logout
 * tears the session down SERVER-side first (DELETE — an HttpOnly cookie
 * cannot be cleared from JS; a failed DELETE leaves the owner signed in
 * and says so instead of silently flipping to read-only).
 *
 * fix/login-feedback: the gate's session events surface as toasts — the
 * owner asked the app to CONFIRM a successful login (or shout about a 401)
 * instead of closing the window silently. The subscription lives in an
 * effect (closed over the current t/push) so the gate object itself is
 * built exactly once per gateway: a rebuild on language switch would reset
 * the machine mid-login, losing the queued action.
 */
export function UiTokenProvider({ children }: { children: React.ReactNode }) {
  const gateway = useGateway();
  const toast = useToast();
  const t = useT();

  // Adapter-owned token policy: BoardAdapter reads sessionStorage + the
  // live-cookie flag (ADR 0014 Ф2), the mock answers true (no auth wall in
  // the dev playground). The session wire (verify/probe) is injected only
  // when the adapter grows it — otherwise the gate keeps the legacy
  // paste-and-store path.
  const gate = useMemo(
    () =>
      new UiTokenGate({
        // Scope v1 (ADR 0012 Amendment): a mutation may LEAVE the browser
        // on the owner session OR the paired device's identity — the
        // server's scope table rules from there (open routes run for a
        // control device; closed ones answer 403).
        hasToken: () =>
          isTaskMutationSource(gateway)
            ? gateway.hasUiToken() || hasDeviceToken()
            : false,
        // ...but `tokenPresent` keeps meaning the OWNER session: the
        // store-ops/enrollment/devices panels stay hidden on a phone that
        // only holds an mnd_ identity (privilege separation, scope v1).
        hasUiToken: isTaskMutationSource(gateway)
          ? () => gateway.hasUiToken()
          : undefined,
        // UI-22: only a mutation-capable gateway has the device beat — the
        // device identity (ADR 0012 §5) lives in localStorage and the fail-soft
        // read answers "no identity" outside a browser. The mock has no auth
        // wall (hasToken → true), so the branch stays unreachable there.
        // The scope drives the read-scope pre-flight beat (every mutation
        // is a 403 verdict → honest toast without the round-trip).
        ...(isTaskMutationSource(gateway)
          ? {
              hasDeviceIdentity: () => hasDeviceToken(),
              deviceScope: () => getDeviceScope(),
            }
          : {}),
        ...(isUiTokenSessionSource(gateway)
          ? {
              verifyToken: (value: string) => gateway.verifyUiToken(value),
              probe: () => gateway.probeUiSession(),
            }
          : {}),
      }),
    [gateway],
  );

  // Boot hydration (ADR 0014 Ф2): ONE probe per gateway — 204 flips
  // tokenPresent without any user action, so a second tab (or a reload
  // past the 6h sliding window's refresh) opens signed-in or stays
  // read-only, never stuck with a dead prompt. Union И1 (ME-043): the probe
  // now lives in the boot auth-session store (authSession.ts) and main.tsx
  // fires it BEFORE the first render — this effect JOINS that same promise
  // (a standalone harness mount initializes the store itself, firing the
  // probe exactly here as before). No second request, ever.
  useEffect(() => {
    if (!isUiTokenSessionSource(gateway)) return;
    let cancelled = false;
    const probe = authSessionProbe(gateway);
    // Already settled before this mount: the gate sampled the verdict at
    // construction (the adapter's cookie flag was set before render).
    if (!probe) return;
    void probe.then(() => {
      if (!cancelled) gate.refreshPresence();
    });
    return () => {
      cancelled = true;
    };
  }, [gateway, gate]);

  // Read-side 401s rebuild the session verdict (cascade P2, ME-043): every
  // READ error lands in the TanStack query cache — a 401 there means the
  // server refused a request the boot verdict trusted the stored token /
  // cookie with (the mutation leg already owns its 401s through
  // runAuthorized; the query cache is exactly the reads' seam). The
  // handler mirrors the gate's mid-flight beat: re-probe → the session
  // rides the cookie leg and the fallen queries re-fly ("recovered"), or
  // the verdict flips to anonymous and the gated surfaces re-render behind
  // the honest gate screen — never the eternal raw error state a stale
  // token used to leave on screen.
  //
  // Fail-soft on the context (not useQueryClient, which throws): minimal
  // harnesses mount the provider without a QueryClientProvider — without a
  // cache there is no read seam and the beat simply does not wire.
  const queryClient = useContext(QueryClientContext);
  useEffect(() => {
    if (!queryClient || !isUiTokenSessionSource(gateway)) return;
    let rebuilding = false;
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") return;
      const { action } = event;
      if (action.type !== "error") return;
      if (!isApiError(action.error) || action.error.status !== 401) return;
      // Nothing to rebuild once the verdict is already anonymous, and one
      // rebuild in flight absorbs the burst of queries that fell together.
      if (rebuilding || !gate.getState().tokenPresent) return;
      rebuilding = true;
      void gate.rebuildAfterReadUnauthorized().then((outcome) => {
        rebuilding = false;
        if (outcome === "recovered") {
          // The header token is gone; the cookie leg carries the session —
          // re-fly everything that fell (and mark the rest stale).
          void queryClient.invalidateQueries();
        }
      });
    });
    return unsubscribe;
  }, [gateway, gate, queryClient]);

  // Login feedback toasts: success is confirmed once the value actually
  // lands in the tab (with an honest note in legacy mode — the board token
  // logged the owner in); a server-side 401 is announced beside the
  // window's inline line. Events only fire from user actions, always
  // post-mount, so the effect subscription is attached before the first
  // one can fire.
  useEffect(() => {
    return gate.listen((event) => {
      if (event.type === "loginStored") {
        toast.push({
          kind: "ok",
          title: t("login.toastSignedIn"),
          ...(event.tokenClass === "legacy"
            ? { detail: t("login.toastLegacy") }
            : {}),
        });
        return;
      }
      if (event.type === "deviceForbidden") {
        // UI-22 beat, now read-scope-only (ADR 0012 Amendment): a `read`
        // device's mutations are all 403 verdicts — the honest toast fires
        // pre-flight; a `control` device mutates and only the server's
        // closed-route 403s refuse it (honest per-action toast).
        toast.push({
          kind: "error",
          title: t("login.deviceForbidden"),
          detail: t("login.deviceForbiddenDetail"),
        });
        return;
      }
      toast.push({
        kind: "error",
        title: t("login.toastRejected"),
        detail: t("login.toastRejectedDetail"),
      });
    });
  }, [gate, toast, t]);

  const state = useSyncExternalStore(
    gate.subscribe.bind(gate),
    gate.getState.bind(gate),
    // SSR snapshot: the same pure read (renderToString harnesses need it).
    gate.getState.bind(gate),
  );

  // data-auth on the root (07k §5.1): "user" while the owner session is
  // live, "anon" otherwise — the pending boot probe reads "anon" (the safe
  // default; it can only flip up). A layout effect so the attribute lands
  // before the browser's first paint; visual chrome never keys on it (the
  // reactive state above drives the UI) — it is the audit/CSS seam.
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const value = state.tokenPresent ? "user" : "anon";
    if (document.documentElement.dataset.auth !== value) {
      document.documentElement.dataset.auth = value;
    }
  }, [state.tokenPresent]);

  const runAuthorized = useCallback(
    (run: () => Promise<void>, onDeferred?: () => void) => {
      gate.runAuthorized(run, onDeferred);
    },
    [gate],
  );
  const openLogin = useCallback(() => gate.openLogin(), [gate]);
  const dismiss = useCallback(() => gate.dismiss(), [gate]);
  const submitToken = useCallback(
    (value: string) => gate.submitToken(value),
    [gate],
  );

  // Logout (ADR 0014 Ф2): the provider owns the wire — DELETE first, THEN
  // the local scrub. A failed DELETE means the cookie (the actual session)
  // is still live: abort the logout and say so — a silent "signed out"
  // that isn't would be the same lie ADR 0014 removes everywhere else.
  const logout = useCallback(() => {
    if (!isUiTokenSessionSource(gateway)) {
      gate.logout();
      return;
    }
    void gateway
      .logoutUiToken()
      .then(() => gate.logout())
      .catch(() => {
        toast.push({
          kind: "error",
          title: t("login.logoutFailed"),
        });
      });
  }, [gateway, gate, toast, t]);

  return (
    <UiTokenContext.Provider
      value={{
        tokenPresent: state.tokenPresent,
        openLogin,
        runAuthorized,
        logout,
        submitToken,
        verifyPending: state.verifyPending === true,
        rejectKind: state.rejectKind,
        rejectDetail: state.rejectDetail,
      }}
    >
      {children}
      <LoginDialog
        open={state.open}
        reason={state.reason}
        verifyPending={state.verifyPending === true}
        rejectKind={state.rejectKind}
        rejectDetail={state.rejectDetail}
        onSubmitToken={submitToken}
        onDismiss={dismiss}
      />
    </UiTokenContext.Provider>
  );
}
