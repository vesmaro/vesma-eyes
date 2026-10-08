import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useToast } from "@/components/Toast/toastContext";
import { Button } from "@/components/ui/button";
import { BackToBoardLink } from "@/components/BackToBoardLink/BackToBoardLink";
import { IrisLogo } from "@/components/IrisLogo/IrisLogo";
import { PublicStatusLine } from "@/components/PublicStatusLine/PublicStatusLine";
import { useT } from "@/i18n";
import { resolveReturnTarget } from "@/lib/returnParams";
import { isApiError } from "@/lib/errors";
import { useAuth } from "@/features/auth/AuthContext";
import { PasswordRateLimitedError } from "@/gateway/passwordAuth";
import { UiTokenLoginForm } from "./UiTokenLoginForm";
import { useUiToken } from "./UiTokenContext";
import {
  PasswordRecoveryForm,
  PasswordRegisterForm,
  PasswordSignInForm,
} from "./PasswordAuthForms";
import type { FormVerdict } from "./PasswordAuthForms";

/**
 * The /auth route (07k §4 as a React route; ME-080 = dressing map §1.1.6
 * И2): the «Вход | Регистрация» tab pair on ONE public page outside the
 * Shell, with its own minimal header (the Shell chrome — sidebar, locks —
 * never mounts here).
 *
 * Tabs are URL-first (07k §4.1): `?tab=register` opens Регистрация from the
 * gate screens and the TopBar «Создать аккаунт»; the default is Вход. The
 * segment is a real tablist (aria-selected, arrow keys, roving tabindex)
 * over two panels that stay mounted behind `hidden` — aria-controls stays
 * resolvable in both states. A panel switch moves focus to the first input
 * of the panel (07k §4.4), never on the initial mount.
 *
 * Legacy admin mode (the ui-token world — machines and old deploys): the
 * paste-token form stays available as a SECONDARY «Вход по токену (админ)»
 * view (`?tab=token`, a quiet link under the card, never a third equal tab)
 * hosting the ONE UiTokenLoginForm unchanged — the kubectl hints ride along,
 * they are admin-only copy now (ME-078: the human tabs carry zero jargon).
 *
 * Password recovery (fix/recovery-ux — the owner's prod-1.64.0 complaint:
 * «как сбросить пароль, если не помню старый?»): a «Забыли пароль?»
 * link-button under the sign-in form opens a TWO-STEP recovery walk on
 * PAGE STATE (no new route — the URL and the return target stay put), and
 * while it runs the tab pair is hidden. Step 1 reuses the ONE token form
 * (sign in with the token); step 2 — after the verify-at-the-door flips
 * `tokenPresent` — is «Задать новый пароль» on the token leg of
 * `POST /auth/password`: name + new password + repeat, the current
 * password is never asked for. Success toasts «Пароль задан — теперь
 * войдите», tears the token session down server-side and lands back on the
 * Вход tab. The honest «уже вошёл» redirect stays fenced off for the whole
 * walk — a mid-walk sign-in is a step transition, not a journey's end.
 * The settings «Безопасность» section remains the signed-in surface for
 * the same wire; recovery here is for the locked-out owner.
 *
 * returnTo (07k §4.2 + the UI-18 `?return=` transport, ME-026 precedent):
 * the gate screens and the TopBar link here carrying
 * `return=<encodeURIComponent(pathname+search)>`; after a successful
 * sign-in the user lands back on the DEEP LINK they came from — query
 * intact. The target is validated by resolveReturnTarget (in-app routes
 * only, no schemes, no protocol-relative tricks); anything else silently
 * falls back to the public Обзор.
 *
 * Outcomes (07k §4.2): success → toast on the landing spot + redirect;
 * refusal → inline verdict under the form (aria-live polite, «Ошибка:»
 * prefix, focus to the offending field); already signed in → the honest
 * redirect, the form never pretends a second sign-in is needed.
 */

/** Brand wordmark — language-independent, hence not in the dictionaries. */
const BRAND_NAME = "vesma-eyes"; // brand canon: main's rebrand (union policy)

type AuthTab = "signin" | "register" | "token";

/** The recovery walk's steps (fix/recovery-ux): page state, never a route.
 * Step 1 = token sign-in, step 2 = set the new password; `null` = the walk
 * is off and the ordinary tab pair owns the card. */
type RecoveryStep = "token" | "password";

const SIGNIN_TAB_ID = "auth-tab-signin";
const REGISTER_TAB_ID = "auth-tab-register";

function tabFromSearch(search: string): AuthTab {
  const tab = new URLSearchParams(search).get("tab");
  if (tab === "register") return "register";
  if (tab === "token") return "token";
  return "signin";
}

export function AuthRoutePage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { theme, toggleTheme } = useTheme();
  const { tokenPresent, submitToken, verifyPending, rejectKind, rejectDetail, logout } =
    useUiToken();
  const { loginWithPassword, registerAccount, passwordUser, setPassword } = useAuth();

  const tab = tabFromSearch(location.search);
  // resolveReturnTarget rejects the self-return by construction (the current
  // pathname here is /auth, never the target) and unknown prefixes — the
  // fallback for every rejected shape is the public Обзор.
  const returnTarget =
    resolveReturnTarget({
      searchParams: new URLSearchParams(location.search),
      currentPathname: location.pathname,
      currentSearch: location.search,
    }) ?? "/";

  // The route shows the gate's refusal beats only for ITS OWN submits — a
  // rejection that predates the mount (a dismissed mutation prompt
  // elsewhere) must not paint a stale error onto a fresh form.
  const [submitted, setSubmitted] = useState(false);

  // Password round-trips: the forms disable while one is in flight; the
  // verdict survives until the next submit (never a toast, never a reload).
  const [passwordPending, setPasswordPending] = useState(false);
  const [signInVerdict, setSignInVerdict] = useState<FormVerdict | null>(null);
  const [registerVerdict, setRegisterVerdict] = useState<FormVerdict | null>(null);

  // The recovery walk (fix/recovery-ux): page state — step 1 (token) and
  // step 2 (set the new password). `recoveryDone` latches the SUCCESS beat:
  // the walk may only exit once the token session teardown lands (the
  // logout is a server round-trip — leaving earlier would trip the honest
  // «уже вошёл» redirect mid-walk).
  const [recovery, setRecovery] = useState<RecoveryStep | null>(null);
  const [recoveryDone, setRecoveryDone] = useState(false);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [recoveryVerdict, setRecoveryVerdict] = useState<FormVerdict | null>(null);

  // Tablist wiring (roving tabindex): refs to the two segment buttons, so
  // the arrow keys move both selection AND focus.
  const signInTabRef = useRef<HTMLButtonElement | null>(null);
  const registerTabRef = useRef<HTMLButtonElement | null>(null);
  const signinPanelRef = useRef<HTMLDivElement | null>(null);
  const registerPanelRef = useRef<HTMLDivElement | null>(null);

  // Sign-in transitions: mounted-signed-in → the honest «уже вошёл»
  // redirect; signed-in mid-page (a submit below landed) → return to the
  // deep link. The ref distinguishes the two without a second effect.
  // The recovery walk FENCES this off: its step-1 token sign-in flipping
  // `tokenPresent` is a step transition (→ set the new password), never a
  // journey's end — the walk exits by its own landing effect below.
  const wasPresentRef = useRef<boolean | null>(null);
  const present = tokenPresent || passwordUser !== null;
  useEffect(() => {
    const was = wasPresentRef.current;
    wasPresentRef.current = present;
    if (!present) return;
    if (recovery !== null) return;
    if (was === null) {
      toast.push({
        kind: "ok",
        title: passwordUser
          ? t("auth.route.alreadySignedInNamed", { username: passwordUser.username })
          : t("auth.route.alreadySignedIn"),
      });
    }
    navigate(returnTarget, { replace: true });
  }, [present, passwordUser, navigate, returnTarget, toast, t, recovery]);

  // Recovery step 1 → 2 (fix/recovery-ux): the token verify at the door
  // flipped `tokenPresent` — the set-password step takes the card. The
  // redirect above stays fenced while the walk is on.
  useEffect(() => {
    if (recovery === "token" && tokenPresent) setRecovery("password");
  }, [recovery, tokenPresent]);

  // Recovery landing (fix/recovery-ux): the success toast is up and the
  // token session teardown (logout — DELETE first, the cookie leg is
  // server-side) is in flight; the moment the board is anonymous again the
  // walk exits to the Вход tab — the fresh password awaits its first
  // sign-in. A FAILED teardown keeps the step on screen (the provider's
  // honest «не вышло выйти» toast covers it; the user leaves via
  // «Назад ко входу» — the walk then unblocks through the honest
  // already-signed-in redirect, the visitor IS signed in).
  useEffect(() => {
    if (!recoveryDone || present) return;
    setRecoveryDone(false);
    setRecovery(null);
    setRecoveryVerdict(null);
    setSubmitted(false);
    // Back to the Вход tab: the URL's tab param resets, the return survives.
    const params = new URLSearchParams(location.search);
    params.delete("tab");
    const search = params.toString();
    navigate(search ? `/auth?${search}` : "/auth", { replace: true });
  }, [recoveryDone, present, location.search, navigate]);

  // Leaving the walk hands the card back to the tab pair — the focus
  // follows (07k §4.4: a surface switch moves focus to the new surface's
  // first input). ENTERING needs no help: the token form autofocuses its
  // own field on mount.
  const wasInRecoveryRef = useRef(false);
  useEffect(() => {
    if (wasInRecoveryRef.current && recovery === null) {
      signinPanelRef.current
        ?.querySelector<HTMLInputElement>("input:not([type=hidden])")
        ?.focus();
    }
    wasInRecoveryRef.current = recovery !== null;
  }, [recovery]);

  // Panel switch → focus the first input of the panel that just became
  // visible (07k §4.4) — but never on the initial mount (the visitor's
  // first paint owns focus; UiTokenLoginForm autofocuses its own field).
  const mountedTabRef = useRef<AuthTab | null>(null);
  useEffect(() => {
    if (mountedTabRef.current === null) {
      mountedTabRef.current = tab;
      return;
    }
    if (mountedTabRef.current === tab) return;
    mountedTabRef.current = tab;
    if (tab === "signin" || tab === "register") {
      const panel = tab === "signin" ? signinPanelRef.current : registerPanelRef.current;
      panel?.querySelector<HTMLInputElement>("input:not([type=hidden])")?.focus();
    }
  }, [tab]);

  // A live session never sees the form (the redirect above is imminent) —
  // except mid-walk: recovery step 2 RUNS on a token session by design.
  if (present && recovery === null) {
    return <p role="status" className="sr-only">{t("auth.route.alreadySignedIn")}</p>;
  }

  // Human verdicts from the wire (07k §4.2): status classes → localized
  // lines; the server's own detail rides as the secondary line when it
  // carries human words (the cascade fix emptied 422 of any input echo, and
  // the generic "401 …" fallback stays hidden — the localized line says it).
  const verdictFrom = (error: unknown, kind: "signin" | "register"): FormVerdict => {
    const status = isApiError(error) ? error.status : 0;
    const detail =
      isApiError(error) && !/^\d{3}\b/.test(error.message) && error.message.length < 200
        ? error.message
        : undefined;
    if (kind === "signin") {
      if (status === 401) {
        return {
          text: t("auth.route.loginFailed"),
          detail: t("auth.route.loginFailedHelp"),
          focus: "username",
        };
      }
      if (status === 429) {
        return { text: t("auth.route.tooManyAttempts"), detail };
      }
      return { text: t("auth.route.networkFailed") };
    }
    if (status === 409) {
      return { text: t("auth.route.nameTaken"), focus: "username" };
    }
    if (status === 403) {
      return { text: t("auth.route.registrationClosed"), detail };
    }
    if (status === 429) {
      return { text: t("auth.route.tooManyAttempts"), detail };
    }
    if (status === 422) {
      return { text: t("auth.route.registerFailed"), detail };
    }
    return { text: t("auth.route.networkFailed") };
  };

  const signIn = async (username: string, password: string) => {
    setSubmitted(true);
    setPasswordPending(true);
    setSignInVerdict(null);
    try {
      const user = await loginWithPassword(username, password);
      // Success (07k §4.2): the toast rides to the landing spot (the app's
      // toast region lives above the router), the redirect is the return
      // target — the cookie session is already open.
      toast.push({
        kind: "ok",
        title: t("auth.route.signedInToast", { username: user.username }),
      });
      navigate(returnTarget, { replace: true });
    } catch (error) {
      setSignInVerdict(verdictFrom(error, "signin"));
    } finally {
      setPasswordPending(false);
    }
  };

  const register = async (username: string, password: string) => {
    setSubmitted(true);
    setPasswordPending(true);
    setRegisterVerdict(null);
    try {
      const user = await registerAccount(username, password);
      // Registration IS a sign-in (the cookie rode the same response).
      toast.push({
        kind: "ok",
        title: t("auth.route.accountCreatedToast", { username: user.username }),
      });
      navigate(returnTarget, { replace: true });
    } catch (error) {
      setRegisterVerdict(verdictFrom(error, "register"));
    } finally {
      setPasswordPending(false);
    }
  };

  // --- recovery walk (fix/recovery-ux) -------------------------------------

  /** Human verdicts for the set-password step: 403 — owner-only (an
   * unknown account answers the SAME 403 — the copy does not distinguish,
   * no oracle); 429 — the server's own Retry-After seconds; 401 (a token
   * session that went stale mid-walk) and 422 — one honest failure line,
   * the server's words on the expandable tech line; transport — the
   * network line. */
  const recoveryVerdictFrom = (error: unknown): FormVerdict => {
    if (error instanceof PasswordRateLimitedError) {
      // The server's own Retry-After; an absent header falls back to 60s.
      return {
        text: t("auth.route.recoveryTooManyAttempts", {
          n: error.retryAfterSeconds ?? 60,
        }),
      };
    }
    const status = isApiError(error) ? error.status : 0;
    const detail =
      isApiError(error) && !/^\d{3}\b/.test(error.message) && error.message.length < 200
        ? error.message
        : undefined;
    if (status === 403) {
      return { text: t("auth.route.recoveryForbidden"), focus: "username" };
    }
    if (status === 422 || status === 401) {
      return { text: t("auth.route.recoveryFailed"), detail };
    }
    return { text: t("auth.route.networkFailed"), detail };
  };

  /** Enter the walk from the «Забыли пароль?» link: page state only — the
   * URL (and the return target it carries) stay untouched. A fresh start
   * never inherits a stale token-refusal beat. */
  const enterRecovery = () => {
    setSubmitted(false);
    setRecovery("token");
  };

  /** Leave the walk without setting a password — back to the tab pair (the
   * focus-return effect moves the caret to the sign-in form). */
  const exitRecovery = () => {
    setRecovery(null);
    setRecoveryDone(false);
    setRecoveryVerdict(null);
    setSubmitted(false);
  };

  /** Recovery step 2's submit: the token leg of `POST /auth/password` —
   * `{username, new_password}`, the current password does not exist on
   * this leg. Success toasts «теперь войдите» and starts the token
   * teardown; the landing effect exits the walk once the board is
   * anonymous again. */
  const setRecoveryPassword = async (username: string, password: string) => {
    setRecoveryPending(true);
    setRecoveryVerdict(null);
    try {
      await setPassword({ username, newPassword: password });
      toast.push({ kind: "ok", title: t("auth.route.recoveryDoneToast") });
      setRecoveryDone(true);
      logout();
    } catch (error) {
      setRecoveryVerdict(recoveryVerdictFrom(error));
    } finally {
      setRecoveryPending(false);
    }
  };

  /** Tab-switch URL update — return survives every switch (ME-026). */
  const switchTab = (next: AuthTab) => {
    const params = new URLSearchParams(location.search);
    if (next === "signin") params.delete("tab");
    else params.set("tab", next);
    const search = params.toString();
    navigate(search ? `/auth?${search}` : "/auth", { replace: true });
  };

  /** Tab href — a real link under the markup (middle-click still works). */
  const tabHref = (next: AuthTab) => {
    const params = new URLSearchParams(location.search);
    if (next === "signin") params.delete("tab");
    else params.set("tab", next);
    const search = params.toString();
    return search ? `/auth?${search}` : "/auth";
  };

  const selectFromKeyboard = (event: React.KeyboardEvent): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const forward = event.key === "ArrowRight";
    const next: "signin" | "register" =
      tab === "signin" ? (forward ? "register" : "signin") : forward ? "signin" : "register";
    if (next === tab) return;
    switchTab(next);
    (next === "signin" ? signInTabRef : registerTabRef).current?.focus();
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Minimal header (07k §4): the iris mark, the page name, the theme
       * toggle — no Shell chrome on the public entry page. */}
      <header className="flex h-topbar shrink-0 items-center justify-between border-myelin-hairline border-b-hairline bg-well px-4">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2 rounded-md py-1 font-semibold text-foreground transition-colors duration-instant hover:text-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <IrisLogo size={20} decorative />
          <span className="whitespace-nowrap text-sm tracking-wide">
            {BRAND_NAME}
          </span>
          <span className="text-sm font-normal text-foreground-muted">
            · {t("login.title")}
          </span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={t(
            theme === "dark" ? "topbar.themeToLight" : "topbar.themeToDark",
          )}
          title={t(theme === "dark" ? "topbar.themeToLight" : "topbar.themeToDark")}
          className="h-8 w-8"
        >
          {theme === "dark" ? (
            <Sun className="size-4" aria-hidden="true" />
          ) : (
            <Moon className="size-4" aria-hidden="true" />
          )}
        </Button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-md" data-testid="auth-route">
          {/* The «На борт» slot (07k §4.3 → 07h §12): ABOVE the card, the
           * same slot in every tab state — the page has no Shell chrome,
           * the way back must not hide in the corner. */}
          <div className="mb-3 flex">
            <BackToBoardLink />
          </div>
          {/* The card on well (07k §4): the sign-in surface itself. While
           * the recovery walk runs it hosts the walk instead — the tab pair
           * is hidden, not merely inert. */}
          <div className="rounded-lg border border-border bg-well p-6 shadow-raised">
            <h1 className="text-lg font-semibold text-foreground">
              {recovery !== null
                ? t("auth.route.recoveryTitle")
                : tab === "register"
                  ? t("auth.route.registerTitle")
                  : t("login.title")}
            </h1>
            <p className="mt-1 text-xs text-foreground-secondary">
              {recovery === "token"
                ? t("auth.route.recoveryTokenLead")
                : recovery === "password"
                  ? t("auth.route.recoverySetLead")
                  : tab === "register"
                    ? t("auth.route.registerDescription")
                    : tab === "token"
                      ? t("auth.route.tokenDescription")
                      : t("auth.route.passwordDescription")}
            </p>

            {recovery !== null ? (
              recovery === "token" ? (
                /* Step 1: the ONE token form, reused unchanged (union И1) —
                 * the secondary action leaves the walk («Назад ко входу»). */
                <div className="mt-4" data-testid="auth-recovery-token">
                  <UiTokenLoginForm
                    onSubmitToken={(value) => {
                      setSubmitted(true);
                      submitToken(value);
                    }}
                    verifyPending={verifyPending}
                    rejectKind={submitted ? rejectKind : undefined}
                    rejectDetail={submitted ? rejectDetail : undefined}
                    secondaryLabel={t("auth.route.recoveryBack")}
                    onSecondary={exitRecovery}
                  />
                </div>
              ) : (
                /* Step 2: the token leg of /auth/password — name + new
                 * password + repeat, the current one is never asked for. */
                <div className="mt-4" data-testid="auth-recovery-set">
                  <h2 className="text-sm font-medium text-foreground">
                    {t("auth.route.recoveryFormTitle")}
                  </h2>
                  <PasswordRecoveryForm
                    pending={recoveryPending}
                    verdict={recoveryVerdict}
                    onSubmit={(username, password) =>
                      void setRecoveryPassword(username, password)
                    }
                  />
                </div>
              )
            ) : tab !== "token" ? (
              <>
                {/* The segment (07k §4.1): a real tablist — aria-selected,
                 * arrow keys, roving tabindex; the active tab reads
                 * iris-bright (≥3:1) on the raised well. */}
                <div
                  role="tablist"
                  aria-label={t("auth.route.tabsLabel")}
                  className="mt-4 grid grid-cols-2 gap-1 rounded-md bg-elevated p-1"
                  onKeyDown={selectFromKeyboard}
                >
                  <TabButton
                    ref={signInTabRef}
                    tabId={SIGNIN_TAB_ID}
                    selected={tab === "signin"}
                    controls="auth-panel-signin"
                    label={t("auth.route.tabSignIn")}
                    onSelect={() => switchTab("signin")}
                  />
                  <TabButton
                    ref={registerTabRef}
                    tabId={REGISTER_TAB_ID}
                    selected={tab === "register"}
                    controls="auth-panel-register"
                    label={t("auth.route.tabRegister")}
                    onSelect={() => switchTab("register")}
                  />
                </div>

                {/* Both panels stay mounted behind `hidden` (the tablist's
                 * aria-controls stays resolvable in both states; hidden
                 * removes the panel from the a11y tree and the layout). */}
                <div
                  ref={signinPanelRef}
                  role="tabpanel"
                  id="auth-panel-signin"
                  aria-labelledby={SIGNIN_TAB_ID}
                  hidden={tab !== "signin"}
                  tabIndex={-1}
                >
                  <div className="mt-4">
                    <PasswordSignInForm
                      pending={passwordPending}
                      verdict={signInVerdict}
                      onSubmit={(username, password) => void signIn(username, password)}
                    />
                    {/* fix/recovery-ux: the way back in for a locked-out
                     * owner — a quiet link-button under the password form.
                     * It OPENS the walk; it never navigates. */}
                    <p className="mt-3 text-center text-xs">
                      <button
                        type="button"
                        data-testid="auth-recovery-link"
                        onClick={enterRecovery}
                        className="rounded-sm text-foreground-muted underline-offset-2 hover:text-foreground-secondary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        {t("auth.route.recoveryLink")}
                      </button>
                    </p>
                  </div>
                </div>
                <div
                  ref={registerPanelRef}
                  role="tabpanel"
                  id="auth-panel-register"
                  aria-labelledby={REGISTER_TAB_ID}
                  hidden={tab !== "register"}
                  tabIndex={-1}
                >
                  <div className="mt-4">
                    <PasswordRegisterForm
                      pending={passwordPending}
                      verdict={registerVerdict}
                      note={t("auth.route.registerNote")}
                      onSubmit={(username, password) => void register(username, password)}
                    />
                  </div>
                </div>
              </>
            ) : (
              /* Legacy admin mode: the ONE token form, hints included — the
               * kubectl copy is admin-only now (ME-078: the human tabs carry
               * zero jargon). */
              <div className="mt-4">
                <UiTokenLoginForm
                  onSubmitToken={(value) => {
                    setSubmitted(true);
                    submitToken(value);
                  }}
                  verifyPending={verifyPending}
                  rejectKind={submitted ? rejectKind : undefined}
                  rejectDetail={submitted ? rejectDetail : undefined}
                  secondaryLabel={t("auth.route.back")}
                  onSecondary={() => navigate(returnTarget, { replace: true })}
                />
              </div>
            )}
          </div>

          {/* The secondary legacy entry — a quiet link under the card, never
           * a third equal tab (machines/legacy only; ME-078 keeps the human
           * surface clean). The recovery walk hides it: its step 1 IS the
           * token form, and the link's switchTab would drop the walk. */}
          {recovery === null ? (
            <p className="mt-3 text-center text-xs text-foreground-muted">
              <Link
                to={tabHref(tab === "token" ? "signin" : "token")}
                onClick={(event) => {
                  event.preventDefault();
                  switchTab(tab === "token" ? "signin" : "token");
                }}
                data-testid="auth-token-mode-link"
                className="rounded-sm underline-offset-2 hover:text-foreground-secondary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {tab === "token"
                  ? t("auth.route.backToPassword")
                  : t("auth.route.tokenModeLink")}
              </Link>
            </p>
          ) : null}

          {/* The public-contour footer (07k §1.3): «vesma-eyes <v> · аноним»
           * — the same single version source as the sidebar footer. */}
          <div className="mt-6 flex justify-center">
            <PublicStatusLine />
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * One segment tab (07k §4.1): the active tab reads iris-bright on the
 * raised well; keyboard follows the roving-tabindex pattern — the selected
 * tab is the only tab stop, arrows move selection (handled by the tablist).
 */
function TabButton({
  ref,
  tabId,
  selected,
  controls,
  label,
  onSelect,
}: {
  ref: React.RefObject<HTMLButtonElement>;
  tabId: string;
  selected: boolean;
  controls: string;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={tabId}
      data-testid={tabId}
      aria-selected={selected}
      aria-controls={controls}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={
        "min-h-9 rounded-sm px-3 py-1.5 text-sm transition-colors duration-instant focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
        (selected
          ? // The 07k §4.1 selected beats TOGETHER: the raised well, the
            // iris-bright label (≥3:1) and the 2px iris underline.
            "bg-well font-medium text-iris-bright shadow-raised border-b-2 border-iris-bright"
          : "text-foreground-secondary hover:text-foreground border-b-2 border-transparent")
      }
    >
      {label}
    </button>
  );
}
