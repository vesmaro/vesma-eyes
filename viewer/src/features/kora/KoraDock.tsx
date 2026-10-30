import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import {
  Check,
  ChevronDown,
  ChevronRight,
  EyeOff,
  MoreHorizontal,
  Pencil,
  Radio,
  Search,
  Star,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { KoraSession } from "./koraTypes";
import {
  readKoraDockGroups,
  readKoraDockView,
  writeKoraDockGroups,
  writeKoraDockView,
  type KoraDockView,
} from "./koraFrameStorage";
import {
  clearKoraDockHidden,
  setKoraDockAlias,
  setKoraDockHidden,
  setKoraDockPinned,
  useKoraDockAlias,
  useKoraDockAliases,
  useKoraDockCustomPersistFailure,
  useKoraDockHidden,
  useKoraDockPins,
} from "./koraDockCustomStore";
import {
  buildProjectGroups,
  koraAgeUnit,
  koraGroupListId,
  koraSessionName,
  pathBasename,
  quickFilterMatches,
  type KoraQuickFilter,
  type KoraWorkspaceModel,
} from "./koraWorkspaceModel";
import type { KoraRegistryEmpty } from "./KoraWorkzone";

/**
 * The sessions DOCK (Kora IDE contract §2.1/§3.1, wave В1 + В4) — the
 * permanent LEFT zone the KW4 two-zone frame retired. The dock is IMMOVABLE
 * (K-INV-1): selecting a session, a harness or a host never changes the
 * dock's composition, width, scroll or focus — only the CENTER changes with
 * the route. The pin «★ Чат с кластером» moves here from the tree (the
 * reserved /kora/hermes route is untouched, K-INV-2).
 *
 * Three views over the ALREADY-LOADED registry slice — zero new requests
 * (contract §5.4, gate: деривации над загруженным реестром):
 * - «По работе» — buildProjectGroups cwd/source groups, AS IS (KW4
 *   grammar, verdict Q6: преемственность);
 * - «По хосту» — host → harness groups, the tree-v2 grammar;
 * - «Таймлайн» — one flat list, freshest activity first.
 *
 * Quick filters («идёт» / «за 24 ч») and the client search filter BEFORE
 * grouping — an emptied group never renders (07c §3). Honest empties:
 * K-DOCK-PENDING (skeletons), K-DOCK-EMPTY (registry facts, action-free —
 * the connect CTA lives ONCE, in the center, ME-072),
 * K-DOCK-FILTERED-EMPTY (with the reset), K-DOCK-SEARCH-0 and — В4 —
 * K-DOCK-HIDDEN (everything this view would show is hidden LOCALLY: the
 * line names the count and offers the way back; hiding is client-side,
 * no server archive exists and none is pretended).
 *
 * В4 customization (contract §3.1/§7 В4, the koraDockCustomStore): the
 * pin-SECTION of sessions above the views (beside the cluster pin), the
 * LOCAL aliases (the «локально» badge — the server name is never
 * rewritten, it stays the row's tooltip) and the LOCAL hiding. The
 * customization is a LOCAL overlay end to end: pinned rows render from
 * the LOADED slice only (a pin past the loaded pages renders nothing —
 * no invented rows), the search reads aliases alongside the honest row
 * words, and a refused storage write raises the honest K-PERSIST-FAIL
 * bit (the store's bit rides the dock's own line). Persistence: the view
 * and the group open-set ride localStorage (vesmaro.koraDockView /
 * vesmaro.koraDockGroups), the customization rides the В4 keys
 * (vesmaro.koraDockPins / vesmaro.koraDockHidden /
 * vesmaro.koraAlias:{sessionId}) — nothing pretends to persist.
 */

const STATE_DOT: Record<KoraSession["state"], string> = {
  live: "bg-success",
  idle: "bg-elevated",
  dead: "bg-foreground-muted",
};

const agentLabel = (agent: {
  executor: { name: string } | null;
  harness: string;
}): string => agent.executor?.name ?? agent.harness;

/** Freshest-activity stamp as a comparable number (a missing stamp is the
 * oldest — the registry's own floor). */
const freshestTs = (session: KoraSession): number =>
  Date.parse(session.last_activity_at ?? session.started_at ?? "") || 0;

export function KoraDock({
  items,
  model,
  dockReady,
  registryEmpty,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  selectedSessionId = null,
  clusterActive = false,
  persistFail = false,
  onPersistFail,
  contextHost = null,
  contextExecutorId = null,
}: {
  /** The already-loaded registry slice (the workspace owns the read). */
  items: readonly KoraSession[];
  /** The derived tree — the «По хосту» view's source. */
  model: KoraWorkspaceModel;
  /** Both reads settled — skeletons leave only after this. */
  dockReady: boolean;
  /** The §9.3 registry-empty fact (null = rows exist or still pending). */
  registryEmpty: KoraRegistryEmpty;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  /** The route's session — its row reads current (aria-current only; the
   * geometry never moves — K-INV-1). */
  selectedSessionId?: string | null;
  /** The reserved /kora/hermes route is ON STAGE (the pin reads current). */
  clusterActive?: boolean;
  /** The honest K-PERSIST-FAIL bit — any dock-related write the storage
   * refused (the dock's own writes and the workspace's dock-seam commits). */
  persistFail?: boolean;
  onPersistFail?: () => void;
  /** В3 context filter (contract §2.3): the route's :host — the dock
   * shows only that host's sessions. Null off the field route. */
  contextHost?: string | null;
  /** В3 context filter: the route's ?agent= — only that harness's
   * sessions («переключение харнеса → динамический список сессий»). A
   * derivation over the LOADED registry — zero new requests (§5.4). */
  contextExecutorId?: string | null;
}) {
  const t = useT();
  const [view, setView] = useState<KoraDockView>(() => readKoraDockView() ?? "work");
  const [query, setQuery] = useState("");
  // The quick filters stay local UI state in В1 (the brief's persist list:
  // widths / view / groups — filter persistence is a later polish surface).
  const [quickFilter, setQuickFilter] = useState<KoraQuickFilter | null>(null);
  // В4 — the customization overlays (the koraDockCustomStore; honest
  // K-PERSIST-FAIL bit rides the dock's own persist-fail line).
  const pins = useKoraDockPins();
  const aliasMap = useKoraDockAliases();
  const hiddenSet = useKoraDockHidden();
  const customPersistFail = useKoraDockCustomPersistFailure();

  // The group open-set seeds from persistence, else live groups open by
  // default (K-GRP-DEFAULT). The initializer computes from the CURRENT
  // items so a prefilled first render (snapshot/SSR, warm client cache)
  // paints the default already; a cold client's rows arriving later
  // re-seed HERE, during render — the react.dev «adjust state when data
  // arrives» shape (no effect, no setState-in-effect cascade): the
  // guarded one-shot compare re-renders immediately, a pending dock
  // never seeds an empty set over the default.
  const [seeded, setSeeded] = useState(dockReady && items.length > 0);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => {
    const persisted = readKoraDockGroups();
    if (persisted !== null) return new Set(persisted);
    return new Set(
      buildProjectGroups(items)
        .filter((group) => group.hasLive)
        .map((group) => `work:${group.key}`),
    );
  });
  if (!seeded && dockReady && items.length > 0) {
    setSeeded(true);
    const persisted = readKoraDockGroups();
    setOpen(
      persisted !== null
        ? new Set(persisted)
        : new Set(
            buildProjectGroups(items)
              .filter((group) => group.hasLive)
              .map((group) => `work:${group.key}`),
          ),
    );
  }

  const toggle = (key: string): void => {
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (!writeKoraDockGroups([...next])) onPersistFail?.();
      return next;
    });
  };

  const onSelectView = (next: KoraDockView): void => {
    setView(next);
    if (!writeKoraDockView(next)) onPersistFail?.();
  };

  const needle = query.trim().toLowerCase();

  // В4 — the LOCAL hiding is the FIRST stage of the funnel: a hidden row
  // leaves every view AND the search (hidden means hidden — searching is
  // not a way to peek behind the user's own hiding). The K-DOCK-HIDDEN
  // count below reads the intersection with the LOADED slice, so stale
  // ids for sessions gone from the registry count nothing.
  const unhidden = useMemo(
    () => items.filter((session) => !hiddenSet.has(session.id)),
    [items, hiddenSet],
  );
  const hiddenVisibleCount = items.length - unhidden.length;

  // Filters + search run BEFORE grouping — an emptied group never renders.
  // The search reads the row's honest words (name, preview, native id, cwd)
  // plus the LOCAL alias when one exists — over the already-loaded slice,
  // zero new requests.
  const filtered = useMemo(
    () =>
      unhidden.filter((session) => {
        if (!quickFilterMatches(session, quickFilter)) return false;
        if (needle === "") return true;
        const alias = aliasMap.get(session.id);
        return (
          koraSessionName(session).toLowerCase().includes(needle) ||
          (alias !== undefined && alias.toLowerCase().includes(needle)) ||
          (session.last_line_preview ?? "").toLowerCase().includes(needle) ||
          session.native_id.toLowerCase().includes(needle) ||
          (session.cwd ?? "").toLowerCase().includes(needle)
        );
      }),
    [unhidden, quickFilter, needle, aliasMap],
  );

  // В3 — the context filter (contract §2.3), the LAST stage before
  // grouping: a harness context keeps that executor's rows, a host
  // context keeps the host's agents' rows. A pure derivation over the
  // already-loaded slice — zero new requests (acceptance (в)). The
  // context never rewrites the dock's machinery (K-INV-1: the view
  // switcher, search and pin stay put) — only the row set narrows, and
  // the context line below names it honestly.
  const contextActive = contextExecutorId !== null || contextHost !== null;
  const contextFiltered = useMemo(() => {
    if (contextExecutorId !== null) {
      return filtered.filter((session) => session.executor_id === contextExecutorId);
    }
    if (contextHost !== null) {
      const hostNode = [...model.hosts, ...model.unknown].find(
        (candidate) => candidate.host === contextHost,
      );
      if (hostNode === undefined) return [];
      const ids = new Set(hostNode.agents.map((agent) => agent.executorId));
      return filtered.filter((session) => ids.has(session.executor_id));
    }
    return filtered;
  }, [filtered, model, contextHost, contextExecutorId]);

  // The context label: the harness node's own label (executor name, else
  // the harness name — the tree's grammar); a registry miss keeps the
  // mono id (no invented name), the host context the host name.
  const contextLabel = useMemo(() => {
    if (contextExecutorId !== null) {
      for (const group of [...model.hosts, ...model.unknown]) {
        for (const agent of group.agents) {
          if (agent.executorId === contextExecutorId) {
            return agent.executor?.name ?? agent.harness;
          }
        }
      }
      return contextExecutorId;
    }
    return contextHost;
  }, [model, contextExecutorId, contextHost]);

  const rowsTotal = contextFiltered.length;
  const searching = needle !== "";

  // The pin-section's RESOLVED rows: the pin order, mapped over the
  // loaded slice, hidden rows excluded (hidden wins), ghost ids (past
  // the loaded pages) rendering nothing.
  const pinnedRows = useMemo(
    () =>
      pins
        .map((id) => items.find((session) => session.id === id))
        .filter(
          (session): session is KoraSession =>
            session !== undefined && !hiddenSet.has(session.id),
        ),
    [pins, items, hiddenSet],
  );

  return (
    // NO own landmark label: the placement element (the frame's dock aside
    // / the flow card) carries aria-label «Сессии» — a second, nested
    // identical label would double the region.
    <section className="text-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
        {t("kora.dock.region")}
      </h2>
      {(persistFail || customPersistFail) ? (
        // K-PERSIST-FAIL: the honest bit — the view/width/groups AND the
        // В4 customization (pins/aliases/hiding) do NOT pretend to persist
        // while the storage refuses writes.
        <p role="status" className="mt-1 text-xs text-foreground-muted">
          {t("kora.dock.persistFail")}
        </p>
      ) : null}

      {/* The pin section — «★ Чат с кластером» moved here from the tree
       * (kora-ide contract §2.1); the /kora/hermes route is untouched. */}
      <Link
        to="/kora/hermes"
        aria-current={clusterActive ? "page" : undefined}
        title={t("kora.nav.clusterChatHint")}
        className={cn(
          "mt-2 flex min-h-12 items-center gap-2 rounded-md border-l-2 px-2 py-1.5 transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:min-h-7",
          clusterActive
            ? "border-iris bg-iris-tint text-foreground"
            : "border-transparent text-foreground-secondary",
        )}
      >
        <Star aria-hidden className="size-3.5 shrink-0 text-iris-bright" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {t("kora.nav.clusterChat")}
        </span>
      </Link>

      {/* В4 — the pin-SECTION of sessions (contract §3.1: pin-секция
       * сверху): the user's fixed shelf ABOVE the views — a pinned row
       * renders regardless of the view, the quick filters or the context
       * (that is what pinning is for), but ONLY from the LOADED slice (a
       * pin past the loaded pages renders nothing — no invented rows) and
       * never for a locally hidden row (hidden wins). No RESOLVED pins —
       * no section (пустой слот не рисуем). */}
      {pinnedRows.length > 0 ? (
        <div data-testid="kora-dock-pin-section">
          <p className="mt-2 text-xs uppercase tracking-wide text-foreground-muted">
            {t("kora.dock.pinnedSection")}
          </p>
          <ul role="list" className="mt-1 space-y-0.5">
            {pinnedRows.map((session) => (
              <DockSessionRow
                key={session.id}
                session={session}
                selected={session.id === selectedSessionId}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {/* The view switcher (contract §3.1: По работе / По хосту / Таймлайн). */}
      <div
        role="group"
        aria-label={t("kora.dock.viewLabel")}
        className="mt-2 flex flex-wrap items-center gap-1"
      >
        {(["work", "host", "timeline"] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={view === candidate}
            onClick={() => onSelectView(candidate)}
            className="min-h-12 rounded-full border border-border-subtle px-2 text-xs text-foreground-secondary transition-colors duration-instant hover:text-foreground aria-pressed:border-iris aria-pressed:text-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:min-h-6"
          >
            {t(`kora.dock.view.${candidate}`)}
          </button>
        ))}
      </div>

      {/* K-DOCK-SEARCH-0's input side: the client filter, zero new requests. */}
      <div className="relative mt-2">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-foreground-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t("kora.dock.searchLabel")}
          placeholder={t("kora.dock.searchPlaceholder")}
          className="h-12 w-full rounded-md border border-border-subtle bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-foreground-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:h-7"
        />
      </div>
      {/* The honest counter — polite live region (the tree's pattern).
       * В3: when a context filter is live (and no search), the line names
       * it with the one-click way out («показать все» → /kora). */}
      <p role="status" className="mt-1 min-h-4 text-xs text-foreground-muted">
        {searching ? (
          t("kora.dock.found", { n: rowsTotal })
        ) : contextActive && contextLabel !== null ? (
          <>
            {t("kora.dock.contextFilter", { context: contextLabel })}{" "}
            <Link
              to="/kora"
              className="underline decoration-border-subtle underline-offset-2 transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
            >
              {t("kora.dock.contextClear")}
            </Link>
          </>
        ) : (
          ""
        )}
      </p>

      {/* The quick filters («идёт / за 24 ч») — BEFORE grouping. */}
      <div className="mt-1 flex items-center gap-2">
        <FilterChip
          active={quickFilter === "running"}
          label={t("kora.block2.qfRunning")}
          onClick={() =>
            setQuickFilter(quickFilter === "running" ? null : "running")
          }
        />
        <FilterChip
          active={quickFilter === "day"}
          label={t("kora.block2.qfDay")}
          onClick={() => setQuickFilter(quickFilter === "day" ? null : "day")}
        />
      </div>

      {/* В4 — the honest K-DOCK-HIDDEN line: N loaded rows are hidden
       * LOCALLY (no server archive exists, none is pretended) — the count
       * and the one-click way back («показать» clears the whole hidden
       * set). Stale ids (the session left the registry) count nothing. */}
      {dockReady && hiddenVisibleCount > 0 ? (
        <p
          role="status"
          data-testid="kora-dock-hidden-line"
          className="mt-1 flex min-h-4 flex-wrap items-center gap-x-2 text-xs text-foreground-muted"
        >
          <span>{t("kora.dock.hiddenLine", { n: hiddenVisibleCount })}</span>
          <button
            type="button"
            data-testid="kora-dock-hidden-show"
            onClick={() => clearKoraDockHidden()}
            className="min-h-6 rounded-sm text-xs text-foreground-secondary underline decoration-border-subtle underline-offset-2 transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
          >
            {t("kora.dock.hiddenShow")}
          </button>
        </p>
      ) : null}

      <div className="mt-1">
        {!dockReady ? (
          // K-DOCK-PENDING: skeletons — no invented rows.
          <div role="status" aria-label={t("kora.list.loading")} className="space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : registryEmpty !== null ? (
          // K-DOCK-EMPTY: the registry fact, action-free in the dock — the
          // connect CTA lives ONCE, in the center (ME-072).
          <p className="text-sm text-foreground-secondary">
            {registryEmpty === "no-executors"
              ? t("kora.list.emptyNoExecutors")
              : t("kora.list.emptyNoSessions")}
          </p>
        ) : searching && rowsTotal === 0 ? (
          // K-DOCK-SEARCH-0: the honest zero-match.
          <p className="text-sm text-foreground-secondary">
            {t("kora.dock.noMatches")}
          </p>
        ) : (quickFilter !== null || contextActive) && rowsTotal === 0 ? (
          // K-DOCK-FILTERED-EMPTY: the fact + the way out (the quick
          // filter's reset; the context's «показать все»).
          <div className="text-sm text-foreground-secondary">
            <p>{t("kora.dock.emptyFiltered")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {quickFilter !== null ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickFilter(null)}
                  className="h-12 border-border-subtle px-3 font-mono text-xs text-foreground-secondary md:h-7"
                >
                  {t("kora.dock.resetFilter")}
                </Button>
              ) : null}
              {contextActive ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-12 border-border-subtle px-3 font-mono text-xs text-foreground-secondary md:h-7"
                >
                  <Link to="/kora">{t("kora.dock.contextClear")}</Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : rowsTotal === 0 && hiddenVisibleCount > 0 ? (
          // K-DOCK-HIDDEN: everything this view would show is hidden
          // LOCALLY — the count + the way back sit in the line above; here
          // only the honest explanation (the «Здесь сессий нет» residue
          // would pretend the slice is empty, it is not — it is hidden).
          <p className="text-sm text-foreground-secondary">
            {t("kora.dock.hiddenAll")}
          </p>
        ) : view === "work" ? (
          <WorkView
            filtered={contextFiltered}
            selectedSessionId={selectedSessionId}
            open={open}
            onToggle={toggle}
          />
        ) : view === "host" ? (
          <HostView
            filtered={contextFiltered}
            model={model}
            selectedSessionId={selectedSessionId}
            open={open}
            onToggle={toggle}
          />
        ) : (
          <TimelineView filtered={contextFiltered} selectedSessionId={selectedSessionId} />
        )}
      </div>

      {hasMore ? (
        // «ещё N» — the existing limit/offset cursor, one button (P4-7).
        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={isLoadingMore}
            onClick={onLoadMore}
            className="h-12 w-full border-border-subtle px-3 font-mono text-xs text-foreground-secondary md:h-7"
          >
            {isLoadingMore ? t("kora.list.loadingMore") : t("kora.list.loadMore")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function FilterChip({
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
      className="min-h-12 rounded-full border border-border-subtle px-2.5 text-xs text-foreground-secondary transition-colors duration-instant hover:text-foreground aria-pressed:border-iris aria-pressed:text-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:min-h-6"
    >
      {label}
    </button>
  );
}

/** «По работе» — buildProjectGroups over the filtered slice, AS IS. Group
 * open-set keys carry the `work:` prefix (one shared open-set across views,
 * no collision with the other views' key namespaces). */
function WorkView({
  filtered,
  selectedSessionId,
  open,
  onToggle,
}: {
  filtered: readonly KoraSession[];
  selectedSessionId: string | null;
  open: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  const t = useT();
  const groups = useMemo(() => buildProjectGroups(filtered), [filtered]);

  if (groups.length === 0) {
    // No filter/search reach here (the caller resolves those empties) —
    // this is the honest «Здесь сессий нет» residue of an empty slice.
    return <p className="text-sm text-foreground-secondary">{t("kora.block2.emptyContext")}</p>;
  }

  return (
    <ul role="list" className="space-y-1">
      {groups.map((group) => {
        const key = `work:${group.key}`;
        const title =
          group.kind === "cwd"
            ? pathBasename(group.cwd ?? "")
            : group.kind === "source"
              ? t("kora.group.source", { source: group.source ?? "" })
              : t("kora.group.noCwd");
        const listId = koraGroupListId(key);
        const isOpen = open.has(key);
        return (
          <li key={key}>
            <GroupDisclosure
              title={title}
              tooltip={group.kind === "cwd" ? (group.cwd ?? undefined) : undefined}
              count={group.sessions.length}
              open={isOpen}
              controls={listId}
              onToggle={() => onToggle(key)}
            />
            {isOpen ? (
              <ul id={listId} className="ml-4 mt-1 space-y-0.5 border-l border-myelin pl-2">
                {group.sessions.map((session) => (
                  <DockSessionRow
                    key={session.id}
                    session={session}
                    selected={session.id === selectedSessionId}
                  />
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** «По хосту» — host → harness groups (the tree-v2 grammar) with session
 * rows as the leaves. Registry-miss executors keep the honest mono id and
 * do NOT route («нет имени — нет роута»). Empty agents/hosts never render. */
function HostView({
  filtered,
  model,
  selectedSessionId,
  open,
  onToggle,
}: {
  filtered: readonly KoraSession[];
  model: KoraWorkspaceModel;
  selectedSessionId: string | null;
  open: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  const t = useT();
  const ids = useMemo(() => new Set(filtered.map((session) => session.id)), [filtered]);
  const branches = useMemo(
    () =>
      [...model.hosts, ...model.unknown]
        .map((host) => ({
          host,
          agents: host.agents
            .map((agent) => ({
              ...agent,
              sessions: agent.sessions.filter((session) => ids.has(session.id)),
            }))
            .filter((agent) => agent.sessions.length > 0),
        }))
        .filter((branch) => branch.agents.length > 0),
    [model, ids],
  );

  if (branches.length === 0) {
    return <p className="text-sm text-foreground-secondary">{t("kora.block2.emptyContext")}</p>;
  }

  return (
    <ul role="list" className="space-y-1">
      {branches.map((branch) => {
        const hostKey = branch.host.host;
        const hostOpenKey = `host:${hostKey ?? branch.agents[0]?.executorId ?? ""}`;
        const hostTitle = hostKey ?? branch.agents[0]?.executorId ?? "";
        const hostListId = koraGroupListId(hostOpenKey);
        const hostOpen = open.has(hostOpenKey);
        return (
          <li key={hostOpenKey}>
            <GroupDisclosure
              title={hostTitle}
              count={branch.agents.reduce((n, agent) => n + agent.sessions.length, 0)}
              open={hostOpen}
              controls={hostListId}
              onToggle={() => onToggle(hostOpenKey)}
            />
            {hostOpen ? (
              <ul id={hostListId} className="ml-4 mt-1 space-y-1 border-l border-myelin pl-2">
                {branch.agents.map((agent) => {
                  const harnessKey = `harness:${agent.executorId}`;
                  const harnessListId = koraGroupListId(harnessKey);
                  const harnessOpen = open.has(harnessKey);
                  return (
                    <li key={agent.executorId}>
                      <GroupDisclosure
                        title={agentLabel(agent)}
                        count={agent.sessions.length}
                        open={harnessOpen}
                        controls={harnessListId}
                        onToggle={() => onToggle(harnessKey)}
                      />
                      {harnessOpen ? (
                        <ul
                          id={harnessListId}
                          className="ml-4 mt-1 space-y-0.5 border-l border-myelin pl-2"
                        >
                          {agent.sessions.map((session) => (
                            <DockSessionRow
                              key={session.id}
                              session={session}
                              selected={session.id === selectedSessionId}
                            />
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** «Таймлайн» — one flat list, freshest activity first (no grouping, no
 * folds — the chronological journal). */
function TimelineView({
  filtered,
  selectedSessionId,
}: {
  filtered: readonly KoraSession[];
  selectedSessionId: string | null;
}) {
  const t = useT();
  const rows = useMemo(
    () => [...filtered].sort((a, b) => freshestTs(b) - freshestTs(a)),
    [filtered],
  );
  if (rows.length === 0) {
    return <p className="text-sm text-foreground-secondary">{t("kora.block2.emptyContext")}</p>;
  }
  return (
    <ul role="list" className="space-y-0.5">
      {rows.map((session) => (
        <DockSessionRow
          key={session.id}
          session={session}
          selected={session.id === selectedSessionId}
        />
      ))}
    </ul>
  );
}

/** One disclosure head: chevron + title + honest count (the field/tree
 * grammar; the digest-suffixed list id keeps distinct DOM ids for colliding
 * slugs). */
function GroupDisclosure({
  title,
  tooltip,
  count,
  open,
  controls,
  onToggle,
}: {
  title: string;
  tooltip?: string;
  count: number;
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      aria-label={`${title}: ${open ? t("kora.tree.collapse") : t("kora.tree.expand")}`}
      title={tooltip}
      className="flex min-h-12 w-full items-center gap-1.5 rounded-sm px-1 text-left text-sm font-medium transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:min-h-7"
    >
      {open ? (
        <ChevronDown aria-hidden className="size-4 shrink-0 text-foreground-secondary" />
      ) : (
        <ChevronRight aria-hidden className="size-4 shrink-0 text-foreground-secondary" />
      )}
      <span className="min-w-0 truncate" title={title}>
        {title}
      </span>
      <span
        aria-hidden
        className="ml-auto shrink-0 font-mono text-xs tabular-nums text-foreground-muted"
      >
        · {count}
      </span>
    </button>
  );
}

/** The dock's session row — the KoraSessionList grammar (state dot + name +
 * age/state + origin/steerable badges + preview), the frozen
 * /kora/:sessionId deep link. The route's selection reads aria-current —
 * nothing else about the row moves (K-INV-1).
 *
 * В4 customization rides the row honestly (koraDockCustomStore): the LOCAL
 * alias replaces the display name ONLY with the «локально» badge — the
 * server name stays the tooltip and the search key; the row menu (one
 * disclosure per row, the 07j §6.1 discipline — a real trigger with the
 * aria-expanded/controls pair, plain command rows, NO menu roles) carries
 * the three actions: pin/unpin, the LOCAL rename (the form replaces the
 * link while open; the server name is never written anywhere) and the
 * LOCAL hide. */
function DockSessionRow({
  session,
  selected = false,
}: {
  session: KoraSession;
  selected?: boolean;
}) {
  const t = useT();
  const { unit, n } = koraAgeUnit(session.age_seconds);
  const age = t(`kora.age.${unit}`, { n });
  const alias = useKoraDockAlias(session.id);
  const pins = useKoraDockPins();
  const pinned = pins.includes(session.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const menuId = `kora-dock-row-menu-${session.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  // Click-outside + Escape close the row menu; focus returns to the
  // trigger (the SelectorButton disclosure contract: the focus never
  // drops to body).
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !menuOpen) triggerRef.current?.focus();
    wasOpen.current = menuOpen;
  }, [menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      if (target?.closest(`[data-kora-row-menu="${menuId}"]`) === null) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, menuId]);

  if (renaming) {
    return (
      <li>
        <DockRenameForm session={session} onDone={() => setRenaming(false)} />
      </li>
    );
  }

  return (
    <li className="relative flex items-stretch gap-0.5">
      <Link
        to={`/kora/${encodeURIComponent(session.id)}`}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "flex min-h-12 min-w-0 flex-1 flex-col gap-0.5 rounded-md border-l-2 px-2 py-1.5 transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:min-h-6",
          selected ? "border-iris bg-iris-tint" : "border-transparent",
        )}
      >
        <span className="flex items-baseline gap-2">
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 self-center rounded-full", STATE_DOT[session.state])}
          />
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium"
            title={koraSessionName(session)}
          >
            {alias ?? koraSessionName(session)}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-foreground-secondary">
            {session.state === "live"
              ? t("kora.pill.liveAge", { age })
              : t(`kora.session.state.${session.state}`)}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-3.5 font-mono text-xs text-foreground-muted">
          {alias !== null ? (
            // The LOCAL overlay names itself (contract В4 acceptance (б)):
            // the alias never masks as the server name.
            <Badge
              variant="outline"
              data-testid="kora-dock-alias-badge"
              title={t("kora.dock.aliasHint")}
            >
              {t("kora.dock.aliasBadge")}
            </Badge>
          ) : null}
          <Badge
            variant="outline"
            title={t(
              session.origin === "relay"
                ? "kora.session.origin.relayHint"
                : "kora.session.origin.localHint",
            )}
          >
            {t(`kora.session.origin.${session.origin}`)}
          </Badge>
          {session.steerable ? (
            <Badge variant="outline" className="gap-1">
              <Radio aria-hidden className="size-3" />
              {t("kora.session.steerable")}
            </Badge>
          ) : null}
        </span>
        {session.last_line_preview ? (
          <span className="line-clamp-1 pl-3.5 text-xs text-foreground-secondary">
            {session.last_line_preview}
          </span>
        ) : null}
      </Link>
      {/* The row's actions trigger: one disclosure, the ≥48px touch target
       * below md (the ladder rule), the menu anchored RIGHT (the dock is
       * the left edge — a left-anchored panel would clip). */}
      <div className="flex shrink-0 items-center" data-kora-row-menu={menuId}>
        <button
          ref={triggerRef}
          type="button"
          data-testid="kora-dock-row-menu"
          aria-label={t("kora.dock.rowMenuLabel")}
          title={t("kora.dock.rowMenuLabel")}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          onClick={() => setMenuOpen((current) => !current)}
          className="inline-flex min-h-12 min-w-8 items-center justify-center rounded-sm text-foreground-muted transition-colors duration-instant hover:bg-elevated hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:min-h-6"
        >
          <MoreHorizontal aria-hidden className="size-4" />
        </button>
        {menuOpen ? (
          <div
            id={menuId}
            data-testid="kora-dock-row-menu-panel"
            className="absolute left-full top-0 z-20 ml-1 min-w-52 rounded-md border border-border-subtle bg-background py-1 shadow-lg"
          >
            <button
              type="button"
              data-testid="kora-dock-row-pin"
              onClick={() => {
                setKoraDockPinned(session.id);
                setMenuOpen(false);
              }}
              className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground-secondary transition-colors duration-instant hover:bg-elevated hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-iris-bright md:min-h-6"
            >
              {pinned ? (
                <Star aria-hidden className="size-3.5 shrink-0 fill-iris-bright text-iris-bright" />
              ) : (
                <Star aria-hidden className="size-3.5 shrink-0" />
              )}
              {t(pinned ? "kora.dock.unpinSession" : "kora.dock.pinSession")}
            </button>
            <button
              type="button"
              data-testid="kora-dock-row-rename"
              onClick={() => {
                setRenaming(true);
                setMenuOpen(false);
              }}
              className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground-secondary transition-colors duration-instant hover:bg-elevated hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-iris-bright md:min-h-6"
            >
              <Pencil aria-hidden className="size-3.5 shrink-0" />
              {t("kora.dock.renameSession")}
            </button>
            <button
              type="button"
              data-testid="kora-dock-row-hide"
              onClick={() => {
                setKoraDockHidden(session.id, true);
                setMenuOpen(false);
              }}
              className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground-secondary transition-colors duration-instant hover:bg-elevated hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-iris-bright md:min-h-6"
            >
              <EyeOff aria-hidden className="size-3.5 shrink-0" />
              {t("kora.dock.hideSession")}
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** The LOCAL rename form (contract §3.1 «локальные алиасы»): an input for
 * the local name only — the server name is shown untouched underneath and
 * is NEVER written anywhere. An emptied submit clears the alias; Escape
 * cancels. */
function DockRenameForm({
  session,
  onDone,
}: {
  session: KoraSession;
  onDone: () => void;
}) {
  const t = useT();
  const current = useKoraDockAlias(session.id);
  const [value, setValue] = useState(current ?? "");
  const inputId = `kora-dock-rename-${session.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const submit = (): void => {
    setKoraDockAlias(session.id, value);
    onDone();
  };
  return (
    <div className="rounded-md border border-border-subtle px-2 py-1.5">
      <label htmlFor={inputId} className="sr-only">
        {t("kora.dock.renameLabel")}
      </label>
      <input
        id={inputId}
        data-testid="kora-dock-rename-input"
        value={value}
        autoFocus
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onDone();
          }
        }}
        className="h-8 w-full rounded-sm border border-border-subtle bg-background px-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      />
      <p className="mt-1 text-xs text-foreground-muted">{t("kora.dock.aliasHint")}</p>
      <p className="truncate text-xs text-foreground-secondary">
        {koraSessionName(session)}
      </p>
      <div className="mt-1 flex items-center gap-1">
        <button
          type="button"
          data-testid="kora-dock-rename-save"
          aria-label={t("kora.dock.renameSave")}
          onClick={submit}
          className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-sm text-foreground-secondary transition-colors duration-instant hover:bg-elevated hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
        >
          <Check aria-hidden className="size-3.5" />
        </button>
        <button
          type="button"
          data-testid="kora-dock-rename-cancel"
          aria-label={t("kora.dock.renameCancel")}
          onClick={onDone}
          className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-sm text-foreground-muted transition-colors duration-instant hover:bg-elevated hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
