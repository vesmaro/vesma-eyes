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
import { UiTokenLoginForm } from "./UiTokenLoginForm";
import { useUiToken } from "./UiTokenContext";
import { PasswordRegisterForm, PasswordSignInForm } from "./PasswordAuthForms";
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
  const { tokenPresent, submitToken, verifyPending, rejectKind, rejectDetail } =
    useUiToken();
  const { loginWithPassword, registerAccount, passwordUser } = useAuth();

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

  // Tablist wiring (roving tabindex): refs to the two segment buttons, so
  // the arrow keys move both selection AND focus.
  const signInTabRef = useRef<HTMLButtonElement | null>(null);
  const registerTabRef = useRef<HTMLButtonElement | null>(null);
  const signinPanelRef = useRef<HTMLDivElement | null>(null);
  const registerPanelRef = useRef<HTMLDivElement | null>(null);

  // Sign-in transitions: mounted-signed-in → the honest «уже вошёл»
  // redirect; signed-in mid-page (a submit below landed) → return to the
  // deep link. The ref distinguishes the two without a second effect.
  const wasPresentRef = useRef<boolean | null>(null);
  const present = tokenPresent || passwordUser !== null;
  useEffect(() => {
    const was = wasPresentRef.current;
    wasPresentRef.current = present;
    if (!present) return;
    if (was === null) {
      toast.push({
        kind: "ok",
        title: passwordUser
          ? t("auth.route.alreadySignedInNamed", { username: passwordUser.username })
          : t("auth.route.alreadySignedIn"),
      });
    }
    navigate(returnTarget, { replace: true });
  }, [present, passwordUser, navigate, returnTarget, toast, t]);

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

  // A live session never sees the form (the redirect above is imminent).
  if (present) {
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
          className="flex min-w-0 items-center gap-2 rounded-md py-1 font-semibold text-foreground transition-colors duration-instant hover:text-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
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
          {/* The card on well (07k §4): the sign-in surface itself. */}
          <div className="rounded-lg border border-border bg-well p-6 shadow-raised">
            <h1 className="text-lg font-semibold text-foreground">
              {tab === "register" ? t("auth.route.registerTitle") : t("login.title")}
            </h1>
            <p className="mt-1 text-xs text-foreground-secondary">
              {tab === "register"
                ? t("auth.route.registerDescription")
                : tab === "token"
                  ? t("auth.route.tokenDescription")
                  : t("auth.route.passwordDescription")}
            </p>

            {tab !== "token" ? (
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
           * surface clean). */}
          <p className="mt-3 text-center text-xs text-foreground-muted">
            <Link
              to={tabHref(tab === "token" ? "signin" : "token")}
              onClick={(event) => {
                event.preventDefault();
                switchTab(tab === "token" ? "signin" : "token");
              }}
              data-testid="auth-token-mode-link"
              className="rounded-sm underline-offset-2 hover:text-foreground-secondary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
            >
              {tab === "token"
                ? t("auth.route.backToPassword")
                : t("auth.route.tokenModeLink")}
            </Link>
          </p>

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
        "min-h-9 rounded-sm px-3 py-1.5 text-sm transition-colors duration-instant focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright " +
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
