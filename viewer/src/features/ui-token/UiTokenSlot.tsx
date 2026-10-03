import { Link, useLocation } from "react-router";
import { LogIn, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { withReturn } from "@/lib/returnParams";
import { useAuthOptional } from "@/features/auth/AuthContext";
import { useUiToken } from "./UiTokenContext";

/**
 * TopBar ui-token slot (board mode only, Ф3 fix/login-window; gates v6 in
 * union И1; ME-080 makes the password session the HUMAN entry). Three
 * states, most-specific first:
 *
 * - a password-session person is confirmed → the user chip: username + the
 *   role badge («владелец» / «участник») and «Выйти» — the server-side
 *   logout (`POST /api/auth/logout`: the session ROW dies, a stolen cookie
 *   with it) plus the local mirror reset;
 * - else a stored ui token → the plain «Выйти» of the token model (the
 *   token carries no name to fill a chip with) — machines/legacy, unchanged;
 * - else the anonymous pair: an ACCENT «Войти» — now a link to the /auth
 *   route (login+password is the human path; the ui token became plumbing,
 *   ME-080) — plus the ghost «Создать аккаунт». The token login WINDOW stays
 *   the mutation-driven prompt (runAuthorized) and the /auth admin view;
 *   it is no longer the front door.
 *
 * Both auth links carry the CURRENT location as `return=` (the UI-18
 * transport): a sign-in from anywhere returns the user where they stood,
 * query intact (ME-026).
 *
 * All states flip reactively off the gate/password stores — no reload.
 * Mounted by AuthStatus ONLY in board mode, so the useUiToken hook never
 * runs in trees without the provider (mnemos/mock harnesses). The optional
 * auth read keeps bare SSR harnesses (no AuthProvider) on the token-only
 * behavior.
 */
export function UiTokenSlot() {
  const { tokenPresent, logout } = useUiToken();
  const auth = useAuthOptional();
  const t = useT();
  const location = useLocation();
  const user = auth?.passwordUser ?? null;

  if (user) {
    return (
      <>
        {/* The user chip (ME-080): who is signed in, at which rank — the
         * role badge reads «владелец»/«участник», never machine jargon. */}
        <span
          data-testid="topbar-user-chip"
          className="flex min-w-0 items-center gap-1.5 text-sm text-foreground-secondary"
        >
          <span className="max-w-40 truncate font-medium text-foreground">
            {user.username}
          </span>
          <Badge variant={user.role === "owner" ? "iris" : "default"}>
            {t(user.role === "owner" ? "auth.route.roleOwner" : "auth.route.roleMember")}
          </Badge>
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void auth?.logoutPassword()}
          aria-label={t("login.signOutAria")}
        >
          <LogOut className="size-4" aria-hidden="true" />
          {t("login.signOut")}
        </Button>
      </>
    );
  }

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
      {/* Accent sign-in — the entry must be findable, not a hidden affordance.
       * ME-080: it LEADS to the /auth route (login+password), carrying the
       * current location as return. openLogin (the token window) stays the
       * mutation-prompt path and the admin view, not the front door. */}
      <Button asChild variant="default" size="sm" data-testid="topbar-sign-in">
        <Link to={withReturn("/auth", location.pathname, location.search)}>
          <LogIn className="size-4" aria-hidden="true" />
          {t("login.signIn")}
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm" data-testid="topbar-sign-up">
        <Link to={withReturn("/auth?tab=register", location.pathname, location.search)}>
          {t("auth.gate.signUp")}
        </Link>
      </Button>
    </>
  );
}
