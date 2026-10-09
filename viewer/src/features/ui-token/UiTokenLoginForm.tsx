import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

/**
 * The ONE login form of the app (union И1, «одна реализация на понятие»):
 * the LoginDialog and the /auth route host the same field, hint and verdict
 * beats, so the two surfaces cannot drift. State machine, verify-at-the-door
 * and storage all stay in the UiTokenGate — this component only renders
 * what the gate state says and reports the submit.
 *
 * A11y: the value is masked behind type=password with an explicit reveal
 * toggle (aria-pressed, 24px target), the submit is a native form (Enter
 * works), the server refusal renders as an inline `role="alert"` line —
 * never a toast, never a page reload.
 */
export interface UiTokenLoginFormProps {
  /** «Войти»: verify against the server; the gate retries any queued
   * action after a 200 and re-renders the hosts. */
  onSubmitToken: (value: string) => void;
  /** Server verify in flight (ADR 0014 Ф1) — field + buttons disabled. */
  verifyPending?: boolean;
  /** Which refusal beat applies: "verify" = refused at the door (the
   * value/class was wrong), "session" = the mid-flight «сессия истекла». */
  rejectKind?: "verify" | "session";
  /** Server-provided detail for the rejected case (optional). */
  rejectDetail?: string;
  /** The secondary action beside the submit — «continue read-only» in the
   * dialog, «back to the board» on the /auth route. */
  secondaryLabel: string;
  onSecondary: () => void;
}

export function UiTokenLoginForm({
  onSubmitToken,
  verifyPending = false,
  rejectKind,
  rejectDetail,
  secondaryLabel,
  onSecondary,
}: UiTokenLoginFormProps) {
  const t = useT();
  // Cascade P3 (ME-043): the dialog and the /auth route host this form —
  // useId keeps the label/input/describedby wiring unique per host instance
  // (fixed ids duplicated across the two mounted surfaces broke the
  // label→control association). data-testid stays the stable test hook.
  const valueId = useId();
  const hintId = useId();
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);

  // The field resets through the callbacks (submit / secondary), never
  // through an effect: a half-typed secret never survives the surface
  // either way. A verify in flight owns the surface (no dismissal).
  const secondary = () => {
    if (verifyPending) return;
    onSecondary();
    setValue("");
    setReveal(false);
  };

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || verifyPending) return;
    onSubmitToken(trimmed);
    setValue("");
  };

  return (
    <>
      {/* Inline sign-in error — two distinct beats (ADR 0014): refused
       * AT THE DOOR (wrong value or a machine-class token) vs the
       * mid-flight «сессия истекла». Assertive, inside the surface. */}
      {rejectKind ? (
        <>
          <p role="alert" className="text-xs text-error">
            {t(rejectKind === "session" ? "login.sessionExpired" : "login.rejected")}
          </p>
          {rejectDetail ? (
            <p className="text-xs text-foreground-secondary">{rejectDetail}</p>
          ) : null}
        </>
      ) : null}

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={valueId} className="text-xs text-foreground-secondary">
            {t("login.fieldLabel")}
          </label>
          <div className="flex items-center gap-1">
            <input
              id={valueId}
              data-testid="login-token-value"
              // Masked by default — the value is a secret; the reveal
              // toggle is the explicit, user-driven exception.
              type={reveal ? "text" : "password"}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              disabled={verifyPending}
              aria-describedby={hintId}
              className="h-12 md:h-9 min-w-0 flex-1 rounded-md border border-border bg-well px-2 font-mono text-sm text-foreground focus-visible:border-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={verifyPending}
              onClick={() => setReveal((current) => !current)}
              aria-label={t(reveal ? "login.hideValue" : "login.showValue")}
              aria-pressed={reveal}
            >
              {reveal ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        {/* ME-028: the guidance leads («спросите у администратора»); the
         * kubectl command sits under a native disclosure — closed by
         * default, so the surface no longer opens with a wall of shell, but
         * it stays one click away for the admin (content remains in the
         * DOM and the a11y tree). */}
        <p
          id={hintId}
          className="rounded-md bg-elevated p-2 text-xs text-foreground-muted"
        >
          {t("login.hint")}
        </p>
        <details className="rounded-md bg-elevated px-2 py-1.5 text-xs text-foreground-muted">
          <summary className="cursor-pointer select-none rounded-sm py-0.5 text-foreground-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {t("login.hintCommandSummary")}
          </summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground-muted">
            {t("login.hintCommand")}
          </pre>
        </details>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={secondary} disabled={verifyPending}>
            {secondaryLabel}
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={verifyPending || value.trim().length === 0}
          >
            {verifyPending ? t("login.verifying") : t("login.submit")}
          </Button>
        </div>
      </form>
    </>
  );
}
