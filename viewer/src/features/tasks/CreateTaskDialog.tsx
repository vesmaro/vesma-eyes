import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import { StepRail, type ConveyorStepDef } from "@/components/conveyor/StepRail";
import { useStepHeadingFocus } from "@/components/conveyor/useStepHeadingFocus";
import {
  clearConveyorDraft,
  loadConveyorDraft,
  saveConveyorDraft,
} from "@/components/conveyor/conveyorStorage";
import type { ExecutorItem } from "@/gateway/boardTypes";
import { useExecutors } from "@/features/agents/useAgents";
import { HarnessSelect } from "@/features/agents/HarnessSelect";
import { useDefaultHarness } from "@/features/agents/useHarnesses";
import { useAssignmentMutations } from "@/features/agents/useAssignmentMutations";
import { useBoardTasks } from "./useTasks";
import { useTaskMutations } from "./useTaskMutations";
import { formatTaskDate } from "./taskStatus";

/**
 * New-task conveyor (Ф3; U8 v12-UX-потоки — the v12 task wizard «Что → Кому
 * → Проверка» on the main engine). Owner decision intact: tasks are created
 * DIRECTLY via `POST /api/tasks` — the first line of the raw text becomes
 * the title, the rest the summary; project and mnemos_tags attach as
 * metadata. The wizard ADDS the v12 «Кому» step on the REAL assignment
 * engine (§2.4 creation lives on the task — the AssignExecutorSheet stays
 * the only OTHER place assignments are created; this wizard rides the SAME
 * `useAssignmentMutations.createAssignment` mutation, one implementation of
 * the operation):
 *
 * 1. ЧТО — text (title+summary), project, tags. The typed draft persists
 *    locally (vesmaro.flow.taskcreate — NO secrets by construction) and
 *    survives a reload; the restore is NAMED with its stamp.
 * 2. КОМУ — radio cards with an HONEST start promise each (the v12 canon):
 *    «В очередь без исполнителя» is the equal first-class default; an
 *    online executor promises «начнётся после ближайшего доклада», an
 *    offline one «встанет в очередь — заберёт при возвращении». A direct
 *    hand-off reveals the fields the assignment engine REALLY needs
 *    (specialist min_length=1 on the wire, harness from the live
 *    dictionary) — a step the operation did not earn does not exist.
 * 3. ПРОВЕРКА — the summary of what will actually travel, then one real
 *    submit: create the task, and (executor path) queue the assignment
 *    through the same gated mutation. If the task exists but the hand-off
 *    fails, the dialog says so and names the way out (the task card) —
 *    the task is never silently re-created.
 *
 * Validation mirrors the wire (TaskCreate): title 1..200 chars — enforced
 * on the first line BEFORE any request; empty text never leaves the dialog.
 */

const TITLE_MAX = 200;

export interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTaskDialog({ open, onOpenChange }: CreateTaskDialogProps) {
  const t = useT();
  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-iris">
            <Plus className="size-5" aria-hidden="true" />
            <DialogTitle>{t("tasks.create.title")}</DialogTitle>
          </div>
          <DialogDescription>{t("tasks.create.description")}</DialogDescription>
        </DialogHeader>
        <CreateTaskWizard onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** The step-1..2 draft — secret-free by construction (no secrets exist
 * on this flow; the guard keeps yesterday's shape out regardless). */
interface TaskDraft {
  readonly text: string;
  readonly project: string;
  readonly tags: string;
  readonly assignee: string;
  readonly executorId: string;
  readonly specialist: string;
  readonly harness: string;
}

const DRAFT_NAME = "taskcreate";
const DRAFT_VERSION = 1;

const draftGuard = (value: unknown): TaskDraft | null => {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<TaskDraft>;
  const strings = [
    candidate.text,
    candidate.project,
    candidate.tags,
    candidate.assignee,
    candidate.executorId,
    candidate.specialist,
    candidate.harness,
  ];
  if (strings.some((field) => typeof field !== "string")) return null;
  return {
    text: candidate.text!,
    project: candidate.project!,
    tags: candidate.tags!,
    assignee: candidate.assignee!,
    executorId: candidate.executorId!,
    specialist: candidate.specialist!,
    harness: candidate.harness!,
  };
};

function CreateTaskWizard({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { lang } = useI18n();
  const { createTask } = useTaskMutations();
  const assignmentMutations = useAssignmentMutations();
  const board = useBoardTasks();
  const executors = useExecutors();
  const defaultHarness = useDefaultHarness();

  // Draft restore (the conveyor-kit posture): named, stamped, explicit.
  const restoredDraft = loadConveyorDraft<TaskDraft>(DRAFT_NAME, DRAFT_VERSION, draftGuard);
  const [restored, setRestored] = useState<TaskDraft | null>(restoredDraft?.value ?? null);
  const restoredAt = restoredDraft?.savedAt ?? null;

  const [step, setStep] = useState(0);
  const [text, setText] = useState(restored?.text ?? "");
  const [project, setProject] = useState(restored?.project ?? "");
  const [tags, setTags] = useState(restored?.tags ?? "");
  const [textError, setTextError] = useState(false);
  // «Кому»: the queue is the equal first-class default (the v12 canon).
  const [assignee, setAssignee] = useState<string>(restored?.assignee ?? "queue");
  const [executorId, setExecutorId] = useState(restored?.executorId ?? "");
  const [specialist, setSpecialist] = useState(restored?.specialist ?? "");
  const [specialistError, setSpecialistError] = useState(false);
  const [harnessChoice, setHarnessChoice] = useState<string>(restored?.harness ?? "");
  const harness = harnessChoice || defaultHarness;
  // The honest leg-failure line: the task EXISTS, the hand-off did not land.
  const [legFailedTaskId, setLegFailedTaskId] = useState<string | null>(null);

  useEffect(() => {
    const empty =
      text.trim() === "" &&
      project.trim() === "" &&
      tags.trim() === "" &&
      assignee === "queue" &&
      specialist.trim() === "";
    if (empty) {
      clearConveyorDraft(DRAFT_NAME);
      return;
    }
    saveConveyorDraft<TaskDraft>(DRAFT_NAME, DRAFT_VERSION, step, {
      text,
      project,
      tags,
      assignee,
      executorId,
      specialist,
      harness: harnessChoice,
    });
  }, [text, project, tags, assignee, executorId, specialist, harnessChoice, step]);

  const title = (text.split("\n")[0] ?? "").trim();
  const summary = text.split("\n").slice(1).join("\n").trim();
  const titleValid = title.length > 0 && title.length <= TITLE_MAX;

  const executorRows = executors.data?.items ?? [];
  const executorName = (id: string): string =>
    executorRows.find((row) => row.id === id)?.name ?? id;

  /** Specialist candidates: the board union (a NEW task has none of its
   * own — the same source the assign sheet's datalist reads). */
  const specialistChoices = useMemo(() => {
    const union = new Set<string>();
    for (const row of board.data?.tasks ?? []) {
      for (const name of row.specialists ?? []) {
        if (name.trim().length > 0) union.add(name);
      }
    }
    return [...union].sort();
  }, [board.data]);

  const projectChoices = [
    ...new Set((board.data?.tasks ?? []).map((row) => row.project).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  /** The v12 start promise — one card, one honest moment of start. Only a
   * CONFIRMED-online agent promises the near-term start; stale/offline/
   * unknown all read «заберёт при возвращении» (a stale agent cannot
   * honestly promise «после ближайшего доклада»). */
  const startPromiseKey = (executor: ExecutorItem): TranslationKey => {
    if (executor.state !== "approved" || !executor.enabled)
      return executor.state === "pending"
        ? "agents.executor.pendingReason"
        : executor.state === "revoked"
          ? "agents.executor.revokedReason"
          : "agents.executor.disabledReason";
    return executor.presence === "online"
      ? "tasks.create.startLive"
      : "tasks.create.startOffline";
  };
  const executorSelectable = (executor: ExecutorItem): boolean =>
    executor.state === "approved" && executor.enabled;

  const steps: readonly ConveyorStepDef[] = [
    { id: "what", label: t("tasks.create.stepWhat") },
    { id: "whom", label: t("tasks.create.stepWhom") },
    { id: "review", label: t("tasks.create.stepReview") },
  ];
  const headingRef = useStepHeadingFocus(step);

  const goNext = (): void => {
    if (step === 0) {
      if (!titleValid) {
        setTextError(true);
        return;
      }
      setTextError(false);
    }
    if (step === 1 && assignee === "executor") {
      // The assignment engine refuses an empty specialist (min_length=1) —
      // the gate is REAL, mirrored here before anything travels.
      if (specialist.trim().length === 0 || specialist.trim().length > 120) {
        setSpecialistError(true);
        return;
      }
    }
    setSpecialistError(false);
    setStep((current) => Math.min(current + 1, 2));
  };

  const submit = (): void => {
    if (!titleValid) {
      setTextError(true);
      setStep(0);
      return;
    }
    createTask(
      {
        title,
        summary,
        spec: "",
        col: "open",
        priority: "normal",
        env: "unknown",
        agents: [],
        specialists: [],
        project: project.trim(),
        memory_ids: [],
        mnemos_tags: tags
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part.length > 0),
      },
      // Success (direct or after the token-panel retry): the queue path is
      // DONE here; the executor path hands off through the SAME gated
      // mutation the assign sheet rides — closing only when the assignment
      // is actually queued (a failure leaves the task created and the
      // dialog honest about it).
      (created) => {
        if (assignee !== "executor" || executorId === "") {
          clearConveyorDraft(DRAFT_NAME);
          onClose();
          return;
        }
        let queued = false;
        assignmentMutations.createAssignment(
          created,
          {
            task_id: created.id,
            specialist: specialist.trim(),
            harness,
            executor_id: executorId,
          },
          {
            onQueued: () => {
              queued = true;
              clearConveyorDraft(DRAFT_NAME);
              onClose();
            },
            onSettled: () => {
              if (!queued) setLegFailedTaskId(created.id);
            },
          },
        );
      },
    );
  };

  const inputClass =
    "min-h-12 md:min-h-9 w-full rounded-md border bg-well px-2 py-1.5 text-sm text-foreground placeholder:text-foreground-muted focus-visible:border-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright ";

  return (
    <div className="space-y-3">
      <StepRail
        steps={steps}
        current={step}
        label={t("tasks.create.conveyorLabel")}
        onStepClick={(index) => setStep(index)}
      />

      {/* Draft restore: named and stamped — never a silent refilling of the
       * form (the shared flows.draft copy — ONE restore concept). */}
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
            onClick={() => {
              clearConveyorDraft(DRAFT_NAME);
              setRestored(null);
              setText("");
              setProject("");
              setTags("");
              setAssignee("queue");
              setExecutorId("");
              setSpecialist("");
              setHarnessChoice("");
              setStep(0);
            }}
          >
            {t("flows.draft.startOver")}
          </Button>
        </div>
      ) : null}

      {/* Step 1 — ЧТО (the Ф3 direct-creation form, unchanged semantics). */}
      {step === 0 ? (
        <div role="group" aria-labelledby="create-step-what">
          <h2
            id="create-step-what"
            ref={headingRef}
            tabIndex={-1}
            className="text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
          >
            {t("tasks.create.whatTitle")}
          </h2>
          <div className="mt-2 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="create-text" className="text-xs text-foreground-secondary">
                {t("tasks.create.textLabel")}
              </label>
              <textarea
                id="create-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={6}
                aria-invalid={textError}
                aria-describedby={textError ? "create-text-error" : "create-text-hint"}
                placeholder={t("tasks.create.textPlaceholder")}
                autoFocus
                className={
                  inputClass + (textError ? " border-error" : " border-border")
                }
              />
              {textError ? (
                <p id="create-text-error" role="alert" className="text-xs text-error">
                  {t("tasks.create.textError")}
                </p>
              ) : (
                <p id="create-text-hint" className="text-xs text-foreground-muted">
                  {t("tasks.create.textHint")}
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="create-project" className="text-xs text-foreground-secondary">
                  {t("tasks.create.projectLabel")}
                </label>
                <input
                  id="create-project"
                  value={project}
                  onChange={(event) => setProject(event.target.value)}
                  list="create-project-choices"
                  className={inputClass + " border-border"}
                />
                <datalist id="create-project-choices">
                  {projectChoices.map((choice) => (
                    <option key={choice} value={choice} />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="create-tags" className="text-xs text-foreground-secondary">
                  {t("tasks.create.tagsLabel")}
                </label>
                <input
                  id="create-tags"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder={t("tasks.edit.listPlaceholder")}
                  className={inputClass + " border-border"}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Step 2 — КОМУ (the v12 radio-cards with honest start promises). */}
      {step === 1 ? (
        <div role="group" aria-labelledby="create-step-whom">
          <h2
            id="create-step-whom"
            ref={headingRef}
            tabIndex={-1}
            className="text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
          >
            {t("tasks.create.whomTitle")}
          </h2>
          <p className="mt-1 text-xs text-foreground-secondary">
            {t("tasks.create.whomSub")}
          </p>
          <fieldset className="mt-2 rounded-md border border-border-subtle p-3">
            <legend className="px-1 text-xs font-medium text-foreground-secondary">
              {t("tasks.create.stepWhom")}
            </legend>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              <label className="flex cursor-pointer items-start gap-2 rounded-sm p-1.5 hover:bg-elevated">
                <input
                  type="radio"
                  name="create-assignee"
                  checked={assignee === "queue"}
                  onChange={() => {
                    setAssignee("queue");
                    setSpecialistError(false);
                  }}
                  className="mt-1 accent-iris-bright"
                />
                <span className="text-sm">
                  <span className="font-medium">{t("tasks.create.queueChoice")}</span>
                  <span className="block text-xs text-foreground-secondary">
                    {t("tasks.create.queueNote")}
                  </span>
                </span>
              </label>
              {executorRows.map((executor) => {
                const selectable = executorSelectable(executor);
                return (
                  <label
                    key={executor.id}
                    className={
                      "flex items-start gap-2 rounded-sm p-1.5 " +
                      (selectable
                        ? "cursor-pointer hover:bg-elevated"
                        : "cursor-not-allowed opacity-70")
                    }
                  >
                    <input
                      type="radio"
                      name="create-assignee"
                      checked={assignee === "executor" && executorId === executor.id}
                      disabled={!selectable}
                      onChange={() => {
                        setAssignee("executor");
                        setExecutorId(executor.id);
                      }}
                      className="mt-1 accent-iris-bright"
                    />
                    <span className="min-w-0 text-sm">
                      <span className="font-medium">{executor.name}</span>
                      <span className="block text-xs text-foreground-secondary">
                        {t(startPromiseKey(executor))}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* The direct hand-off reveals the fields the assignment engine
           * REALLY requires — no hidden contracts, no invented defaults. */}
          {assignee === "executor" ? (
            <div className="mt-2 rounded-md border border-border-subtle bg-elevated p-3">
              <p className="text-xs text-foreground-secondary">
                {t("tasks.create.assignHint", {
                  name: executorName(executorId),
                })}
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="create-specialist" className="text-xs text-foreground-secondary">
                    {t("agents.sheet.specialistLabel")}
                  </label>
                  <input
                    id="create-specialist"
                    value={specialist}
                    onChange={(event) => {
                      setSpecialist(event.target.value);
                      setSpecialistError(false);
                    }}
                    list="create-specialist-choices"
                    aria-invalid={specialistError}
                    aria-describedby={specialistError ? "create-specialist-error" : undefined}
                    className={
                      inputClass +
                      (specialistError ? " border-error" : " border-border")
                    }
                  />
                  <datalist id="create-specialist-choices">
                    {specialistChoices.map((choice) => (
                      <option key={choice} value={choice} />
                    ))}
                  </datalist>
                  {specialistError ? (
                    <p id="create-specialist-error" role="alert" className="text-xs text-error">
                      {t("tasks.create.specialistError")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="create-harness" className="text-xs text-foreground-secondary">
                    {t("agents.sheet.harnessLabel")}
                  </label>
                  <HarnessSelect id="create-harness" value={harness} onChange={setHarnessChoice} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Step 3 — ПРОВЕРКА (the summary of what will actually travel). */}
      {step === 2 ? (
        <div role="group" aria-labelledby="create-step-review">
          <h2
            id="create-step-review"
            ref={headingRef}
            tabIndex={-1}
            className="text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
          >
            {t("tasks.create.stepReview")}
          </h2>
          {legFailedTaskId !== null ? (
            <p role="alert" className="mt-2 rounded-md border border-error/40 bg-well px-2 py-1.5 text-xs text-error">
              {t("tasks.create.assignmentFailed", { id: legFailedTaskId })}
            </p>
          ) : null}
          <dl className="mt-2 space-y-2 text-sm">
            <div>
              <dt className="text-xs font-medium text-foreground-secondary">
                {t("tasks.create.sumWhat")}
              </dt>
              <dd className="font-medium">{title}</dd>
              {summary !== "" ? (
                <dd className="whitespace-pre-wrap text-xs text-foreground-secondary">
                  {summary}
                </dd>
              ) : null}
            </div>
            {project.trim() !== "" ? (
              <div>
                <dt className="text-xs font-medium text-foreground-secondary">
                  {t("tasks.create.projectLabel")}
                </dt>
                <dd className="font-mono text-xs">{project.trim()}</dd>
              </div>
            ) : null}
            {tags.trim() !== "" ? (
              <div>
                <dt className="text-xs font-medium text-foreground-secondary">
                  {t("tasks.create.sumTags")}
                </dt>
                <dd className="font-mono text-xs">{tags.trim()}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-medium text-foreground-secondary">
                {t("tasks.create.stepWhom")}
              </dt>
              {assignee === "queue" || executorId === "" ? (
                <dd>{t("tasks.create.whomQueue")}</dd>
              ) : (
                <dd>
                  {t("tasks.create.whomExecutor", {
                    name: executorName(executorId),
                    specialist: specialist.trim(),
                    harness,
                  })}
                </dd>
              )}
            </div>
          </dl>
        </div>
      ) : null}

      {/* The wizard foot: back lives on the rail (done steps), forward is
       * the step's one honest action; the last step submits for real. */}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t("tasks.edit.cancel")}
        </Button>
        {step < 2 ? (
          <Button type="button" size="sm" onClick={goNext}>
            {t("tasks.create.next")}
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={submit}>
            {assignee === "executor" && executorId !== ""
              ? t("tasks.create.give")
              : t("tasks.create.submit")}
          </Button>
        )}
      </div>
    </div>
  );
}
