import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { KoraEther } from "./KoraEther";
import type { KoraEtherRow } from "./koraEtherStore";
import type { KoraCoverage, KoraSession } from "./koraTypes";
import { koraSessionName, sessionCoverageSupport } from "./koraWorkspaceModel";

/**
 * The RIGHT meta panel (kora-rethink blueprint §4, KW1 «Три колонки»): the
 * information half of the three-zone frame, ONE panel scroll, four
 * collapsible blocks — «О СЕССИИ» (moved out of KoraSessionList: fields +
 * the ONE session link), «ДАЙДЖЕСТ» (the ex-Пульт wing; honestly empty
 * until the relay lands), «ЭФИР» (the ex-Пульт wing — the real-bus ring,
 * now the ring's SINGLE mount: the empty scene's card left with the Пульт),
 * «ПОКРЫТИЕ» (the coverage legend, moved from the old panel bottom).
 *
 * Defaults (states.md §5): О СЕССИИ expanded when a session is selected
 * (collapsed otherwise, with the honest line), ЭФИР expanded, ДАЙДЖЕСТ and
 * ПОКРЫТИЕ collapsed. Details never replace content: an expanded block
 * without data shows its honest line, not a fake life.
 */

/** The ONE collapsible block header (the CoverageLegend button grammar). */
function MetaBlock({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex min-h-12 md:min-h-6 w-full items-center gap-1.5 rounded-sm text-left text-xs font-semibold uppercase tracking-wide text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        {open ? "▾" : "▸"} {title}
      </button>
      {open ? (
        <div id={id} className="mt-2 space-y-2 text-sm">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** The «О СЕССИИ» body — the registry fields block, moved verbatim from
 * KoraSessionList (kora-rethink blueprint §6: rehousing, not a rewrite). */
function AboutBody({
  session,
  coverage,
}: {
  session: KoraSession;
  coverage: KoraCoverage | null | undefined;
}) {
  const t = useT();
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
    <div className="space-y-2 border-t border-border-subtle pt-2">
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
  );
}

/** «О СЕССИИ» (states.md §5): expanded with a selected session (the block
 * re-mounts per selection — the default follows the route), collapsed with
 * the honest line otherwise; the line stays under the header in BOTH
 * collapse states when there is nothing to hide. */
function AboutBlock({
  session,
  coverage,
}: {
  session: KoraSession | null;
  coverage: KoraCoverage | null | undefined;
}) {
  const t = useT();
  const [open, setOpen] = useState(session !== null);
  const title = t("kora.about.title");
  return (
    <section aria-label={title}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="kora-meta-about-body"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 md:min-h-6 w-full items-center gap-1.5 rounded-sm text-left text-xs font-semibold uppercase tracking-wide text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        {open ? "▾" : "▸"} {title}
      </button>
      {session !== null ? (
        open ? (
          <div id="kora-meta-about-body" className="mt-2">
            <AboutBody session={session} coverage={coverage} />
          </div>
        ) : null
      ) : (
        <p className="mt-1.5 text-xs text-foreground-muted">
          {t("kora.meta.aboutNoSession")}
        </p>
      )}
    </section>
  );
}

export function KoraMetaPanel({
  session,
  coverage,
  etherRows,
  hostFilter = null,
}: {
  session: KoraSession | null;
  coverage: KoraCoverage | null | undefined;
  /** The real-bus ring — the Эфир block is the ring's ONE mount (KW1). */
  etherRows: readonly KoraEtherRow[];
  /** The page's ONE host filter (07j §3.2) — the ether follows it. */
  hostFilter?: string | null;
}) {
  const t = useT();
  const [digestOpen, setDigestOpen] = useState(false);
  const [etherOpen, setEtherOpen] = useState(true);
  const hasSession = session !== null;

  return (
    <div className="space-y-4 px-3 py-3">
      {/* Keyed per selection: the route change re-mounts the block, so the
       * documented default (expanded with a session) always re-applies. */}
      <AboutBlock
        key={session?.id ?? "none"}
        session={session}
        coverage={coverage}
      />

      {/* ДАЙДЖЕСТ (the ex-Пульт wing): collapsed by default; inside — the
       * honest empty (no relay source yet), never a fake life. */}
      <MetaBlock
        id="kora-meta-digest-body"
        title={t("kora.meta.digest")}
        open={digestOpen}
        onToggle={() => setDigestOpen((value) => !value)}
      >
        <div className="text-foreground-secondary">
          {hasSession ? (
            <div className="flex flex-wrap items-center gap-3">
              <span>{t("kora.meta.digestEmpty")}</span>
              <a
                href="#kora-workzone"
                className="inline-flex min-h-12 md:min-h-6 items-center text-sm text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
              >
                {t("kora.meta.readTranscript")}
              </a>
            </div>
          ) : (
            <p>{t("kora.meta.digestHint")}</p>
          )}
        </div>
      </MetaBlock>

      {/* ЭФИР (the ex-Пульт wing): expanded by default; the real-bus ring —
       * the workspace's ONLY KoraEther mount since the Пульт dissolved. */}
      <MetaBlock
        id="kora-meta-ether-body"
        title={t("kora.meta.ether")}
        open={etherOpen}
        onToggle={() => setEtherOpen((value) => !value)}
      >
        <KoraEther rows={etherRows} hostFilter={hostFilter} className="flex flex-col" />
      </MetaBlock>

      <CoverageBlock coverage={coverage} />
    </div>
  );
}

/** «Что мы видим с ваших машин» (07j §3.5): the registry's real coverage —
 * per-harness visibility + the explicit gaps — folded by default (states.md
 * §5); hidden entirely when the server named no coverage. */
function CoverageBlock({ coverage }: { coverage: KoraCoverage | null | undefined }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  if (coverage === null || coverage === undefined) return null;
  return (
    <MetaBlock
      id="kora-legend-body"
      title={t("kora.legend.title")}
      open={expanded}
      onToggle={() => setExpanded((value) => !value)}
    >
      <div className="space-y-1.5 text-xs">
        {coverage.harnesses.map((row) => (
          <p key={row.harness} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-foreground-secondary">{row.harness}</span>
            <span className="text-foreground-secondary">
              {t(`kora.coverage.support.${row.support}`)}
            </span>
            {row.note ? (
              <span className="basis-full text-foreground-muted">{row.note}</span>
            ) : null}
          </p>
        ))}
        {coverage.gaps.length > 0 ? (
          <div>
            <p className="font-medium text-foreground-secondary">
              {t("kora.coverage.gaps")}
            </p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-foreground-muted">
              {coverage.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="text-foreground-muted">{t("kora.legend.growNote")}</p>
      </div>
    </MetaBlock>
  );
}
