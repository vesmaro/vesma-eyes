import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { validateRegister, isValid } from "./passwordValidation";
import type { FieldIssue } from "./passwordValidation";

/**
 * The two password forms of the /auth route (ME-080, 07k §4.1): «Вход»
 * (username + password) and «Регистрация» (username + password + confirm).
 * Pure surfaces — the submit goes to the AuthProvider's wire methods and the
 * ROUTE owns the outcomes (redirect, toast); a server refusal comes back as
 * a structured `verdict` and renders inline, never as a toast, never a
 * reload.
 *
 * A11y (07k §4.1/§4.4): every field is labelled; the password masks behind
 * type=password with an explicit eye toggle (aria-pressed, ≥24px target);
 * client validation speaks after the first blur (a field the user has not
 * left yet never shouts); issues ride aria-invalid + aria-describedby; the
 * verdict region is an aria-live="polite" line with the «Ошибка:» prefix —
 * not colour alone (WCAG 3.3.1/1.4.1); failed submits move focus to the
 * offending field.
 *
 * Client validation mirrors the server contract exactly (passwordValidation
 * is its pure core): the wire stays the authority, 422s (bounds/charset that
 * slipped past) render the server's human detail.
 */

/** Shared input look — the UiTokenLoginForm field, minus the mono face
 * (names and passwords are human words, not pasted machine values). */
const inputClass =
  "h-9 w-full rounded-md border border-border bg-well px-2 pr-9 text-sm text-foreground placeholder:text-foreground-muted focus-visible:border-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60";

/** Inline verdict the route hands back after a failed submit. */
export interface FormVerdict {
  /** The main human line (already localized). */
  text: string;
  /** Optional secondary line (server detail). */
  detail?: string;
  /** Which field receives focus when the verdict lands. */
  focus?: "username" | "password" | "confirm";
}

/** Shared one-row text field with blur-gated issue display. */
function TextField({
  id,
  testId,
  label,
  type = "text",
  value,
  onChange,
  onBlur,
  autoComplete,
  issue,
  issueText,
  disabled,
  inputRef,
  spellCheck = false,
  revealable = false,
  revealed,
  onToggleReveal,
}: {
  id: string;
  /** Stable hook for tests — the label/id stays the useId-generated pair
   * (two forms mount at once; the ME-043 duplicate-id lesson). */
  testId: string;
  label: string;
  type?: "text" | "password";
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  autoComplete: string;
  issue: FieldIssue;
  issueText: string;
  disabled: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  spellCheck?: boolean;
  revealable?: boolean;
  revealed?: boolean;
  onToggleReveal?: () => void;
}) {
  const t = useT();
  const issueId = `${id}-issue`;
  const invalid = issue !== null;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-foreground-secondary">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          data-testid={testId}
          type={revealable && revealed ? "text" : type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          spellCheck={spellCheck}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? issueId : undefined}
          className={inputClass}
        />
        {revealable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={onToggleReveal}
            aria-label={t(revealed ? "auth.route.hidePassword" : "auth.route.showPassword")}
            aria-pressed={revealed ?? false}
            className="absolute right-0.5 h-6 w-6"
          >
            {revealed ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </Button>
        ) : null}
      </div>
      {invalid ? (
        <p id={issueId} data-testid={`${testId}-issue`} className="text-xs text-error">
          {issueText}
        </p>
      ) : null}
    </div>
  );
}

/** The always-present polite live region for the submit verdict (07k §4.2:
 * the line is announced without stealing focus; «Ошибка:» prefix — the
 * verdict is never colour alone). The server's own detail rides as an
 * EXPANDABLE tech line (fix/kora-auth-honesty): collapsed by default —
 * humans read the localized verdict; the raw server words stay one click
 * away for diagnostics, with the full text on the summary's title tooltip. */
function VerdictLine({ verdict }: { verdict: FormVerdict | null }) {
  const t = useT();
  return (
    <div aria-live="polite" data-testid="auth-verdict">
      {verdict ? (
        <>
          <p className="text-xs text-error">
            <span className="font-medium">{t("auth.route.verdictPrefix")}</span>{" "}
            {verdict.text}
          </p>
          {verdict.detail ? (
            <details
              data-testid="auth-verdict-detail"
              className="mt-0.5 text-xs text-foreground-secondary"
            >
              <summary
                title={verdict.detail}
                className="cursor-pointer select-none rounded-sm underline-offset-2 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {t("auth.route.techDetail")}
              </summary>
              <p className="mt-1 break-words font-mono">{verdict.detail}</p>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Focus the first offending field after a failed submit (07k §4.2). */
function focusField(
  focus: FormVerdict["focus"],
  refs: Partial<Record<"username" | "password" | "confirm", React.RefObject<HTMLInputElement>>>,
): void {
  if (!focus) return;
  refs[focus]?.current?.focus();
}

/** Move focus to the offending field whenever a NEW verdict lands — an
 * effect (post-commit) so the verdict line exists before focus moves, and
 * the polite live region announces while the caret sits in the field. */
function useVerdictFocus(
  verdict: FormVerdict | null,
  refs: Partial<Record<"username" | "password" | "confirm", React.RefObject<HTMLInputElement>>>,
): void {
  const last = useRef<FormVerdict | null>(null);
  useEffect(() => {
    if (verdict && verdict !== last.current) focusField(verdict.focus, refs);
    last.current = verdict;
    // refs are stable per mount; the verdict object is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict]);
}

/**
 * «Вход» — username + password. Empty-only client check (an unknown name
 * must reach the SAME neutral 401 as a wrong password, never a local
 * verdict); everything else is the server's word.
 */
export function PasswordSignInForm({
  pending,
  verdict,
  onSubmit,
}: {
  pending: boolean;
  verdict: FormVerdict | null;
  onSubmit: (username: string, password: string) => void;
}) {
  const t = useT();
  const usernameId = useId();
  const passwordId = useId();
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Sign-in polices only "not empty" (07k §4.1 shape rules are for
  // registration): an unknown name must reach the SAME neutral 401 as a
  // wrong password, never a local verdict that reveals what exists.
  const usernameIssueNow =
    (submitAttempted || usernameTouched) && username.trim().length === 0 ? "required" : null;
  const passwordIssueNow =
    (submitAttempted || passwordTouched) && password.length === 0 ? "required" : null;

  // A fresh verdict moves focus to the offending field (07k §4.2).
  useVerdictFocus(verdict, { username: usernameRef, password: passwordRef });

  const submit = () => {
    setSubmitAttempted(true);
    const trimmed = username.trim();
    if (trimmed.length === 0 || password.length === 0 || pending) {
      if (trimmed.length === 0) usernameRef.current?.focus();
      else if (password.length === 0) passwordRef.current?.focus();
      return;
    }
    onSubmit(trimmed, password);
  };

  return (
    <>
      <VerdictLine verdict={verdict} />
      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <TextField
          id={usernameId}
          testId="auth-username"
          label={t("auth.route.usernameLabel")}
          value={username}
          onChange={setUsername}
          onBlur={() => setUsernameTouched(true)}
          autoComplete="username"
          issue={usernameIssueNow}
          issueText={t("auth.route.errRequiredUsername")}
          disabled={pending}
          inputRef={usernameRef}
        />
        <TextField
          id={passwordId}
          testId="auth-password"
          label={t("auth.route.passwordLabel")}
          type="password"
          value={password}
          onChange={setPassword}
          onBlur={() => setPasswordTouched(true)}
          autoComplete="current-password"
          issue={passwordIssueNow}
          issueText={t("auth.route.errRequiredPassword")}
          disabled={pending}
          inputRef={passwordRef}
          revealable
          revealed={revealed}
          onToggleReveal={() => setRevealed((current) => !current)}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? t("auth.route.signingIn") : t("login.submit")}
          </Button>
        </div>
      </form>
    </>
  );
}

/**
 * «Регистрация» — username + password + confirm, with the one product line
 * under the heading (07k §4.1: «Первый созданный аккаунт становится
 * владельцем борта»). Client validation mirrors the server contract
 * (live after the first blur); the confirm mismatch gets its own field
 * verdict, server 4xx refits come back as the route's verdict.
 */
export function PasswordRegisterForm({
  pending,
  verdict,
  note,
  onSubmit,
}: {
  pending: boolean;
  verdict: FormVerdict | null;
  /** The owner-policy product line (07k §4.1). */
  note: string;
  onSubmit: (username: string, password: string) => void;
}) {
  const t = useT();
  const usernameId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [touched, setTouched] = useState({ username: false, password: false, confirm: false });
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const validation = validateRegister(username, password, confirm);
  const live = submitAttempted || touched.username || touched.password || touched.confirm;
  const shown: typeof validation = live
    ? validation
    : { username: null, password: null, confirm: null };

  const issueText = (field: "username" | "password" | "confirm"): string => {
    switch (validation[field]) {
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

  // Verdict-focus, same pattern as the sign-in form.
  useVerdictFocus(verdict, {
    username: usernameRef,
    password: passwordRef,
    confirm: confirmRef,
  });

  const submit = () => {
    setSubmitAttempted(true);
    if (!isValid(validation) || pending) {
      // Focus the first offending field right away (client-side refusal).
      const first: FormVerdict["focus"] =
        validation.username !== null
          ? "username"
          : validation.password !== null
            ? "password"
            : validation.confirm !== null
              ? "confirm"
              : undefined;
      focusField(first, { username: usernameRef, password: passwordRef, confirm: confirmRef });
      return;
    }
    onSubmit(username.trim(), password);
  };

  return (
    <>
      <p
        data-testid="auth-route-signup-note"
        className="rounded-md bg-elevated p-2 text-xs text-foreground-secondary"
      >
        {note}
      </p>
      <VerdictLine verdict={verdict} />
      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <TextField
          id={usernameId}
          testId="auth-reg-username"
          label={t("auth.route.usernameLabel")}
          value={username}
          onChange={setUsername}
          onBlur={() => setTouched((current) => ({ ...current, username: true }))}
          autoComplete="username"
          issue={shown.username}
          issueText={issueText("username")}
          disabled={pending}
          inputRef={usernameRef}
        />
        <TextField
          id={passwordId}
          testId="auth-reg-password"
          label={t("auth.route.passwordLabel")}
          type="password"
          value={password}
          onChange={setPassword}
          onBlur={() => setTouched((current) => ({ ...current, password: true }))}
          autoComplete="new-password"
          issue={shown.password}
          issueText={issueText("password")}
          disabled={pending}
          inputRef={passwordRef}
          revealable
          revealed={revealed}
          onToggleReveal={() => setRevealed((current) => !current)}
        />
        <TextField
          id={confirmId}
          testId="auth-reg-confirm"
          label={t("auth.route.confirmLabel")}
          type="password"
          value={confirm}
          onChange={setConfirm}
          onBlur={() => setTouched((current) => ({ ...current, confirm: true }))}
          autoComplete="new-password"
          issue={shown.confirm}
          issueText={issueText("confirm")}
          disabled={pending}
          inputRef={confirmRef}
        />
        <p className="text-xs text-foreground-muted">
          {t("auth.route.passwordHint")} {t("auth.route.usernameHint")}
        </p>
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? t("auth.route.creating") : t("auth.route.registerSubmit")}
          </Button>
        </div>
      </form>
    </>
  );
}
