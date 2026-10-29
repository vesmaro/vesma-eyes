import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
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
import { KoraMetaPanel } from "./KoraMetaPanel";
import { KoraWorkzone, type KoraRegistryEmpty } from "./KoraWorkzone";
import { KoraDock } from "./KoraDock";
import { KoraHostField } from "./KoraHostField";
import { KoraTreePanel } from "./KoraTree";
import { HermesSourceLine } from "./KoraHermesSource";
import { KoraResizeHandle, seamPx } from "./KoraResizeHandle";
import { useKoraEtherBridge, useKoraEtherRows } from "./useKoraEther";
import {
  KORA_DOCK_DEFAULT,
  KORA_DOCK_MAX,
  KORA_DOCK_MIN,
  KORA_SIDE_DEFAULT,
  KORA_SIDE_MAX,
  KORA_SIDE_MIN,
  readKoraDockW,
  readKoraSideW,
  writeKoraDockW,
  writeKoraSideW,
} from "./koraFrameStorage";
import { NOOP_KORA_INTENT_EVENTS } from "./koraIntentEvents";
import {
  NOOP_KORA_FRAME_EVENTS,
  type KoraFrameEventPoints,
} from "./koraFrameEvents";
import { useIsFrameViewport } from "./koraViewport";
import { buildKoraTree, koraSummary, type KoraQuickFilter } from "./koraWorkspaceModel";
import type { KoraHarnessOption } from "./KoraComposerControls";
import { useKoraSpecialistAnnotation } from "./koraSpecialistStore";
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
 * The Kora workspace — the Kora IDE В1 THREE-zone frame (kora-ide contract
 * §2, wave В1; the KW4 «ПОЛЕ ХОСТА + ПРАВАЯ ПАНЕЛЬ» cut is the base it
 * extends): from ≥lg the page is a 100vh app frame — NO page scroll, every
 * surface scrolls inside itself (07l §1.2). Geometry: the 40px-style header
 * row (the real «ждут владельца» badge), then ONE grid with THREE columns —
 * the permanent LEFT DOCK «Сессии» (K-INV-1: immoveable — selection never
 * changes its composition/width/scroll/focus; the pin «Чат с кластером»
 * moved here from the tree; three views over the loaded registry), the
 * CENTRAL column (the context bar «хост · харнес · модель · специалист ·
 * режим» — the В2 full line, only the fields that ARE real; absent facts
 * are omitted, never placeholders; then the host FIELD at /kora/host/:host, the hermes
 * split at /kora/hermes, the frozen session modes at /kora/:sessionId, the
 * invitation at /kora — the modes byte-for-byte, K-INV-4) and the RIGHT
 * panel «Дерево и мета» (the v2 tree — search + hosts→agents, the pin
 * lives in the dock now — then the KW3 meta blocks, ONE panel scroll).
 * TWO real seams (07l §3): the dock width `--kora-dock-w` (220–380,
 * default 300 — the NEW vesmaro.koraDockW key; the dead vesmaro.koraLeftW
 * stays unread) and the right panel width `--kora-right-w` (240–420,
 * default 320) — both the KoraResizeHandle mechanics: pointer drag + full
 * keyboard path + persist on commit. Below lg the frame reflows honestly
 * (07l §1.5, KW3 precedent): document flow — dock card → center card →
 * tree card → meta card, the page scrolls.
 *
 * Selection is ROUTE-driven everywhere (K-INV-2, blueprint-kw4 §4): the
 * field's agent chips write ?agent=, the tree rows link /kora/host/:host
 * (+?agent=), the dock rows link the frozen /kora/:sessionId, the dock pin
 * links /kora/hermes. The 401 gate / error / not-found states keep the
 * document flow (they are not the frame).
 *
 * И1 honest cuts kept: no fake counters; the Эфир feeds ONLY from the real
 * bus (one stream per workspace, the ring lives in koraEtherStore — ONE
 * mount, the meta panel). Everything data-shaped reads the EXISTING
 * slice 1–2 seams (the paged session registry, the paged transcript
 * cursor, the executors registry, the UI-30 inbox).
 */

const PAGE_SIZE = 50;

/** The hermes session id prefix (T004 slice 3) — the canonical deep-link
 * form for the source's sessions; the routing fact, not a filter value. */
const HERMES_ID_PREFIX = "hermes:";

export function KoraWorkspace({
  sessionId = null,
  host = null,
  cluster = false,
  frameEvents = NOOP_KORA_FRAME_EVENTS,
}: {
  sessionId?: string | null;
  /** The decoded :host route param (/kora/host/:host) — null = not the
   * field route (the invitation / hermes / a session mode). */
  host?: string | null;
  /** The RESERVED /kora/hermes segment (kora-rethink blueprint §5): the
   * cluster-chat mode is ROUTE-driven. */
  cluster?: boolean;
  /** The frame telemetry call points (KW3): seam commits ride them — a
   * no-op until the taxonomy v1 revision names the kinds. */
  frameEvents?: KoraFrameEventPoints;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessions = useKoraSessionPages(PAGE_SIZE);
  // T004 slice 3 — ONE transcript leg per source: the canonical
  // «hermes:<native>» deep link rides the LIVE hermes messages route, the
  // registry ids ride the zcode transcript route. The id prefix is the
  // routing fact (the FE only ever links the canonical form), so the
  // disabled hook stays a no-op instead of a guaranteed-404 call.
  const hermesDeepLink =
    sessionId !== null && sessionId.startsWith(HERMES_ID_PREFIX);
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
  // page the visit entered (field vs list vs deep-linked transcript).
  useKoraEntered(
    hermesDeepLink
      ? !hermesTranscript.isPending
      : sessionId !== null
        ? !transcript.isPending
        : !sessions.isPending,
  );
  const executors = useExecutors();

  // The Эфир: ONE stream for the workspace; since KW1 the ring has ONE
  // mount — the meta panel's Эфир block.
  useKoraEtherBridge();
  const etherRows = useKoraEtherRows();

  // The right-panel («Дерево и мета») seam (07l §3.1): width state + persist
  // on commit. The DOCK seam (kora-ide contract §2): the returned left
  // zone's width — the NEW vesmaro.koraDockW key (the dead koraLeftW stays
  // unread, KW4 §5 precedent). A failed write sets the honest
  // K-PERSIST-FAIL bit — the dock names it, nothing pretends to persist.
  const [sideW, setSideW] = useState<number>(readKoraSideW);
  const onSideValue = useCallback((next: number): void => setSideW(next), []);
  const onSideCommit = useCallback((): void => {
    writeKoraSideW(sideW);
    frameEvents.seamCommitted("meta");
  }, [sideW, frameEvents]);
  const onSideReset = useCallback((): void => {
    setSideW(KORA_SIDE_DEFAULT);
    writeKoraSideW(KORA_SIDE_DEFAULT);
  }, []);

  const [dockW, setDockW] = useState<number>(readKoraDockW);
  const [persistFail, setPersistFail] = useState(false);
  const onDockValue = useCallback((next: number): void => setDockW(next), []);
  const onDockCommit = useCallback((): void => {
    if (!writeKoraDockW(dockW)) setPersistFail(true);
    frameEvents.seamCommitted("dock");
  }, [dockW, frameEvents]);
  const onDockReset = useCallback((): void => {
    setDockW(KORA_DOCK_DEFAULT);
    if (!writeKoraDockW(KORA_DOCK_DEFAULT)) setPersistFail(true);
  }, []);
  const onPersistFail = useCallback((): void => setPersistFail(true), []);

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

  // В2 — the composer selector row's harness facts: the harnesses of
  // execution the LOADED registry actually knows, with their session
  // counts (a pure derivation — zero new requests, contract §5.4). The
  // current session's own harness unions in inside the controls (its
  // count may honestly be unknown past the loaded pages).
  const harnessOptions = useMemo<KoraHarnessOption[]>(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.harness, (counts.get(item.harness) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([harness, count]) => ({ harness, count }))
      .sort((a, b) => a.harness.localeCompare(b.harness));
  }, [items]);

  // states-kw4 §4 — the session-mode breadcrumb's host: the registry group
  // that owns the session's executor. A registry miss (unknown-host group)
  // reads «← Кора» — no invented host name, one way back.
  const sessionHost = useMemo(() => {
    if (session === null) return null;
    for (const group of [...model.hosts, ...model.unknown]) {
      if (group.agents.some((agent) => agent.executorId === session.executor_id)) {
        return group.host;
      }
    }
    return null;
  }, [session, model]);

  // The route IS the page context (KW4): ?agent= selects the field's agent
  // (empty → the freshest default, K-CTX-NO-AGENT). The quick filter stays
  // local UI state — the field owns the only chips that read it.
  const agentParam = searchParams.get("agent");
  const [quickFilter, setQuickFilter] = useState<KoraQuickFilter | null>(null);

  // The field's agent chip click: writes ?agent= (route = selection); the
  // selected chip's second click returns to the default agent.
  const onSelectAgent = useCallback(
    (executorId: string): void => {
      if (searchParams.get("agent") === executorId) setSearchParams({});
      else setSearchParams({ agent: executorId });
    },
    [searchParams, setSearchParams],
  );

  // T004 slice 2 — the hermes status read is DATA (no live probe, no
  // pulse); the pull runs ONLY on the explicit panel refresh button.
  const hermesStatus = useKoraHermesStatus();
  const hermesPull = useKoraHermesPull();

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
  // stage — the cluster route or a selected hermes session. The switcher's
  // list: the hermes rows in the cluster mode (the pin-click parity), the
  // whole registry slice in a session mode (the deep-link parity).
  const hermesSessions = useMemo(
    () => items.filter((item) => item.harness === "hermes"),
    [items],
  );
  const hermesSplit =
    cluster || session?.harness === "hermes"
      ? {
          session: cluster ? hermesChatSession : session,
          pages: hermesTranscript,
          models: hermesStatus.data?.models ?? [],
          defaultModel: hermesStatus.data?.default_model ?? null,
          sessions: cluster ? hermesSessions : items,
          activeSessionId: cluster ? null : hermesDeepLink ? sessionId : null,
          onNavigateSession: onChatNavigateSession,
        }
      : null;

  // The hermes context line + the ONE manual refresh (T004 slice 2) ride
  // the right panel under the tree (blueprint-kw4 §2: HermesSourceLine →
  // правая панель); shown only when a hermes mode is on stage.
  const hermesMode = cluster || session?.harness === "hermes";
  const hermesLine = hermesMode ? (
    <div className="mt-3 space-y-1 border-t border-myelin-hairline pt-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={hermesPull.isPending}
        onClick={() => void hermesPull.mutate()}
        className="min-h-12 px-2 font-mono text-xs text-foreground-secondary md:min-h-6"
      >
        {hermesPull.isPending
          ? t("kora.hermes.refreshing")
          : t("kora.hermes.refresh")}
      </Button>
      <HermesSourceLine
        status={hermesStatus.data ?? null}
        isPending={hermesStatus.isPending}
        isError={hermesStatus.isError}
        pullError={hermesPull.error}
      />
    </div>
  ) : null;

  // The right-panel tree element (blueprint-kw4 §3) — ONE element, two
  // placements (the ladder): a section of the panel at ≥lg, its own card
  // at the top of the document flow below lg. Exactly ONE instance mounts
  // in every regime (the aria-controls id uniqueness lesson, W2-1).
  const treePanel = (
    <KoraTreePanel
      model={model}
      treeReady={treeReady}
      activeHost={host ?? ""}
      activeAgentId={agentParam}
      hermesLine={hermesLine}
    />
  );

  // The sessions DOCK element (kora-ide contract §2.1) — ONE element, the
  // same two placements as the tree: the frame's left column at ≥lg, its
  // own document-flow card (FIRST in the flow) below lg. Props are
  // registry-derived only — route changes never remount or re-seed it
  // (K-INV-1: the dock does not move when the selection does).
  const dockPanel = (
    <KoraDock
      items={items}
      model={model}
      dockReady={treeReady}
      registryEmpty={registryEmpty}
      hasMore={sessions.hasMore}
      isLoadingMore={sessions.isLoadingMore}
      onLoadMore={() => void sessions.loadMore()}
      selectedSessionId={sessionId}
      clusterActive={cluster}
      persistFail={persistFail}
      onPersistFail={onPersistFail}
    />
  );

  // The CENTER context bar (kora-ide contract §2.2) — «где я сейчас», the
  // В2 FULL line «хост · харнес · модель · специалист · режим»: only the
  // fields that ARE real today — an absent fact is NOT rendered as a
  // placeholder («пустой слот не рисуем», §4 rule; the В1 mock-drift
  // brief). Model: only where a roster EXISTS (Q3 — the hermes roster's
  // server default from /status; local sessions report no models, the
  // slot omits rather than invents). Specialist: the session's LOCAL
  // annotation (koraSpecialistStore) when one is chosen. Skipped while
  // the registry/deep-link resolves (no invented «where»).
  const resolvingContext = sessions.isPending || resolvingDeepLink;
  const centerMode = host !== null
    ? "field"
    : session !== null
      ? session.harness === "hermes"
        ? "chat"
        : "transcript"
      : cluster
        ? "chat"
        : "invite";
  // Q3: the model fact rides the hermes roster ONLY (the default_model is
  // the server's own value; the chat header select remains the live
  // override). Nothing renders for the local sessions — no models are
  // reported (K-TREE-MODEL-UNKNOWN).
  const contextModel =
    (cluster || session?.harness === "hermes") && hermesStatus.isSuccess
      ? (hermesStatus.data.default_model ??
        hermesStatus.data.models?.[0] ??
        null)
      : null;
  // The hook is unconditional (rules of hooks); no session → the empty
  // key honestly resolves to null.
  const contextSpecialist = useKoraSpecialistAnnotation(sessionId ?? "");
  const contextSegments = resolvingContext
    ? null
    : [
        host ?? sessionHost,
        session?.harness ?? (cluster ? "hermes" : null),
        contextModel,
        contextSpecialist,
        t(`kora.context.mode.${centerMode}`),
      ]
        .filter((segment): segment is string => segment !== null && segment !== "")
        .join(" · ");
  const contextBar = contextSegments === null ? null : (
    <div className="shrink-0 border-b border-myelin-hairline px-4 py-1">
      <p className="truncate font-mono text-xs text-foreground-secondary">
        {contextSegments}
      </p>
    </div>
  );

  // The responsive ladder (blueprint-kw4 §6): ≥lg — the two-zone 100vh
  // frame; <lg — the document flow (tree → center → meta), the seams leave.
  const frameViewport = useIsFrameViewport();

  // ── The 401 gate: the CTA replaces every data-shaped surface (the old
  // hotfix contract, kept verbatim through the rework). ──
  if (unauthorized) {
    return (
      <section aria-labelledby="kora-title" className={pageGridClass("operational", "space-y-4")}>
        <Header summary={null} />
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
        <Header summary={null} />
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
        <Header summary={items.length > 0 ? summary : null} />
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
     * document flow (tree → center → meta). */
    <section
      aria-labelledby="kora-title"
      className={cn(
        pageGridClass("operational"),
        "flex flex-col gap-4 lg:h-[var(--kora-frame-h)] lg:gap-3 lg:overflow-hidden",
      )}
    >
      <div className="shrink-0">
        <Header summary={items.length > 0 ? summary : null} />
      </div>

      <div
        className={cn(
          "relative grid min-h-0 min-w-0 flex-1 items-start gap-4 lg:grid-cols-[var(--kora-dock-w)_minmax(0,1fr)_var(--kora-right-w)] lg:items-stretch lg:gap-0",
        )}
        style={
          {
            "--kora-dock-w": `${dockW}px`,
            "--kora-right-w": `${sideW}px`,
          } as React.CSSProperties
        }
      >
        {/* The DOCK «Сессии» (kora-ide contract §2.1) — the frame's FIRST
         * column at ≥lg (a flush panel, its own scroll), its own document-
         * flow card below lg (the ladder's first rung: док → центр →
         * панель). ONE instance in every regime. */}
        {frameViewport ? (
          <aside
            aria-label={t("kora.dock.region")}
            className="kora-scroll min-h-0 min-w-0 overflow-y-auto"
          >
            {dockPanel}
          </aside>
        ) : (
          <section
            aria-label={t("kora.dock.region")}
            className="rounded-md border border-myelin bg-well px-3 py-3"
          >
            {dockPanel}
          </section>
        )}

        {/* CENTRAL column: the context bar (контекст «хост · харнес ·
         * режим» — kora-ide contract §2.2) above the host FIELD at
         * /kora/host/:host (chips + grouped sessions — the В1 keeps the
         * field as the honest host-context presentation; the composer
         * chat-surface replaces it in В2), the KW2 hermes split / the
         * frozen session modes / the invitation ride KoraWorkzone
         * untouched. Flush inside the frame, a card below lg. */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-myelin bg-well lg:rounded-none lg:border-0">
          {contextBar}
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
          ) : host !== null ? (
            <KoraHostField
              host={host}
              model={model}
              quickFilter={quickFilter}
              onQuickFilter={setQuickFilter}
              selectedAgentId={agentParam}
              onSelectAgent={onSelectAgent}
              hasMore={sessions.hasMore}
              isLoadingMore={sessions.isLoadingMore}
              onLoadMore={() => void sessions.loadMore()}
            />
          ) : (
            <>
              {/* states-kw4 §4: the breadcrumb above the session head —
               * «← <хост> · поле» back to the field; unknown host → «←
               * Кора» (no invented name). Session modes stay byte-identical
               * — this rides ABOVE KoraWorkzone, the workzone is untouched. */}
              {session !== null ? (
                <div className="shrink-0 border-b border-myelin-hairline px-4 py-1">
                  <Link
                    to={
                      sessionHost !== null
                        ? `/kora/host/${encodeURIComponent(sessionHost)}`
                        : "/kora"
                    }
                    className="inline-flex min-h-12 items-center gap-1 text-sm text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:min-h-6"
                  >
                    {sessionHost !== null
                      ? t("kora.breadcrumb.field", { host: sessionHost })
                      : t("kora.breadcrumb.kora")}
                  </Link>
                </div>
              ) : null}
              <KoraWorkzone
                session={session}
                registryEmpty={registryEmpty}
                coverage={sessions.coverage}
                transcript={transcript}
                hermes={hermesSplit}
                intentEvents={NOOP_KORA_INTENT_EVENTS}
                frameEvents={frameEvents}
                harnessOptions={harnessOptions}
                resolvedModel={contextModel}
              />
            </>
          )}
        </div>

        {/* The DOCK SEAM (07l §3, kora-ide contract §2): pointer drag with
         * capture, the full keyboard path (arrows/Home/End/Esc), dblclick
         * reset, persist on commit — vesmaro.koraDockW. The dock's edge is
         * its RIGHT one (dragSign −1: drag right / ArrowRight widen). Lives
         * only inside the frame (≥lg). */}
        <KoraResizeHandle
          orientation="vertical"
          label={t("kora.resize.dock.label")}
          tooltip={t("kora.resize.side.tooltip")}
          min={KORA_DOCK_MIN}
          max={KORA_DOCK_MAX}
          value={dockW}
          valueText={seamPx(dockW)}
          dragSign={-1}
          onValue={onDockValue}
          onCommit={onDockCommit}
          onReset={onDockReset}
          className="absolute inset-y-0 left-[var(--kora-dock-w)] hidden -translate-x-1/2 lg:flex"
        />

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

        {/* The TREE CARD (<lg ladder): the v2 tree is its own document-
         * flow section AFTER the center (kora-ide contract §2.5: док →
         * центр → панель). At ≥lg it lives inside the panel instead —
         * this card does not mount there (one instance). */}
        {!frameViewport ? (
          <section
            aria-label={t("kora.panel.region")}
            className="rounded-md border border-myelin bg-well px-3 py-3"
          >
            {treePanel}
          </section>
        ) : null}

        {/* RIGHT: the «Дерево и мета» panel (blueprint-kw4 §2–3) — the v2
         * tree on top (pin + search + hosts→agents + the hermes line),
         * then the KW3 meta blocks (О СЕССИИ / ДАЙДЖЕСТ / ЭФИР /
         * ПОКРЫТИЕ), ONE panel scroll. Below lg it is its own document-
         * flow card (the last rung of the ladder). */}
        <aside
          aria-label={
            frameViewport ? t("kora.panel.region") : t("kora.meta.region")
          }
          className="kora-scroll min-h-0 min-w-0 overflow-y-auto rounded-md border border-myelin bg-well lg:rounded-none lg:border-0"
        >
          {frameViewport ? (
            <div className="border-b border-myelin-hairline px-3 py-3">
              {treePanel}
            </div>
          ) : null}
          <KoraMetaPanel
            session={session}
            coverage={sessions.coverage}
            etherRows={etherRows}
            hostFilter={host}
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
 * (mono, plain — the quick filters moved into the field, KW4; the header
 * numbers are DERIVATIVES, not controls) and the «ждут владельца» badge
 * (the REAL UI-30 inbox counter — hidden while the count is unknown, a
 * fake 0 would lie). The retired select-filter is GONE: the page context
 * is the route now (blueprint-kw4 §2, ТЛ verdict). No numbers while data
 * is pending. */
function Header({
  summary,
}: {
  summary: { hosts: number; running: number; day: number } | null;
}) {
  const t = useT();
  const waiting = useWaitingCount();

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
          <span>{t("kora.summary.running", { n: summary.running })}</span>
          <span>{t("kora.summary.day", { n: summary.day })}</span>
        </p>
      ) : null}
      {waiting !== null ? (
        <Link
          to="/tasks/inbox"
          title={t("kora.header.waitingHint")}
          className={cn(
            "ml-auto inline-flex min-h-12 md:min-h-6 shrink-0 items-center rounded-full border border-border-subtle px-2 font-mono text-xs tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
            waiting === 0
              ? "text-foreground-muted"
              : "border-border-iris text-iris-bright",
          )}
        >
          {t("kora.header.waiting", { n: waiting })}
        </Link>
      ) : null}
    </header>
  );
}
