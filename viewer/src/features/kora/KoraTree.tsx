import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight, Search, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { readKoraTreeState, writeKoraTreeState } from "./koraTreeState";
import type {
  KoraAgentNode,
  KoraHostNode,
  KoraWorkspaceModel,
} from "./koraWorkspaceModel";
import type { KoraSession } from "./koraTypes";

/**
 * Дерево v2 (KW4, blueprint-kw4 §2–3/§7): the RIGHT panel's «ХОСТЫ И
 * АГЕНТЫ» block. Depth 2 — hosts → agents; LEAF SESSIONS ARE GONE (the
 * sessions live in the host field, grouped — «красивее и удобнее» = depth
 * 2 instead of 3, without the noisy listing). The pinned «★ Чат с
 * кластером» row is the block's FIRST row (route /kora/hermes). A search
 * input filters client-side over the already-derived model (zero new
 * requests, gate §9.2); zero matches read honestly (K-TREE-SEARCH).
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
  clusterActive,
  hermesLine = null,
}: {
  model: KoraWorkspaceModel;
  /** Both registries settled — the skeleton leaves only after this. */
  treeReady: boolean;
  /** The route's :host — its row reads current; it auto-opens on arrival. */
  activeHost: string;
  /** The route's ?agent= — its row reads current. */
  activeAgentId: string | null;
  /** The reserved /kora/hermes route is ON STAGE (the pin reads current). */
  clusterActive: boolean;
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

      {/* The pinned «Чат с кластером» — the block's FIRST row (blueprint-kw4
       * §2): a surface ABOVE the hosts, its route is the reserved segment. */}
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
  // route's host joins the open-set on arrival (a deep link must show its
  // selection, not a closed branch).
  const persisted = useRef(readKoraTreeState());
  const seeded = useRef(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const hasAnyHost = hosts.length > 0 || unknown.length > 0;

  useEffect(() => {
    if (seeded.current || !hasAnyHost) return;
    seeded.current = true;
    const stored = persisted.current;
    const initial =
      stored !== null
        ? stored.open
        : hosts.filter((host) => host.state === "live").map((host) => host.host ?? "");
    setOpen(new Set(initial));
  }, [hosts, hasAnyHost]);

  useEffect(() => {
    if (activeHost === "") return;
    setOpen((previous) => {
      if (previous.has(activeHost)) return previous;
      const next = new Set(previous);
      next.add(activeHost);
      writeKoraTreeState({ open: [...next] });
      return next;
    });
  }, [activeHost]);

  const toggle = (key: string) => {
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (!searching) writeKoraTreeState({ open: [...next] });
      return next;
    });
  };

  return (
    <ul role="list" className="space-y-1">
      {hosts.map((host) => (
        <HostBranch
          key={host.host ?? ""}
          host={host}
          // The search answers in one click: every visible branch is expanded
          // while a query is live (toggles stay inert for persistence).
          expanded={searching || open.has(host.host ?? "")}
          active={(host.host ?? "") === activeHost}
          activeAgentId={activeAgentId}
          onToggle={toggle}
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
}: {
  host: KoraHostNode;
  expanded: boolean;
  active: boolean;
  activeAgentId: string | null;
  onToggle: (key: string) => void;
}) {
  const t = useT();
  const key = host.host ?? "";
  const listId = `kora-tree-host-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  return (
    <li>
      <div className="flex items-center gap-1">
        <DisclosureButton
          expanded={expanded}
          controls={listId}
          onToggle={() => onToggle(key)}
          label={key}
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
}: {
  expanded: boolean;
  controls: string;
  onToggle: () => void;
  label: string;
}) {
  const t = useT();
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
      aria-label={`${label}: ${expanded ? t("kora.tree.collapse") : t("kora.tree.expand")}`}
      className="flex size-12 md:size-6 shrink-0 items-center justify-center rounded-sm text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
    >
      {expanded ? (
        <ChevronDown aria-hidden className="size-4" />
      ) : (
        <ChevronRight aria-hidden className="size-4" />
      )}
    </button>
  );
}
