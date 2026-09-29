import { useState } from "react";
import { Link } from "react-router";
import { ArrowDownToLine, Search } from "lucide-react";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { KoraComposer } from "./KoraComposer";
import { KoraTranscript } from "./KoraTranscript";
import type { KoraIntentEventPoints } from "./koraIntentEvents";
import type { KoraCoverage, KoraSession } from "./koraTypes";
import {
  koraAgeUnit,
  koraSessionName,
  sessionCoverageSupport,
} from "./koraWorkspaceModel";
import type { KoraTranscriptPages } from "./useKora";

/**
 * The central work zone (07j §3.1, union И1): ALWAYS deployed — selecting a
 * session never re-assembles the page, only the center's content changes
 * with the route. No session → the honest invitation (no Эфир: the event
 * feed has no source until И4 — a fixture feed would be fake life); an
 * EMPTY registry → the §9.3 honest variants (A: connect an agent; B: the
 * scanner wait) so the center explains WHY there is nothing to select.
 * A session → the transcript scroll canon (Lora ≤72ch, mono tnum times,
 * load-more, follow-tail as scroll pinning) + the composer (07j §4.6).
 */

/** The §9.3 registry-empty branch: A = zero executors, B = scanner wait. */
export type KoraRegistryEmpty = "no-executors" | "no-sessions" | null;

export function KoraWorkzone({
  session,
  registryEmpty,
  coverage,
  transcript,
  intentEvents,
}: {
  session: KoraSession | null;
  registryEmpty: KoraRegistryEmpty;
  coverage: KoraCoverage | null | undefined;
  transcript: KoraTranscriptPages;
  intentEvents: KoraIntentEventPoints;
}) {
  const t = useT();

  if (session === null) {
    return (
      <section aria-label={t("kora.transcript.region")} className="min-w-0 px-6 py-5">
        <p className="text-sm text-foreground-secondary">{t("kora.workzone.invite")}</p>
        {registryEmpty !== null ? (
          <div className="mt-3">
            <HonestLine
              action={
                registryEmpty === "no-executors" ? (
                  <Link
                    to="/agents/harnesses"
                    className="inline-flex min-h-6 items-center text-sm text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
                  >
                    {t("kora.list.emptyAction")}
                  </Link>
                ) : (
                  <Link
                    to="/system/status"
                    className="inline-flex min-h-6 items-center text-sm text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
                  >
                    {t("kora.list.emptyStatusLink")}
                  </Link>
                )
              }
            >
              {registryEmpty === "no-executors"
                ? t("kora.list.emptyNoExecutors")
                : t("kora.list.emptyNoSessions")}
            </HonestLine>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <SessionView
      session={session}
      coverage={coverage}
      transcript={transcript}
      intentEvents={intentEvents}
    />
  );
}

function SessionView({
  session,
  coverage,
  transcript,
  intentEvents,
}: {
  session: KoraSession;
  coverage: KoraCoverage | null | undefined;
  transcript: KoraTranscriptPages;
  intentEvents: KoraIntentEventPoints;
}) {
  const t = useT();
  const [follow, setFollow] = useState(true);
  const [query, setQuery] = useState("");
  const support = sessionCoverageSupport(coverage, session.harness);
  const { unit, n } = koraAgeUnit(session.age_seconds);
  const age = t(`kora.age.${unit}`, { n });
  const needle = query.trim().toLowerCase();
  const matchCount =
    needle === ""
      ? null
      : transcript.items.filter((item) => item.content.toLowerCase().includes(needle))
          .length;

  return (
    <section
      id="kora-workzone"
      aria-label={t("kora.transcript.region")}
      className="min-w-0"
    >
      {/* 4.1.3: the opened session is announced politely (07j §6.1). */}
      <p role="status" aria-live="polite" className="sr-only">
        {t("kora.workzone.openedAnnounce", { name: koraSessionName(session) })}
      </p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-3">
        <h2
          id="kora-session-heading"
          className="min-w-0 flex-1 truncate font-scroll text-lg font-semibold"
          title={koraSessionName(session)}
        >
          {koraSessionName(session)}
        </h2>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-foreground-secondary">
          <span
            aria-hidden
            className={cn(
              "size-2 rounded-full",
              session.state === "live" ? "bg-success" : "bg-elevated",
            )}
          />
          {session.state === "live"
            ? t("kora.pill.liveAge", { age })
            : t(`kora.session.state.${session.state}`)}
        </span>
      </div>
      {/* The session coverage — caps-small after the status (07j §3.5). */}
      <p className="px-4 pt-1 text-xs uppercase tracking-wide text-foreground-muted">
        {t("kora.about.coverage")}:{" "}
        {support !== null ? (
          t(`kora.sessionCov.${support === "lists-only" ? "partial" : support}`)
        ) : (
          <span className="normal-case">{t("kora.sessionCov.unknown")}</span>
        )}
      </p>

      {/* Reading tools (07j §3 / 07i §4) — the work zone's own toolbar. */}
      <div className="mt-2 flex flex-wrap items-center gap-2 px-4">
        <button
          type="button"
          aria-pressed={follow}
          onClick={() => setFollow((value) => !value)}
          className="inline-flex min-h-6 items-center gap-1.5 rounded-sm px-2 text-xs text-foreground-secondary transition-colors duration-instant hover:text-foreground aria-pressed:text-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
        >
          <ArrowDownToLine aria-hidden className="size-3.5" />
          {t("kora.workzone.followTail")}
        </button>
        <div className="relative min-w-0 flex-1 sm:max-w-72">
          <label className="sr-only" htmlFor="kora-session-search">
            {t("kora.workzone.searchLabel")}
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-foreground-muted"
          />
          <input
            id="kora-session-search"
            type="search"
            value={query}
            placeholder={t("kora.workzone.searchPlaceholder")}
            onChange={(event) => setQuery(event.target.value)}
            className="h-7 w-full rounded-md border border-border-subtle bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-foreground-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
          />
        </div>
        {matchCount !== null ? (
          <span
            role="status"
            className="font-mono text-xs tabular-nums text-foreground-muted"
          >
            {t("kora.workzone.matches", { n: matchCount })}
          </span>
        ) : null}
      </div>

      <div className="mt-3 px-4 pb-4">
        <KoraTranscript
          sessionId={session.id}
          pages={transcript}
          follow={follow}
          query={query}
        />
      </div>

      {/* The composer rides below the scroll, always visible for the open
       * session (07j §4.6 — never hidden behind a disclosure). */}
      <KoraComposer key={session.id} session={session} intentEvents={intentEvents} />
    </section>
  );
}
