import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { useExecutors } from "@/features/agents/useAgents";
import { useT } from "@/i18n";
import { isKoraUnauthorized } from "./koraGateway";
import { KoraSignInCta } from "./KoraSignInCta";
import { KoraTree } from "./KoraTree";
import { KoraSessionList, type KoraBlock2Context } from "./KoraSessionList";
import { KoraWorkzone, type KoraRegistryEmpty } from "./KoraWorkzone";
import { KoraPult } from "./KoraPult";
import { NOOP_KORA_INTENT_EVENTS } from "./koraIntentEvents";
import type { KoraCoverage } from "./koraTypes";
import { buildKoraTree, koraSummary, type KoraQuickFilter } from "./koraWorkspaceModel";
import { useKoraSessionPages, useKoraTranscriptPages } from "./useKora";

/**
 * The Kora workspace (union И1, 07j §3 / 07l §1–2): ONE composition for
 * both kora routes — the central work zone + the right panel (Блок 1 tree,
 * Блок 2 sessions, the coverage legend) + the Пульт strip docked to the
 * central column with a myelin seam («стык без зазора»). Selecting a
 * session is a ROUTE (/kora/:sessionId) — the frame stays mounted, the
 * center's content changes; the route table itself is untouched.
 *
 * И1 honest cuts (i1-dressing-map §1.2): the frame lives in the Shell's
 * DOCUMENT scroll (100vh/resize/drawer hardware is И3); no Эфир and no
 * Дайджест content (no source until И4 — the Пульт names what arrives);
 * the send is honestly deferred (07j §4.6). Everything data-shaped reads
 * the EXISTING slice 1–2 seams: the paged session registry, the paged
 * transcript cursor, the executors registry (hosts), the UI-30 inbox.
 */

const PAGE_SIZE = 50;

export function KoraWorkspace({ sessionId = null }: { sessionId?: string | null }) {
  const t = useT();
  const sessions = useKoraSessionPages(PAGE_SIZE);
  const transcript = useKoraTranscriptPages(sessionId ?? undefined, PAGE_SIZE);
  const executors = useExecutors();

  // §9.3 honest-empty branching: the connect CTA only shows when the
  // executor registry zero is a FACT; undefined (pending/failed/ incapable
  // gateway) resolves to the scanner variant, which promises nothing.
  const executorsCount = executors.data?.items.length;
  const noExecutors = executorsCount === 0;

  const unauthorized =
    (sessions.error !== null && isKoraUnauthorized(sessions.error)) ||
    (transcript.error !== null && isKoraUnauthorized(transcript.error));

  const items = sessions.items;
  const session = useMemo(
    () =>
      sessionId === null ? null : (items.find((item) => item.id === sessionId) ?? null),
    [items, sessionId],
  );
  // A deep link may point past the loaded pages: keep appending until the
  // session turns up or the cursor honestly ends (one query, no second
  // read). The ref keeps the effect deps stable; items.length re-triggers
  // the append per loaded page.
  const resolvingDeepLink =
    sessionId !== null &&
    session === null &&
    sessions.hasMore &&
    sessions.error === null &&
    !unauthorized;
  const loadMoreRef = useRef(sessions.loadMore);
  useEffect(() => {
    loadMoreRef.current = sessions.loadMore;
  });
  useEffect(() => {
    if (resolvingDeepLink) void loadMoreRef.current();
  }, [resolvingDeepLink, items.length]);

  const model = useMemo(
    () => buildKoraTree(items, executors.data?.items ?? []),
    [items, executors.data],
  );
  const summary = useMemo(() => koraSummary(model, items), [model, items]);

  // The ONE page filter (07j §3.2): the header select and the tree clicks
  // write the same context; Блок 2 + the tree dimming follow it.
  const [context, setContext] = useState<KoraBlock2Context>({ kind: "all" });
  const [quickFilter, setQuickFilter] = useState<KoraQuickFilter | null>(null);
  const contextHost =
    context.kind === "host"
      ? context.host
      : context.kind === "agent"
        ? context.host
        : null;

  const contextSessions = useMemo(() => {
    if (context.kind === "all") return items;
    if (context.kind === "host") {
      return model.hosts
        .filter((host) => host.host === context.host)
        .flatMap((host) => host.agents.flatMap((agent) => [...agent.sessions]));
    }
    return items.filter((item) => item.executor_id === context.executorId);
  }, [context, items, model]);

  const registryEmpty: KoraRegistryEmpty =
    !sessions.isPending && sessions.error === null && items.length === 0
      ? noExecutors
        ? "no-executors"
        : "no-sessions"
      : null;

  // The tree needs BOTH reads settled (hosts come from the executors
  // registry); an incapable/failed registry read degrades to the
  // executor-id grouping, never to a skeleton forever.
  const executorsSettled =
    executors.isSuccess ||
    executors.isError ||
    (!executors.isFetching && executors.isPending);
  const treeReady = !sessions.isPending && executorsSettled;

  const selectHost = (host: string) => {
    if (host === "") {
      setContext({ kind: "all" });
      return;
    }
    setContext((previous) =>
      previous.kind === "host" && previous.host === host
        ? { kind: "all" }
        : { kind: "host", host },
    );
  };
  const selectAgent = (executorId: string, harness: string, host: string | null) => {
    setContext({ kind: "agent", executorId, harness, host });
  };

  const hostOptions = [
    ...model.hosts.map((host) => host.host ?? ""),
    ...model.unknown.map((host) => host.agents[0]?.executorId ?? ""),
  ].filter((host) => host.length > 0);

  // ── The 401 gate: the CTA replaces every data-shaped surface (the old
  // hotfix contract, kept verbatim through the rework). ──
  if (unauthorized) {
    return (
      <section aria-labelledby="kora-title" className="mx-auto max-w-3xl space-y-4">
        <Header
          summary={null}
          hostOptions={[]}
          contextHost={null}
          onSelectHost={() => undefined}
          quickFilter={null}
          onQuickFilter={() => undefined}
        />
        {sessionId !== null ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/kora">
                <ArrowLeft aria-hidden className="size-4" />
                {t("kora.session.backToList")}
              </Link>
            </Button>
            <h2 className="min-w-0 truncate font-mono text-sm text-foreground-secondary">
              {sessionId}
            </h2>
          </div>
        ) : null}
        <KoraSignInCta
          title={
            sessionId !== null
              ? t("kora.session.inactiveTitle")
              : t("kora.list.inactiveTitle")
          }
          message={
            sessionId !== null
              ? t("kora.transcript.inactiveHint")
              : t("kora.list.inactiveHint")
          }
          refetch={async () => {
            await sessions.refetch();
            await transcript.refetch();
          }}
        />
      </section>
    );
  }

  // ── The honest retry state: 5xx/transport keeps the error + retry. ──
  if (sessions.error !== null) {
    return (
      <section aria-labelledby="kora-title" className="mx-auto max-w-3xl space-y-4">
        <Header
          summary={null}
          hostOptions={[]}
          contextHost={null}
          onSelectHost={() => undefined}
          quickFilter={null}
          onQuickFilter={() => undefined}
        />
        <EmptyState
          variant="error"
          title={t("kora.list.loadFailed")}
          techDetail={sessions.error.message}
          action={
            <Button variant="outline" onClick={() => void sessions.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      </section>
    );
  }

  // ── Not-found: the cursor honestly ended and the id is not in the registry. ──
  if (
    sessionId !== null &&
    session === null &&
    !resolvingDeepLink &&
    !sessions.isPending
  ) {
    return (
      <section aria-labelledby="kora-title" className="mx-auto max-w-3xl space-y-4">
        <Header
          summary={items.length > 0 ? summary : null}
          hostOptions={hostOptions}
          contextHost={contextHost}
          onSelectHost={selectHost}
          quickFilter={quickFilter}
          onQuickFilter={setQuickFilter}
        />
        <EmptyState
          variant="not-found"
          title={t("kora.session.notFound")}
          message={t("kora.session.notFoundMessage", { id: sessionId })}
          action={
            <Button variant="outline" asChild>
              <Link to="/kora">{t("kora.session.backToList")}</Link>
            </Button>
          }
        />
      </section>
    );
  }

  return (
    <section aria-labelledby="kora-title" className="mx-auto max-w-6xl">
      <Header
        summary={items.length > 0 ? summary : null}
        hostOptions={hostOptions}
        contextHost={contextHost}
        onSelectHost={selectHost}
        quickFilter={quickFilter}
        onQuickFilter={setQuickFilter}
      />

      <div className="mt-4 grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-4">
        {/* Central column: work zone + Пульт, ONE contour with a myelin
         * seam (07l §2 — стык без зазора). */}
        <div className="min-w-0 overflow-hidden rounded-md border border-myelin bg-well">
          {sessions.isPending || resolvingDeepLink ? (
            <div
              role="status"
              aria-label={t("kora.list.loading")}
              className="space-y-3 px-6 py-6"
            >
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          ) : (
            <KoraWorkzone
              session={session}
              registryEmpty={registryEmpty}
              coverage={sessions.coverage}
              transcript={transcript}
              intentEvents={NOOP_KORA_INTENT_EVENTS}
            />
          )}
          <KoraPult hasSession={session !== null} />
        </div>

        {/* Right panel: Блок 1 → Блок 2 → the coverage legend (07j §3.3–3.5). */}
        <aside
          aria-label={t("kora.side.region")}
          className="min-w-0 rounded-md border border-myelin bg-well"
        >
          <div className="space-y-4 px-3 py-3">
            <section aria-label={t("kora.tree.title")}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                {t("kora.tree.title")}
              </h2>
              <p className="mt-1 text-xs text-foreground-muted">
                {t("kora.tree.explain")}
              </p>
              <div className="mt-2">
                {!treeReady ? (
                  <div
                    role="status"
                    aria-label={t("kora.list.loading")}
                    className="space-y-2"
                  >
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-5 w-1/2" />
                  </div>
                ) : (
                  <KoraTree
                    model={model}
                    selectedId={sessionId}
                    activeHost={contextHost ?? ""}
                    onHostContext={selectHost}
                    onAgentContext={(agent) =>
                      selectAgent(
                        agent.executorId,
                        agent.harness,
                        agent.executor?.host ?? null,
                      )
                    }
                  />
                )}
              </div>
            </section>

            <KoraSessionList
              context={context}
              sessions={contextSessions}
              quickFilter={quickFilter}
              onQuickFilter={setQuickFilter}
              selectedId={sessionId}
              coverage={sessions.coverage}
              noExecutors={noExecutors}
              sessionsEmpty={registryEmpty !== null}
            />

            <CoverageLegend coverage={sessions.coverage} />
          </div>
        </aside>
      </div>
    </section>
  );
}

/** The 40px-style header row (07l §1.3, И1 in-flow form): H1 with the
 * «Кора» name explanation in its tooltip, the derived summary numbers
 * (mono; «идущие»/«за 24 ч» click into the Блок 2 quick filters), the ONE
 * host filter. No numbers while data is pending — no fake counters. */
function Header({
  summary,
  hostOptions,
  contextHost,
  onSelectHost,
  quickFilter,
  onQuickFilter,
}: {
  summary: { hosts: number; running: number; day: number } | null;
  hostOptions: readonly string[];
  contextHost: string | null;
  onSelectHost: (host: string) => void;
  quickFilter: KoraQuickFilter | null;
  onQuickFilter: (filter: KoraQuickFilter | null) => void;
}) {
  const t = useT();

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1
        id="kora-title"
        title={t("kora.workspace.hint")}
        className="text-lg font-semibold"
      >
        {t("kora.workspace.title")}
      </h1>
      {summary !== null ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums text-foreground-secondary">
          <span>{t("kora.summary.hosts", { n: summary.hosts })}</span>
          <SummaryChip
            active={quickFilter === "running"}
            label={t("kora.summary.running", { n: summary.running })}
            onClick={() => onQuickFilter(quickFilter === "running" ? null : "running")}
          />
          <SummaryChip
            active={quickFilter === "day"}
            label={t("kora.summary.day", { n: summary.day })}
            onClick={() => onQuickFilter(quickFilter === "day" ? null : "day")}
          />
        </p>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        <label className="sr-only" htmlFor="kora-host-filter">
          {t("kora.filter.label")}
        </label>
        <select
          id="kora-host-filter"
          value={contextHost ?? ""}
          onChange={(event) => onSelectHost(event.target.value)}
          className="h-7 rounded-md border border-border-subtle bg-background px-2 text-xs text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
        >
          <option value="">{t("kora.filter.all")}</option>
          {hostOptions.map((host) => (
            <option key={host} value={host}>
              {host}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}

function SummaryChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="min-h-6 rounded-sm px-1 underline-offset-2 transition-colors duration-instant hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright aria-pressed:text-iris-bright aria-pressed:underline"
    >
      {label}
    </button>
  );
}

/** «Что мы видим с ваших машин» (07j §3.5): the registry's real coverage —
 * per-harness visibility + the explicit gaps — folded below the data. */
function CoverageLegend({ coverage }: { coverage: KoraCoverage | null | undefined }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  if (coverage === null || coverage === undefined) return null;
  return (
    <section aria-label={t("kora.legend.title")}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="kora-legend-body"
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-6 w-full items-center gap-1.5 rounded-sm text-left text-xs font-semibold uppercase tracking-wide text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        {expanded ? "▾" : "▸"} {t("kora.legend.title")}
      </button>
      {expanded ? (
        <div id="kora-legend-body" className="mt-2 space-y-1.5 text-xs">
          {coverage.harnesses.map((row) => (
            <p key={row.harness} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-foreground-secondary">{row.harness}</span>
              <span className="text-foreground-secondary">
                {t(`kora.coverage.support.${row.support}`)}
              </span>
              {row.note ? (
                <span className="basis-full text-foreground-muted">{row.note}</span>
              ) : null}
            </p>
          ))}
          {coverage.gaps.length > 0 ? (
            <div>
              <p className="font-medium text-foreground-secondary">
                {t("kora.coverage.gaps")}
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-foreground-muted">
                {coverage.gaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-foreground-muted">{t("kora.legend.growNote")}</p>
        </div>
      ) : null}
    </section>
  );
}
