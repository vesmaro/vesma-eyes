import type { TranslationKey } from "@/i18n";
import { useValidationNow } from "@/features/tasks/useValidationClock";
import { presenceFromLastSeen } from "./presence";
import { useExecutors, useExecutionSettings } from "./useAgents";

/**
 * The saved execution pair vs the save gate's own rules (W-A D11-UI, user
 * panel 2026-10-21): a default/fallback combination that cannot route
 * anything warns EVERYWHERE its consequence is visible — the setting
 * itself (Настройки › Исполнение) and the queue page (/agents/execution)
 * where «задачи не забираются» is actually observed. Shared so the two
 * surfaces can never disagree about whether the pair is broken.
 *
 * Honesty: both wires must have ANSWERED (no guessing from partial data —
 * a pending registry renders nothing); the rules mirror the server's
 * `_validate_default_executor` gate (approved, enabled, strictly online,
 * local-poll). The settings section additionally suppresses the line while
 * the form is dirty (the owner is already fixing it) — this hook computes
 * the raw verdict.
 */
export interface ExecutionWarning {
  key: TranslationKey;
  values?: Record<string, string>;
}

export interface ExecutionWarningState {
  /** Non-null when the saved pair cannot route (or nothing is set). */
  warning: ExecutionWarning | null;
  /** The saved fallback is empty — rides along as the second line. */
  fallbackEmpty: boolean;
  /** Both wires answered (the caller renders nothing while false). */
  settled: boolean;
}

export function useExecutionWarning(): ExecutionWarningState {
  const executors = useExecutors();
  const settings = useExecutionSettings();
  const now = useValidationNow();

  const settled = settings.isSuccess && executors.isSuccess;
  let warning: ExecutionWarning | null = null;
  let fallbackEmpty = false;
  if (settled) {
    const items = executors.data?.items ?? [];
    const meta = executors.data?.meta;
    const savedDefault = settings.data?.default_executor ?? "";
    fallbackEmpty = !(settings.data?.fallback_executor ?? "");
    const row = savedDefault
      ? items.find((candidate) => candidate.id === savedDefault)
      : undefined;
    if (!savedDefault && fallbackEmpty) {
      // Nothing set at all — no pair, no routing.
      warning = { key: "agents.settings.warnNone" };
    } else if (savedDefault && !row) {
      warning = {
        key: "agents.settings.warnMissing",
        values: { name: savedDefault },
      };
    } else if (row) {
      if (row.state === "pending") {
        warning = {
          key: "agents.settings.warnPending",
          values: { name: row.name },
        };
      } else if (row.state === "revoked") {
        warning = {
          key: "agents.settings.warnRevoked",
          values: { name: row.name },
        };
      } else if (!row.enabled) {
        warning = {
          key: "agents.settings.warnDisabled",
          values: { name: row.name },
        };
      } else if (presenceFromLastSeen(row.last_seen, meta, now) !== "online") {
        warning = {
          key: "agents.settings.warnOffline",
          values: { name: row.name },
        };
      }
    }
  }
  return { warning, fallbackEmpty, settled };
}
