import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { ActivityKind } from "@/gateway/boardTypes";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { Skeleton } from "@/components/ui/skeleton";
import { useT, useI18n, type TranslationKey } from "@/i18n";
import { cn } from "@/lib/utils";
import { useActivityBuckets, useActivityFeed } from "@/features/tasks/useActivity";
import { buildPulseAxis } from "@/features/tasks/activityUrl";
import { useExecutionWarning } from "./useExecutionWarning";
import type { HostGroup } from "./rosterModel";

/**
 * The RIGHT meta-panel blocks of the hosts frame (agents-workspace-ide W2
 * «Мета-панель», states.md §2): three collapsible blocks — «Присутствие»
 * (the roster listbox + filter chips, moved AS-IS from the old panel —
 * HostsWorkspace composes the children), «Пульс» (the host-scoped 24h
 * strip + fresh activity rows, moved out of the field's «Недавно»), and
 * «Настройки» (the first-line routing verdict + quiet links into the
 * settings hub sections). Defaults (states.md §2): Присутствие and Пульс
 * expanded, Настройки collapsed. ONE panel scroll — the scroll container
 * lives in HostsWorkspace; the blocks only stack.
 *
 * Block grammar (aria-expanded + aria-controls toggle, session-only open
 * state) is the KoraMetaPanel MetaBlock grammar verbatim — the two meta
 * panels of the product read and behave identically (reuse, not a
 * re-implementation; Kora's copy stays file-local there by the same
 * decision).
 */

/** The ONE collapsible block (the KoraMetaPanel header grammar). */
function MetaBlock({
  id,
  title,
  defaultOpen,
  children,
}: {
  id: string;
  title: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section aria-label={title}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 md:min-h-6 w-full items-center gap-1.5 rounded-sm text-left text-xs font-semibold uppercase tracking-wide text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        {open ? "▾" : "▸"} {title}
      </button>
      {open ? (
        <div id={id} className="mt-2 space-y-2 text-sm">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/**
 * «Присутствие» (states.md §2): the roster listbox + filter chips exactly
 * as the old right panel composed them — the caller passes the children
 * (the chips, the list, the honest filter-empty line), the block owns only
 * the collapsible header. Default EXPANDED (the roster is the panel's
 * reason to exist).
 */
export function HostsPresenceBlock({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <MetaBlock
      id="hosts-meta-presence-body"
      title={t("agents.hosts.presenceTitle")}
      defaultOpen
    >
      {children}
    </MetaBlock>
  );
}

/**
 * «Пульс» (states.md §2): the host-scoped activity — the 24h hourly strip
 * + the freshest rows, moved verbatim from the field's «Недавно» section
 * (same hooks, same honest states). Default EXPANDED. The activity wires
 * mount ONLY while the block is open AND a host is selected — a collapsed
 * block keeps the quiet, an unselected host renders the honest line (never
 * a guessed «тишина» for a host the URL did not name).
 *
 * Mounted TWICE by design (the ≥xl panel + the md..xl section under the
 * field, blueprint §6): the copies share ONE react-query key per host —
 * one wire read, no second stream; the hidden copy is display:none for
 * assistive tech. The body id is CALLER-SCOPED (the required `id` prop —
 * review W2-1): two mounted copies must never share one DOM id, or the
 * visible toggle's aria-controls would resolve into the hidden copy.
 */
export function HostsPulseBlock({
  id,
  group,
  now,
}: {
  /** The body element id — unique per mount (e.g. `…-panel` / `…-field`). */
  id: string;
  group: HostGroup | null;
  now: number;
}) {
  const t = useT();
  return (
    <MetaBlock id={id} title={t("agents.hosts.pulseTitle")} defaultOpen>
      {group === null ? (
        <p className="text-xs text-foreground-muted">
          {t("agents.hosts.pulseNoHost")}
        </p>
      ) : (
        <PulseBody key={group.host || "__unreported__"} group={group} now={now} />
      )}
    </MetaBlock>
  );
}

/** The pulse body — the «Недавно» section of the field, rehoused as-is. */
function PulseBody({ group, now }: { group: HostGroup; now: number }) {
  const t = useT();
  const { lang } = useI18n();
  // The host-scoped activity: the cursor feed + the 24h hourly buckets —
  // the SAME wire the Задачи activity page reads.
  const activity = useActivityFeed({ host: group.host, limit: 8 });
  const buckets = useActivityBuckets({ host: group.host, bucket: "hour", hours: 24 });
  const pulseSlots = useMemo(
    () => buildPulseAxis(buckets.data?.buckets ?? [], now),
    [buckets.data, now],
  );
  const activityRows = activity.data?.pages.flatMap((page) => [...page.items]) ?? [];
  const maxSlot = Math.max(1, ...pulseSlots.map((slot) => slot.total));

  if (activity.isError) {
    return <p className="text-sm text-foreground-muted">{t("agents.hosts.pulseFailed")}</p>;
  }
  if (activityRows.length === 0 && buckets.data === undefined) {
    return (
      <div role="status" aria-label={t("agents.hosts.loading")} className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    );
  }
  if (activityRows.length === 0) {
    return <p className="text-sm text-foreground-muted">{t("agents.hosts.pulseEmpty")}</p>;
  }
  if (buckets.data === undefined) {
    // The strip renders only from RESOLVED buckets — a zero-flat axis
    // would read as «тишина» while the wire is still in flight.
    return (
      <div role="status" aria-label={t("agents.hosts.loading")} className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div aria-hidden="true" className="flex h-12 items-end gap-px">
        {pulseSlots.map((slot) => (
          <div
            key={slot.ts}
            title={`${new Date(slot.ts).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })} — ${slot.total}`}
            className={cn(
              "min-w-[2px] flex-1 rounded-t-sm",
              slot.total > 0 ? "bg-iris/80" : "bg-border-subtle",
            )}
            style={{
              height: `${slot.total > 0 ? Math.max(25, Math.round((slot.total / maxSlot) * 100)) : 8}%`,
            }}
          />
        ))}
      </div>
      <ul className="space-y-0.5">
        {activityRows.slice(0, 8).map((row) => (
          <li
            key={row.id}
            className="flex min-h-8 items-baseline gap-2 rounded-sm px-1 text-xs"
          >
            <span className="shrink-0 font-mono tabular-nums text-foreground-muted">
              {new Date(row.ts).toLocaleTimeString(lang, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="shrink-0 text-foreground-secondary">
              {t(activityKindKey(row.kind))}
            </span>
            {row.task_title || row.task_id ? (
              <span className="min-w-0 truncate text-foreground-secondary">
                {row.task_title ?? row.task_id}
              </span>
            ) : null}
            {row.detail ? (
              <span className="min-w-0 truncate text-foreground-muted">
                {row.detail}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * «Настройки» (states.md §2): the first-line routing verdict
 * (useExecutionWarning — the SAME verdict the hub section and the queue
 * page show) + quiet links into the hub sections. Default COLLAPSED.
 *
 * The verdict is a WARNING, so it never hides behind the default: while
 * both wires have answered and the pair is broken, the line stays under
 * the block header in BOTH collapse states (the Kora AboutBlock grammar);
 * the quiet links live in the expanded body. Unsettled wires render
 * nothing — no guessing from partial data (the hook's own contract).
 */
export function HostsSettingsBlock() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { warning, fallbackEmpty, settled } = useExecutionWarning();
  const title = t("agents.hosts.settingsTitle");
  return (
    <section aria-label={title}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="hosts-meta-settings-body"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 md:min-h-6 w-full items-center gap-1.5 rounded-sm text-left text-xs font-semibold uppercase tracking-wide text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        {open ? "▾" : "▸"} {title}
      </button>
      {settled && warning !== null ? (
        <div className="mt-2">
          <HonestLine tone="warning">
            <span className="block">{t(warning.key, warning.values)}</span>
            {fallbackEmpty ? (
              <span className="mt-0.5 block text-xs text-foreground-muted">
                {t("agents.settings.warnFallbackNone")}
              </span>
            ) : null}
          </HonestLine>
        </div>
      ) : null}
      {open ? (
        <div id="hosts-meta-settings-body" className="mt-2 space-y-1.5">
          <QuietHubLink to="/system/settings#execution">
            {t("settings.hub.executionTitle")}
          </QuietHubLink>
          <QuietHubLink to="/system/settings#automation">
            {t("settings.hub.automationTitle")}
          </QuietHubLink>
        </div>
      ) : null}
    </section>
  );
}

/** The quiet hub link (the HarnessChipStrip connect-link grammar). */
function QuietHubLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-12 md:min-h-6 items-center rounded-sm px-1 text-sm text-foreground-secondary underline-offset-2 transition-colors duration-instant hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
    >
      {children}
    </Link>
  );
}

/** The activity kind → the agents feed dictionary (the SAME keys the
 * execution feed speaks — one vocabulary per fact). Moved with the feed
 * from HostsWorkspace (W2 «Мета-панель»). The default is the NEUTRAL
 * «событие» (review W2-2): the wire's kind union is wider than the pulse's
 * dictionary (task.moved/updated/archived/unarchived, assignment.created)
 * — an unmapped kind must not borrow «поручение создано», which says
 * something that did not happen. */
function activityKindKey(kind: ActivityKind): TranslationKey {
  switch (kind) {
    case "task.created":
      return "agents.feed.created";
    case "assignment.claimed":
      return "agents.feed.claimed";
    case "assignment.started":
      return "agents.feed.started";
    case "assignment.done":
      return "agents.feed.done";
    case "assignment.failed":
      return "agents.feed.failed";
    case "assignment.cancelled":
      return "agents.feed.cancelled";
    case "assignment.expired":
      return "agents.feed.expired";
    case "report":
      return "agents.feed.report";
    default:
      return "agents.feed.event";
  }
}
