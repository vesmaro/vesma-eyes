import { LogIn } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n";
import { UiTokenLoginForm } from "./UiTokenLoginForm";
import type { UiTokenWindowReason } from "./uiTokenGate";

/**
 * The ONE login window of the app (Ф3, fix/login-window redesign; the form
 * body itself lives in UiTokenLoginForm — the /auth route hosts the same
 * beats, union И1). A plain sign-in dialog the user opens from the TopBar
 * («Войти») or that opens itself when a mutation needs a ui token — same
 * window either way, the contextual line is the only difference. Read-only
 * pages stay mounted and browsable underneath.
 *
 * A11y: Radix Dialog (Esc, cross, focus trap, aria-modal free), the value is
 * masked behind type=password with an explicit reveal toggle, the submit is
 * a native form (Enter works), focus lands in the token field on open, and
 * the server-rejected case surfaces as an inline `role="alert"` line —
 * never a toast, never a page reload.
 */
export interface LoginDialogProps {
  /** Window visibility (gate state). */
  open: boolean;
  /** Why the window is up — drives the contextual line / inline error. */
  reason: UiTokenWindowReason;
  /** Server verify in flight (ADR 0014 Ф1) — submit + field disabled. */
  verifyPending?: boolean;
  /** Which refusal beat applies: "verify" = refused at the door (the
   * value/class was wrong), "session" = the mid-flight «сессия истекла»
   * (a stored token rotted or the session idled out). */
  rejectKind?: "verify" | "session";
  /** «Войти»: verify against the server; the gate retries any queued
   * action after a 200. */
  onSubmitToken: (value: string) => void;
  /** Esc / cross / «continue read-only»: drop any queued action, close. */
  onDismiss: () => void;
  /** Server-provided detail for the rejected case (optional). */
  rejectDetail?: string;
}

export function LoginDialog({
  open,
  reason,
  verifyPending = false,
  rejectKind,
  onSubmitToken,
  onDismiss,
  rejectDetail,
}: LoginDialogProps) {
  const t = useT();

  // The field resets through the form's own callbacks (submit / secondary),
  // never through an effect: a half-typed secret never survives the window.
  const dismiss = () => {
    if (verifyPending) return; // a verify in flight owns the window
    onDismiss();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent data-testid="login-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2 text-iris">
            <LogIn className="size-5" aria-hidden="true" />
            <DialogTitle>{t("login.title")}</DialogTitle>
          </div>
          <DialogDescription>{t("login.description")}</DialogDescription>
        </DialogHeader>

        {/* The mutation-driven context: the SAME window, plus this line so
         * the user knows their action will not be lost. */}
        {reason !== "manual" ? (
          <p className="rounded-md bg-elevated p-2 text-xs text-foreground-secondary">
            {t("login.continueQueued")}
          </p>
        ) : null}

        <UiTokenLoginForm
          onSubmitToken={onSubmitToken}
          verifyPending={verifyPending}
          // A rejected window always carries a beat; a legacy harness that
          // mounts it without one gets the at-the-door text (the default).
          rejectKind={reason === "rejected" ? (rejectKind ?? "verify") : undefined}
          rejectDetail={rejectDetail}
          secondaryLabel={t("login.continueReadOnly")}
          onSecondary={dismiss}
        />
      </DialogContent>
    </Dialog>
  );
}
