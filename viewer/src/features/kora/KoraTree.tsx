import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { readKoraTreeState, writeKoraTreeState } from "./koraTreeState";
import { koraDisclosureListId } from "./koraWorkspaceModel";
import type {
  KoraAgentNode,
  KoraHostNode,
  KoraWorkspaceModel,
} from "./koraWorkspaceModel";
import type { KoraSession } from "./koraTypes";

/**
 * Дерево v2 (KW4, blueprint-kw4 §2–3/§7; Kora IDE В1 tail): the RIGHT
 * panel's «ХОСТЫ И АГЕНТЫ» block. Depth 2 — hosts → agents; LEAF SESSIONS
 * ARE GONE (the sessions live in the left DOCK, grouped — kora-ide contract
 * §2.1). The pinned «★ Чат с кластером» row MOVED to the dock's pin section
 * (contract §2.1) — the tree leads with the search now. A search input
 * filters client-side over the already-derived model (zero new requests,
 * gate §9.2); zero matches read honestly (K-TREE-SEARCH).
 *
 * Selection is a ROUTE (blueprint-kw4 §4): a host row links
 * /kora/host/:host, an agent row links /kora/host/:host?agent=<id>; the
 * unknown-host group keeps the mono executor id and does NOT route («нет
 * имени — нет роута», честно). Nested disclosure per 07j §6.1:
 * aria-expanded/aria-controls chevrons, no roving tabindex. The open-set
 * persists per browser session (koraTreeState, 07j §3.3).
 */

const STATE_DOT: Record<KoraSession["state"], string> = {
  live: "bg-success",
  idle: "bg-elevated",
  dead: "bg-foreground-muted",
};

const agentLabel = (agent: KoraAgentNode): string =>
  agent.executor?.name ?? agent.harness;

/** The whole right-panel tree block — ONE element, two placements in the
 * KW4 ladder (the frame's panel at ≥lg; its own document-flow card <lg).
 * Exactly one instance mounts in every regime (the aria-controls id
 * uniqueness lesson, W2-1). */
export function KoraTreePanel({
  model,
  treeReady,
  activeHost,
  activeAgentId,
  hermesLine = null,
}: {
  model: KoraWorkspaceModel;
  /** Both registries settled — the skeleton leaves only after this. */
  treeReady: boolean;
  /** The route's :host — its row reads current; it auto-opens on arrival. */
  activeHost: string;
  /** The route's ?agent= — its row reads current. */
  activeAgentId: string | null;
  /** The hermes context rides its source line under the tree
   * (blueprint-kw4 §2: HermesSourceLine → правая панель). */
  hermesLine?: React.ReactNode;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const { hosts, unknown, total } = useMemo(() => {
    const match = (host: KoraHostNode): boolean =>
      needle === "" ||
      (host.host ?? "").toLowerCase().includes(needle) ||
      host.agents.some(
        (agent) =>
          agentLabel(agent).toLowerCase().includes(needle) ||
          agent.executorId.toLowerCase().includes(needle),
      );
    const hosts = model.hosts.filter(match);
    const unknown = model.unknown.filter(match);
    return {
      hosts,
      unknown,
      total: hosts.length + unknown.length,
    };
  }, [model, needle]);

  return (
    <section aria-label={t("kora.tree.title")} className="text-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
        {t("kora.tree.title")}
      </h2>
      <p className="mt-1 text-xs text-foreground-muted">{t("kora.tree.explain")}</p>

      {/* K-TREE-SEARCH: the client filter over the derived model. */}
      <div className="relative mt-2">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-foreground-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t("kora.tree.searchLabel")}
          placeholder={t("kora.tree.searchPlaceholder")}
          className="h-12 w-full rounded-md border border-border-subtle bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-foreground-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:h-7"
        />
      </div>
      {/* The honest counter — polite live region (blueprint-kw4 §7): the
       * search result count is announced, zero reads «ничего не найдено». */}
      <p role="status" className="mt-1 min-h-4 text-xs text-foreground-muted">
        {needle !== "" ? t("kora.tree.found", { n: total }) : ""}
      </p>

      <div className="mt-1">
        {!treeReady ? (
          <div role="status" aria-label={t("kora.list.loading")} className="space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : total === 0 ? (
          needle !== "" ? (
            // K-TREE-SEARCH zero-match: the honest line, the model untouched.
            <p className="text-sm text-foreground-secondary">
              {t("kora.tree.noMatches")}
            </p>
          ) : (
            // No executors at all → no hosts (07j §1.2). ME-072 №7:
            // action-free — the connect CTA lives ONCE, in the center.
            <p className="text-sm text-foreground-secondary">
              {t("kora.tree.emptyNoExecutors")}
            </p>
          )
        ) : (
          <TreeNav
            hosts={hosts}
            unknown={unknown}
            searching={needle !== ""}
            activeHost={activeHost}
            activeAgentId={activeAgentId}
          />
        )}
      </div>

      {hermesLine}
    </section>
  );
}

/** The host→agent nav itself (split out so the search state stays above). */
function TreeNav({
  hosts,
  unknown,
  searching,
  activeHost,
  activeAgentId,
}: {
  hosts: readonly KoraHostNode[];
  unknown: readonly KoraHostNode[];
  /** While searching every visible branch renders expanded — the answer
   * must not need a second click; toggles persist only outside a search. */
  searching: boolean;
  activeHost: string;
  activeAgentId: string | null;
}) {
  // The open-set seeds from sessionStorage when present; otherwise the
  // default opens exactly the hosts with live sessions (07j §11). The
  // route's host joins the open-set on arrival — INCLUDING the first
  // arrival (a direct deep link in a fresh tab must show its selection,
  // not a closed branch). Both beats adjust state DURING render — the
  // react.dev «adjust state when data/props arrive» shape (no effect, no
  // setState-in-effect cascade), in the SAME order the two effects used
  // to run: seed first, join second, so a non-live deep-link host
  // survives the seed; `openNow` threads the seed's result into the join
  // within one render pass.
  // Mount-time snapshot of the persisted open-set: the useState
  // initializer runs exactly once (the render-safe equivalent of the old
  // useRef snapshot — a ref may not be read during render), so a join
  // that writes sessionStorage later can never leak into the seed.
  const [persistedAtMount] = useState(() => readKoraTreeState());
  const hasAnyHost = hosts.length > 0 || unknown.length > 0;
  // The open-set initializer is EMPTY by design (the seed derives from
  // hosts, unlike the dock's initializer): the adjust below must run even
  // on a prefilled first render, so `seeded` starts false unconditionally.
  const [seeded, setSeeded] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());

  let openNow = open;
  if (!seeded && hasAnyHost) {
    setSeeded(true);
    const stored = persistedAtMount;
    openNow = new Set(
      stored !== null
        ? stored.open
        : hosts.filter((host) => host.state === "live").map((host) => host.host ?? ""),
    );
    setOpen(openNow);
  }

  // The join tracker seeds from NOTHING (""), not from activeHost: the
  // first render is itself a change — from no host to the route's host —
  // so a DIRECT deep-link entry (fresh tab, empty sessionStorage, a dead
  // host the live-seed default never opens) joins on mount. Seeding from
  // activeHost made the adjust skip the first render and folded the
  // deep-linked branch (the cascade W2 QA P2 regression); "" keeps the
  // mount and every later prop change on the SAME adjust path below.
  const [joinedHost, setJoinedHost] = useState("");
  if (joinedHost !== activeHost) {
    setJoinedHost(activeHost);
    if (activeHost !== "" && !openNow.has(activeHost)) {
      openNow = new Set([...openNow, activeHost]);
      writeKoraTreeState({ open: [...openNow] });
      setOpen(openNow);
    }
  }

  const toggle = (key: string) => {
    // Honestly inert while searching: every visible branch renders
    // force-expanded (the answer must not need a second click), so a
    // chevron click has NO visible response — and it must not mutate
    // the open-set either, or the fold would surprise-jump out the
    // moment the search clears. The button mirrors this with
    // aria-disabled (DisclosureButton), so the control reads inert,
    // not silently dead.
    if (searching) return;
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeKoraTreeState({ open: [...next] });
      return next;
    });
  };

  return (
    <ul role="list" className="space-y-1">
      {hosts.map((host) => (
        <HostBranch
          key={host.host ?? ""}
          host={host}
          // The search answers in one click: every visible branch is
          // expanded while a query is live — the chevron stays honestly
          // inert for the whole search (aria-disabled, no-op click).
          expanded={searching || open.has(host.host ?? "")}
          active={(host.host ?? "") === activeHost}
          activeAgentId={activeAgentId}
          onToggle={toggle}
          inert={searching}
        />
      ))}
      {unknown.map((host) => (
        <UnknownRow
          key={host.agents[0]?.executorId ?? "unknown"}
          host={host}
        />
      ))}
    </ul>
  );
}

/** The aggregate state of ONE agent — same live > idle > dead rank as the
 * host aggregate (koraWorkspaceModel), derived over the agent's sessions;
 * zero sessions → no dot (no invented state). */
function agentState(agent: KoraAgentNode): KoraSession["state"] | null {
  if (agent.sessions.length === 0) return null;
  if (agent.sessions.some((session) => session.state === "live")) return "live";
  if (agent.sessions.some((session) => session.state === "idle")) return "idle";
  return "dead";
}

/** One host branch: chevron disclosure + the host LINK (the route IS the
 * selection — /kora/host/:host). Depth 2: the agents below are LEAVES —
 * no session subtree (the sessions live in the field, grouped). */
function HostBranch({
  host,
  expanded,
  active,
  activeAgentId,
  onToggle,
  inert,
}: {
  host: KoraHostNode;
  expanded: boolean;
  active: boolean;
  activeAgentId: string | null;
  onToggle: (key: string) => void;
  /** While a search is live the chevron is honestly inert (see toggle). */
  inert: boolean;
}) {
  const t = useT();
  const key = host.host ?? "";
  // The digest-suffixed id (kora-tree-listid-collision, the class closed
  // for the project groups in KoraHostField): hosts «a.b» and «a_b» both
  // flatten to the same slug, and a duplicated DOM id breaks the
  // aria-controls link — the shared FNV core keeps the family apart.
  const listId = koraDisclosureListId("kora-tree-host", key);

  return (
    <li>
      <div className="flex items-center gap-1">
        <DisclosureButton
          expanded={expanded}
          controls={listId}
          onToggle={() => onToggle(key)}
          label={key}
          inert={inert}
        />
        <Link
          to={`/kora/host/${encodeURIComponent(key)}`}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex min-h-12 flex-1 items-center gap-1.5 rounded-sm px-1 font-medium transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:min-h-6",
            active && "bg-iris-tint",
          )}
        >
          {host.state !== null ? (
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-full", STATE_DOT[host.state])}
            />
          ) : null}
          <span className="min-w-0 truncate">{key}</span>
          {/* The aggregate state is never colour-only (1.4.1). */}
          {host.state !== null ? (
            <span className="sr-only">{t(`kora.session.state.${host.state}`)}</span>
          ) : null}
          <span
            aria-hidden
            className="ml-auto shrink-0 font-mono text-xs tabular-nums text-foreground-muted"
          >
            · {host.sessionCount}
          </span>
        </Link>
      </div>
      {expanded ? (
        <ul id={listId} className="ml-4 mt-1 space-y-0.5 border-l border-myelin pl-2">
          {host.agents.map((agent) => (
            <AgentRow
              key={agent.executorId}
              host={key}
              agent={agent}
              active={active && agent.executorId === activeAgentId}
            />
          ))}
          {host.agents.length === 0 ? (
            <li className="py-1 text-xs text-foreground-muted">
              {t("kora.tree.noAgents")}
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

/** One agent LEAF (v2: no session subtree): the row links the field route
 * with ?agent= — the field shows the sessions grouped. Current reads
 * aria-current="true" (a selection, not the page itself). */
function AgentRow({
  host,
  agent,
  active,
}: {
  host: string;
  agent: KoraAgentNode;
  active: boolean;
}) {
  const t = useT();
  const state = agentState(agent);
  return (
    <li>
      <Link
        to={`/kora/host/${encodeURIComponent(host)}?agent=${encodeURIComponent(agent.executorId)}`}
        aria-current={active ? "true" : undefined}
        title={agentLabel(agent)}
        className={cn(
          "flex min-h-12 items-center gap-1.5 rounded-sm px-1 transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:min-h-6",
          active && "bg-iris-tint",
        )}
      >
        {state !== null ? (
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-full", STATE_DOT[state])}
          />
        ) : null}
        <span className="min-w-0 truncate font-mono text-foreground-secondary">
          {agentLabel(agent)}
        </span>
        {state !== null ? (
          <span className="sr-only">{t(`kora.session.state.${state}`)}</span>
        ) : null}
        <span
          aria-hidden
          className="ml-auto shrink-0 font-mono text-xs tabular-nums text-foreground-muted"
        >
          · {agent.sessions.length}
        </span>
      </Link>
    </li>
  );
}

/** K-TREE-UNKNOWN: the registry-miss group keeps the mono executor id and
 * does NOT route («нет имени — нет роута», честно) — no link, no chevron. */
function UnknownRow({ host }: { host: KoraHostNode }) {
  const t = useT();
  const label = host.agents[0]?.executorId ?? "";
  return (
    <li className="flex min-h-12 items-center gap-1.5 px-1 md:min-h-6">
      {host.state !== null ? (
        <span
          aria-hidden
          className={cn("size-2 shrink-0 rounded-full", STATE_DOT[host.state])}
        />
      ) : null}
      <span className="min-w-0 truncate font-mono text-foreground-secondary">
        {label}
      </span>
      {host.state !== null ? (
        <span className="sr-only">{t(`kora.session.state.${host.state}`)}</span>
      ) : null}
      <span
        aria-hidden
        className="ml-auto shrink-0 font-mono text-xs tabular-nums text-foreground-muted"
      >
        · {host.sessionCount}
      </span>
    </li>
  );
}

/** The chevron disclosure: a ≥24px target with the state in the name (4.1.2). */
function DisclosureButton({
  expanded,
  controls,
  onToggle,
  label,
  inert = false,
}: {
  expanded: boolean;
  controls: string;
  onToggle: () => void;
  label: string;
  /** While a search is live the branch renders force-expanded: the
   * chevron is honestly INERT — announced via aria-disabled, its click
   * a no-op — instead of a zero-response control that still mutates
   * state under the user (the cascade W6 fix). */
  inert?: boolean;
}) {
  const t = useT();
  // Plain concatenation, NOT cn(): twMerge folds `focus-visible:outline`
  // into `focus-visible:outline-2` (same class group) and the focus ring
  // loses its style half — the pair is deliberate, pin-shape: outline
  // (style) + outline-2 (width) + outline-offset-2 + the colour.
  const baseClass = "flex size-12 md:size-6 shrink-0 items-center justify-center rounded-sm text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright";
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      aria-disabled={inert || undefined}
      onClick={onToggle}
      aria-label={`${label}: ${expanded ? t("kora.tree.collapse") : t("kora.tree.expand")}`}
      className={inert ? `${baseClass} cursor-default opacity-60` : baseClass}
    >
      {expanded ? (
        <ChevronDown aria-hidden className="size-4" />
      ) : (
        <ChevronRight aria-hidden className="size-4" />
      )}
    </button>
  );
}
