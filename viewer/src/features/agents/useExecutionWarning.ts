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
 * `_validate_default_executor` gate IN ORDER (approved, enabled, strictly
 * online, local-poll — review F2 added the missing transport leg). The
 * settings section suppresses the line while the shown pair differs from
 * the loaded one (review F3); this hook computes the raw verdict.
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
    if (!savedDefault) {
      // Review F4: an empty default warns EVEN with a fallback set — new
      // tasks are not picked up in that combo either.
      warning = { key: "agents.settings.warnNone" };
    } else if (!row) {
      warning = {
        key: "agents.settings.warnMissing",
        values: { name: savedDefault },
      };
    } else {
      // The gate's rule order (pending → revoked → enabled → presence →
      // transport) mirrored verbatim.
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
      } else if (row.transport !== "local-poll") {
        // Review F2: the mirror promised the gate's FULL rule set — a
        // default drifted to mesh never travels local-poll, so the poller
        // silently never picks its tasks up. Warn like the gate does.
        warning = {
          key: "agents.settings.warnMesh",
          values: { name: row.name },
        };
      }
    }
  }
  return { warning, fallbackEmpty, settled };
}
