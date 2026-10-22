import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { useExecutors } from "@/features/agents/useAgents";
import { useTaskInbox } from "@/features/tasks/useTasks";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { isKoraUnauthorized } from "./koraGateway";
import { KoraSignInCta } from "./KoraSignInCta";
import { KoraNavPanel } from "./KoraNavPanel";
import { KoraMetaPanel } from "./KoraMetaPanel";
import { type KoraBlock2Context } from "./KoraSessionList";
import { KoraWorkzone, type KoraRegistryEmpty } from "./KoraWorkzone";
import { KoraResizeHandle, seamPx } from "./KoraResizeHandle";
import { useKoraEtherBridge, useKoraEtherRows } from "./useKoraEther";
import {
  KORA_NAV_DEFAULT,
  KORA_NAV_MAX,
  KORA_NAV_MIN,
  KORA_SIDE_DEFAULT,
  KORA_SIDE_MAX,
  KORA_SIDE_MIN,
  readKoraLeftW,
  readKoraSideW,
  writeKoraLeftW,
  writeKoraSideW,
} from "./koraFrameStorage";
import { NOOP_KORA_INTENT_EVENTS } from "./koraIntentEvents";
import { buildKoraTree, koraSummary, type KoraQuickFilter } from "./koraWorkspaceModel";
import {
  useKoraSessionPages,
  useKoraTranscriptPages,
  useKoraHermesStatus,
  useKoraHermesPull,
  useKoraHermesTranscriptPages,
} from "./useKora";
import { pageGridClass } from "@/layout/pageGrid";
import { useKoraEntered } from "@/telemetry/useKoraEntered"; // ME-041: kora.entered

/**
 * The Kora workspace — the v7 frame in its KW1 «ТРИ КОЛОНКИ» cut
 * (kora-rethink blueprint §3–4): from ≥lg the page is a 100vh app frame —
 * NO page scroll, every surface scrolls inside itself (07l §1.2). Geometry:
 * the 40px-style header row (now carrying the real «ждут владельца» badge —
 * the ex-Пульт UI-30 counter), then ONE grid with THREE columns — the LEFT
 * navigation panel (Блок 1 tree + Блок 2 sessions + the pinned cluster-chat
 * entry + the hermes source line, `vesmaro.koraLeftW`), the central column
 * (the work zone as it stands — the chat split is KW2) and the RIGHT meta
 * panel (О СЕССИИ / ДАЙДЖЕСТ / ЭФИР / ПОКРЫТИЕ, one scroll, states.md §5
 * defaults). Both widths are REAL seams (07l §3: pointer drag + full
 * keyboard path + persist on commit). Below lg the frame reflows honestly
 * (07l §1.5): the seams leave, the page scrolls (nav → center → meta —
 * the ladder tuning is KW3).
 *
 * The ПУЛЬТ is dissolved (blueprint §6): the strip leaves the structure,
 * the Дайджест/Эфир wings moved into the meta panel, the badge moved into
 * the header; the height hardware survives in useKoraBandHeight for KW2's
 * «Все ходы» zone. The Эфир ring now has ONE mount (the meta block).
 *
 * Selection stays a ROUTE (/kora/:sessionId) — the frame never re-assembles,
 * the center's content changes. The 401 gate / error / not-found states
 * keep the document flow (they are not the frame).
 *
 * И1 honest cuts kept: no fake counters, the composer's send is deferred;
 * the Эфир feeds ONLY from the real bus (one stream per workspace, the ring
 * lives in koraEtherStore). Everything data-shaped reads the EXISTING slice
 * 1–2 seams (the paged session registry, the paged transcript cursor, the
 * executors registry, the UI-30 inbox).
 */

const PAGE_SIZE = 50;

/** The hermes source option VALUE in the ONE filter select (T004 slice 2).
 * Mirrors the reserved synthetic executor id — the registry filter branch
 * keys on harness=hermes, so the value only routes the select. */
const HERMES_SOURCE = "hermes";

export function KoraWorkspace({
  sessionId = null,
  cluster = false,
}: {
  sessionId?: string | null;
  /** The RESERVED /kora/hermes segment (kora-rethink blueprint §5): the
   * cluster-chat mode is ROUTE-driven — it no longer depends on the filter
   * being hermes with nothing selected. */
  cluster?: boolean;
}) {
  const t = useT();
  const navigate = useNavigate();
  const sessions = useKoraSessionPages(PAGE_SIZE);
  // T004 slice 3 — ONE transcript leg per source: the canonical
  // «hermes:<native>» deep link rides the LIVE hermes messages route, the
  // registry ids ride the zcode transcript route. The id prefix is the
  // routing fact (the FE only ever links the canonical form), so the
  // disabled hook stays a no-op instead of a guaranteed-404 call.
  const hermesDeepLink = sessionId !== null && sessionId.startsWith(`${HERMES_SOURCE}:`);
  // T004 slice 3 — the chat anchor: the api_server session of the source,
  // the LAST ACTIVE one (live first, then freshest) — the conversation the
  // chat continues. No api_server row (pre-pull, or the cluster serves
  // other sources only) → the chat starts from a clean slate, honestly.
  // (Hoisted ABOVE the transcript hooks: KW2's ONE messages read targets it
  // in the cluster mode.)
  const items = sessions.items;
  const hermesChatSession = useMemo(() => {
    const api = items.filter(
      (item) => item.harness === "hermes" && item.project === "hermes:api_server",
    );
    if (api.length === 0) return null;
    const live = api.filter((item) => item.state === "live");
    const pool = live.length > 0 ? live : api;
    // last_activity_at is nullable on the frozen row — «fresher» compares
    // with the empty string as the floor (a missing stamp is the oldest).
    return pool.reduce((a, b) =>
      (a.last_activity_at ?? "") >= (b.last_activity_at ?? "") ? a : b,
    );
  }, [items]);
  // KW2 (kora-rethink blueprint §6): ONE hermes messages read per session
  // at the workspace level — the chat filters user/assistant out of it, the
  // «Все ходы» zone shows the full grammar; a pagination click is ONE
  // request (gate §10.6, test-pinned). The target: a selected hermes
  // session rides its own id; the cluster rides the anchor's.
  const hermesTarget = hermesDeepLink
    ? sessionId
    : cluster
      ? (hermesChatSession?.id ?? undefined)
      : undefined;
  const transcript = useKoraTranscriptPages(
    sessionId !== null && !hermesDeepLink ? sessionId : undefined,
    PAGE_SIZE,
  );
  const hermesTranscript = useKoraHermesTranscriptPages(hermesTarget, PAGE_SIZE);
  // kora.entered (taxonomy §1.2 #3): settle = first honest verdict of the
  // page the visit entered (list vs deep-linked transcript). The cluster
  // route settles on the registry read — the chat's own skeleton lives
  // inside the split, the frame's verdict is the nav's.
  useKoraEntered(
    hermesDeepLink
      ? !hermesTranscript.isPending
      : sessionId !== null
        ? !transcript.isPending
        : !sessions.isPending,
  );
  const executors = useExecutors();

  // The Эфир: ONE stream for the workspace; since KW1 the ring has ONE
  // mount — the meta panel's Эфир block (the scene card left with the
  // Пульт; koraEtherStore stays the single source).
  useKoraEtherBridge();
  const etherRows = useKoraEtherRows();

  // The right-panel (meta) seam (07l §3.1): width state + persist on commit.
  const [sideW, setSideW] = useState<number>(readKoraSideW);
  const onSideValue = useCallback((next: number): void => setSideW(next), []);
  const onSideCommit = useCallback((): void => {
    writeKoraSideW(sideW);
  }, [sideW]);
  const onSideReset = useCallback((): void => {
    setSideW(KORA_SIDE_DEFAULT);
    writeKoraSideW(KORA_SIDE_DEFAULT);
  }, []);

  // The LEFT navigation seam (kora-rethink blueprint §4, KW1): same seam
  // hardware, `vesmaro.koraLeftW` (220–380, def 280).
  const [leftW, setLeftW] = useState<number>(readKoraLeftW);
  const onLeftValue = useCallback((next: number): void => setLeftW(next), []);
  const onLeftCommit = useCallback((): void => {
    writeKoraLeftW(leftW);
  }, [leftW]);
  const onLeftReset = useCallback((): void => {
    setLeftW(KORA_NAV_DEFAULT);
    writeKoraLeftW(KORA_NAV_DEFAULT);
  }, []);

  // §9.3 honest-empty branching: the connect CTA only shows when the
  // executor registry zero is a FACT; undefined (pending/failed/ incapable
  // gateway) resolves to the scanner variant, which promises nothing.
  const executorsCount = executors.data?.items.length;
  const noExecutors = executorsCount === 0;

  const unauthorized =
    (sessions.error !== null && isKoraUnauthorized(sessions.error)) ||
    (transcript.error !== null && isKoraUnauthorized(transcript.error)) ||
    (hermesTranscript.error !== null && isKoraUnauthorized(hermesTranscript.error));

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
  // write the same context; Блок 2 + the tree dimming follow it. The
  // agents-hosts deep link (`/kora?host=<host>`, B1 «Сессии в Кору») lands
  // with the host filter preset — INITIAL-ONLY: the select stays the owner
  // of the context afterwards.
  const [context, setContext] = useState<KoraBlock2Context>(() => {
    if (typeof window === "undefined") return { kind: "all" };
    const host = new URLSearchParams(window.location.search).get("host");
    return host ? { kind: "host", host } : { kind: "all" };
  });
  const [quickFilter, setQuickFilter] = useState<KoraQuickFilter | null>(null);
  const contextHost =
    context.kind === "host"
      ? context.host
      : context.kind === "agent"
        ? context.host
        : null;

  // T004 slice 2 — the hermes source (cluster) as a FIRST-CLASS filter: the
  // status read is DATA (no live probe, no pulse); the pull runs ONLY on the
  // explicit refresh button. The context branches read/writes stay local.
  const hermesStatus = useKoraHermesStatus();
  const hermesPull = useKoraHermesPull();

  const contextSessions = useMemo(() => {
    if (context.kind === "all") return items;
    if (context.kind === "host") {
      return model.hosts
        .filter((host) => host.host === context.host)
        .flatMap((host) => host.agents.flatMap((agent) => [...agent.sessions]));
    }
    if (context.kind === "hermes") {
      return items.filter((item) => item.harness === "hermes");
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
    // The hermes SOURCE option (T004 slice 2) rides the same ONE filter
    // select: value "hermes" selects the cluster-source context, "" clears.
    if (host === HERMES_SOURCE) {
      setContext({ kind: "hermes" });
      return;
    }
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
  ]
    // The reserved synthetic hermes executor is NOT a host — its rows are
    // the SOURCE option above (T004 slice 2); listing it twice splits the
    // one source into two filter targets.
    .filter((host) => host.length > 0 && host !== HERMES_SOURCE);

  // The pinned «Чат с кластером» entry (blueprint §4–5): KW2 lands the
  // dedicated route — the click WRITES /kora/hermes (deep-linkable, the
  // reserved segment) and keeps the hermes filter context for the nav.
  // KEPT ABOVE THE EARLY RETURNS: hooks never ride a render branch.
  const onClusterChat = useCallback((): void => {
    setContext({ kind: "hermes" });
    navigate("/kora/hermes");
  }, [navigate]);

  // The route seam of the chat's session switcher (blueprint §4): the
  // cluster option → /kora/hermes, a context session → /kora/:sessionId —
  // both deep-linkable, the frame never re-assembles.
  const onChatNavigateSession = useCallback(
    (id: string | null): void => {
      if (id === null) {
        navigate("/kora/hermes");
        return;
      }
      navigate(`/kora/${encodeURIComponent(id)}`);
    },
    [navigate],
  );

  // The hermes split contract (KW2): non-null iff a hermes mode is on
  // stage — the cluster route or a selected hermes session.
  const hermesSplit =
    cluster || session?.harness === "hermes"
      ? {
          session: cluster ? hermesChatSession : session,
          pages: hermesTranscript,
          models: hermesStatus.data?.models ?? [],
          defaultModel: hermesStatus.data?.default_model ?? null,
          sessions: contextSessions,
          activeSessionId: cluster ? null : hermesDeepLink ? sessionId : null,
          onNavigateSession: onChatNavigateSession,
        }
      : null;

  // ── The 401 gate: the CTA replaces every data-shaped surface (the old
  // hotfix contract, kept verbatim through the rework). ──
  if (unauthorized) {
    return (
      <section aria-labelledby="kora-title" className={pageGridClass("operational", "space-y-4")}>
        <Header
          summary={null}
          hostOptions={[]}
          context={context}
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
      <section aria-labelledby="kora-title" className={pageGridClass("operational", "space-y-4")}>
        <Header
          summary={null}
          hostOptions={[]}
          context={context}
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
      <section aria-labelledby="kora-title" className={pageGridClass("operational", "space-y-4")}>
        <Header
          summary={items.length > 0 ? summary : null}
          hostOptions={hostOptions}
          context={context}
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
    /* The v7 frame (07l §1.2): from lg the section IS the viewport minus
     * the shell chrome (topbar 48 + crumbs 40 + main's p-6 ×2 — and the
     * Vesma nest pad when on; the arithmetic lives in --kora-frame-h,
     * global.css) — no page scroll; below lg it degrades to the stacked
     * document flow (nav → center → meta). */
    <section
      aria-labelledby="kora-title"
      className={cn(
        pageGridClass("operational"),
        "flex flex-col gap-4 lg:h-[var(--kora-frame-h)] lg:gap-3 lg:overflow-hidden",
      )}
    >
      <div className="shrink-0">
        <Header
          summary={items.length > 0 ? summary : null}
          hostOptions={hostOptions}
          context={context}
          onSelectHost={selectHost}
          quickFilter={quickFilter}
          onQuickFilter={setQuickFilter}
        />
      </div>

      <div
        className="relative grid min-h-0 min-w-0 flex-1 items-start gap-6 lg:grid-cols-[var(--kora-left-w)_minmax(0,1fr)_var(--kora-right-w)] lg:items-stretch lg:gap-0"
        style={
          {
            "--kora-left-w": `${leftW}px`,
            "--kora-right-w": `${sideW}px`,
          } as React.CSSProperties
        }
      >
        {/* LEFT: the navigation panel (kora-rethink blueprint §4) — tree →
         * sessions → the pinned cluster-chat entry → the hermes source
         * line, ONE panel scroll. Flush inside the frame (§1.2), a card
         * below lg. */}
        <aside
          aria-label={t("kora.nav.region")}
          className="kora-scroll min-h-0 min-w-0 overflow-y-auto rounded-md border border-myelin bg-well lg:rounded-none lg:border-0"
        >
          <KoraNavPanel
            model={model}
            treeReady={treeReady}
            context={context}
            contextSessions={contextSessions}
            quickFilter={quickFilter}
            onQuickFilter={setQuickFilter}
            sessionId={sessionId}
            selectedSessionId={sessionId}
            noExecutors={noExecutors}
            sessionsEmpty={registryEmpty !== null}
            activeHost={contextHost ?? ""}
            onSelectHostContext={selectHost}
            onSelectAgentContext={(agent) =>
              selectAgent(
                agent.executorId,
                agent.harness,
                agent.executor?.host ?? null,
              )
            }
            hermesRefresh={
              context.kind === "hermes"
                ? {
                    onRefresh: () => void hermesPull.mutate(),
                    pending: hermesPull.isPending,
                  }
                : null
            }
            hermesStatus={hermesStatus.data ?? null}
            hermesStatusPending={hermesStatus.isPending}
            hermesStatusError={hermesStatus.isError}
            hermesPullError={hermesPull.error}
            clusterActive={cluster}
            onClusterChat={onClusterChat}
          />
        </aside>

        {/* The LEFT SEAM (07l §3 anatomy, blueprint §4): col-resize on the
         * nav panel's right edge — pointer drag + full keyboard path +
         * dblclick reset, persist on commit. Grows RIGHTWARD (dragSign -1).
         * Lives only inside the frame (≥lg). */}
        <KoraResizeHandle
          orientation="vertical"
          label={t("kora.resize.nav.label")}
          tooltip={t("kora.resize.side.tooltip")}
          min={KORA_NAV_MIN}
          max={KORA_NAV_MAX}
          value={leftW}
          valueText={seamPx(leftW)}
          dragSign={-1}
          onValue={onLeftValue}
          onCommit={onLeftCommit}
          onReset={onLeftReset}
          className="absolute inset-y-0 left-[var(--kora-left-w)] hidden -translate-x-1/2 lg:flex"
        />

        {/* CENTRAL column: the work zone — KW2 «Живой чат»: the hermes
         * modes ride the SPLIT (chat + «Все ходы»), zcode/vscode/pi stay
         * the full-page transcript. Flush inside the frame, a card below
         * lg. The Пульт is gone (KW1): no strip, no wings here. */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-myelin bg-well lg:rounded-none lg:border-0">
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
              hermes={hermesSplit}
              intentEvents={NOOP_KORA_INTENT_EVENTS}
            />
          )}
        </div>

        {/* The RIGHT SEAM (07l §3): pointer drag with capture, the full
         * keyboard path (arrows/Home/End/Esc), dblclick reset, persist on
         * commit. Lives only inside the frame (≥lg). */}
        <KoraResizeHandle
          orientation="vertical"
          label={t("kora.resize.side.label")}
          tooltip={t("kora.resize.side.tooltip")}
          min={KORA_SIDE_MIN}
          max={KORA_SIDE_MAX}
          value={sideW}
          valueText={seamPx(sideW)}
          dragSign={1}
          onValue={onSideValue}
          onCommit={onSideCommit}
          onReset={onSideReset}
          className="absolute inset-y-0 left-[calc(100%-var(--kora-right-w))] hidden -translate-x-1/2 lg:flex"
        />

        {/* RIGHT: the meta panel (kora-rethink blueprint §4) — О СЕССИИ /
         * ДАЙДЖЕСТ / ЭФИР / ПОКРЫТИЕ, ONE panel scroll, the states.md §5
         * defaults (about+ether open, digest+coverage folded). */}
        <aside
          aria-label={t("kora.meta.region")}
          className="kora-scroll min-h-0 min-w-0 overflow-y-auto rounded-md border border-myelin bg-well lg:rounded-none lg:border-0"
        >
          <KoraMetaPanel
            session={session}
            coverage={sessions.coverage}
            etherRows={etherRows}
            hostFilter={contextHost}
          />
        </aside>
      </div>
    </section>
  );
}

/** The real UI-30 counter (ex-Пульт badge, kora-rethink blueprint §4):
 * null while unknown (hidden badge), 0 = muted. */
function useWaitingCount(): number | null {
  const inbox = useTaskInbox();
  if (inbox.isPending || inbox.isError) return null;
  return inbox.data?.count ?? null;
}

/** The 40px-style header row (07l §1.3, И1 in-flow form): H1 with the
 * «Кора» name explanation in its tooltip, the derived summary numbers
 * (mono; «идущие»/«за 24 ч» click into the Блок 2 quick filters), the
 * «ждут владельца» badge (the REAL UI-30 inbox counter — moved here from
 * the dissolved Пульт; hidden while the count is unknown, a fake 0 would
 * lie) and the ONE host filter. No numbers while data is pending. */
function Header({
  summary,
  hostOptions,
  context,
  onSelectHost,
  quickFilter,
  onQuickFilter,
}: {
  summary: { hosts: number; running: number; day: number } | null;
  hostOptions: readonly string[];
  /** The page's ONE filter context — the select's value maps it verbatim. */
  context: KoraBlock2Context;
  onSelectHost: (host: string) => void;
  quickFilter: KoraQuickFilter | null;
  onQuickFilter: (filter: KoraQuickFilter | null) => void;
}) {
  const t = useT();
  const waiting = useWaitingCount();
  const contextHost =
    context.kind === "host"
      ? context.host
      : context.kind === "agent"
        ? context.host
        : null;
  const selectValue =
    contextHost ?? (context.kind === "hermes" ? HERMES_SOURCE : "");

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
        {waiting !== null ? (
          <Link
            to="/tasks/inbox"
            title={t("kora.header.waitingHint")}
            className={cn(
              "inline-flex min-h-12 md:min-h-6 shrink-0 items-center rounded-full border border-border-subtle px-2 font-mono text-xs tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
              waiting === 0
                ? "text-foreground-muted"
                : "border-border-iris text-iris-bright",
            )}
          >
            {t("kora.header.waiting", { n: waiting })}
          </Link>
        ) : null}
        <label className="sr-only" htmlFor="kora-host-filter">
          {t("kora.filter.label")}
        </label>
        <select
          id="kora-host-filter"
          value={selectValue}
          onChange={(event) => onSelectHost(event.target.value)}
          className="h-12 md:h-7 rounded-md border border-border-subtle bg-background px-2 text-xs text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
        >
          <option value="">{t("kora.filter.all")}</option>
          <option value={HERMES_SOURCE}>{t("kora.hermes.filterOption")}</option>
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
      className="min-h-12 md:min-h-6 rounded-sm px-1 underline-offset-2 transition-colors duration-instant hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright aria-pressed:text-iris-bright aria-pressed:underline"
    >
      {label}
    </button>
  );
}
