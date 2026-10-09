import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import type { TaskListUrlState } from "./taskFilters";

/**
 * ME-075 date filter for the task listings (kanban + list share the URL
 * dialect): arrival (поступила) and completion (завершена) from–to bounds
 * plus the «Сегодня / Неделя / Всё» presets. Presets bound the ARRIVAL
 * period («свежие поступившие» is the reading the owner asked for); «Всё»
 * clears every date bound. Values are UTC calendar days (YYYY-MM-DD) — the
 * same dialect the server's /api/board listing params speak.
 *
 * The controls live in the shared filter form as URL state: a filtered
 * view survives F5 and deep links like every other task filter.
 */

const DAY_MS = 86_400_000;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekAgoIso(): string {
  return new Date(Date.now() - 7 * DAY_MS).toISOString().slice(0, 10);
}

const DAY_INPUT_CLASS =
  "h-12 md:h-12 md:h-9 rounded-md border border-border bg-well px-2 text-sm text-foreground focus-visible:border-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright";

export function TaskDateFilter({
  state,
  patch,
}: {
  state: TaskListUrlState;
  patch: (changes: Partial<TaskListUrlState>) => void;
}) {
  const t = useT();

  const dayInput = (
    id: string,
    label: string,
    value: string | undefined,
    onChange: (value: string | undefined) => void,
  ) => (
    <label htmlFor={id} className="flex items-center gap-1 text-xs text-foreground-secondary">
      {label}
      <input
        id={id}
        type="date"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
        className={DAY_INPUT_CLASS}
      />
    </label>
  );

  const presetButton = (label: string, changes: Partial<TaskListUrlState>) => (
    <Button type="button" variant="outline" size="sm" onClick={() => patch(changes)}>
      {label}
    </Button>
  );

  return (
    <fieldset className="flex flex-wrap items-end gap-2">
      <legend className="sr-only">{t("tasks.date.label")}</legend>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-foreground-secondary">
          {t("tasks.date.arrivalLabel")}
        </span>
        <div className="flex items-center gap-1">
          {dayInput("filter-created-from", t("tasks.date.from"), state.created_from,
            (value) => patch({ created_from: value }))}
          {dayInput("filter-created-to", t("tasks.date.to"), state.created_to,
            (value) => patch({ created_to: value }))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-foreground-secondary">
          {t("tasks.date.completedLabel")}
        </span>
        <div className="flex items-center gap-1">
          {dayInput("filter-completed-from", t("tasks.date.from"), state.completed_from,
            (value) => patch({ completed_from: value }))}
          {dayInput("filter-completed-to", t("tasks.date.to"), state.completed_to,
            (value) => patch({ completed_to: value }))}
        </div>
      </div>

      <div className="flex items-center gap-1.5 pb-0.5" role="group" aria-label={t("tasks.date.label")}>
        {presetButton(t("tasks.date.presetToday"), {
          created_from: todayIso(),
          created_to: todayIso(),
        })}
        {presetButton(t("tasks.date.presetWeek"), {
          created_from: weekAgoIso(),
          created_to: todayIso(),
        })}
        {presetButton(t("tasks.date.presetAll"), {
          created_from: undefined,
          created_to: undefined,
          completed_from: undefined,
          completed_to: undefined,
        })}
      </div>
    </fieldset>
  );
}
