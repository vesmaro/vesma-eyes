import type { LucideIcon } from "lucide-react";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Ban,
  Check,
  ClipboardList,
  FileText,
  Flag,
  Hand,
  Hourglass,
  Pencil,
  Play,
  Plus,
  X,
} from "lucide-react";
import type { TranslationKey } from "@/i18n";
import { columnLabelKey, isTaskColumn } from "./taskStatus";

/**
 * UI-28 row grammar (spec §2): the WHAT verb + icon per event kind, the
 * accent class, and the WHO actor grammar of ADR 0012 Amd §A.5 — parsed,
 * never invented. Everything here is pure and language-independent except
 * the TranslationKey references; the page owns all rendering.
 *
 * Actor honesty rule (§2.3): an absent actor is a HONEST ABSENCE — the row
 * renders without the WHO badge (pre-1.35 records; the server strips the
 * field for anonymous legs). No «неизвестно» placeholder is fabricated.
 */

// --- WHAT: verb + icon + accent per kind (spec §2.1/§2.2) ---------------------

export interface ActivityKindMeta {
  readonly icon: LucideIcon;
  /** Verb microcopy key (§6 family `activity.kind.*`). */
  readonly verbKey: TranslationKey;
  /** Accent treatment — semantic tokens only, colour never alone (§2.1). */
  readonly accent: "neutral" | "success" | "error" | "warning" | "highlight";
  /** Terminal assignment transitions go aloud via the polite region. */
  readonly terminal: boolean;
}

export const ACTIVITY_KIND_META: Readonly<
  Record<string, ActivityKindMeta | undefined>
> = {
  "task.created": { icon: Plus, verbKey: "activity.kind.taskCreated", accent: "neutral", terminal: false },
  "task.moved": { icon: ArrowRight, verbKey: "activity.kind.taskMoved", accent: "neutral", terminal: false },
  "task.updated": { icon: Pencil, verbKey: "activity.kind.taskUpdated", accent: "neutral", terminal: false },
  "task.archived": { icon: Archive, verbKey: "activity.kind.taskArchived", accent: "neutral", terminal: false },
  "task.unarchived": { icon: ArchiveRestore, verbKey: "activity.kind.taskUnarchived", accent: "neutral", terminal: false },
  "assignment.created": { icon: ClipboardList, verbKey: "activity.kind.assignmentCreated", accent: "neutral", terminal: false },
  "assignment.claimed": { icon: Hand, verbKey: "activity.kind.assignmentClaimed", accent: "neutral", terminal: false },
  "assignment.started": { icon: Play, verbKey: "activity.kind.assignmentStarted", accent: "neutral", terminal: false },
  "assignment.done": { icon: Check, verbKey: "activity.kind.assignmentDone", accent: "success", terminal: true },
  "assignment.failed": { icon: X, verbKey: "activity.kind.assignmentFailed", accent: "error", terminal: true },
  "assignment.cancelled": { icon: Ban, verbKey: "activity.kind.assignmentCancelled", accent: "warning", terminal: true },
  "assignment.expired": { icon: Hourglass, verbKey: "activity.kind.assignmentExpired", accent: "warning", terminal: true },
  report: { icon: FileText, verbKey: "activity.kind.reportIntermediate", accent: "neutral", terminal: false },
};

/** Final reports are the SAME kind with a louder treatment (§2.1: flagged). */
export function activityKindMeta(kind: string, isFinalReport: boolean): ActivityKindMeta | undefined {
  if (kind === "report" && isFinalReport) {
    return {
      icon: Flag,
      verbKey: "activity.kind.reportFinal",
      accent: "highlight",
      terminal: false,
    };
  }
  return ACTIVITY_KIND_META[kind];
}

/** Accent → the semantic token class used by the row icon (no new tokens). */
export function accentColorClass(accent: ActivityKindMeta["accent"]): string {
  switch (accent) {
    case "success":
      return "text-success";
    case "error":
      return "text-error";
    case "warning":
      return "text-confidence";
    case "highlight":
      return "text-iris-bright";
    default:
      return "text-foreground-secondary";
  }
}

/**
 * «переведена: в работе → решено» — the moved detail renders column KEYS
 * through the existing column labels when the wire speaks keys (mock and
 * live frames), and falls back to the raw server text verbatim when it
 * already carries human words (server COLUMN_RU spellings). Split on the
 * arrow the spec's wireframe uses.
 */
export function movedDetailParts(detail: string): readonly string[] {
  return detail
    .split("→")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** One part of a moved detail: a column key → its label key; else null. */
export function movedPartColumnKey(part: string): TranslationKey | null {
  if (!isTaskColumn(part)) return null;
  return columnLabelKey(part);
}

// --- WHO: actor grammar (ADR 0012 Amd §A.5, format unchanged) ------------------

export type ActorClass = "user" | "device" | "board" | "agent" | "service";

export interface ParsedActor {
  readonly cls: ActorClass;
  /**
   * Label translation key for CLASS-NAMED actors (owner/board/services).
   * For device/agent the label is the NAME itself — never translated.
   */
  readonly labelKey?: TranslationKey;
  /** Display name for device/agent actors (raw id as fallback). */
  readonly name?: string;
  /** `title` tooltip: the full wire string (ids live here, not in the row). */
  readonly title: string;
}

/**
 * Parse the wire actor string. Unknown spellings degrade to the raw string
 * as an agent-class name fallback — a grammar extension must never break a
 * row (additive-only, ui-contract §11).
 */
export function parseActor(actor: string): ParsedActor {
  if (actor === "ui") {
    return { cls: "user", labelKey: "activity.actor.owner", title: actor };
  }
  if (actor === "machine:board") {
    return { cls: "board", labelKey: "activity.actor.board", title: actor };
  }
  if (actor === "machine:reaper") {
    return { cls: "service", labelKey: "activity.actor.reaper", title: actor };
  }
  if (actor === "machine:validation-sweep") {
    return { cls: "service", labelKey: "activity.actor.sweep", title: actor };
  }
  if (actor.startsWith("device:")) {
    // `device:<id> <name>` — the name shows, the id rides in the title.
    const rest = actor.slice("device:".length);
    const spaceAt = rest.indexOf(" ");
    const name = (spaceAt === -1 ? rest : rest.slice(spaceAt + 1)).trim();
    return {
      cls: "device",
      name: name.length > 0 ? name : rest,
      title: actor,
    };
  }
  if (actor.startsWith("machine:")) {
    return {
      cls: "agent",
      name: actor.slice("machine:".length) || actor,
      title: actor,
    };
  }
  // Unknown spelling: show it raw, class it an agent (least-assuming).
  return { cls: "agent", name: actor, title: actor };
}

/**
 * Resolve an agent-class actor against the executor registry (spec §2.3:
 * «имя из реестра /api/executors; fallback — сырой id»). The lookup is the
 * ALREADY-LOADED roster — the activity page never refetches the registry
 * for attribution.
 */
export function resolveActorName(
  actor: ParsedActor,
  executorNameOf: (id: string) => string | undefined,
): string | undefined {
  if (actor.cls !== "agent") return actor.name;
  const id = actor.name ?? "";
  return executorNameOf(id) ?? id;
}

// --- WHEN: relative label, absolute in title (spec §2) -------------------------

/**
 * КОГДА — relative, language-aware (Intl.RelativeTimeFormat; «только что» /
 * «N мин назад» / «N ч назад» / days). The exact clock lives in the row's
 * `title`. Pure (the caller passes `now`) and timezone-honest (uses the
 * viewer's local time — the feed is a «что происходит сейчас» view).
 */
export function formatRelativeActivityTime(
  iso: string,
  lang: "ru" | "en",
  now: number,
): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  const diffSeconds = Math.round((now - ts) / 1000);
  if (diffSeconds < 60) return lang === "ru" ? "только что" : "just now";
  const rtf = new Intl.RelativeTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", {
    numeric: "auto",
  });
  if (diffSeconds < 3600) return rtf.format(-Math.floor(diffSeconds / 60), "minute");
  if (diffSeconds < 86400) return rtf.format(-Math.floor(diffSeconds / 3600), "hour");
  return rtf.format(-Math.floor(diffSeconds / 86400), "day");
}

/** Absolute HH:MM (the amber marker and the histogram range labels). */
export function formatClockTime(iso: string, lang: "ru" | "en"): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts);
}

/** Absolute full stamp for the row title (КОГДА: absolute in title). */
export function formatAbsoluteStamp(iso: string, lang: "ru" | "en"): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts);
}
