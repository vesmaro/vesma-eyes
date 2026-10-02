import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { readKoraTreeState, writeKoraTreeState } from "./koraTreeState";
import type {
  KoraAgentNode,
  KoraHostNode,
  KoraWorkspaceModel,
} from "./koraWorkspaceModel";
import { koraSessionName } from "./koraWorkspaceModel";
import type { KoraSession } from "./koraTypes";

/**
 * Блок 1 «Хосты и агенты» (07j §1.2/§3.3, union И1): the host → agent →
 * sessions tree over the real registries. Nested DISCLOSURE, not a
 * role="tree" (07j §6.1): name buttons + chevron buttons with
 * aria-expanded/aria-controls, sessions as links — no roving tabindex.
 *
 * Honest cuts (i1-dressing-map §1.2.2): the «Общие сессии» node never
 * renders (no `shared` field); the host row shows the sessions-registry
 * aggregate WITHOUT an invented report age (no lifecycle source); hosts
 * whose executors have no sessions carry no state dot at all.
 */

const STATE_DOT: Record<KoraSession["state"], string> = {
  live: "bg-success",
  idle: "bg-elevated",
  dead: "bg-foreground-muted",
};

export function KoraTree({
  model,
  selectedId,
  activeHost,
  onHostContext,
  onAgentContext,
}: {
  model: KoraWorkspaceModel;
  /** The open session id (route-driven) — its row is the selected one. */
  selectedId: string | null;
  /** The host the page filter points at ("" = none): others dim, it lights. */
  activeHost: string;
  onHostContext: (host: string) => void;
  onAgentContext: (agent: KoraAgentNode) => void;
}) {
  const t = useT();
  // The open-set seeds from sessionStorage when present; otherwise the
  // default opens exactly the hosts with live sessions (07j §11).
  const persisted = useRef(readKoraTreeState());
  const seeded = useRef(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const hasAnyHost = model.hosts.length > 0 || model.unknown.length > 0;

  useEffect(() => {
    if (seeded.current || !hasAnyHost) return;
    seeded.current = true;
    const stored = persisted.current;
    const initial =
      stored !== null
        ? stored.open
        : model.hosts
            .filter((host) => host.state === "live")
            .map((host) => host.host ?? "");
    setOpen(new Set(initial));
  }, [model, hasAnyHost]);

  const toggle = (key: string) => {
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeKoraTreeState({ open: [...next] });
      return next;
    });
  };

  if (!hasAnyHost) {
    // No executors → no hosts: the honest one-liner (07j §1.2). ME-072 №7:
    // action-free — the connect CTA lives ONCE, in the center; the panel
    // states the fact, it does not repeat the command.
    return (
      <p className="text-sm text-foreground-secondary">
        {t("kora.tree.emptyNoExecutors")}
      </p>
    );
  }

  return (
    <nav aria-label={t("kora.tree.title")} className="text-sm">
      <ul className="space-y-1">
        {[...model.hosts, ...model.unknown].map((host) => (
          <HostBranch
            key={host.host ?? `unknown:${host.agents[0]?.executorId}`}
            host={host}
            open={open}
            selectedId={selectedId}
            dimmed={activeHost !== "" && (host.host ?? "") !== activeHost}
            active={(host.host ?? "") === activeHost && activeHost !== ""}
            onToggle={toggle}
            onHostContext={onHostContext}
            onAgentContext={onAgentContext}
          />
        ))}
      </ul>
    </nav>
  );
}

function HostBranch({
  host,
  open,
  selectedId,
  dimmed,
  active,
  onToggle,
  onHostContext,
  onAgentContext,
}: {
  host: KoraHostNode;
  open: ReadonlySet<string>;
  selectedId: string | null;
  dimmed: boolean;
  active: boolean;
  onToggle: (key: string) => void;
  onHostContext: (host: string) => void;
  onAgentContext: (agent: KoraAgentNode) => void;
}) {
  const t = useT();
  const key = host.host ?? "";
  const expanded = open.has(key);
  const listId = `kora-tree-host-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  // Unknown-host group: the executor id IS the label (honest absence of a
  // host name — the registry never reported one for these sessions).
  const label = host.host ?? host.agents[0]?.executorId ?? "";

  return (
    <li
      className={cn(
        "rounded-md transition-opacity duration-fast motion-reduce:transition-none",
        dimmed && "opacity-50",
        active && "bg-iris/10",
      )}
    >
      <div className="flex min-h-6 items-center gap-1">
        <DisclosureButton
          expanded={expanded}
          controls={listId}
          onToggle={() => onToggle(key)}
          label={label}
        />
        <button
          type="button"
          onClick={() => host.host !== null && onHostContext(host.host)}
          className="flex min-h-6 flex-1 items-center gap-1.5 rounded-sm px-1 text-left font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
        >
          {host.state !== null ? (
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-full", STATE_DOT[host.state])}
            />
          ) : null}
          <span
            className={cn(
              "truncate",
              host.host === null && "font-mono text-foreground-secondary",
            )}
          >
            {label}
          </span>
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
        </button>
      </div>
      {expanded ? (
        <ul id={listId} className="ml-4 mt-1 space-y-1 border-l border-myelin pl-2">
          {host.agents.map((agent) => (
            <AgentBranch
              key={agent.executorId}
              agent={agent}
              open={open}
              selectedId={selectedId}
              onToggle={onToggle}
              onAgentContext={onAgentContext}
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

function AgentBranch({
  agent,
  open,
  selectedId,
  onToggle,
  onAgentContext,
}: {
  agent: KoraAgentNode;
  open: ReadonlySet<string>;
  selectedId: string | null;
  onToggle: (key: string) => void;
  onAgentContext: (agent: KoraAgentNode) => void;
}) {
  const label = agent.executor?.name ?? agent.harness;
  const listId = `kora-tree-agent-${agent.executorId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const expanded = open.has(agent.executorId);

  return (
    <li>
      <div className="flex min-h-6 items-center gap-1">
        {agent.sessions.length > 0 ? (
          <DisclosureButton
            expanded={expanded}
            controls={listId}
            onToggle={() => onToggle(agent.executorId)}
            label={label}
          />
        ) : (
          <span aria-hidden className="inline-block w-6" />
        )}
        <button
          type="button"
          onClick={() => onAgentContext(agent)}
          className="flex min-h-6 flex-1 items-center gap-1.5 rounded-sm px-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
        >
          <span className="truncate font-mono text-foreground-secondary">{label}</span>
          <span
            aria-hidden
            className="ml-auto shrink-0 font-mono text-xs tabular-nums text-foreground-muted"
          >
            · {agent.sessions.length}
          </span>
        </button>
      </div>
      {expanded && agent.sessions.length > 0 ? (
        <ul id={listId} className="ml-4 mt-1 space-y-0.5 border-l border-myelin pl-2">
          {agent.sessions.map((session) => {
            const selected = session.id === selectedId;
            return (
              <li key={session.id}>
                <Link
                  to={`/kora/${encodeURIComponent(session.id)}`}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "flex min-h-6 items-center gap-1.5 rounded-sm border-l-2 px-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
                    selected
                      ? "border-iris bg-iris/10"
                      : "border-transparent hover:bg-elevated",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      STATE_DOT[session.state],
                    )}
                  />
                  <span className="truncate text-foreground-secondary">
                    {koraSessionName(session)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
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
      className="flex size-6 shrink-0 items-center justify-center rounded-sm text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
    >
      {expanded ? (
        <ChevronDown aria-hidden className="size-4" />
      ) : (
        <ChevronRight aria-hidden className="size-4" />
      )}
    </button>
  );
}
