import { useEffect, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  EnrollmentCreatedResult,
  EnrollmentItem,
} from "@/gateway/boardTypes";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import { useValidationNow } from "@/features/tasks/useValidationClock";
import { formatTaskDate } from "@/features/tasks/taskStatus";
import { useI18n } from "@/i18n";
import { StepRail, type ConveyorStepDef } from "@/components/conveyor/StepRail";
import { useStepHeadingFocus } from "@/components/conveyor/useStepHeadingFocus";
import {
  clearConveyorDraft,
  loadConveyorDraft,
  saveConveyorDraft,
} from "@/components/conveyor/conveyorStorage";
import {
  buildBootstrapScript,
  buildBootstrapSteps,
  effectiveEnrollmentState,
  formatTtlCountdown,
  maskEnrollmentToken,
} from "./enrollment";
import { useEnrollmentActions, useEnrollments, useHonestCopy } from "./useEnrollment";
import { useExecutors } from "./useAgents";
import { HarnessSelect } from "./HarnessSelect";
import { useDefaultHarness } from "./useHarnesses";
import { useUiToken } from "@/features/ui-token/UiTokenContext";

/**
 * «Добавить исполнителя» — the enrollment conveyor (AGW-5 phase 2; U8
 * v12-UX-потоки: the v12 connect-master steps on the main engine). THREE
 * steps, ONE real operation each:
 *
 * 1. ДАННЫЕ — label (≤64), harness_hint (the LIVE dictionary combobox with
 *    free entry — wave 3C; the server 422s unknown values with the
 *    authoritative list), name_hint (optional, ≤120). The typed draft
 *    persists locally (vesmaro.flow.enrollment, NO secrets by
 *    construction) and survives a reload; the restore is NAMED with its
 *    stamp — the form does not pretend it was never closed.
 * 2. ТОКЕН — the mne_… token MASKED on screen (AGW-11: the full plaintext
 *    exists only on the clipboard via «Копировать»), the LIVE TTL countdown
 *    (mm:ss off the shared 1 Hz ticker), the live-token ≤3 counter on the
 *    form, and the VPS bootstrap block — the commands are a copy-paste
 *    projection of deploy/poller/REMOTE-EXECUTOR.md §4б/§4в (the runbook
 *    is the source of truth; this screen never invents a second one); the
 *    one-command grows --expect-fp as soon as the board's mint answer
 *    carries the CA fingerprint (AGW-9).
 * 3. ПЕРВЫЙ КОННЕКТ — the WAIT, rendered from the LIVE enrollment row (the
 *    same list query the panel below the registry reads; SSE
 *    invalidation + a slow poll while the token is live — the at-most-once
 *    stream must not freeze the wait). Every branch names a REAL state:
 *    waiting (TTL countdown), used+pending (approve CTA), used+approved,
 *    expired, revoked. No timer-driven progress — the countdown IS the
 *    token's real TTL.
 *
 * Cancel is honest at every step: closing never kills the token — the
 * panel below the registry stays the persistent surface (v12's «хост
 * останется в списке» outcome). Radix owns the focus trap / Esc / restore.
 */

const DRAFT_NAME = "enrollment";
const DRAFT_VERSION = 1;

/** The poll cadence while the watch step waits on a live token (SSE is
 * the fast path; the stream is at-most-once — the provision LIVE_POLL
 * posture). */
const WATCH_POLL_MS = 5000;

/** The step-1 form draft — secret-free by construction. */
interface EnrollmentDraft {
  readonly label: string;
  readonly harnessChoice: string;
  readonly nameHint: string;
}

const draftGuard = (value: unknown): EnrollmentDraft | null => {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<EnrollmentDraft>;
  if (
    typeof candidate.label !== "string" ||
    typeof candidate.harnessChoice !== "string" ||
    typeof candidate.nameHint !== "string"
  ) {
    return null;
  }
  return {
    label: candidate.label,
    harnessChoice: candidate.harnessChoice,
    nameHint: candidate.nameHint,
  };
};

export function EnrollmentDialog({
  open,
  onOpenChange,
  liveCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * AGW-11: live (created) token count for the ≤3 pre-flight (the server
   * 409s at the cap — the counter is UX parity, not enforcement). Absent
   * = the caller has no list yet (the counter hides, the server still
   * guards).
   */
  liveCount?: number;
}) {
  const t = useT();
  // Keyed inner component (EditTaskDialog pattern): a fresh form per open,
  // and a re-open after the token screen never shows a stale token.
  const [formKey, setFormKey] = useState(0);
  const [created, setCreated] = useState<EnrollmentCreatedResult | null>(null);
  // The REAL step of the conveyor: 0 form → 1 token → 2 first connect.
  // Keyed alongside the form so a fresh open starts the conveyor over.
  const [step, setStep] = useState(0);

  const close = (): void => {
    onOpenChange(false);
    setCreated(null);
    setStep(0);
    setFormKey((value) => value + 1);
  };

  const steps: readonly ConveyorStepDef[] = [
    { id: "form", label: t("agents.enrollment.stepForm") },
    { id: "token", label: t("agents.enrollment.stepToken") },
    { id: "connect", label: t("agents.enrollment.stepConnect") },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogTitle>{t("agents.enrollment.title")}</DialogTitle>
        {/* The rail mirrors the REAL phase — form → token → watching. The
         * rail is read-only here: «назад» после минта подразумевал бы
         * правку уже отправленных данных (второй токен), а живая установка
         * не редактируется — пересмотр пройденного шага был бы ложью. A
         * failed run (expired/revoked) restarts the conveyor explicitly. */}
        <StepRail steps={steps} current={step} label={t("agents.enrollment.railLabel")} />
        {created ? (
          <TokenScreen
            created={created}
            step={step}
            onWatch={() => setStep(2)}
            onBackToToken={() => setStep(1)}
            onDone={close}
            onRestart={() => {
              setCreated(null);
              setStep(0);
              setFormKey((value) => value + 1);
            }}
          />
        ) : (
          <EnrollmentForm
            key={formKey}
            onCreated={(result) => {
              setCreated(result);
              setStep(1);
              // The typed draft did its job — the operation is minted and
              // its state lives server-side now.
              clearConveyorDraft(DRAFT_NAME);
            }}
            onDone={close}
            liveCount={liveCount}
          />
        )}
        {/* The description stays stable across phases (Radix wants one). */}
        <DialogDescription className="sr-only">
          {t("agents.enrollment.description")}
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

/** Phase 1 — the mint form (conveyor step 1 «Данные»). */
function EnrollmentForm({
  onCreated,
  onDone,
  liveCount,
}: {
  onCreated: (created: EnrollmentCreatedResult) => void;
  onDone: () => void;
  liveCount?: number;
}) {
  const t = useT();
  const { lang } = useI18n();
  const actions = useEnrollmentActions();
  // Draft restore (the koraFrameStorage posture): a reload mid-form hands
  // the typed fields back and SAYS so — never a silent restore. The saved
  // stamp is read once with the value (the banner is data, not a clock).
  const restoredDraft = loadConveyorDraft<EnrollmentDraft>(
    DRAFT_NAME,
    DRAFT_VERSION,
    draftGuard,
  );
  const [restored, setRestored] = useState<EnrollmentDraft | null>(
    restoredDraft?.value ?? null,
  );
  const restoredAt = restoredDraft?.savedAt ?? null;
  const [label, setLabel] = useState(restored?.label ?? "");
  // Wave 3C review: the default is the first entry of the LIVE dictionary.
  const defaultHarness = useDefaultHarness();
  const [harnessChoice, setHarnessChoice] = useState<string>(restored?.harnessChoice ?? "");
  const harness = harnessChoice || defaultHarness;
  const [nameHint, setNameHint] = useState(restored?.nameHint ?? "");
  const [submitting, setSubmitting] = useState(false);
  // AGW-11: the ≤3 live-token pre-flight (ENROLLMENT_MAX_LIVE parity).
  const quotaReached = liveCount !== undefined && liveCount >= 3;

  // Persist the draft on every change (secret-free by construction). An
  // EMPTY form persists nothing — a pristine dialog must not come back as
  // a «restored draft» (the restore banner names real typed work only).
  useEffect(() => {
    if (label.trim() === "" && harnessChoice === "" && nameHint.trim() === "") {
      clearConveyorDraft(DRAFT_NAME);
      return;
    }
    saveConveyorDraft<EnrollmentDraft>(DRAFT_NAME, DRAFT_VERSION, 0, {
      label,
      harnessChoice,
      nameHint,
    });
  }, [label, harnessChoice, nameHint]);

  const startOver = (): void => {
    clearConveyorDraft(DRAFT_NAME);
    setRestored(null);
    setLabel("");
    setHarnessChoice("");
    setNameHint("");
  };

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    actions.createEnrollment(
      {
        ...(label.trim() ? { label: label.trim() } : {}),
        harness_hint: harness,
        ...(nameHint.trim() ? { name_hint: nameHint.trim() } : {}),
      },
      { onCreated, onSettled: () => setSubmitting(false) },
    );
  };

  const fieldClass =
    "h-9 rounded-md border border-border bg-background px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <DialogDescription>{t("agents.enrollment.formHint")}</DialogDescription>
      {restored !== null ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-subtle bg-well px-2 py-1.5">
          <p className="text-xs text-foreground-secondary" role="status">
            {t("flows.draft.restored", {
              time: formatTaskDate(restoredAt ?? new Date().toISOString(), lang),
            })}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-1.5 text-xs"
            onClick={startOver}
          >
            {t("flows.draft.startOver")}
          </Button>
        </div>
      ) : null}
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("agents.enrollment.label")}
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={64}
          placeholder={t("agents.enrollment.labelPlaceholder")}
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("agents.enrollment.harness")}
        <HarnessSelect
          id="enroll-harness"
          value={harness}
          onChange={setHarnessChoice}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("agents.enrollment.nameHint")}
        <input
          value={nameHint}
          onChange={(event) => setNameHint(event.target.value)}
          maxLength={120}
          className={fieldClass}
        />
      </label>
      <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
        {liveCount !== undefined ? (
          <span
            className={`mr-auto text-xs ${quotaReached ? "text-error" : "text-foreground-muted"}`}
            aria-live="polite"
          >
            {quotaReached
              ? t("agents.enrollment.quotaFull")
              : t("agents.enrollment.quotaCount", { count: liveCount })}
          </span>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          {t("agents.sheet.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={submitting || quotaReached}>
          {submitting ? t("agents.enrollment.creating") : t("agents.enrollment.create")}
        </Button>
      </div>
    </form>
  );
}

/**
 * PR #99 review P3-3: the CA fingerprint rides a COPY-PASTE shell command,
 * so its shape is validated client-side before insertion — canonical
 * ssh-keygen base64 (43 unpadded chars) or a hex64 digest, mirroring the
 * board's normalize_fingerprint accept-list. Anything else omits the
 * flag: the command degrades loudly-shorter, never injects a foreign
 * string into the owner's shell.
 */
const CA_FINGERPRINT_RE = /^SHA256:(?:[A-Za-z0-9+/]{43}|[a-fA-F0-9]{64})$/;

/** Phases 2–3 — the token screen and the first-connect wait. */
function TokenScreen({
  created,
  step,
  onWatch,
  onBackToToken,
  onRestart,
  onDone,
}: {
  created: EnrollmentCreatedResult;
  /** 1 = token screen, 2 = the wait. */
  step: number;
  onWatch: () => void;
  onBackToToken: () => void;
  onRestart: () => void;
  onDone: () => void;
}) {
  if (step === 2) {
    return (
      <ConnectWatch
        created={created}
        /* Back to the token screen while the token is live is a READ-BACK
         * (re-copy the command), not an edit — the v12 maxReached rule;
         * the watch offers it only while the token is alive. A dead token
         * restarts the conveyor instead (fresh mint). */
        onBackToToken={onBackToToken}
        onRestart={onRestart}
        onDone={onDone}
      />
    );
  }
  return <TokenBlock created={created} onWatch={onWatch} />;
}

/** Step 2 — the once-only token, the live TTL and the VPS bootstrap block. */
function TokenBlock({
  created,
  onWatch,
}: {
  created: EnrollmentCreatedResult;
  onWatch: () => void;
}) {
  const t = useT();
  const now = useValidationNow();
  // The bootstrap command shows the minted hint or the first LIVE
  // dictionary entry (wave 3C review — no hardcoded harness constant).
  const defaultHarness = useDefaultHarness();
  // Review P2-2: flash ONLY on a resolved write — clipboard absent or a
  // rejection is a visible failure (the token is shown once; a lying
  // «Скопировано» quietly loses it).
  const { copied, failed, copy } = useHonestCopy();
  const headingRef = useStepHeadingFocus(1);
  const row: EnrollmentItem = created.enrollment;

  const ttl = formatTtlCountdown(row, now);
  const state = effectiveEnrollmentState(row, now);
  const steps = buildBootstrapSteps({
    token: created.token,
    name: row.name_hint || row.label || "executor",
    harness: row.harness_hint || defaultHarness,
  });
  // Wave 3D: the ONE-COMMAND path (design §D). The bootstrap script is
  // served by the board itself (open read, no secrets inside — the token
  // travels as a CLI ARGUMENT, never a URL: ADR 0012 §9). On screen the
  // token stays MASKED like the row above (shoulder-surfing discipline);
  // the clipboard copy is a deliberate act and carries the FULL token.
  const origin = window.location.origin;
  const bootstrapName = row.name_hint || row.label || "vps-1";
  const bootstrapHarness = row.harness_hint || defaultHarness;
  // AGW-11: the CA fingerprint from the mint answer turns the installer
  // into a strict-CA run (--expect-fp). OPTIONAL until every deployed
  // board carries the AGW-9 field — absent OR malformed = the command
  // without the flag (no silent degradation, no unvalidated string in
  // a paste-ready shell line; PR #99 review P3-3).
  const expectFpRaw = created.ca_fingerprint?.trim() ?? "";
  const expectFp = CA_FINGERPRINT_RE.test(expectFpRaw) ? expectFpRaw : "";
  const expectFpArg = expectFp ? ` --expect-fp ${expectFp}` : "";
  const oneLinerArgs =
    `--url ${origin} --token ${created.token}` +
    ` --name ${bootstrapName} --harness ${bootstrapHarness}${expectFpArg}`;
  // The outer -k is honest and bounded: the installer TEXT is public and
  // secret-free, the lab TLS is self-signed (the chicken-and-egg this
  // script breaks); everything inside rides the PINNED CA + fingerprint
  // check. See REMOTE-EXECUTOR.md Путь 1.
  const oneLiner = `curl -kfsSL ${origin}/api/poller/bootstrap.sh | sudo bash -s -- ${oneLinerArgs}`;
  const oneLinerMasked =
    `curl -kfsSL ${origin}/api/poller/bootstrap.sh | sudo bash -s -- ` +
    `--url ${origin} --token ${maskEnrollmentToken(created.token)}` +
    ` --name ${bootstrapName} --harness ${bootstrapHarness}${expectFpArg}`;

  return (
    <div className="flex flex-col gap-3">
      <h2 ref={headingRef} tabIndex={-1} className="text-sm font-medium outline-none">
        {t("agents.enrollment.stepTokenTitle")}
      </h2>
      <DialogDescription>{t("agents.enrollment.tokenOnce")}</DialogDescription>

      {/* The token: ALWAYS masked on screen (AGW-11 — the full plaintext
       * exists only on the clipboard via «Копировать»); mono; copy beside,
       * never inline in the text (no accidental selection leaks). */}
      <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-background px-2 py-1.5">
        {/* aria-label: a screen reader must not read the bullet mask as
         * glyph soup — the row is labeled, the mask is visual only. */}
        <code
          className="min-w-0 flex-1 truncate font-mono text-sm"
          aria-label={t("agents.enrollment.tokenLabel")}
        >
          {/* Copy-failure UNMASKS as the last resort: the token is
           * one-time — losing it to a broken clipboard is worse than the
           * shoulder-surfing window (the copyFailedToken text stays true). */}
          {failed ? created.token : maskEnrollmentToken(created.token)}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => copy("token", created.token)}
        >
          {copied === "token" ? (
            <Check className="size-3.5" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )}
          {copied === "token"
            ? t("agents.enrollment.copied")
            : t("agents.enrollment.copy")}
        </Button>
      </div>

      {/* Review P2-2: the honest failure path — the token is STILL on
       * screen (the dialog stays open, the code is selectable), the owner
       * just has to select it by hand. */}
      {failed ? (
        <p role="alert" className="text-xs text-error">
          {t("agents.enrollment.copyFailedToken")}
        </p>
      ) : null}

      {/* Live TTL: mm:ss off the shared ticker; past-TTL reads «истёк» via
       * the effective state even before the sweeper frame arrives. */}
      <p className="font-mono text-xs text-foreground-secondary">
        {state === "created" && ttl !== null
          ? t("agents.enrollment.ttl", { time: ttl })
          : t(`agents.enrollment.state.${state}` as TranslationKey)}
      </p>

      {/* Wave 3D: the ONE COMMAND. --url must be the address THIS machine
       * resolves — the overlay address may differ from the browser's. */}
      <div className="rounded-md border border-border-subtle bg-well">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <p className="text-sm font-medium text-foreground-secondary">
            {t("agents.enrollment.bootstrapTitle")}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            onClick={() => copy("one-liner", oneLiner)}
          >
            {copied === "one-liner" ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <Copy className="size-3.5" aria-hidden="true" />
            )}
            {copied === "one-liner"
              ? t("agents.enrollment.copied")
              : t("agents.enrollment.copy")}
          </Button>
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all border-t border-border-subtle px-3 py-2 font-mono text-xs text-foreground-secondary">
          {oneLinerMasked}
        </pre>
        <p className="px-3 pb-2 text-xs text-foreground-muted">
          {t("agents.enrollment.oneLinerHint")}{" "}
          {t("agents.enrollment.tokenInCopyNote")}
        </p>
      </div>

      {/* The honest manual path (REMOTE-EXECUTOR.md §3-§4) — diagnostics
       * and air-gapped installs; collapsed, never deleted. */}
      <details className="rounded-md border border-border-subtle">
        <summary className="cursor-pointer px-3 py-1.5 text-sm text-foreground-secondary">
          {t("agents.enrollment.manualToggle")}
        </summary>
        <div className="border-t border-border-subtle bg-well">
          <div className="flex items-center justify-end px-3 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => copy("all", buildBootstrapScript(steps))}
            >
              {copied === "all" ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
              {copied === "all"
                ? t("agents.enrollment.copied")
                : t("agents.enrollment.copyAll")}
            </Button>
          </div>
          <ol className="space-y-2 border-t border-border-subtle px-3 py-2">
            {steps.map((step, index) => (
              <li key={index} className="flex items-start gap-2">
                <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-foreground-secondary">
                  {step.split(created.token).join(maskEnrollmentToken(created.token))}
                </pre>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-1.5 text-xs"
                  aria-label={t("agents.enrollment.copyStepAria", { step: index + 1 })}
                  onClick={() => copy(`step-${index}`, step)}
                >
                  {copied === `step-${index}` ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="size-3.5" aria-hidden="true" />
                  )}
                </Button>
              </li>
            ))}
          </ol>
        </div>
      </details>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onWatch}>
          {t("agents.enrollment.watch")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Step 3 — the FIRST-CONNECT WAIT. Every line renders from a REAL state:
 * the live enrollment row (the same query the panel below the registry
 * reads) and the minted executor row (the same registry list). The slow
 * poll exists because the SSE stream is at-most-once — a dropped frame
 * must not freeze the wait (the provision LIVE_POLL posture). No
 * spinner-as-progress: the TTL countdown IS the token's real remaining
 * life, and the branch texts name exactly what happened.
 */
function ConnectWatch({
  created,
  onBackToToken,
  onRestart,
  onDone,
}: {
  created: EnrollmentCreatedResult;
  onBackToToken: () => void;
  onRestart: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const uiToken = useUiToken();
  const now = useValidationNow();
  const headingRef = useStepHeadingFocus(2);
  const row: EnrollmentItem = created.enrollment;

  // The wait watches the SAME queries the registry page holds (one
  // implementation of the enrollment/registry truth); while the token is
  // live both also poll slowly — the at-most-once stream can drop frames.
  const enrollments = useEnrollments({ tokenPresent: uiToken.tokenPresent });
  const executors = useExecutors();
  const liveRow = enrollments.data?.items.find(
    (item) => item.enrollment_id === row.enrollment_id,
  );
  const viewRow = liveRow ?? row;
  const state = effectiveEnrollmentState(viewRow, now);
  const stillLive = state === "created";

  useEffect(() => {
    if (!stillLive) return;
    const timer = window.setInterval(() => {
      void enrollments.refetch();
      void executors.refetch();
    }, WATCH_POLL_MS);
    return () => window.clearInterval(timer);
  }, [stillLive, enrollments.refetch, executors.refetch]);

  const mintedId = viewRow.executor_id;
  const minted = mintedId
    ? (executors.data?.items.find((executor) => executor.id === mintedId) ?? null)
    : null;
  const ttl = formatTtlCountdown(viewRow, now);

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <h2 ref={headingRef} tabIndex={-1} className="text-sm font-medium outline-none">
        {t("agents.enrollment.stepConnectTitle", {
          label: viewRow.label || viewRow.name_hint || viewRow.enrollment_id,
        })}
      </h2>

      {state === "created" ? (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-well p-3">
          <p className="text-sm text-foreground-secondary">
            {t("agents.enrollment.watchWaiting")}
          </p>
          {ttl !== null ? (
            <p className="font-mono text-xs text-foreground-secondary">
              {t("agents.enrollment.ttl", { time: ttl })}
            </p>
          ) : null}
          <p className="text-xs text-foreground-muted">
            {t("agents.enrollment.watchPollNote")}
          </p>
        </div>
      ) : null}

      {state === "used" && minted !== null && minted.state === "pending" ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md border border-iris-bright/40 bg-elevated p-3"
        >
          <p className="text-sm font-medium">
            {t("agents.enrollment.watchConnected", { name: minted.name })}
          </p>
          <p className="text-xs text-foreground-secondary">
            {t("agents.enrollment.watchApproveNote")}
          </p>
          <div>
            <Button asChild variant="outline" size="sm">
              <a href="/agents/harnesses">
                <Link2 className="size-3.5" aria-hidden="true" />
                {t("agents.enrollment.watchOpenRegistry")}
              </a>
            </Button>
          </div>
        </div>
      ) : null}

      {state === "used" && minted !== null && minted.state !== "pending" ? (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-md border border-iris-bright/40 bg-elevated p-3"
        >
          <p className="text-sm font-medium">
            {t("agents.enrollment.watchApproved", { name: minted.name })}
          </p>
        </div>
      ) : null}

      {state === "used" && minted === null ? (
        <div role="status" className="rounded-md border border-border-subtle bg-well p-3">
          <p className="text-sm text-foreground-secondary">
            {t("agents.enrollment.watchUsedNoRow")}
          </p>
        </div>
      ) : null}

      {state === "expired" ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-error/40 bg-elevated p-3"
        >
          <p className="text-sm font-medium">{t("agents.enrollment.watchExpired")}</p>
          <p className="text-xs text-foreground-secondary">
            {t("agents.enrollment.watchExpiredHint")}
          </p>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={onRestart}>
              {t("agents.enrollment.watchRestart")}
            </Button>
          </div>
        </div>
      ) : null}

      {state === "revoked" ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-error/40 bg-elevated p-3"
        >
          <p className="text-sm font-medium">{t("agents.enrollment.watchRevoked")}</p>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={onRestart}>
              {t("agents.enrollment.watchRestart")}
            </Button>
          </div>
        </div>
      ) : null}

      {enrollments.isError ? (
        <p role="alert" className="text-xs text-error">
          {t("agents.enrollment.watchListError", {
            message: enrollments.error instanceof Error ? enrollments.error.message : "",
          })}
        </p>
      ) : null}

      {/* Honest cancel: closing never kills the token — the panel below
       * the registry keeps watching (the v12 «останется в списке»). */}
      <p className="text-xs text-foreground-muted">
        {t("agents.enrollment.cancelNote", {
          time: formatTaskDate(viewRow.expires_at, lang),
        })}
      </p>

      <div className="flex items-center justify-end gap-2">
        {state === "created" ? (
          <Button type="button" variant="outline" size="sm" onClick={onBackToToken}>
            {t("agents.enrollment.backToToken")}
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          {t("agents.enrollment.done")}
        </Button>
      </div>
    </div>
  );
}
