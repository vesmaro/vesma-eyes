import { useState } from "react";
import { Link } from "react-router";
import { Check, ChevronRight, Copy, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { KoraCoverage, KoraSession } from "./koraTypes";
import {
  koraAgeUnit,
  koraSessionName,
  quickFilterMatches,
  sessionCoverageSupport,
  sortKoraSessions,
  type KoraQuickFilter,
} from "./koraWorkspaceModel";

/**
 * Блок 2 «Сессии · <контекст>» (07j §3.4, union И1): the session list of
 * the current context (all / host / agent — set by the header filter and
 * the tree clicks), sorted live-on-top, always filtered by the ONE page
 * host filter; each row carries its state as dot + TEXT with a mono age.
 * The «О сессии» disclosure rides the top of the block only while a
 * session is selected — details never replace content.
 */

/** The Блок 2 context: all sessions, one host, or one agent (07j §1.2). */
export type KoraBlock2Context =
  | { kind: "all" }
  | { kind: "host"; host: string }
  | { kind: "agent"; executorId: string; harness: string; host: string | null };

const STATE_DOT: Record<KoraSession["state"], string> = {
  live: "bg-success",
  idle: "bg-elevated",
  dead: "bg-foreground-muted",
};

/** The state pill: dot + text + age, state never colour-only (1.4.1). */
function StatePill({ session }: { session: KoraSession }) {
  const t = useT();
  const { unit, n } = koraAgeUnit(session.age_seconds);
  const age = t(`kora.age.${unit}`, { n });
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-foreground-secondary">
      <span
        aria-hidden
        className={cn("size-2 rounded-full", STATE_DOT[session.state])}
      />
      {session.state === "live"
        ? t("kora.pill.liveAge", { age })
        : t(`kora.session.state.${session.state}`)}
    </span>
  );
}

function SessionRow({
  session,
  selected,
  context,
}: {
  session: KoraSession;
  selected: boolean;
  context: KoraBlock2Context;
}) {
  const t = useT();
  return (
    <li>
      <Link
        to={`/kora/${encodeURIComponent(session.id)}`}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "flex min-h-6 flex-col gap-1 rounded-md border-l-2 px-2 py-2 transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
          selected ? "border-iris bg-iris/10" : "border-transparent",
        )}
      >
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {koraSessionName(session)}
          </span>
          <StatePill session={session} />
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-foreground-muted">
          {/* «host · harness» only where the context does not already say it (07j §3.4). */}
          {context.kind === "all" ? <span>{session.harness}</span> : null}
          <span>{session.executor_id}</span>
          <Badge variant="outline">{t(`kora.session.origin.${session.origin}`)}</Badge>
          {session.steerable ? (
            <Badge variant="outline" className="gap-1">
              <Radio aria-hidden className="size-3" />
              {t("kora.session.steerable")}
            </Badge>
          ) : null}
        </span>
        {session.last_line_preview ? (
          <span className="line-clamp-1 text-xs text-foreground-secondary">
            {session.last_line_preview}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/** «О сессии» (07j §3.4): real registry fields only — full name, preview,
 * exact times in the tooltip, the coverage wording, the ONE session link. */
function AboutSession({
  session,
  coverage,
}: {
  session: KoraSession;
  coverage: KoraCoverage | null | undefined;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "failed">("idle");
  const support = sessionCoverageSupport(coverage, session.harness);
  const started = session.started_at ?? null;
  const lastActivity = session.last_activity_at ?? null;

  const copyLink = async () => {
    const url = `${window.location.origin}/kora/${encodeURIComponent(session.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("ok");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <div className="rounded-md border border-border-subtle">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="kora-about-body"
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-sm font-medium text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "size-4 transition-transform duration-instant",
            expanded && "rotate-90",
          )}
        />
        {t("kora.about.title")}
      </button>
      {expanded ? (
        <div
          id="kora-about-body"
          className="space-y-2 border-t border-border-subtle px-3 py-2 text-sm"
        >
          <p className="break-words font-medium">{koraSessionName(session)}</p>
          {session.last_line_preview ? (
            <p className="text-xs text-foreground-secondary">
              {session.last_line_preview}
            </p>
          ) : null}
          <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-xs">
            <dt className="text-foreground-secondary">{t("kora.about.started")}</dt>
            <dd title={started ?? undefined} className="font-mono tabular-nums">
              {started ?? "—"}
            </dd>
            <dt className="text-foreground-secondary">
              {t("kora.about.lastActivity")}
            </dt>
            <dd title={lastActivity ?? undefined} className="font-mono tabular-nums">
              {lastActivity ?? "—"}
            </dd>
            <dt className="text-foreground-secondary">{t("kora.about.coverage")}</dt>
            <dd>
              {support !== null ? (
                t(`kora.sessionCov.${support === "lists-only" ? "partial" : support}`)
              ) : (
                <span className="text-foreground-muted">
                  {t("kora.sessionCov.unknown")}
                </span>
              )}
            </dd>
            <dt className="text-foreground-secondary">{t("kora.about.harness")}</dt>
            <dd className="font-mono">
              {session.harness} · {session.executor_id} · {session.native_id}
            </dd>
          </dl>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void copyLink()}>
              <Copy aria-hidden className="size-3.5" />
              {t("kora.about.copyLink")}
            </Button>
            {copyState !== "idle" ? (
              <span
                role="status"
                className={cn(
                  "inline-flex items-center gap-1 text-xs",
                  copyState === "ok" ? "text-success" : "text-error",
                )}
              >
                {copyState === "ok" ? <Check aria-hidden className="size-3.5" /> : null}
                {copyState === "ok"
                  ? t("kora.about.copied")
                  : t("kora.about.copyFailed")}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function KoraSessionList({
  context,
  sessions,
  quickFilter,
  onQuickFilter,
  selectedId,
  coverage,
  noExecutors,
  sessionsEmpty,
}: {
  context: KoraBlock2Context;
  /** Sessions of the CURRENT context (the caller applies the context). */
  sessions: readonly KoraSession[];
  quickFilter: KoraQuickFilter | null;
  onQuickFilter: (filter: KoraQuickFilter | null) => void;
  selectedId: string | null;
  coverage: KoraCoverage | null | undefined;
  /** Executor registry is a FACT zero (drives the variant-A empty state). */
  noExecutors: boolean;
  /** The WHOLE registry is empty (drives the variant-B empty state). */
  sessionsEmpty: boolean;
}) {
  const t = useT();
  const rows = sortKoraSessions(
    sessions.filter((session) => quickFilterMatches(session, quickFilter)),
  );
  const selected = sessions.find((session) => session.id === selectedId) ?? null;

  const title =
    context.kind === "all"
      ? t("kora.block2.titleAll")
      : context.kind === "host"
        ? t("kora.block2.titleHost", { host: context.host })
        : context.host !== null
          ? t("kora.block2.titleAgent", {
              harness: context.harness,
              host: context.host,
            })
          : t("kora.block2.titleExecutor", { name: context.executorId });

  return (
    <section aria-label={t("kora.block2.section")}>
      {/* Sticky context header (07l §4): the context stays readable while
       * the panel scrolls in the document flow — well bg so nothing shows
       * through, offset below the shell's topbar+crumbs rows. */}
      <div className="sticky top-[calc(var(--shell-topbar-h)+var(--shell-crumbs-h))] z-10 -mx-3 flex min-h-8 items-center gap-2 bg-well px-3 py-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
          {title}
        </h2>
        <span
          aria-hidden
          className="font-mono text-xs tabular-nums text-foreground-muted"
        >
          · {rows.length}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          aria-pressed={quickFilter === "running"}
          onClick={() => onQuickFilter(quickFilter === "running" ? null : "running")}
          className="min-h-6 rounded-full border border-border-subtle px-2.5 text-xs text-foreground-secondary transition-colors duration-instant hover:text-foreground aria-pressed:border-iris aria-pressed:text-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
        >
          {t("kora.block2.qfRunning")}
        </button>
        <button
          type="button"
          aria-pressed={quickFilter === "day"}
          onClick={() => onQuickFilter(quickFilter === "day" ? null : "day")}
          className="min-h-6 rounded-full border border-border-subtle px-2.5 text-xs text-foreground-secondary transition-colors duration-instant hover:text-foreground aria-pressed:border-iris aria-pressed:text-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
        >
          {t("kora.block2.qfDay")}
        </button>
      </div>

      {selected ? (
        <div className="mt-2">
          <AboutSession session={selected} coverage={coverage} />
        </div>
      ) : null}

      <div className="mt-2">
        {sessionsEmpty && context.kind === "all" ? (
          noExecutors ? (
            <HonestLine
              action={
                <Button asChild variant="outline" size="sm">
                  <Link to="/agents/harnesses">{t("kora.list.emptyAction")}</Link>
                </Button>
              }
            >
              {t("kora.list.emptyNoExecutors")}
            </HonestLine>
          ) : (
            <HonestLine
              action={
                <Link
                  to="/system/status"
                  className="inline-flex min-h-6 items-center gap-1 text-sm text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
                >
                  {t("kora.list.emptyStatusLink")}
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              }
            >
              {t("kora.list.emptyNoSessions")}
            </HonestLine>
          )
        ) : rows.length === 0 ? (
          <p className="text-sm text-foreground-secondary">
            {quickFilter !== null
              ? t("kora.block2.emptyFiltered")
              : t("kora.block2.emptyContext")}
          </p>
        ) : (
          <ul role="list" className="space-y-1">
            {rows.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                selected={session.id === selectedId}
                context={context}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
