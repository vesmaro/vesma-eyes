import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ExecutorItem } from "@/gateway/boardTypes";
import type { KoraSession } from "./koraTypes";
import { readKoraGroups, writeKoraGroups } from "./koraFrameStorage";
import {
  buildProjectGroups,
  koraAgeUnit,
  koraGroupListId,
  koraSessionName,
  pathBasename,
  quickFilterMatches,
  type KoraAgentNode,
  type KoraHostNode,
  type KoraQuickFilter,
  type KoraWorkspaceModel,
} from "./koraWorkspaceModel";

/**
 * The HOST FIELD — the KW4 center (blueprint-kw4 §2–3): «поле уже
 * выбранного хоста» — the host's headline (name + aggregate dot + registry
 * derivatives), the host's agents as LIGHT chips (presence dot · name ·
 * session count · freshest activity — NO operation menus, the agents
 * operations live on /agents/hosts; Кора = журнал), then the SELECTED
 * agent's sessions grouped by cwd (hermes — by source). Kora = a journal:
 * NO composer, NO agent operations here (§9 gate 8).
 *
 * Honest states (states-kw4 §1): K-CTX-HOST-UNKNOWN (the registry never
 * heard of the host), K-CTX-NO-AGENTS (a fact, no CTA — connecting lives
 * on /agents/harnesses, ME-072), K-CTX-AGENT-EMPTY. The selection rides
 * the ROUTE: the chips write `?agent=`, the workspace owns the write.
 *
 * Grouping: buildProjectGroups over the ALREADY-LOADED registry slice —
 * zero new requests (gate §9.2). Live groups open by default; the user's
 * toggles persist in vesmaro.koraGroups (K-GRP-DEFAULT). Quick filters
 * («идёт» / «за 24 ч») filter BEFORE grouping — empty groups simply do
 * not render (K-GRP-FILTERED, 07c §3).
 */

const PRESENCE_DOT: Record<ExecutorItem["presence"], string> = {
  online: "bg-success",
  stale: "bg-elevated",
  offline: "bg-foreground-muted",
};

const STATE_DOT: Record<KoraSession["state"], string> = {
  live: "bg-success",
  idle: "bg-elevated",
  dead: "bg-foreground-muted",
};

/** The default agent: the FRESHEST activity (states-kw4 K-CTX-NO-AGENT).
 * Freshness is the REGISTRY's own age_seconds — a derivative frozen on each
 * row, so no client clock is involved (SSR-stable, 07j §2.2). Ties fall to
 * the registry order (harness-sorted by buildKoraTree) — deterministic. */
function freshestAgent(agents: readonly KoraAgentNode[]): KoraAgentNode | null {
  if (agents.length === 0) return null;
  const freshest = (agent: KoraAgentNode): number =>
    Math.min(...agent.sessions.map((session) => session.age_seconds));
  return agents.reduce((a, b) => (freshest(b) < freshest(a) ? b : a));
}

export function KoraHostField({
  host,
  model,
  quickFilter,
  onQuickFilter,
  selectedAgentId = null,
  onSelectAgent,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: {
  /** The decoded :host route param — the field's subject. */
  host: string;
  /** The derived registry tree (the workspace already built it). */
  model: KoraWorkspaceModel;
  quickFilter: KoraQuickFilter | null;
  onQuickFilter: (filter: KoraQuickFilter | null) => void;
  /** The ?agent= route param (executor id); null = the default agent. */
  selectedAgentId?: string | null;
  /** The chip click — the workspace writes ?agent= (route = selection). */
  onSelectAgent: (executorId: string) => void;
  /** K-GRP-MORE: the paged registry may hold more of this host's rows. */
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const t = useT();
  const hostNode: KoraHostNode | null =
    model.hosts.find((candidate) => candidate.host === host) ?? null;

  // Смена хоста/агента → фокус на h2 поля (blueprint-kw4 §7): the route
  // change moves the reading focus, not just the pixels. Skips the first
  // mount — a fresh page load must not steal the focus.
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const firstRender = useRef(true);
  const agent = selectedAgent(hostNode, selectedAgentId);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    titleRef.current?.focus();
  }, [host, agent?.executorId]);

  if (hostNode === null) {
    // K-CTX-HOST-UNKNOWN: the honest empty — the registry never named this
    // host; no invented rows, one way back.
    return (
      <section aria-label={t("kora.field.region")} className="px-6 py-5">
        <EmptyState
          variant="not-found"
          title={t("kora.field.unknownHost")}
          message={t("kora.field.unknownHostHint")}
          action={
            <Button variant="outline" asChild>
              <Link to="/kora">{t("kora.field.backToKora")}</Link>
            </Button>
          }
        />
      </section>
    );
  }

  if (hostNode.agents.length === 0) {
    // K-CTX-NO-AGENTS: the constatation only — the connect CTA lives on
    // /agents/harnesses (ME-072 №7: the panel states the fact, the command
    // is not repeated).
    return (
      <section aria-label={t("kora.field.region")} className="px-6 py-5">
        <HonestLine>{t("kora.field.noAgents")}</HonestLine>
      </section>
    );
  }

  const sessions = hostNode.agents.flatMap((node) => [...node.sessions]);
  const running = sessions.filter((session) => session.state === "live").length;
  const day = sessions.filter((session) => session.age_seconds < 86_400).length;

  return (
    <section
      aria-label={t("kora.field.region")}
      className="kora-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-6 py-5"
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2
          ref={titleRef}
          tabIndex={-1}
          title={host}
          className="min-w-0 truncate text-lg font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
        >
          {host}
        </h2>
        {hostNode.state !== null ? (
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", STATE_DOT[hostNode.state])}
          />
        ) : null}
        <span className="font-mono text-xs tabular-nums text-foreground-secondary">
          {t("kora.field.summary", {
            agents: hostNode.agents.length,
            running,
            total: sessions.length,
            day,
          })}
        </span>
      </header>

      {/* The agents of the host — LIGHT chips (blueprint-kw4 §2/§3): NO
       * HarnessChipStrip (its menus are operations; Кора is a journal). */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {hostNode.agents.map((node) => (
          <AgentChip
            key={node.executorId}
            agent={node}
            selected={node.executorId === agent?.executorId}
            onSelect={() => onSelectAgent(node.executorId)}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <QuickFilterChip
          active={quickFilter === "running"}
          label={t("kora.block2.qfRunning")}
          onClick={() => onQuickFilter(quickFilter === "running" ? null : "running")}
        />
        <QuickFilterChip
          active={quickFilter === "day"}
          label={t("kora.block2.qfDay")}
          onClick={() => onQuickFilter(quickFilter === "day" ? null : "day")}
        />
      </div>

      {agent === null ? null : agent.sessions.length === 0 ? (
        // K-CTX-AGENT-EMPTY: the honest line, nothing invented.
        <p className="mt-4 text-sm text-foreground-secondary">
          {t("kora.field.agentEmpty")}
        </p>
      ) : (
        // Remounts per host+agent: the group open-set re-seeds for the new
        // key space (vesmaro.koraGroups keys are cwd/source tags).
        <KoraAgentGroups
          key={`${host}\u0000${agent.executorId}`}
          agent={agent}
          quickFilter={quickFilter}
        />
      )}

      {hasMore ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={isLoadingMore}
            onClick={onLoadMore}
            className="h-12 border-border-subtle px-3 font-mono text-xs text-foreground-secondary md:h-7"
          >
            {isLoadingMore ? t("kora.list.loadingMore") : t("kora.list.loadMore")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** The route-selected agent or the freshest default (K-CTX-NO-AGENT). */
function selectedAgent(
  hostNode: KoraHostNode | null,
  selectedAgentId: string | null,
): KoraAgentNode | null {
  if (hostNode === null) return null;
  return (
    hostNode.agents.find((agent) => agent.executorId === selectedAgentId) ??
    freshestAgent(hostNode.agents)
  );
}

/** One light agent chip: presence dot · name · session count · freshest
 * activity. The state is never colour-only (1.4.1): presence reads as text. */
function AgentChip({
  agent,
  selected,
  onSelect,
}: {
  agent: KoraAgentNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useT();
  const presence: ExecutorItem["presence"] = agent.executor?.presence ?? "offline";
  const label = agent.executor?.name ?? agent.harness;
  const fresh = useMemo(() => {
    if (agent.sessions.length === 0) return null;
    const freshest = Math.min(...agent.sessions.map((session) => session.age_seconds));
    const { unit, n } = koraAgeUnit(freshest);
    return t(`kora.age.${unit}`, { n });
  }, [agent.sessions, t]);

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      title={label}
      className={cn(
        "inline-flex min-h-12 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors duration-instant focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:min-h-7",
        selected
          ? "border-iris bg-iris-tint text-foreground"
          : "border-border-subtle text-foreground-secondary hover:text-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", PRESENCE_DOT[presence])}
      />
      <span className="sr-only">{t(`agents.presence.${presence}`)}.</span>
      <span className="max-w-48 truncate font-mono">{label}</span>
      <span
        aria-hidden
        className="shrink-0 font-mono tabular-nums text-foreground-muted"
      >
        · {agent.sessions.length}
      </span>
      {fresh !== null ? (
        <span
          aria-hidden
          className="shrink-0 font-mono tabular-nums text-foreground-muted"
        >
          · {fresh}
        </span>
      ) : null}
    </button>
  );
}

function QuickFilterChip({
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

/** The selected agent's session groups (disclosure per group; live groups
 * open by default, the user's toggles persist in vesmaro.koraGroups). */
function KoraAgentGroups({
  agent,
  quickFilter,
}: {
  agent: KoraAgentNode;
  quickFilter: KoraQuickFilter | null;
}) {
  const t = useT();
  // Quick filter FIRST (K-GRP-FILTERED): a group whose rows all fail the
  // filter never renders — the empty slot does not exist (07c §3).
  const filtered = useMemo(
    () => agent.sessions.filter((session) => quickFilterMatches(session, quickFilter)),
    [agent.sessions, quickFilter],
  );
  const groups = useMemo(() => buildProjectGroups(filtered), [filtered]);

  const [open, setOpen] = useState<ReadonlySet<string>>(() => {
    const persisted = readKoraGroups();
    if (persisted !== null) return new Set(persisted);
    // K-GRP-DEFAULT: live groups open, the rest stay folded.
    return new Set(
      buildProjectGroups(agent.sessions)
        .filter((group) => group.hasLive)
        .map((group) => group.key),
    );
  });
  const toggle = (key: string) => {
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeKoraGroups([...next]);
      return next;
    });
  };

  return (
    <ul role="list" className="mt-2 space-y-1">
      {groups.map((group) => (
        <SessionGroup
          key={group.key}
          group={group}
          open={open.has(group.key)}
          onToggle={() => toggle(group.key)}
        />
      ))}
      {groups.length === 0 ? (
        <li>
          <p className="text-sm text-foreground-secondary">
            {quickFilter !== null
              ? t("kora.block2.emptyFiltered")
              : t("kora.block2.emptyContext")}
          </p>
        </li>
      ) : null}
    </ul>
  );
}

/** One group: the disclosure «<title> · N» + the session rows. The title is
 * the i18n mapping of the group kind; the FULL cwd rides the title tooltip
 * (blueprint-kw4 §3: «title = полный cwd»). */
function SessionGroup({
  group,
  open,
  onToggle,
}: {
  group: ReturnType<typeof buildProjectGroups>[number];
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const title =
    group.kind === "cwd"
      ? pathBasename(group.cwd ?? "")
      : group.kind === "source"
        ? t("kora.group.source", { source: group.source ?? "" })
        : t("kora.group.noCwd");
  // The digest-suffixed id (koraGroupListId): two different cwds can
  // sanitize to the same slug — the bare form collided the DOM ids.
  const listId = koraGroupListId(group.key);

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={onToggle}
        aria-label={`${title}: ${open ? t("kora.tree.collapse") : t("kora.tree.expand")}`}
        title={group.kind === "cwd" ? (group.cwd ?? undefined) : undefined}
        className="flex min-h-12 w-full items-center gap-1.5 rounded-sm px-1 text-left text-sm font-medium transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:min-h-7"
      >
        {open ? (
          <ChevronDown aria-hidden className="size-4 shrink-0 text-foreground-secondary" />
        ) : (
          <ChevronRight aria-hidden className="size-4 shrink-0 text-foreground-secondary" />
        )}
        <span className="min-w-0 truncate">{title}</span>
        <span
          aria-hidden
          className="ml-auto shrink-0 font-mono text-xs tabular-nums text-foreground-muted"
        >
          · {group.sessions.length}
        </span>
      </button>
      {open ? (
        <ul id={listId} className="ml-4 mt-1 space-y-0.5 border-l border-myelin pl-2">
          {group.sessions.map((session) => (
            <FieldSessionRow key={session.id} session={session} selected={false} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** The field's session row — the KoraSessionList row grammar (dot + name +
 * state pill + the origin/steerable badges + preview), clickable into the
 * frozen /kora/:sessionId deep link. */
function FieldSessionRow({
  session,
  selected,
}: {
  session: KoraSession;
  selected: boolean;
}) {
  const t = useT();
  const { unit, n } = koraAgeUnit(session.age_seconds);
  const age = t(`kora.age.${unit}`, { n });
  return (
    <li>
      <Link
        to={`/kora/${encodeURIComponent(session.id)}`}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "flex min-h-12 flex-col gap-0.5 rounded-md border-l-2 px-2 py-1.5 transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:min-h-6",
          selected ? "border-iris bg-iris-tint" : "border-transparent",
        )}
      >
        <span className="flex items-baseline gap-2">
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 self-center rounded-full", STATE_DOT[session.state])}
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {koraSessionName(session)}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-foreground-secondary">
            {session.state === "live"
              ? t("kora.pill.liveAge", { age })
              : t(`kora.session.state.${session.state}`)}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-3.5 font-mono text-xs text-foreground-muted">
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
    </li>
  );
}
