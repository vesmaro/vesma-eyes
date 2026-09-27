import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { TextEngine } from "@/components/TextEngine";
import { useI18n, useT, type TranslateFn } from "@/i18n";
import type { ActivityItem, ActivityType } from "@/gateway/boardTypes";
import { isActivitySource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import { withReturn } from "@/lib/returnParams";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useExecutors } from "@/features/agents/useAgents";
import {
  ACTIVITY_FAMILIES,
  activityTypeTokens,
  buildPulseAxis,
  coalescePulseSlots,
  filterActivityItem,
  hasActiveActivityFilters,
  mergeActivityRows,
  parseActivityUrlState,
  serializeActivityUrlState,
  type ActivityUrlState,
} from "./activityUrl";
import {
  accentColorClass,
  activityKindMeta,
  formatAbsoluteStamp,
  formatClockTime,
  formatRelativeActivityTime,
  movedDetailParts,
  movedPartColumnKey,
  parseActor,
  resolveActorName,
} from "./activityGrammar";
import { useActivityBuckets, useActivityFeed, useActivityLive } from "./useActivity";
import { ActivityPulseChart } from "./ActivityPulseChart";
import { TasksUnsupported } from "./TasksUnsupported";

/**
 * `/tasks/activity` — UI-28 «Активность» (spec 2026-09-27): the task-centred
 * cross-task live stream. Every row answers five questions (§2): ЧТО (fact
 * verb + icon + accent), ЗАДАЧА (drill-down link with `?return=` per UI-18),
 * КТО (the §A.5 actor grammar — honest absence when the wire carries none),
 * ГДЕ (host, best-effort from the registry) and КОГДА (relative, absolute in
 * title). All list state lives in the URL (?type=&agent=&host=&task_id=
 * &from=&to=); pages page back through the `before_id` cursor («Показать
 * ещё», honest journal end), the LIVE half prepends from the domain SSE
 * bridge through the activity store (one stream per domain — this page
 * never opens an EventSource): rows never shift (2 s flash), and when the
 * reader is scrolled away a «N новых — показать» plate holds them.
 */

/** Highlight lifetime — 2 s fade, rows never move (UI-10 pattern, §5.2). */
const FRESH_MS = 2000;

/** Scroll tolerance for «the reader is at the top of the feed». */
const TOP_EPSILON_PX = 8;

/** The store row lifted into the common display shape. */
function liveToItem(row: {
  id: string;
  ts: string;
  kind: string;
  task_id: string;
  actor?: string;
  executor_id?: string;
  detail?: string;
  report_kind?: "intermediate" | "final";
}): ActivityItem {
  return {
    id: row.id,
    ts: row.ts,
    kind: (row.kind.startsWith("task.") ||
      row.kind.startsWith("assignment.") ||
      row.kind === "report"
      ? row.kind
      : "task.updated") as ActivityItem["kind"],
    task_id: row.task_id,
    ...(row.actor !== undefined ? { actor: row.actor } : {}),
    ...(row.executor_id !== undefined ? { executor_id: row.executor_id } : {}),
    ...(row.detail !== undefined ? { detail: row.detail } : {}),
    ...(row.report_kind !== undefined ? { report_kind: row.report_kind } : {}),
  };
}

export function TaskActivityPage() {
  const t = useT();
  const { lang } = useI18n();
  const gateway = useGateway();
  const capable = isActivitySource(gateway);
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(() => parseActivityUrlState(searchParams), [searchParams]);

  // Relative-time ticker (the КОГДА column ages without refetching).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const wireFilters = useMemo(
    () => ({
      type: urlState.type,
      agent: urlState.agent,
      host: urlState.host,
      task_id: urlState.task_id,
    }),
    [urlState.type, urlState.agent, urlState.host, urlState.task_id],
  );
  const feed = useActivityFeed(wireFilters);
  const buckets = useActivityBuckets(wireFilters);
  const live = useActivityLive();
  // Reconnect refetch is owned by the task-events bridge (taskEvents.ts —
  // the SSE recovery invalidates the activity keys there); the page does
  // not watch the counter (single-owner rule, review P3-4).
  const reducedMotion = useReducedMotion();

  // Registry join for the КТО/ГДЕ columns (shared roster cache).
  const executors = useExecutors();
  const executorNameOf = useMemo(() => {
    const byId = new Map((executors.data?.items ?? []).map((row) => [row.id, row.name]));
    return (id: string): string | undefined => byId.get(id);
  }, [executors.data]);
  const executorHostOf = useMemo(() => {
    const byId = new Map((executors.data?.items ?? []).map((row) => [row.id, row.host]));
    return (id: string): string | undefined => byId.get(id);
  }, [executors.data]);
  const hostOptions = useMemo(() => {
    const hosts = new Set((executors.data?.items ?? []).map((row) => row.host).filter(Boolean));
    return [...hosts].sort((a, b) => a.localeCompare(b));
  }, [executors.data]);

  // — live withholding (the «N новых» plate, §5.2) ---------------------------
  const [pendingIds, setPendingIds] = useState<readonly string[]>([]);
  const [freshIds, setFreshIds] = useState<readonly string[]>([]);
  const [lastTerminalLine, setLastTerminalLine] = useState<string | null>(null);
  const seenLiveRef = useRef<Set<string>>(new Set());
  const [atTop, setAtTop] = useState(true);
  const atTopRef = useRef(true);
  useEffect(() => {
    const onScroll = (): void => {
      const top = window.scrollY <= TOP_EPSILON_PX;
      atTopRef.current = top;
      setAtTop(top);
      if (top) {
        // Back at the top — the withheld «N новых» rows flush (event-driven;
        // the reader asked for them by scrolling back, spec §5.2).
        setPendingIds((prev) => (prev.length > 0 ? [] : prev));
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Newcomers: at the top they prepend aloud (flash 2 s, rows never shift);
  // scrolled away they are withheld into the plate — never under the reader.
  useEffect(() => {
    const newcomers = live.items.filter((row) => !seenLiveRef.current.has(row.id));
    if (newcomers.length === 0) return;
    for (const row of newcomers) seenLiveRef.current.add(row.id);
    const terminal = newcomers.find((row) => TERMINAL_KINDS.has(row.kind));
    if (terminal) {
      setLastTerminalLine(`${verbLine(terminal, t)} · ${terminal.task_id}`);
    }
    if (atTopRef.current) {
      setFreshIds(newcomers.map((row) => row.id));
      const timer = setTimeout(() => setFreshIds([]), FRESH_MS);
      return () => clearTimeout(timer);
    }
    setPendingIds((prev) => [
      ...newcomers.map((row) => row.id).filter((id) => !prev.includes(id)),
      ...prev,
    ]);
  }, [live.items, t]);

  const scrollToFeedTop = (): void => {
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  };

  // — merged + filtered display rows -----------------------------------------
  const pageRows = useMemo(
    () => feed.data?.pages.flatMap((page) => page.items) ?? [],
    [feed.data],
  );
  const liveItems = useMemo(() => live.items.map(liveToItem), [live.items]);
  const shownLive = useMemo(
    () => liveItems.filter((row) => !pendingIds.includes(row.id)),
    [liveItems, pendingIds],
  );
  const merged = useMemo(() => mergeActivityRows(pageRows, shownLive), [pageRows, shownLive]);
  const rows = useMemo(
    () => merged.filter((row) => filterActivityItem(row, urlState)),
    [merged, urlState],
  );

  // The plate counts only rows the CURRENT filters would actually show.
  const pendingCount = useMemo(() => {
    const byId = new Map(liveItems.map((row) => [row.id, row]));
    return pendingIds.filter((id) => {
      const row = byId.get(id);
      return row !== undefined && filterActivityItem(row, urlState);
    }).length;
  }, [pendingIds, liveItems, urlState]);

  // Window floor: with ?from set, once the oldest loaded row is older than
  // the window the cursor has paged past it — an honest end, not a spinner.
  const windowExhausted =
    urlState.from !== undefined &&
    pageRows.length > 0 &&
    Date.parse(pageRows[pageRows.length - 1].ts) < Date.parse(urlState.from);
  const feedEnded = !feed.hasNextPage || windowExhausted;

  // P2-1: the free-text task filter debounces into the URL — a per-keystroke
  // patch would spam history AND fire a GET per character. The input is
  // UNCONTROLLED (keyed by the URL value, so direct-open/reset/chips reset
  // it by remount — no state-mirroring effect); typing arms a 300 ms commit
  // with replace:true (typing is one refinement, not N back-steps). Chips
  // and selects keep their push semantics.
  const taskInputRef = useRef<HTMLInputElement>(null);
  const [taskDirty, setTaskDirty] = useState(false);
  useEffect(() => {
    if (!taskDirty) return;
    const timer = setTimeout(() => {
      const value = taskInputRef.current?.value.trim() ?? "";
      setSearchParams(
        serializeActivityUrlState({ ...urlState, task_id: value || undefined }),
        { replace: true },
      );
      setTaskDirty(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [taskDirty, urlState, setSearchParams]);

  const patch = (changes: Partial<ActivityUrlState>, replace = false): void => {
    setSearchParams(serializeActivityUrlState({ ...urlState, ...changes }), {
      replace,
    });
  };

  const toggleFamily = (family: ActivityType): void => {
    const current = new Set(activityTypeTokens(urlState).filter(isFamilyToken));
    if (current.has(family)) current.delete(family);
    else current.add(family);
    const ordered = ACTIVITY_FAMILIES.filter((family_) => current.has(family_));
    patch({ type: ordered.length > 0 ? ordered.join(",") : undefined });
  };

  const activeFamilies = useMemo(
    () => new Set(activityTypeTokens(urlState).filter(isFamilyToken)),
    [urlState],
  );

  // Chart axis (Ф2): full 24 h regardless of the wire's bucket density;
  // coalesced to two-hour bars below 640 px (spec §7).
  const chartSlots = useMemo(() => buildPulseAxis(buckets.data?.buckets ?? [], now), [buckets.data, now]);
  const [narrowViewport, setNarrowViewport] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const onChange = (): void => setNarrowViewport(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const displaySlots = useMemo(
    () => (narrowViewport ? coalescePulseSlots(chartSlots, 2) : chartSlots),
    [chartSlots, narrowViewport],
  );

  const selectedHour = (fromIso: string | undefined): void => {
    if (fromIso === undefined) {
      patch({ from: undefined, to: undefined });
      return;
    }
    const span = narrowViewport ? 2 : 1;
    patch({
      from: fromIso,
      to: new Date(Date.parse(fromIso) + span * 60 * 60 * 1000).toISOString(),
    });
  };

  if (!capable) {
    return <TasksUnsupported />;
  }

  const filtered = hasActiveActivityFilters(urlState);

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h1 id="activity-title" className="text-xl font-semibold">
          {t("activity.title")}
        </h1>
        <p className="text-sm text-foreground-secondary">{t("activity.subtitle")}</p>
      </div>
      <LiveIndicator state={live.streamState} lastDataAt={live.lastDataAt} lang={lang} t={t} />
    </div>
  );

  if (feed.isPending) {
    return (
      <section aria-labelledby="activity-title" className="mx-auto max-w-5xl space-y-4">
        {header}
        <div role="status" aria-label={t("activity.loading")}>
          <ActivityFeedSkeleton />
        </div>
      </section>
    );
  }

  if (feed.isError) {
    return (
      <section aria-labelledby="activity-title" className="mx-auto max-w-5xl space-y-4">
        {header}
        <EmptyState
          variant="error"
          title={t("activity.loadFailed")}
          message={feed.error.message}
          action={
            <Button variant="outline" onClick={() => void feed.refetch()}>
              {t("activity.retry")}
            </Button>
          }
        />
      </section>
    );
  }

  return (
    <section aria-labelledby="activity-title" className="mx-auto max-w-5xl space-y-4">
      {header}

      {/* Filters — ALL state in the URL (§5.3); direct-open reproduces the view. */}
      <form
        aria-label={t("activity.filter.label")}
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => event.preventDefault()}
      >
        {ACTIVITY_FAMILIES.map((family) => (
          <button
            key={family}
            type="button"
            aria-pressed={activeFamilies.has(family)}
            onClick={() => toggleFamily(family)}
            className="rounded-sm transition-colors duration-instant focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
          >
            <Badge variant={activeFamilies.has(family) ? "iris" : "outline"} className="cursor-pointer px-2 py-1">
              {t(`activity.type.${family}`)}
            </Badge>
          </button>
        ))}
        <div className="flex flex-col gap-0.5">
          <label htmlFor="activity-agent" className="sr-only">
            {t("activity.filter.agent")}
          </label>
          <select
            id="activity-agent"
            value={urlState.agent ?? ""}
            disabled={hostOptions.length === 0 && (executors.data?.items.length ?? 0) === 0}
            onChange={(event) => patch({ agent: event.target.value || undefined })}
            className="h-8 rounded-md border border-border bg-well px-2 text-sm text-foreground focus-visible:border-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
          >
            <option value="">{t("activity.filter.agent")}</option>
            {(executors.data?.items ?? []).map((executor) => (
              <option key={executor.id} value={executor.id}>
                {executor.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <label htmlFor="activity-host" className="sr-only">
            {t("activity.filter.host")}
          </label>
          <select
            id="activity-host"
            value={urlState.host ?? ""}
            disabled={hostOptions.length === 0}
            onChange={(event) => patch({ host: event.target.value || undefined })}
            className="h-8 rounded-md border border-border bg-well px-2 text-sm text-foreground focus-visible:border-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
          >
            <option value="">{t("activity.filter.host")}</option>
            {hostOptions.map((host) => (
              <option key={host} value={host}>
                {host}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex flex-col gap-0.5">
            <label htmlFor="activity-task" className="sr-only">
              {t("activity.filter.task")}
            </label>
            <input
              id="activity-task"
              key={urlState.task_id ?? ""}
              ref={taskInputRef}
              type="search"
              defaultValue={urlState.task_id ?? ""}
              placeholder={t("activity.filter.taskPlaceholder")}
              onChange={() => setTaskDirty(true)}
              className="h-8 w-44 rounded-md border border-border bg-well px-2 text-sm text-foreground placeholder:text-foreground-muted focus-visible:border-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
            />
          </div>
          {urlState.task_id ? (
            <button
              type="button"
              aria-label={t("activity.filter.clearTask")}
              onClick={() => {
                if (taskInputRef.current) taskInputRef.current.value = "";
                setTaskDirty(false);
                patch({ task_id: undefined }, true);
              }}
              className="rounded-sm p-1 text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              patch({
                type: undefined,
                agent: undefined,
                host: undefined,
                task_id: undefined,
                from: undefined,
                to: undefined,
              })
            }
          >
            {t("activity.clearFilters")}
          </Button>
        ) : null}
      </form>

      <ActivityPulseChart
        slots={displaySlots}
        groupHours={narrowViewport ? 2 : 1}
        selectedFrom={urlState.from}
        onSelect={selectedHour}
        reducedMotion={reducedMotion}
      />

      {/* The plate: rows never move under the reader (§5.2). */}
      {!atTop && pendingCount > 0 ? (
        <div className="sticky top-2 z-10 flex justify-center">
          <button
            type="button"
            onClick={scrollToFeedTop}
            className="rounded-full border border-border-iris bg-well px-4 py-1.5 text-sm text-foreground shadow-well transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
          >
            {t("activity.newBatch", { count: pendingCount })}
          </button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          variant="empty"
          title={t("activity.emptyTitle")}
          message={filtered ? t("activity.emptyFiltered") : t("activity.emptyMessage")}
          action={
            filtered ? (
              <Button
                variant="outline"
                onClick={() =>
                  patch({
                    type: undefined,
                    agent: undefined,
                    host: undefined,
                    task_id: undefined,
                    from: undefined,
                    to: undefined,
                  })
                }
              >
                {t("activity.clearFilters")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* aria-live=off: the stream must not speak over the reader;
           * terminal transitions go aloud through the polite region below. */}
          <ul
            aria-live="off"
            aria-label={t("activity.feed.label")}
            className="flex flex-col"
            style={{ gap: "var(--list-gap)" }}
          >
            {rows.map((row) => (
              <ActivityRow
                key={row.id}
                row={row}
                fresh={freshIds.includes(row.id)}
                executorNameOf={executorNameOf}
                executorHostOf={executorHostOf}
                lang={lang}
                now={now}
                t={t}
              />
            ))}
          </ul>
          <p aria-live="polite" className="sr-only">
            {lastTerminalLine ?? ""}
          </p>
          <div className="flex justify-center py-2">
            {feedEnded ? (
              <p className="text-sm text-foreground-muted" role="status">
                {t("activity.feedEnd")}
              </p>
            ) : (
              <Button
                variant="outline"
                onClick={() => void feed.fetchNextPage()}
                disabled={feed.isFetchingNextPage}
              >
                {feed.isFetchingNextPage ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {t("activity.loadMore")}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// --- pieces -------------------------------------------------------------------

const TERMINAL_KINDS: ReadonlySet<string> = new Set([
  "assignment.done",
  "assignment.failed",
  "assignment.cancelled",
  "assignment.expired",
]);

function isFamilyToken(token: string): token is ActivityType {
  return (ACTIVITY_FAMILIES as readonly string[]).includes(token);
}

/** Verb + moved-detail one-liner for the aloud region. */
function verbLine(
  row: { kind: string; report_kind?: "intermediate" | "final"; detail?: string },
  t: TranslateFn,
): string {
  const meta = activityKindMeta(row.kind, row.report_kind === "final");
  if (!meta) return row.kind;
  let verb = t(meta.verbKey);
  if (row.kind === "task.moved" && row.detail) {
    verb += `: ${renderMovedDetail(row.detail, t)}`;
  }
  return verb;
}

/** «переведена: в работе → решено» — column keys translate, raw text passes. */
function renderMovedDetail(detail: string, t: TranslateFn): string {
  return movedDetailParts(detail)
    .map((part) => {
      const columnKey = movedPartColumnKey(part);
      return columnKey !== null ? t(columnKey) : part;
    })
    .join(" → ");
}

function LiveIndicator({
  state,
  lastDataAt,
  lang,
  t,
}: {
  state: "connecting" | "open" | "closed" | "none";
  lastDataAt: number;
  lang: "ru" | "en";
  t: TranslateFn;
}) {
  if (state === "none") return null; // no stream (mock mode) — honest silence
  if (state === "open") {
    return (
      <p className="flex items-center gap-1.5 text-sm text-foreground-secondary">
        <span className="relative flex size-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-30" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        {t("activity.live")}
      </p>
    );
  }
  const time = lastDataAt > 0 ? formatClockTime(new Date(lastDataAt).toISOString(), lang) : "—";
  return (
    <p
      className="flex items-center gap-1.5 text-sm text-confidence"
      role="status"
    >
      <span className="inline-block size-2 rounded-full bg-confidence" aria-hidden="true" />
      {t("activity.reconnecting", { time })}
    </p>
  );
}

function ActivityRow({
  row,
  fresh,
  executorNameOf,
  executorHostOf,
  lang,
  now,
  t,
}: {
  row: ActivityItem;
  fresh: boolean;
  executorNameOf: (id: string) => string | undefined;
  executorHostOf: (id: string) => string | undefined;
  lang: "ru" | "en";
  now: number;
  t: TranslateFn;
}) {
  const location = useLocation();
  const meta = activityKindMeta(row.kind, row.report_kind === "final");
  if (!meta) return null; // additive-only dictionary: unknown kinds wait
  const Icon = meta.icon;
  const isReport = row.kind === "report";

  // ЗАДАЧА: reports drill into ?tab=reports, execution into ?tab=execution,
  // status facts into the card itself — every link carries `return=`.
  const tab = isReport ? "reports" : row.kind.startsWith("assignment.") ? "execution" : undefined;
  const target = tab !== undefined ? `/tasks/${encodeURIComponent(row.task_id)}?tab=${tab}` : `/tasks/${encodeURIComponent(row.task_id)}`;
  const href = withReturn(target, location.pathname, location.search);

  // КТО: the §2.3 grammar — absent actor renders NO badge (honest gap).
  // Class-named actors (owner/board/services) take their label key; device
  // and agent actors take the resolved NAME (registry join, raw-id fallback).
  const actor = row.actor !== undefined ? parseActor(row.actor) : undefined;
  const actorLabel =
    actor === undefined
      ? undefined
      : (actor.labelKey !== undefined ? t(actor.labelKey) : resolveActorName(actor, executorNameOf));

  // ГДЕ: the row's read-time host wins; otherwise the registry resolves
  // the executor id (spec §2.4 — host is a place fact, never presence).
  const host =
    row.host ?? (row.executor_id !== undefined ? executorHostOf(row.executor_id) : undefined);

  return (
    <li
      className={
        "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-sm border border-transparent px-2 py-1.5 text-sm transition-colors " +
        (fresh ? "bg-iris/10" : "")
      }
      style={{ minHeight: "var(--row-h)" }}
    >
      <Icon
        className={`size-4 shrink-0 self-center ${accentColorClass(meta.accent)}`}
        aria-hidden="true"
      />
      {/* КОГДА: relative here, the exact stamp in the title. */}
      <span
        className="font-mono text-xs text-foreground-muted"
        title={formatAbsoluteStamp(row.ts, lang)}
      >
        {formatRelativeActivityTime(row.ts, lang, now)}
      </span>
      <span className="text-foreground-secondary">
        {verbLine(row, t)}
      </span>
      <Link
        to={href}
        className="inline-flex min-h-6 min-w-0 items-baseline gap-1.5 rounded-sm py-0.5 underline-offset-2 hover:text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        <span className="font-mono text-xs">{row.task_id}</span>
        {row.task_title ? (
          <span className="truncate text-xs text-foreground-muted">{row.task_title}</span>
        ) : null}
      </Link>
      {actor !== undefined && actorLabel !== undefined ? (
        <span
          className="rounded-full border border-border px-1.5 py-px text-xs text-foreground-secondary"
          title={actor.title}
        >
          {actorLabel}
        </span>
      ) : null}
      {host ? (
        <span className="font-mono text-xs text-foreground-muted" title={host}>
          {host}
        </span>
      ) : null}
      {isReport && row.detail ? (
        <span className="min-w-0 flex-1 basis-full text-xs text-foreground-muted">
          <TextEngine text={row.detail} variant="compact" />
        </span>
      ) : null}
    </li>
  );
}

/** Loading skeleton — same row rhythm, no layout jump on resolve (§5.1). */
function ActivityFeedSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col" style={{ gap: "var(--list-gap)" }}>
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-2 px-2 py-1.5"
          style={{ minHeight: "var(--row-h)" }}
        >
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}


