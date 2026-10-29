import { useState } from "react";
import { Link } from "react-router";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { KoraComposer } from "./KoraComposer";
import type { KoraHarnessOption } from "./KoraComposerControls";
import { KoraTranscript } from "./KoraTranscript";
import { KoraHermesChat } from "./KoraHermesChat";
import { KoraMovesZone } from "./KoraMovesZone";
import { KoraReadingTools } from "./KoraReadingTools";
import type { KoraIntentEventPoints } from "./koraIntentEvents";
import { NOOP_KORA_FRAME_EVENTS, type KoraFrameEventPoints } from "./koraFrameEvents";
import type { KoraCoverage, KoraSession } from "./koraTypes";
import {
  koraAgeUnit,
  koraSessionName,
  sessionCoverageSupport,
} from "./koraWorkspaceModel";
import type { KoraHermesTranscriptPages, KoraTranscriptPages } from "./useKora";

/**
 * The central work zone (07j §3.1; the KW2 SPLIT per kora-rethink
 * blueprint §2–4): ALWAYS deployed — selecting a session never
 * re-assembles the page, only the center's content changes with the route.
 *
 * Modes (states.md §2):
 * - K-EMPTY: no session, not the hermes mode → the honest invitation (Эфир
 *   lives in the meta panel).
 * - K-HERMES-LIVE / K-CLUSTER: the hermes SPLIT — the chat on top (the
 *   header with the session switcher + the model select, the history, the
 *   REAL composer), the «Все ходы» zone below the row-resize seam (the
 *   collapsed 40px strip is the default). The chat is REAL in BOTH: POST
 *   /chat is stateless, so even a selected hermes session stays honest —
 *   the non-persistence note names what a send does and does not touch.
 * - K-ZCODE / K-ZCODE-DEAD: a zcode/vscode/pi session → the FULL-PAGE
 *   transcript, NO split (its content IS the main zone) + the composer
 *   with the honestly deferred send (07a §1 canon — unchanged in KW2).
 */

/** The §9.3 registry-empty branch: A = zero executors, B = scanner wait. */
export type KoraRegistryEmpty = "no-executors" | "no-sessions" | null;

/** The hermes split contract (KW2): everything the two zones need, hoisted
 * at the workspace so the messages cursor is read ONCE per session. */
export interface KoraHermesSplit {
  /** The chat anchor (null = the honest clean slate); the moves zone reads
   * the same session's transcript. */
  session: KoraSession | null;
  /** The ONE hoisted messages read (the chat filters user/assistant out of
   * it; the zone shows the full grammar). */
  pages: KoraHermesTranscriptPages;
  /** The verified model roster + default from /status (empty = fallback). */
  models: readonly string[];
  defaultModel: string | null;
  /** The context sessions for the chat's switcher. */
  sessions: readonly KoraSession[];
  /** The session the route carries; null = the cluster option is active. */
  activeSessionId: string | null;
  /** The route seam: null → /kora/hermes, an id → /kora/:sessionId. */
  onNavigateSession: (sessionId: string | null) => void;
}

export function KoraWorkzone({
  session,
  registryEmpty,
  coverage,
  transcript,
  hermes = null,
  intentEvents,
  frameEvents = NOOP_KORA_FRAME_EVENTS,
  harnessOptions = [],
}: {
  session: KoraSession | null;
  registryEmpty: KoraRegistryEmpty;
  coverage: KoraCoverage | null | undefined;
  transcript: KoraTranscriptPages;
  /** Non-null iff the hermes mode is on stage (the cluster route or a
   * selected hermes session) — the split center. */
  hermes?: KoraHermesSplit | null;
  intentEvents: KoraIntentEventPoints;
  /** The frame telemetry call points (KW3) — forwarded to the moves zone;
   * a no-op until the taxonomy v1 revision names the kinds. */
  frameEvents?: KoraFrameEventPoints;
  /** В2 — the composer selector row's harness derivations over the
   * LOADED registry (the workspace owns the items). */
  harnessOptions?: readonly KoraHarnessOption[];
}) {
  const t = useT();

  if (session !== null) {
    if (session.harness === "hermes") {
      // K-HERMES-LIVE: the selected hermes session is a CHAT + the moves
      // zone (the read-only full-page transcript left with KW1's shape —
      // the composer here is real, the note names its statelessness).
      return <KoraHermesSplitView split={hermes} frameEvents={frameEvents} />;
    }
    // Mode B (zcode/vscode/pi): the full-page transcript, NO split.
    return (
      <SessionView
        session={session}
        coverage={coverage}
        transcript={transcript}
        intentEvents={intentEvents}
        harnessOptions={harnessOptions}
      />
    );
  }

  if (hermes !== null) {
    // K-CLUSTER (/kora/hermes): the same split, the anchor = the last
    // active api_server session or the honest clean slate.
    return <KoraHermesSplitView split={hermes} frameEvents={frameEvents} />;
  }

  return (
    /* The scene in the v7 frame (07j §3.1 А): the honest invitation; the
     * Эфир lives in the meta panel (KW1), the scene keeps the center's
     * free space for the invitation + the honest empties. */
    <section
      aria-label={t("kora.transcript.region")}
      className="flex min-h-0 min-w-0 flex-1 flex-col px-6 py-5"
    >
      <p className="text-sm text-foreground-secondary">{t("kora.workzone.invite")}</p>
      {registryEmpty !== null ? (
        <div className="mt-3">
          <HonestLine
            action={
              registryEmpty === "no-executors" ? (
                <Link
                  to="/agents/harnesses"
                  className="inline-flex min-h-12 md:min-h-6 items-center text-sm text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
                >
                  {t("kora.list.emptyAction")}
                </Link>
              ) : (
                <Link
                  to="/system/status"
                  className="inline-flex min-h-12 md:min-h-6 items-center text-sm text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
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

/** The hermes split (states.md K-HERMES-LIVE / K-CLUSTER): the chat zone
 * (flex) + the «Все ходы» zone (the seam + the 40px strip / the deployed
 * body). The zones NEVER share scroll state — two follow-tails by design
 * (kora-rethink blueprint §8). */
function KoraHermesSplitView({
  split,
  frameEvents,
}: {
  split: KoraHermesSplit | null;
  frameEvents: KoraFrameEventPoints;
}) {
  if (split === null) return null;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <KoraHermesChat
        session={split.session}
        pages={split.pages}
        models={split.models}
        defaultModel={split.defaultModel}
        sessions={split.sessions}
        activeSessionId={split.activeSessionId}
        onNavigateSession={split.onNavigateSession}
      />
      <KoraMovesZone
        sessionId={split.session?.id ?? null}
        pages={split.pages}
        frameEvents={frameEvents}
      />
    </div>
  );
}

function SessionView({
  session,
  coverage,
  transcript,
  intentEvents,
  harnessOptions = [],
}: {
  session: KoraSession;
  coverage: KoraCoverage | null | undefined;
  transcript: KoraTranscriptPages;
  intentEvents: KoraIntentEventPoints;
  harnessOptions?: readonly KoraHarnessOption[];
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
      className="flex min-h-0 min-w-0 flex-1 flex-col"
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

      <KoraReadingTools
        follow={follow}
        onFollow={() => setFollow((value) => !value)}
        query={query}
        onQuery={setQuery}
        matchCount={matchCount}
      />

      {/* The scroll owns the free height inside the frame (07l §4: the
       * свиток is THE scroll container of the scene). */}
      <div className="kora-scroll mt-3 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <KoraTranscript
          sessionId={session.id}
          pages={transcript}
          follow={follow}
          query={query}
        />
      </div>

      {/* The composer rides below the scroll, always visible for the open
       * session (07j §4.6 — never hidden behind a disclosure). В2: the
       * selector row rides inside it, fed the registry's harness facts. */}
      <KoraComposer
        key={session.id}
        session={session}
        intentEvents={intentEvents}
        harnessOptions={harnessOptions}
      />
    </section>
  );
}
