import type {
  ExecutorLifecycleStatus,
  ExecutorListMeta,
} from "@/gateway/boardTypes";
import type { TranslationKey } from "@/i18n";

/**
 * UXE-2 (07a dictionary §4): the human layer over the server-computed
 * `status` lifecycle. The STATE LIST and the THRESHOLDS are server-owned
 * (`meta.lifecycle.states` / `silent_max_age_s`) — this module renders
 * them, never hardcodes (the presence.ts read-don't-hardcode discipline).
 *
 * A pill is never alone (07a §1.1): `[state] + [age] + [next step]`.
 * `next` is the second hint line under the pill or the tooltip;
 * `since`/ids stay in the details (§1.4).
 */

/** Server state → the pill label key. Unknown state → the unknown pill. */
export function lifecycleLabelKey(state: string): TranslationKey {
  switch (state) {
    case "provisioning":
      return "agents.lifecycle.state.provisioning";
    case "awaiting-approval":
      return "agents.lifecycle.state.awaiting-approval";
    case "awaiting-first-report":
      return "agents.lifecycle.state.awaiting-first-report";
    case "online":
      return "agents.lifecycle.state.online";
    case "silent":
      return "agents.lifecycle.state.silent";
    case "offline":
      return "agents.lifecycle.state.offline";
    case "disabled":
      return "agents.lifecycle.state.disabled";
    case "revoked":
      return "agents.lifecycle.state.revoked";
    default:
      // Server contract drift — the honest non-verdict, NOT a guessed state.
      return "agents.presence.unknown";
  }
}

/** Badge variant per state (semantic tokens only — 02 §4, no new colours). */
export function lifecycleBadgeVariant(
  state: string,
): "default" | "outline" | "success" | "warning" {
  switch (state) {
    case "online":
      return "success";
    case "silent":
    case "awaiting-first-report":
      return "warning";
    case "provisioning":
    case "awaiting-approval":
      return "outline";
    // Disabled/revoked/offline/unknown: the muted outline — a dead-ish
    // row invites no colour optimism.
    default:
      return "outline";
  }
}

/** Second hint line under the pill (the `next_action`, humanised). */
export function lifecycleNextKey(state: string): TranslationKey {
  switch (state) {
    case "provisioning":
      return "agents.lifecycle.next.provisioning";
    case "awaiting-approval":
      return "agents.lifecycle.next.awaiting-approval";
    case "awaiting-first-report":
      return "agents.lifecycle.next.awaiting-first-report";
    case "online":
      return "agents.lifecycle.next.online";
    case "silent":
      return "agents.lifecycle.next.silent";
    case "offline":
      return "agents.lifecycle.next.offline";
    case "disabled":
      return "agents.lifecycle.next.disabled";
    case "revoked":
      return "agents.lifecycle.next.revoked";
    default:
      return "agents.presence.unknown";
  }
}

/** Human age string for the pill («12 с назад» / «4 мин» / «3 ч»), 07a §1.5. */
export function formatReportAge(
  ageS: number | "",
  vars: { agoTemplate: string; never: string; units: {
    readonly minutes: string;
    readonly hours: string;
    readonly days: string;
  } },
): string {
  if (ageS === "") return vars.never;
  const minutes = Math.floor(ageS / 60);
  const human =
    minutes < 1
      ? `${ageS}${vars.units.minutes}`
      : minutes < 60
        ? `${minutes}${vars.units.minutes}`
        : `${Math.floor(minutes / 60)}${vars.units.hours}`;
  return vars.agoTemplate.replace("{{age}}", human);
}

/** The silent threshold from meta (fallback: the stale one — same corridor). */
export function silentMaxAgeS(meta: ExecutorListMeta | undefined): number | null {
  if (!meta) return null;
  return meta.lifecycle?.silent_max_age_s ?? meta.presence.stale_max_age_s;
}

/** Type guard: is this a lifecycle object at all (older boards may omit). */
export function isLifecycle(
  value: unknown,
): value is ExecutorLifecycleStatus {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as ExecutorLifecycleStatus;
  return typeof candidate.state === "string";
}