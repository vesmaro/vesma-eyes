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
    <nav aria-label={useT().string ? undefined : undefined} className="hidden" aria-hidden>
      {/* placeholder never renders — see the real nav below */}
    </nav>
  );
}
