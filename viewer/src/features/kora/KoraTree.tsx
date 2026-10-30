import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { readKoraTreeState, writeKoraTreeState } from "./koraTreeState";
import { koraDisclosureListId } from "./koraWorkspaceModel";
import {
  koraHarnessModels,
  koraHostHealth,
  koraNodeHealth,
  type KoraHealth,
  type KoraModelsSources,
} from "./koraWorkspaceModel";
import type {
  KoraAgentNode,
  KoraHostNode,
  KoraWorkspaceModel,
} from "./koraWorkspaceModel";
import type { KoraExecutorModels } from "./koraTypes";

/**
 * Дерево v3 (kora-ide contract §2.3, wave В3; the v2 KW4 grammar is the
 * base): the RIGHT panel's «ХОСТЫ И АГЕНТЫ» block, now host → HARNESS →
 * MODELS. Depth 3 — the model rows render from REAL data only: the В3a
 * per-executor roster (GET /api/kora/models) for zcode/vscode/pi, the
 * hermes /status roster for hermes; a harness whose source reports
 * nothing reads «модели не сообщаются» (K-TREE-MODEL-UNKNOWN) — no
 * invented model, provider badge or context limit (none exists in any
 * source today). HEALTH DOTS (В3 acceptance (б)): the host and harness
 * rows read the executors registry's computed PRESENCE — «присутствует»
 * (online), «не сообщает» (presence expired — K-HARNESS-OFFLINE; the
 * sessions stay visible in the dock), «статус не сообщается» (no
 * executor row — no dot). presence ≠ живость; session states live on
 * the dock rows. LEAF SESSIONS ARE GONE (the dock owns them, §2.1); the
 * pinned «★ Чат с кластером» row lives in the dock's pin section.
 *
 * Selection is a ROUTE (blueprint-kw4 §4, K-INV-2): a host row links
 * /kora/host/:host, a harness row links /kora/host/:host?agent=<id> —
 * the DOCK filters to that context and the context bar names the
 * harness (В3: «клик харнеса → фильтр дока + контекст»). The
 * unknown-host group keeps the mono executor id and does NOT route
 * («нет имени — нет роута», честно). Nested disclosure per 07j §6.1:
 * aria-expanded/aria-controls chevrons, no roving tabindex. The
 * open-set persists per browser session (koraTreeState, 07j §3.3) —
 * host keys stay bare names, harness keys carry the `agent:` prefix
 * (one namespace, no collision with a host named like an executor id).
 */

/** The health dot colors — one mapping for every row (the field's
 * PRESENCE_DOT grammar: online green; expired/never = one honest gray). */
const HEALTH_DOT: Record<Exclude<KoraHealth, "unknown">, string> = {
  present: "bg-success",
  silent: "bg-foreground-muted",
};

/** The health dot + its non-visual words; «unknown» renders NOTHING —
 * no executor row, no invented state. */
function HealthDot({ health }: { health: KoraHealth }) {
  const t = useT();
  if (health === "unknown") return null;
  return (
    <>
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", HEALTH_DOT[health])}
      />
      <span className="sr-only">{t(`kora.tree.health.${health}`)}</span>
    </>
  );
}

const agentLabel = (agent: KoraAgentNode): string =>
  agent.executor?.name ?? agent.harness;

/** The default mirror map (a stable empty — the prop defaults never
 * re-create it per render). */
const EMPTY_MIRROR: ReadonlyMap<string, KoraExecutorModels> = new Map();

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
  mirror = EMPTY_MIRROR,
  mirrorReady = false,
  hermes = null,
  hermesReady = false,
}: {
  model: KoraWorkspaceModel;
  /** Both registries settled — the skeleton leaves only after this. */
  treeReady: boolean;
  /** The route's :host — its row reads current; it auto-opens on arrival. */
  activeHost: string;
  /** The route's ?agent= — its row reads current; its branch auto-opens. */
  activeAgentId: string | null;
  /** The hermes context rides its source line under the tree
   * (blueprint-kw4 §2: HermesSourceLine → правая панель). */
  hermesLine?: React.ReactNode;
  /** В3a — the per-executor models roster by executor id (the harness
   * nodes' model source for zcode/vscode/pi). */
  mirror?: ReadonlyMap<string, KoraExecutorModels>;
  /** The В3a read settled (success or error) — pending reads wait. */
  mirrorReady?: boolean;
  /** The hermes /status roster (the hermes nodes' model source). */
  hermes?: KoraModelsSources["hermes"];
  /** The hermes status read settled. */
  hermesReady?: boolean;
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

  // The В3 model sources, assembled ONCE (the branches derive per node).
  const sources: KoraModelsSources = {
    mirror,
    mirrorReady,
    hermes,
    hermesReady,
  };

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
            sources={sources}
          />
        )}
      </div>

      {hermesLine}
    </section>
  );
}

/** The host→harness nav itself (split out so the search state stays above). */
function TreeNav({
  hosts,
  unknown,
  searching,
  activeHost,
  activeAgentId,
  sources,
}: {
  hosts: readonly KoraHostNode[];
  unknown: readonly KoraHostNode[];
  /** While searching every visible branch renders expanded — the answer
   * must not need a second click; toggles persist only outside a search. */
  searching: boolean;
  activeHost: string;
  activeAgentId: string | null;
  sources: KoraModelsSources;
}) {
  // The open-set seeds from sessionStorage when present; otherwise the
  // default opens exactly the hosts with live sessions (07j §11). The
  // route's host joins the open-set on arrival — INCLUDING the first
  // arrival (a direct deep link in a fresh tab must show its selection,
  // not a closed branch). В3: the route's ?agent= joins the same way —
  // its HARNESS branch opens on arrival (the deep-link parity; the
  // model rows are the branch's content). Both beats adjust state DURING
  // render — the react.dev «adjust state when data/props arrive» shape
  // (no effect, no setState-in-effect cascade), in the SAME order the
  // two effects used to run: seed first, join second, so a non-live
  // deep-link host survives the seed; `openNow` threads the seed's
  // result into the join within one render pass.
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

  // The join trackers seed from NOTHING (""), not from the route values:
  // the first render is itself a change — from no selection to the
  // route's — so a DIRECT deep-link entry (fresh tab, empty
  // sessionStorage, a dead host the live-seed default never opens) joins
  // on mount. Seeding from the route value made the adjust skip the
  // first render and folded the deep-linked branch (the cascade W2 QA
  // P2 regression); "" keeps the mount and every later prop change on
  // the SAME adjust path below.
  const [joinedHost, setJoinedHost] = useState("");
  if (joinedHost !== activeHost) {
    setJoinedHost(activeHost);
    if (activeHost !== "" && !openNow.has(activeHost)) {
      openNow = new Set([...openNow, activeHost]);
      writeKoraTreeState({ open: [...openNow] });
      setOpen(openNow);
    }
  }
  // В3 — the harness branch join (the SAME shape as the host join; the
  // agent keys carry the `agent:` prefix namespace). Manual close of the
  // ACTIVE harness's branch survives rerenders (join-no-reopen, the
  // cascade W3 pin): only a CHANGE of activeAgentId re-joins.
  const joinedAgent = activeAgentId ?? "";
  const [joinedAgentSeen, setJoinedAgentSeen] = useState("");
  if (joinedAgentSeen !== joinedAgent) {
    setJoinedAgentSeen(joinedAgent);
    if (joinedAgent !== "" && !openNow.has(`agent:${joinedAgent}`)) {
      openNow = new Set([...openNow, `agent:${joinedAgent}`]);
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
          sources={sources}
          agentOpen={open}
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

/** One host branch: chevron disclosure + the host LINK (the route IS the
 * selection — /kora/host/:host). Depth 3: the harnesses below are
 * BRANCHES (their model rows are the В3 level). The health dot reads the
 * AGGREGATE PRESENCE of the host's executors (В3 acceptance (б)) —
 * never the session states (those live on the dock rows). */
function HostBranch({
  host,
  expanded,
  active,
  activeAgentId,
  onToggle,
  inert,
  sources,
  agentOpen,
}: {
  host: KoraHostNode;
  expanded: boolean;
  active: boolean;
  activeAgentId: string | null;
  onToggle: (key: string) => void;
  /** While a search is live the chevron is honestly inert (see toggle). */
  inert: boolean;
  sources: KoraModelsSources;
  /** The shared open-set (the harness branches read their own keys). */
  agentOpen: ReadonlySet<string>;
}) {
  const t = useT();
  const key = host.host ?? "";
  // The digest-suffixed id (kora-tree-listid-collision, the class closed
  // for the project groups in KoraHostField): hosts «a.b» and «a_b» both
  // flatten to the same slug, and a duplicated DOM id breaks the
  // aria-controls link — the shared FNV core keeps the family apart.
  const listId = koraDisclosureListId("kora-tree-host", key);
  const health = koraHostHealth(host.agents);

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
          <HealthDot health={health} />
          <span className="min-w-0 truncate">{key}</span>
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
            <AgentBranch
              key={agent.executorId}
              host={key}
              agent={agent}
              active={active && agent.executorId === activeAgentId}
              onToggle={onToggle}
              inert={inert}
              sources={sources}
              agentOpen={agentOpen}
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

/** One harness BRANCH (В3): chevron disclosure + the row LINK (the field
 * route with ?agent= — the dock filters to this harness's sessions, the
 * context bar names the harness). Expanded, the branch renders its MODEL
 * rows — real data only (K-TREE-MODEL-UNKNOWN when the harness's source
 * reports nothing). */
function AgentBranch({
  host,
  agent,
  active,
  onToggle,
  inert,
  sources,
  agentOpen,
}: {
  host: string;
  agent: KoraAgentNode;
  active: boolean;
  onToggle: (key: string) => void;
  /** While a search is live the chevron is honestly inert (see toggle). */
  inert: boolean;
  sources: KoraModelsSources;
  /** The shared open-set (the host branch threads it down). */
  agentOpen: ReadonlySet<string>;
}) {
  // The `agent:` prefix namespace: a host may share its name with an
  // executor id (the hermes pair is literally id «hermes») — one flat
  // open-set must never fold one branch through the other's key.
  const key = `agent:${agent.executorId}`;
  const listId = koraDisclosureListId("kora-tree-agent", agent.executorId);
  const expanded = inert || agentOpen.has(key);
  const models = koraHarnessModels(agent, sources);
  const health = koraNodeHealth(agent.executor);
  return (
    <li>
      <div className="flex items-center gap-1">
        <DisclosureButton
          expanded={expanded}
          controls={listId}
          onToggle={() => onToggle(key)}
          label={agentLabel(agent)}
          inert={inert}
        />
        <Link
          to={`/kora/host/${encodeURIComponent(host)}?agent=${encodeURIComponent(agent.executorId)}`}
          aria-current={active ? "true" : undefined}
          title={agentLabel(agent)}
          className={cn(
            "flex min-h-12 flex-1 items-center gap-1.5 rounded-sm px-1 transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:min-h-6",
            active && "bg-iris-tint",
          )}
        >
          <HealthDot health={health} />
          <span className="min-w-0 truncate font-mono text-foreground-secondary">
            {agentLabel(agent)}
          </span>
          <span
            aria-hidden
            className="ml-auto shrink-0 font-mono text-xs tabular-nums text-foreground-muted"
          >
            · {agent.sessions.length}
          </span>
        </Link>
      </div>
      {expanded ? (
        <ul id={listId} className="ml-4 mt-1 space-y-0.5 border-l border-myelin pl-2">
          <ModelRows models={models} />
        </ul>
      ) : null}
    </li>
  );
}

/** The model rows of ONE harness branch (В3): the honest three states —
 * known rows (model id + provider badge + availability words + the
 * hermes default marker), «модели не сообщаются» (K-TREE-MODEL-UNKNOWN),
 * or the pending read. No context limit renders anywhere: no source
 * reports one today (the §5.3 datum does not exist yet). */
function ModelRows({ models }: { models: ReturnType<typeof koraHarnessModels> }) {
  const t = useT();
  if (models.state === "pending") {
    return (
      <li className="py-1 text-xs text-foreground-muted" role="status">
        {t("kora.tree.modelsPending")}
      </li>
    );
  }
  if (models.state === "unknown") {
    return (
      <li className="py-1 text-xs text-foreground-muted">
        {t("kora.tree.modelsUnknown")}
      </li>
    );
  }
  return models.models.map((node) => (
    <li
      key={`${node.provider ?? "hermes"}:${node.model}`}
      className="flex min-h-12 items-center gap-1.5 px-1 md:min-h-6"
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full border border-border-subtle bg-background"
      />
      <span className="min-w-0 truncate font-mono text-foreground-secondary">
        {node.model}
      </span>
      {node.provider !== null ? (
        <span
          className="shrink-0 rounded-full border border-border-subtle px-1.5 py-px font-mono text-xs text-foreground-muted"
          title={node.provider}
        >
          {node.provider}
        </span>
      ) : null}
      {node.isDefault ? (
        <span className="shrink-0 text-xs text-foreground-muted">
          {t("kora.tree.modelDefault")}
        </span>
      ) : null}
      {node.auth === "configured" ||
      node.auth === "anonymous" ||
      node.auth === "unknown" ? (
        <span className="sr-only">
          {t(`kora.tree.modelAuth.${node.auth}`)}
        </span>
      ) : null}
    </li>
  ));
}

/** K-TREE-UNKNOWN: the registry-miss group keeps the mono executor id and
 * does NOT route («нет имени — нет роута», честно) — no link, no chevron,
 * NO health dot: the registry never named this executor, so there is no
 * presence fact to show («статус не сообщается» — nothing is invented). */
function UnknownRow({ host }: { host: KoraHostNode }) {
  const label = host.agents[0]?.executorId ?? "";
  return (
    <li className="flex min-h-12 items-center gap-1.5 px-1 md:min-h-6">
      <span className="size-2 shrink-0" aria-hidden />
      <span className="min-w-0 truncate font-mono text-foreground-secondary">
        {label}
      </span>
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
