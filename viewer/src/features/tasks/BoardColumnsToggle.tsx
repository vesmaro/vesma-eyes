import { useT } from "@/i18n";
import type { BoardColumnsMode } from "./tasksViewPrefs";

/**
 * ME-077 «5 колонок | все 7» — the kanban column visibility switcher, a
 * segmented control in the BoardStyleToggle shape sitting next to it. A
 * pure projection choice over the wire columns (the board dictionaries are
 * untouched): "compact" shows the 5 workflow lanes, "all" shows all 7 (the
 * empty pre-validation lanes render folded by default). Persisted as a
 * board setting ("vesmaro.boardColumns") — the choice survives reloads.
 *
 * Buttons (not links) with aria-pressed: the control changes an in-page
 * rendering mode, it does not move the user anywhere.
 */
export function BoardColumnsToggle({
  mode,
  onChange,
}: {
  mode: BoardColumnsMode;
  onChange: (mode: BoardColumnsMode) => void;
}) {
  const t = useT();

  const option = (value: BoardColumnsMode, extra = "") => ({
    type: "button" as const,
    "aria-pressed": mode === value,
    onClick: () => {
      if (value === mode) return;
      onChange(value);
    },
    className:
      "max-md:min-h-12 max-md:inline-flex max-md:items-center px-3 py-1.5 text-sm transition-colors duration-instant focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright " +
      extra +
      (mode === value
        ? "bg-iris-tint text-iris-bright"
        : "text-foreground-secondary hover:text-foreground"),
  });

  return (
    <div
      role="group"
      aria-label={t("tasks.board.columnsLabel")}
      className="inline-flex overflow-hidden rounded-md border border-border"
    >
      <button {...option("compact")}>{t("tasks.board.columnsCompact")}</button>
      <button {...option("all", "border-l border-border ")}>
        {t("tasks.board.columnsAll")}
      </button>
    </div>
  );
}
