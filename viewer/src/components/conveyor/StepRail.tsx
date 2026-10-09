import { useT } from "@/i18n";

/**
 * StepRail (U8 v12-UX-потоки) — the ONE step rail for multi-step flows,
 * the v12 wizard-steps canon (stand connect.html/tasks.html «wizard-steps»)
 * on the main construct: past steps read «✓» and stay CLICKABLE (review /
 * back — the v12 maxReached rule: you can revisit, never skip ahead),
 * the current step carries aria-current="step", future steps are DISABLED
 * (a step you have not earned is not a link). The rail is pure
 * presentation — it owns NO state; the flow's REAL operation state drives
 * the current index, so the rail can never outgrow the truth (the honest
 * light red line: progress is data-derived, never decorative).
 *
 * Keyboard/SR: native buttons keep tab/enter; the number/✓ glyph is
 * aria-hidden and each state names itself to screen readers (WCAG 1.1.1 /
 * 4.1.2); the group is an <ol> — step order is list semantics, not paint.
 */

export interface ConveyorStepDef {
  /** Stable step id (React key). */
  readonly id: string;
  /** Translated label — the caller owns the dictionary. */
  readonly label: string;
}

/** Derived rail state for one step (pure — unit-testable). */
export type StepRailState = "done" | "current" | "upcoming";

export function stepRailState(index: number, current: number): StepRailState {
  if (index < current) return "done";
  if (index === current) return "current";
  return "upcoming";
}

/**
 * The rail. `current` is the 0-based REAL step of the flow. `onStepClick`
 * enables the back/review path for DONE steps only (v12 maxReached);
 * undefined = the flow forbids revisiting (e.g. a live server operation
 * whose inputs are already submitted — going «back» would imply editing
 * facts in flight, which would be the lie).
 */
export function StepRail({
  steps,
  current,
  label,
  onStepClick,
}: {
  steps: readonly ConveyorStepDef[];
  current: number;
  /** Translated accessible name of the group («Шаги подключения»). */
  label: string;
  onStepClick?: (index: number) => void;
}) {
  const t = useT();
  return (
    <ol aria-label={label} className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {steps.map((step, index) => {
        const state = stepRailState(index, current);
        const backable = state === "done" && onStepClick !== undefined;
        const stateKey =
          state === "done"
            ? t("flows.rail.stateDone")
            : state === "current"
              ? t("flows.rail.stateCurrent")
              : t("flows.rail.stateUpcoming");
        return (
          <li key={step.id} className="flex items-center gap-1.5">
            {index > 0 ? (
              <span aria-hidden="true" className="text-foreground-muted">
                —
              </span>
            ) : null}
            <button
              type="button"
              disabled={state === "upcoming"}
              aria-current={state === "current" ? "step" : undefined}
              onClick={backable ? () => onStepClick?.(index) : undefined}
              title={
                backable
                  ? t("flows.rail.backTitle", { step: step.label })
                  : undefined
              }
              className={
                "flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-xs transition-colors duration-instant focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright " +
                (state === "current"
                  ? "border border-iris-bright/60 bg-iris/10 font-medium text-iris-bright"
                  : state === "done"
                    ? "text-foreground-secondary hover:text-foreground"
                    : "cursor-not-allowed text-foreground-muted")
              }
            >
              <span
                aria-hidden="true"
                className={
                  "flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none " +
                  (state === "current"
                    ? "border-iris-bright/60 text-iris-bright"
                    : "border-border-strong text-foreground-muted")
                }
              >
                {state === "done" ? "✓" : index + 1}
              </span>
              <span className="sr-only">{stateKey}. </span>
              {step.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
