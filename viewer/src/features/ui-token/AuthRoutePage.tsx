import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useToast } from "@/components/Toast/toastContext";
import { Button } from "@/components/ui/button";
import { IrisLogo } from "@/components/IrisLogo/IrisLogo";
import { useT } from "@/i18n";
import { resolveReturnTarget } from "@/lib/returnParams";
import { UiTokenLoginForm } from "./UiTokenLoginForm";
import { useUiToken } from "./UiTokenContext";

/**
 * The /auth route (union И1, 07k §4 — the stand's auth.html as a React
 * route): hosts the app's ONE login form (UiTokenLoginForm — the same beats
 * the LoginDialog window renders; the state machine stays the single
 * UiTokenGate) on a public page outside the Shell, with its own minimal
 * header (the Shell chrome — sidebar, locks — never mounts here).
 *
 * returnTo (07k §4.2 + the UI-18 `?return=` transport, ME-026 precedent):
 * the gate screens and the TopBar «Регистрация» link here carrying
 * `return=<encodeURIComponent(pathname+search)>`; after a successful sign-in
 * the user lands back on the DEEP LINK they came from — query intact. The
 * target is validated by resolveReturnTarget (in-app routes only, no
 * schemes, no protocol-relative tricks); anything else silently falls back
 * to the public Обзор.
 *
 * «Создать аккаунт» (?tab=register, И1 honest stub): account creation is
 * owner policy — «первый созданный аккаунт становится владельцем борта»,
 * owner verdict 07k §10-аддендум — and there is no registration FLOW yet,
 * so the page shows the honest policy line instead of a fake form. The
 * full «Вход | Регистрация» tab view is И2 (dressing map §1.1.6).
 *
 * «Уже вошёл» (07k §4.2): arriving with a live session redirects to the
 * return target with an honest toast — the form never pretends a second
 * sign-in is needed.
 */

/** Brand wordmark — language-independent, hence not in the dictionaries. */
const BRAND_NAME = "mnemos-eyes";

export function AuthRoutePage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { theme, toggleTheme } = useTheme();
  const { tokenPresent, submitToken, verifyPending, rejectKind, rejectDetail } =
    useUiToken();

  const searchParams = new URLSearchParams(location.search);
  const registerTab = searchParams.get("tab") === "register";
  // resolveReturnTarget rejects the self-return by construction (the current
  // pathname here is /auth, never the target) and unknown prefixes — the
  // fallback for every rejected shape is the public Обзор.
  const returnTarget =
    resolveReturnTarget({
      searchParams,
      currentPathname: location.pathname,
      currentSearch: location.search,
    }) ?? "/";

  // The route shows the gate's refusal beats only for ITS OWN submits — a
  // rejection that predates the mount (a dismissed mutation prompt
  // elsewhere) must not paint a stale error onto a fresh form.
  const [submitted, setSubmitted] = useState(false);

  // Sign-in transitions: mounted-signed-in → the honest «уже вошёл»
  // redirect; signed-in mid-page (the submit below landed) → return to the
  // deep link. The ref distinguishes the two without a second effect.
  const wasPresentRef = useRef<boolean | null>(null);
  useEffect(() => {
    const was = wasPresentRef.current;
    wasPresentRef.current = tokenPresent;
    if (!tokenPresent) return;
    if (was === null) {
      toast.push({ kind: "ok", title: t("auth.route.alreadySignedIn") });
    }
    navigate(returnTarget, { replace: true });
  }, [tokenPresent, navigate, returnTarget, toast, t]);

  // A live session never sees the form (the redirect above is imminent).
  if (tokenPresent) {
    return <p role="status" className="sr-only">{t("auth.route.alreadySignedIn")}</p>;
  }

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

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md" data-testid="auth-route">
          {/* The card on well (07k §4): the sign-in surface itself. */}
          <div className="rounded-lg border border-border bg-well p-6 shadow-raised">
            <h1 className="text-lg font-semibold text-foreground">
              {t("login.title")}
            </h1>
            <p className="mt-1 text-xs text-foreground-secondary">
              {t("login.description")}
            </p>

            {/* The honest registration stub (owner policy, 07k §10-аддендум):
             * account creation is the owner's act; no fake form until the
             * flow exists (И2). */}
            {registerTab ? (
              <p
                data-testid="auth-route-signup-note"
                className="mt-3 rounded-md bg-elevated p-2 text-xs text-foreground-secondary"
              >
                {t("auth.gate.signUpNote")}
              </p>
            ) : null}

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
          </div>
        </div>
      </main>
    </div>
  );
}
