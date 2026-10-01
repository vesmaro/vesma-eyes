import { useMemo } from "react";
import { useI18n, useT } from "@/i18n";
import type { ActivityPulseSlot } from "./activityUrl";
import { formatClockTime } from "./activityGrammar";

/**
 * Ф2 «Суточный пульс» (UI-28 spec §4 variant A): a quiet 24-hour histogram
 * above the feed. Height = event count; the three family segments use the
 * EXISTING semantic tokens (task → iris, assignment → confidence,
 * report → success) and are never the only encoding — the text legend and
 * every bar's aria-label carry the numbers (WCAG 1.4.1). Every bar is a
 * BUTTON (§5.3): focusable, aria-labelled (activity.chart.barAria), click
 * toggles the hour window filter (`?from=&to=`); the selected bar is
 * pressed + ringed. Reduced motion (media + vesmaro.motion) drops the one
 * height transition — nothing else ever animates (§8.10).
 */

export interface ActivityPulseChartProps {
  /** Full axis slots, oldest → newest (buildPulseAxis). */
  readonly slots: readonly ActivityPulseSlot[];
  /** Hours per bar (1 = hourly, 2 = the <640px coalesced variant). */
  readonly groupHours: number;
  /** Currently selected window start (ISO) or undefined. */
  readonly selectedFrom?: string;
  readonly onSelect: (fromIso: string | undefined) => void;
  /** vesmaro.motion/media reduced flag — kills the height transition. */
  readonly reducedMotion: boolean;
}

const HOUR_MS = 60 * 60 * 1000;
/** Smallest visible column height (% of the axis) for a non-empty slot. */
const MIN_BAR_PERCENT = 6;

/** Segment scale bottom→top: task (iris), assignment, report. */
function segmentHeights(slot: ActivityPulseSlot, max: number): {
  task: number;
  assignment: number;
  report: number;
} {
  const scale = (value: number): number => (max <= 0 ? 0 : Math.round((value / max) * 100));
  return {
    task: scale(slot.by_type.task),
    assignment: scale(slot.by_type.assignment),
    report: scale(slot.by_type.report),
  };
}

export function ActivityPulseChart({
  slots,
  groupHours,
  selectedFrom,
  onSelect,
  reducedMotion,
}: ActivityPulseChartProps) {
  const t = useT();
  const { lang } = useI18n();
  const max = useMemo(
    () => slots.reduce((peak, slot) => Math.max(peak, slot.total), 0),
    [slots],
  );
  const isEmpty = max === 0;

  return (
    <section
      aria-label={t("activity.chart.label")}
      className="rounded-md border border-border-subtle bg-well shadow-well px-3 py-2"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-medium text-foreground-secondary">
          {t("activity.chart.label")}
        </h2>
        {/* Text legend — the segments' colour-independent twin (WCAG 1.4.1). */}
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-0.5" aria-hidden="true">
          <LegendItem className="bg-iris" label={t("activity.type.task")} />
          <LegendItem className="bg-confidence" label={t("activity.type.assignment")} />
          <LegendItem className="bg-success" label={t("activity.type.report")} />
        </ul>
      </div>
      {isEmpty ? (
        <p className="py-6 text-center text-sm text-foreground-muted" role="status">
          {t("activity.chart.empty")}
        </p>
      ) : (
        <>
          <div className="mt-2 flex h-24 items-end gap-0.5">
            {slots.map((slot) => {
              const slotEnd = Date.parse(slot.ts) + groupHours * HOUR_MS;
              const range = `${formatClockTime(slot.ts, lang)}–${formatClockTime(
                new Date(slotEnd).toISOString(),
                lang,
              )}`;
              const selected =
                selectedFrom !== undefined &&
                Date.parse(selectedFrom) === Date.parse(slot.ts);
              const heights = segmentHeights(slot, max);
              const totalHeight = Math.max(
                slot.total > 0 ? MIN_BAR_PERCENT : 0,
                heights.task + heights.assignment + heights.report,
              );
              return (
                <button
                  key={slot.ts}
                  type="button"
                  aria-label={t("activity.chart.barAria", {
                    range,
                    total: slot.total,
                    tasks: slot.by_type.task,
                    assignments: slot.by_type.assignment,
                    reports: slot.by_type.report,
                  })}
                  aria-pressed={selected}
                  title={range}
                  onClick={() => onSelect(selected ? undefined : slot.ts)}
                  className="flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end rounded-t-sm px-px transition-colors duration-instant hover:bg-iris/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright aria-pressed:bg-iris-tint aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-iris-bright"
                >
                  {/* The one motion on the surface: a short height ease on
                   * data change; reduced motion renders it instant (§8.10). */}
                  <span
                    className={
                      "flex w-full flex-col justify-end " +
                      (reducedMotion ? "" : "transition-[height] duration-300")
                    }
                    style={{ height: `${totalHeight}%` }}
                  >
                    <span
                      className="w-full bg-success"
                      style={{ height: `${heights.report}%` }}
                    />
                    <span
                      className="w-full bg-confidence"
                      style={{ height: `${heights.assignment}%` }}
                    />
                    <span className="w-full bg-iris" style={{ height: `${heights.task}%` }} />
                  </span>
                  {/* Baseline tick for zero slots — a slot never vanishes. */}
                  {slot.total === 0 ? (
                    <span className="h-px w-full bg-border" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-foreground-muted">
            {slots
              .filter((_, index) => index % 2 === 0)
              .map((slot) => (
                <span key={slot.ts}>{formatClockTime(slot.ts, lang)}</span>
              ))}
            <span>{t("activity.chart.now")}</span>
          </div>
        </>
      )}
    </section>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1 text-xs text-foreground-secondary">
      <span className={`inline-block size-2 rounded-sm ${className}`} />
      {label}
    </li>
  );
}
