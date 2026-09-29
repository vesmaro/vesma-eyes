import { Link, useLocation } from "react-router";
import { LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { withReturn } from "@/lib/returnParams";
import { useUiToken } from "./UiTokenContext";

/**
 * TopBar ui-token slot (board mode only, Ф3 fix/login-window; gates v6 in
 * union И1). The anonymous pair of 07k §2.3: an ACCENT «Войти» (opens the
 * app's ONE login window — mutations then run without prompts) plus a ghost
 * «Регистрация» — an HONEST stub, not a fake form: account creation is the
 * owner's act («первый созданный аккаунт становится владельцем борта»,
 * owner verdict 07k §10-аддендум), so the button leads to the /auth route
 * which states the policy; the registration FLOW itself does not exist yet
 * (И2, dressing map §1.1.6). The authorized branch keeps the plain «Выйти»
 * until the user chip lands in И2 — the token model carries no name to
 * fill a chip with.
 *
 * The «Регистрация» link carries the CURRENT location as `return=` (the
 * UI-18 transport): a sign-in from anywhere returns the user where they
 * stood, query intact (ME-026).
 *
 * Both auth states flip reactively off the gate state — no reload.
 * Mounted by AuthStatus ONLY in board mode, so the useUiToken hook never
 * runs in trees without the provider (mnemos/mock harnesses).
 */
export function UiTokenSlot() {
  const { tokenPresent, openLogin, logout } = useUiToken();
  const t = useT();
  const location = useLocation();
  if (tokenPresent) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={logout}
        aria-label={t("login.signOutAria")}
      >
        <LogOut className="size-4" aria-hidden="true" />
        {t("login.signOut")}
      </Button>
    );
  }
  return (
    <>
      {/* Accent sign-in — the entry must be findable, not a hidden affordance. */}
      <Button variant="default" size="sm" onClick={openLogin}>
        <LogIn className="size-4" aria-hidden="true" />
        {t("login.signIn")}
      </Button>
      <Button asChild variant="ghost" size="sm" data-testid="topbar-sign-up">
        <Link to={withReturn("/auth?tab=register", location.pathname, location.search)}>
          {t("auth.gate.signUp")}
        </Link>
      </Button>
    </>
  );
}
