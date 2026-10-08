import { useEffect, useRef, useState } from "react";
import { useGateway } from "@/gateway/GatewayContext";
import { isTaskEventSource } from "@/gateway/capabilities";
import type { BoardEvent, EventStream } from "@/gateway/events";
import { useT, type TranslationKey, type TranslateFn } from "@/i18n";

/**
 * The Overview HUD bus ticker (U2; v12 §3.1 + §13.3): ONE line fed by the
 * REAL /api/events stream — «лента-тикер: одна строка, события из шины…
 * обновление только по событию». This is data, not decor: the line updates
 * in every live-layer regime (only the fade-swap MOTION is gated, in CSS);
 * a silent bus renders nothing — honest silence, never a placeholder.
 *
 * The line composes from the ui-contract §11 dictionary by MEANING
 * (family verb + the one honest identifier the frame carries); raw kind
 * codes never reach the UI (the i18n gate). `hello` is a service frame —
 * never displayed, never counted.
 */

/** Display cap + truncation-with-recourse (the full text rides the native
 * title attr) — the same discipline the W1b pulse ticker used; moved here
 * so the composer owns the whole line. Re-exported by WellHero (tests pin
 * it from there). */
const ISO_LIKE = /\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?/g;
const TICKER_CAP = 64;

export function normalizeTickerTitle(
  raw: string,
  fallbackId: string,
): { display: string; full: string } {
  const clean = raw
    .replace(ISO_LIKE, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s·—–-]+|[\s·—–-]+$/g, "");
  const base = clean || fallbackId.slice(0, 8);
  return base.length <= TICKER_CAP
    ? { display: base, full: base }
    : { display: `${base.slice(0, TICKER_CAP).trimEnd()}…`, full: base };
}

export interface BusTickerLine {
  /** Monotonic per-mount sequence — the fade-swap animation key. */
  readonly seq: number;
  /** Local HH:MM receipt time (mono/tabular at the callsite). */
  readonly time: string;
  /** The composed line, localized. */
  readonly text: string;
  /** The uncapped text — the native title carries what display truncates. */
  readonly full: string;
  /** Error-class events also read as TEXT in the error colour (WCAG 1.4.1). */
  readonly isError: boolean;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Local receipt clock — a live line speaks the user's wall clock. */
function receiptTime(): string {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

interface LineSpec {
  readonly key: TranslationKey;
  readonly ref?: string;
  /** The full (uncapped) subject — title attr when display truncated. */
  readonly full?: string;
  readonly error?: boolean;
}

/** The dictionary mapped onto frames — one line spec per known kind.
 * Every identifier shown is a real wire field; nothing is invented. */
function lineSpec(event: BoardEvent): LineSpec | null {
  switch (event.kind) {
    case "task.created":
    case "task.updated":
    case "task.moved": {
      const norm = normalizeTickerTitle(event.task.title ?? "", event.task.id ?? "");
      const key: TranslationKey =
        event.kind === "task.created"
          ? "overview.eventTaskCreated"
          : event.kind === "task.updated"
            ? "overview.eventTaskUpdated"
            : "overview.eventTaskMoved";
      return { key, ref: norm.display, full: norm.full };
    }
    case "task.deleted":
      return { key: "overview.eventTaskDeleted", ref: event.task_id };
    case "task.archived":
      return { key: "overview.eventTaskArchived", ref: event.task_id };
    case "task.unarchived":
      return { key: "overview.eventTaskUnarchived", ref: event.task_id };
    case "report":
      return { key: "overview.eventReport", ref: event.task_id };
    case "assignment.created":
      return { key: "overview.eventAssignmentCreated", ref: event.task_id };
    case "assignment.claimed":
      return { key: "overview.eventAssignmentClaimed", ref: event.task_id };
    case "assignment.started":
      return { key: "overview.eventAssignmentStarted", ref: event.task_id };
    case "assignment.done":
      return { key: "overview.eventAssignmentDone", ref: event.task_id };
    case "assignment.failed":
      return { key: "overview.eventAssignmentFailed", ref: event.task_id, error: true };
    case "assignment.cancelled":
      return { key: "overview.eventAssignmentCancelled", ref: event.task_id };
    case "assignment.expired":
      return {
        key: "overview.eventAssignmentExpired",
        ref: event.task_id,
        error: true,
      };
    case "executor.online":
      return { key: "overview.eventExecutorOnline", ref: event.executor.name };
    case "executor.offline":
      return { key: "overview.eventExecutorOffline", ref: event.executor.name };
    case "executor.registered":
      return { key: "overview.eventExecutorRegistered", ref: event.executor.name };
    case "executor.updated":
      return { key: "overview.eventExecutorUpdated", ref: event.executor.name };
    case "executor.deleted":
      return { key: "overview.eventExecutorDeleted", ref: event.executor.name };
    case "server.changed":
      return { key: "overview.eventServerChanged" };
    case "notification": {
      const norm = normalizeTickerTitle(
        event.notification.title ?? "",
        `#${event.notification.id}`,
      );
      return { key: "overview.eventNotification", ref: norm.display, full: norm.full };
    }
    case "enrollment.created":
      return { key: "overview.eventEnrollmentCreated" };
    case "enrollment.used":
      return { key: "overview.eventEnrollmentUsed", ref: event.executor_name };
    case "enrollment.revoked":
      return { key: "overview.eventEnrollmentRevoked" };
    case "enrollment.expired":
      return { key: "overview.eventEnrollmentExpired" };
    case "harness.added": {
      const name = typeof event.harness?.name === "string" ? event.harness.name : null;
      return { key: "overview.eventHarnessAdded", ref: name ?? "—" };
    }
    case "harness.removed":
      return { key: "overview.eventHarnessRemoved", ref: event.name ?? "—" };
    case "provisioning.created":
      return { key: "overview.eventProvisionCreated", ref: event.host };
    case "provisioning.progress":
    case "provisioning.ok":
      // host rides only created/repinned — the job id is the honest ref.
      return {
        key:
          event.kind === "provisioning.progress"
            ? "overview.eventProvisionProgress"
            : "overview.eventProvisionOk",
        ref: event.job_id.slice(0, 8),
      };
    case "provisioning.failed":
      return {
        key: "overview.eventProvisionFailed",
        ref: event.job_id.slice(0, 8),
        error: true,
      };
    case "provisioning.repinned":
      return { key: "overview.eventProvisionRepinned", ref: event.host };
    case "pairing.requested":
      return {
        key: "overview.eventPairingRequested",
        ref: event.device_name ?? event.pairing_id.slice(0, 8),
      };
    case "pairing.confirmed":
      return {
        key: "overview.eventPairingConfirmed",
        ref: event.device_name ?? event.pairing_id.slice(0, 8),
      };
    case "pairing.revoked":
      return { key: "overview.eventPairingRevoked" };
    case "pairing.expired":
      return { key: "overview.eventPairingExpired" };
    case "automation.rule.created":
      return { key: "overview.eventRuleCreated" };
    case "automation.rule.updated":
      return { key: "overview.eventRuleUpdated" };
    case "automation.rule.toggled":
      return { key: "overview.eventRuleToggled" };
    case "automation.rule.deleted":
      return { key: "overview.eventRuleDeleted" };
    default:
      // Additive-only dictionary: parsed kinds the composer does not know
      // yet still spoke — the honest generic line, never silence.
      return { key: "overview.eventOther" };
  }
}

/** Compose one ticker line from a parsed frame. Pure — unit-tested. */
export function composeBusTickerLine(
  event: BoardEvent,
  t: TranslateFn,
  seq: number,
): BusTickerLine | null {
  if (event.kind === "hello") return null;
  const spec = lineSpec(event);
  if (!spec) return null;
  const vars = spec.ref !== undefined ? { ref: spec.ref } : undefined;
  const text = t(spec.key, vars);
  return {
    seq,
    time: receiptTime(),
    text,
    full: spec.full !== undefined && spec.full !== spec.ref ? spec.full : text,
    isError: spec.error === true,
  };
}

/**
 * The ONE subscription the hero holds (mount-scoped, its own connection —
 * the same pattern as the tasks SSE bridge; the living layer's bridge is
 * a separate honest source). Silent bus → `null` forever.
 */
export function useBusTicker(
  onEvent?: (event: BoardEvent) => void,
): BusTickerLine | null {
  const gateway = useGateway();
  const capable = isTaskEventSource(gateway);
  const t = useT();
  const [line, setLine] = useState<BusTickerLine | null>(null);
  const seq = useRef(0);
  // The awakening (and any future consumer) rides the SAME frames without
  // re-subscribing when its callback identity changes.
  const handlerRef = useRef(onEvent);
  useEffect(() => {
    handlerRef.current = onEvent;
  });

  useEffect(() => {
    if (!capable) return;
    let stream: EventStream | null = null;
    let off: (() => void) | null = null;
    try {
      stream = gateway.events();
      off = stream.onAny((event) => {
        if (event.kind !== "hello") {
          seq.current += 1;
          const composed = composeBusTickerLine(event, t, seq.current);
          if (composed) setLine(composed);
          // The awakening (and any future consumer) rides REAL frames only.
          handlerRef.current?.(event);
        }
      });
    } catch {
      // No EventSource in this environment — the line stays honest-empty.
      return;
    }
    return () => {
      off?.();
      stream?.close();
    };
  }, [capable, gateway, t]);

  return line;
}
