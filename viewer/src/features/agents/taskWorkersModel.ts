import type { ActivityItem } from "@/gateway/boardTypes";
import type { TranslationKey } from "@/i18n";
import {
  activityKindMeta,
  parseActor,
  resolveActorName,
} from "@/features/tasks/activityGrammar";

/**
 * Pure model of the UI-31 «Кто работал» block: the fold of a task's
 * attributed activity rows into unique contributors. Component lives in
 * TaskWorkersPanel.tsx; this module holds ONLY the pure fold (the
 * react-refresh / unit-test seam — same shape as assignmentStatus.ts).
 *
 * Honesty rule (§2.3, shared with the activity page): an absent actor is an
 * HONEST ABSENCE — actor-less rows (pre-1.35 records, stripped anonymous
 * legs) are counted for the ladder, never turned into a contributor.
 */

/** Max distinct verbs shown per contributor; the rest folds into «+N». */
export const MAX_WORKER_VERBS = 3;

export interface TaskContributor {
  /** The wire actor string (title tooltip: ids live here). */
  readonly actor: string;
  /** Display name: registry name for agents, grammar name otherwise. */
  readonly name: string;
  /**
   * Class-named actors (owner/board/services) carry the grammar's label key —
   * the TRANSLATED label is the identity shown. Device/agent actors are
   * identified by their NAME (the registry-resolved one for agents).
   */
  readonly labelKey?: TranslationKey;
  /** How many attributed events this actor has on the task. */
  readonly events: number;
  /** ISO ts of the actor's latest event. */
  readonly lastTs: string;
  /** Distinct verb keys in first-seen order (newest event first). */
  readonly verbKeys: readonly TranslationKey[];
}

export interface WorkersFold {
  readonly contributors: readonly TaskContributor[];
  /** Rows that DID carry an actor (the attribution ladder input). */
  readonly attributed: number;
}

/**
 * Fold activity rows → unique contributors, newest-first. Same actor string
 * = one contributor (the grammar is stable per identity).
 */
export function collectContributors(
  rows: readonly ActivityItem[],
  executorNameOf: (id: string) => string | undefined,
): WorkersFold {
  const byActor = new Map<string, TaskContributor>();
  let attributed = 0;
  for (const row of rows) {
    if (row.actor === undefined) continue;
    attributed += 1;
    const parsed = parseActor(row.actor);
    const name =
      resolveActorName(parsed, (id) => executorNameOf(id)) ?? parsed.name ?? row.actor;
    const verbKey = activityKindMeta(row.kind, row.report_kind === "final")?.verbKey;
    const existing = byActor.get(row.actor);
    if (existing === undefined) {
      byActor.set(row.actor, {
        actor: row.actor,
        name,
        labelKey: parsed.labelKey,
        events: 1,
        lastTs: row.ts,
        verbKeys: verbKey ? [verbKey] : [],
      });
      continue;
    }
    const verbKeys =
      verbKey === undefined || existing.verbKeys.includes(verbKey)
        ? existing.verbKeys
        : [...existing.verbKeys, verbKey];
    byActor.set(row.actor, {
      ...existing,
      events: existing.events + 1,
      verbKeys,
    });
  }
  const contributors = [...byActor.values()].sort((a, b) =>
    b.lastTs.localeCompare(a.lastTs),
  );
  return { contributors, attributed };
}
