import { Link } from "react-router";
import { ChevronRight, Radio, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { KoraSession } from "./koraTypes";
import {
  koraAgeUnit,
  koraSessionName,
  quickFilterMatches,
  sortKoraSessions,
  type KoraQuickFilter,
} from "./koraWorkspaceModel";

/**
 * Блок 2 «Сессии · <контекст>» (07j §3.4, union И1): the session list of
 * the current context (all / host / agent — set by the header filter and
 * the tree clicks), sorted live-on-top, always filtered by the ONE page
 * host filter; each row carries its state as dot + TEXT with a mono age.
 * KW1 (kora-rethink): the block lives in the LEFT navigation panel; the
 * «О сессии» block moved to the RIGHT meta panel (KoraMetaPanel).
 */

/** The Блок 2 context: all sessions, one host, one agent, or the hermes
 * source (T004 slice 2 — the cluster source is a first-class filter). */
export type KoraBlock2Context =
  | { kind: "all" }
  | { kind: "host"; host: string }
  | { kind: "agent"; executorId: string; harness: string; host: string | null }
  | { kind: "hermes" };

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

/**
 * The source badge (T004 slice 2): the harness name as DATA on the same
 * outline token vocabulary as the origin badge — «бейдж по слотам токенами,
 * не новый цвет». The hermes source reads «hermes» verbatim (the source is
 * a proper name); other harnesses keep their bare mono label.
 */
function SourceBadge({ harness }: { harness: string }) {
  if (harness !== "hermes") return <span>{harness}</span>;
  return (
    <Badge variant="outline" className="font-mono">
      {harness}
    </Badge>
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
          "flex min-h-12 md:min-h-6 flex-col gap-1 rounded-md border-l-2 px-2 py-2 transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
          selected ? "border-iris bg-iris-tint" : "border-transparent",
        )}
      >
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {koraSessionName(session)}
          </span>
          <StatePill session={session} />
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-foreground-muted">
          {/* «host · harness» only where the context does not already say it (07j §3.4).
           * T004 slice 2: harness name rides a badge — the source is DATA on
           * both themes; tokens only, no new colour vocabulary. */}
          {context.kind === "all" ? <SourceBadge harness={session.harness} /> : null}
          <span>{session.executor_id}</span>
          {/* D12: the origin chip reads as words («через релей», not «реле»)
           * and carries the contract wording as its tooltip. */}
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
          <span className="line-clamp-1 text-xs text-foreground-secondary">
            {session.last_line_preview}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/** «О сессии» left with KW1 — the block now lives in the RIGHT meta panel
 * (KoraMetaPanel); the list keeps the rows, filters and honest empties. */

export function KoraSessionList({
  context,
  sessions,
  quickFilter,
  onQuickFilter,
  selectedId,
  noExecutors,
  sessionsEmpty,
  hermesRefresh = null,
}: {
  context: KoraBlock2Context;
  /** Sessions of the CURRENT context (the caller applies the context). */
  sessions: readonly KoraSession[];
  quickFilter: KoraQuickFilter | null;
  onQuickFilter: (filter: KoraQuickFilter | null) => void;
  selectedId: string | null;
  /** Executor registry is a FACT zero (drives the variant-A empty state). */
  noExecutors: boolean;
  /** The WHOLE registry is empty (drives the variant-B empty state). */
  sessionsEmpty: boolean;
  /** T004 slice 2: the hermes context owns the ONE manual-refresh slot —
   * present only when the context is hermes (a pull is a live cluster
   * roundtrip + a registry write, triggered by THIS button alone). */
  hermesRefresh?: {
    onRefresh: () => void;
    pending: boolean;
  } | null;
}) {
  const t = useT();
  const rows = sortKoraSessions(
    sessions.filter((session) => quickFilterMatches(session, quickFilter)),
  );

  const title =
    context.kind === "all"
      ? t("kora.block2.titleAll")
      : context.kind === "hermes"
        ? t("kora.block2.titleHermes")
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
       * its scrollport scrolls. Below lg the scrollport is the PAGE — the
       * header pins under the shell's sticky topbar+crumbs rows; inside
       * the frame (lg+, incl. the KW3 meta-panel placement at lg..xl) the
       * scrollport is the panel itself — pin to its top, the shell chrome
       * is not part of it (KW3 a11y pass fix: the frame offset used to
       * leave a dead 88px band inside the panel scroll). */}
      <div className="sticky top-0 z-10 -mx-3 flex min-h-8 items-center gap-2 bg-well px-3 py-1 max-lg:top-[calc(var(--shell-topbar-h)+var(--shell-crumbs-h))]">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
          {title}
        </h2>
        <span
          aria-hidden
          className="font-mono text-xs tabular-nums text-foreground-muted"
        >
          · {rows.length}
        </span>
        {/* The ONE manual pull (T004 slice 2): hermes context only — the
         * refresh is DATA (the live listing answer), never a pulse. The
         * Button spec-05 loading row (spinner + aria-busy) carries pending. */}
        {context.kind === "hermes" && hermesRefresh !== null ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={hermesRefresh.pending}
            onClick={hermesRefresh.onRefresh}
            className="ml-auto h-12 border-border-subtle px-2 font-mono text-xs text-foreground-secondary md:h-7"
          >
            <RefreshCw aria-hidden className="size-3" />
            {hermesRefresh.pending
              ? t("kora.hermes.refreshing")
              : t("kora.hermes.refresh")}
          </Button>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          aria-pressed={quickFilter === "running"}
          onClick={() => onQuickFilter(quickFilter === "running" ? null : "running")}
          className="min-h-12 md:min-h-6 rounded-full border border-border-subtle px-2.5 text-xs text-foreground-secondary transition-colors duration-instant hover:text-foreground aria-pressed:border-iris aria-pressed:text-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
        >
          {t("kora.block2.qfRunning")}
        </button>
        <button
          type="button"
          aria-pressed={quickFilter === "day"}
          onClick={() => onQuickFilter(quickFilter === "day" ? null : "day")}
          className="min-h-12 md:min-h-6 rounded-full border border-border-subtle px-2.5 text-xs text-foreground-secondary transition-colors duration-instant hover:text-foreground aria-pressed:border-iris aria-pressed:text-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
        >
          {t("kora.block2.qfDay")}
        </button>
      </div>

      <div className="mt-2">
        {sessionsEmpty && context.kind === "all" ? (
          noExecutors ? (
            // ME-072 №7: the honest line without an action — the connect
            // CTA lives ONCE, in the center; the panel states the fact.
            <HonestLine>{t("kora.list.emptyNoExecutors")}</HonestLine>
          ) : (
            <HonestLine
              action={
                <Link
                  to="/system/status"
                  className="inline-flex min-h-12 md:min-h-6 items-center gap-1 text-sm text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
                >
                  {t("kora.list.emptyStatusLink")}
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              }
            >
              {t("kora.list.emptyNoSessions")}
            </HonestLine>
          )
        ) : context.kind === "hermes" && rows.length === 0 && quickFilter === null ? (
          // The hermes honest empty (T004 slice 2): the registry slice fills
          // ONLY on a pull — the empty names the one action, no auto-pull,
          // no promises that sessions «появятся сами».
          <HonestLine>{t("kora.hermes.emptyNoPull")}</HonestLine>
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
