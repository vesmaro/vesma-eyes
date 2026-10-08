import { useRef, useState } from "react";
import { useT } from "@/i18n";
import { useToast } from "@/components/Toast/toastContext";
import { Button } from "@/components/ui/button";
import { useAuthOptional } from "@/features/auth/AuthContext";
import { useUiToken } from "@/features/ui-token/UiTokenContext";
import { PasswordRateLimitedError } from "@/gateway/passwordAuth";
import { isApiError } from "@/lib/errors";
import {
  TextField,
  VerdictLine,
  useVerdictFocus,
} from "@/features/ui-token/PasswordAuthForms";
import type { FormVerdict } from "@/features/ui-token/PasswordAuthForms";
import { passwordIssue, usernameIssue } from "@/features/ui-token/passwordValidation";
import type { FieldIssue } from "@/features/ui-token/passwordValidation";
import { HubSection } from "./HubSection";

/**
 * «Безопасность» — the settings-hub password section (ME-080 follow-up,
 * `POST /api/auth/password` → 204). Two server legs, and the form says
 * honestly which one it is on:
 *
 * - `vesmaro_auth` (signed in with a password): changes the OWN account's
 *   password — the current password is required; the name prefills from
 *   the boot whoami mirror.
 * - `vesmaro_ui` (signed in with a token): recovery — sets a password for
 *   an owner account WITHOUT the current one. A nonexistent account
 *   answers the SAME 403 as a non-owner (no oracle), and the verdict says
 *   exactly that. On this leg the «Текущий пароль» field is NOT RENDERED
 *   AT ALL — not as an optional field, absent (fix/recovery-ux: the owner
 *   in token mode saw «Текущий пароль» on the recovery form, read it as
 *   «the old password is required» and abandoned the form).
 *
 * Verdicts are human (dictionary-first): 401 wrong current password
 * (focus moves there), 403 owner-only recovery, 429 with the server's
 * Retry-After seconds, 422/transport with the server detail on the
 * expandable tech line. Client validation (username shape, ≥8, repeat)
 * spares the wire. The honest line under the form tells a locked-out
 * owner the way back in: sign in with the token, then set a new password
 * here — no current password needed. If NEITHER identity is present the
 * form does not render at all — the honesty line says why.
 *
 * A11y: the auth-forms canon verbatim (labelled fields, aria-invalid +
 * describedby, reveal toggles, aria-live verdict, focus to the offending
 * field); no motion beyond the app's instant color transitions —
 * reduced-motion safe by construction.
 */
export function SecuritySettingsSection() {
  const t = useT();
  const toast = useToast();
  const auth = useAuthOptional();
  const { tokenPresent } = useUiToken();
  const passwordUser = auth?.passwordUser ?? null;
  const sessionLeg = passwordUser !== null;
  const available = (sessionLeg || tokenPresent) && auth?.setPassword !== undefined;

  // Prefill from the boot whoami mirror (hydrated before first render).
  const [username, setUsername] = useState(() => passwordUser?.username ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [touched, setTouched] = useState({ username: false, next: false, confirm: false });
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [pending, setPending] = useState(false);
  const [verdict, setVerdict] = useState<FormVerdict | null>(null);

  const usernameRef = useRef<HTMLInputElement>(null);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  useVerdictFocus(verdict, {
    username: usernameRef,
    current: currentRef,
    password: nextRef,
    confirm: confirmRef,
  });

  const live = submitAttempted || touched.username || touched.next || touched.confirm;
  const issues = {
    username: usernameIssue(username),
    password: passwordIssue(next),
    confirm: confirm.length === 0 ? ("required" as const) : confirm !== next ? ("confirm" as const) : null,
  };
  const shown: { username: FieldIssue; password: FieldIssue; confirm: FieldIssue } = live
    ? issues
    : { username: null, password: null, confirm: null };

  const issueText = (field: "username" | "password" | "confirm"): string => {
    switch (issues[field]) {
      case "required":
        return t(
          field === "username"
            ? "auth.route.errRequiredUsername"
            : field === "password"
              ? "auth.route.errRequiredPassword"
              : "auth.route.errRequiredConfirm",
        );
      case "username":
        return t("auth.route.errUsername");
      case "password":
        return t("auth.route.errPassword");
      case "confirm":
        return t("auth.route.errConfirm");
      default:
        return "";
    }
  };

  /** Human verdicts from the wire (the auth-route mapping discipline). */
  const verdictFrom = (error: unknown): FormVerdict => {
    if (error instanceof PasswordRateLimitedError) {
      // The server's own Retry-After; an absent header falls back to 60s.
      return {
        text: t("settings.security.tooManyAttempts", {
          n: error.retryAfterSeconds ?? 60,
        }),
      };
    }
    const status = isApiError(error) ? error.status : 0;
    const detail =
      isApiError(error) && !/^\d{3}\b/.test(error.message) && error.message.length < 200
        ? error.message
        : undefined;
    if (status === 401) {
      // The wrong-current beat exists only on the session leg — the field
      // itself must be on screen for the focus to land somewhere real.
      // On the token leg a 401 means the token session went stale: one
      // honest save-failed line, the detail rides the tech line.
      if (sessionLeg) {
        return { text: t("settings.security.wrongCurrent"), focus: "current" };
      }
      return { text: t("settings.security.saveFailed"), detail };
    }
    if (status === 403) {
      return { text: t("settings.security.forbidden") };
    }
    if (status === 422) {
      return { text: t("settings.security.saveFailed"), detail };
    }
    return { text: t("auth.route.networkFailed"), detail };
  };

  const submit = () => {
    setSubmitAttempted(true);
    if (!available || pending) return;
    if (issues.username !== null || issues.password !== null || issues.confirm !== null) {
      // Client refusal — focus the first offending field, zero network.
      const first: FormVerdict["focus"] =
        issues.username !== null
          ? "username"
          : issues.password !== null
            ? "password"
            : "confirm";
      const refs = {
        username: usernameRef,
        password: nextRef,
        confirm: confirmRef,
      };
      refs[first]?.current?.focus();
      return;
    }
    setPending(true);
    setVerdict(null);
    auth!
      .setPassword({
        username: username.trim(),
        newPassword: next,
        ...(current.length > 0 ? { currentPassword: current } : {}),
      })
      .then(() => {
        toast.push({ kind: "ok", title: t("settings.security.toastOk") });
        // The passwords are consumed; the name stays (identity, prefilled).
        setCurrent("");
        setNext("");
        setConfirm("");
        setTouched({ username: false, next: false, confirm: false });
        setSubmitAttempted(false);
      })
      .catch((error: unknown) => {
        setVerdict(verdictFrom(error));
      })
      .finally(() => {
        setPending(false);
      });
  };

  return (
    <HubSection id="security" title={t("settings.hub.securityTitle")}>
      {/* The honesty section: which leg speaks, and when the form is off —
       * why (spec: «если форма недоступна — почему»). */}
      <p
        data-testid="security-leg-line"
        className="text-xs text-foreground-secondary"
      >
        {available
          ? sessionLeg
            ? t("settings.security.honestySession")
            : t("settings.security.honestyToken")
          : t("settings.security.unavailable")}
      </p>

      {available ? (
        <>
          <h3 className="text-sm font-medium text-foreground">
            {t("settings.security.formTitle")}
          </h3>
          <VerdictLine verdict={verdict} />
          <div className="max-w-md space-y-3">
            <TextField
              id="security-username"
              testId="security-username"
              label={t("settings.security.usernameLabel")}
              value={username}
              onChange={setUsername}
              onBlur={() => setTouched((cur) => ({ ...cur, username: true }))}
              autoComplete="username"
              issue={shown.username}
              issueText={issueText("username")}
              disabled={pending}
              inputRef={usernameRef}
            />
            {sessionLeg ? (
              /* Session leg ONLY (fix/recovery-ux): the current password is
               * required here, so the field exists. On the token leg it is
               * NOT an optional field — it is absent: recovery's whole
               * point is that no current password is needed, and showing
               * the field made the owner read recovery as «the old
               * password is required» and abandon the form. */
              <TextField
                id="security-current"
                testId="security-current"
                label={t("settings.security.currentLabel")}
                type="password"
                value={current}
                onChange={setCurrent}
                onBlur={() => undefined}
                autoComplete="current-password"
                issue={null}
                issueText=""
                disabled={pending}
                inputRef={currentRef}
                revealable
                revealed={revealed}
                onToggleReveal={() => setRevealed((cur) => !cur)}
                hint={t("settings.security.currentHint")}
              />
            ) : null}
            <TextField
              id="security-next"
              testId="security-next"
              label={t("settings.security.newLabel")}
              type="password"
              value={next}
              onChange={setNext}
              onBlur={() => setTouched((cur) => ({ ...cur, next: true }))}
              autoComplete="new-password"
              issue={shown.password}
              issueText={issueText("password")}
              disabled={pending}
              inputRef={nextRef}
              revealable
              revealed={revealed}
              onToggleReveal={() => setRevealed((cur) => !cur)}
            />
            <TextField
              id="security-confirm"
              testId="security-confirm"
              label={t("settings.security.confirmLabel")}
              type="password"
              value={confirm}
              onChange={setConfirm}
              onBlur={() => setTouched((cur) => ({ ...cur, confirm: true }))}
              autoComplete="new-password"
              issue={shown.confirm}
              issueText={issueText("confirm")}
              disabled={pending}
              inputRef={confirmRef}
            />
            {/* The way-back line is for the password leg only: on the token
             * leg the user is ALREADY in a token session — «нажмите Войти
             * вверху» would point at a button that is not there
             * (screenshot review, fix/recovery-ux). */}
            {sessionLeg ? (
              <p className="text-xs text-foreground-muted">
                {t("settings.security.recoveryLine")}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button
                type="button"
                data-testid="security-save"
                onClick={submit}
                disabled={pending}
                loading={pending}
              >
                {pending ? t("settings.security.saving") : t("settings.security.save")}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </HubSection>
  );
}
