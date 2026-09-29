import { useState } from "react";
import { Link } from "react-router";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Lightbulb,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { TableRowSkeleton } from "@/components/skeletons/Skeletons";
import { useExecutors } from "@/features/agents/useAgents";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { useKoraSessionPages } from "./useKora";
import { useKoraEntered } from "@/telemetry/useKoraEntered";
import { isKoraUnauthorized } from "./koraGateway";
import { KoraSignInCta } from "./KoraSignInCta";
import type { KoraCoverageHarness, KoraSession } from "./koraTypes";

/**
 * `/kora` — the session workspace (ADR 0019 rev.2). UX-overhaul §5 (Ф1, П2):
 * the ROOT IS THE SESSION LIST — data first, meta folded away. The coverage
 * panel («что вижу / чего нет») and the onboarding card («зачем Кора») move
 * under a collapsed disclosure at the bottom (the ConnectGuide pattern);
 * they open only on demand. The week-0 badge is a quiet «Демо-данные» chip —
 * no internal dictionary (П4).
 *
 * The honest empty state branches on the executor registry (§9.3): with zero
 * executors the answer is «подключите агента» + the connect CTA; when
 * executors exist but no scanner session has arrived yet, the line names the
 * actual wait («сканер хостов») and links to /system/status — no promise
 * that sessions «appear on their own».
 *
 * The session list reads through the P4-7 load-more hook (slice 2): the
 * first page renders immediately, «Показать ещё» appends the next one.
 */

const SUPPORT_ICON: Record<KoraCoverageHarness["support"], typeof Eye> = {
  full: Eye,
  "lists-only": Eye,
  "metadata-only": EyeOff,
  absent: EyeOff,
};

function CoveragePanel({
  harnesses,
  gaps,
}: {
  // The generated contract types are immutable — readonly arrays in, the
  // render only maps over them.
  harnesses: readonly KoraCoverageHarness[];
  gaps: readonly string[];
}) {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye aria-hidden className="size-4" />
          {t("kora.coverage.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {harnesses.map((row) => {
            const Icon = SUPPORT_ICON[row.support];
            const tone =
              row.support === "full"
                ? "default"
                : row.support === "absent"
                  ? "error"
                  : "outline";
            return (
              <li
                key={row.harness}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <Icon
                  aria-hidden
                  className="size-4 shrink-0 text-foreground-secondary"
                />
                <span className="font-mono">{row.harness}</span>
                <Badge variant={tone}>
                  {t(`kora.coverage.support.${row.support}`)}
                </Badge>
                {row.note ? (
                  <span className="basis-full text-foreground-secondary">
                    {row.note}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {gaps.length > 0 ? (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
              {t("kora.coverage.gaps")}
            </p>
            <ul className="list-inside list-disc space-y-1 text-sm text-foreground-secondary">
              {gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Literal i18n keys (the generated types have no template-literal keys). */
const ONBOARDING_CASES = [
  { title: "kora.onboarding.case1.title", body: "kora.onboarding.case1.body" },
  { title: "kora.onboarding.case2.title", body: "kora.onboarding.case2.body" },
  { title: "kora.onboarding.case3.title", body: "kora.onboarding.case3.body" },
] as const;

function OnboardingCard() {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb aria-hidden className="size-4" />
          {t("kora.onboarding.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3 text-sm">
          {ONBOARDING_CASES.map((caseI18n, index) => (
            <li key={caseI18n.title} className="flex gap-3">
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-well text-xs font-semibold"
              >
                {index + 1}
              </span>
              <div>
                <p className="font-medium">{t(caseI18n.title)}</p>
                <p className="text-foreground-secondary">{t(caseI18n.body)}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/**
 * The folded meta block (П2): «зачем Кора» + «что вижу / чего нет» + the
 * demo-data note live BELOW the working surface, collapsed by default —
 * same disclosure posture as the registry's ConnectGuide.
 */
function MetaDisclosure({
  harnesses,
  gaps,
}: {
  harnesses: readonly KoraCoverageHarness[];
  gaps: readonly string[];
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  return (
    <section
      aria-label={t("kora.metaToggle")}
      className="rounded-md border border-border-subtle bg-well shadow-well"
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-left text-sm font-medium text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        {t("kora.metaToggle")}
      </button>
      {expanded ? (
        <div className="flex flex-col gap-3 border-t border-border-subtle px-3 py-3">
          <p className="max-w-prose text-sm text-foreground-secondary">
            {t("kora.week0Note")}
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <CoveragePanel harnesses={harnesses} gaps={gaps} />
            <OnboardingCard />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatAge(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} м`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч ${minutes % 60} м`;
  return `${Math.floor(hours / 24)} сут ${hours % 24} ч`;
}

const STATE_TONE: Record<KoraSession["state"], string> = {
  live: "bg-success/15 text-success",
  idle: "bg-elevated text-foreground-secondary",
  dead: "bg-elevated text-foreground-muted",
};

function SessionRow({ session }: { session: KoraSession }) {
  const t = useT();
  return (
    <li>
      {/* The whole row is the action; hover tint + the explicit
       * «Открыть →» affordance promise it visually (persona-review:
       * «строки не обещают действия»). */}
      <Link
        to={`/kora/${encodeURIComponent(session.id)}`}
        className="group flex flex-col gap-2 rounded-md border border-border-subtle p-4 transition-colors hover:bg-well focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", STATE_TONE[session.state])}
          />
          <span className="font-mono text-sm">{session.harness}</span>
          <Badge variant="outline">{t(`kora.session.state.${session.state}`)}</Badge>
          <span className="min-w-0 truncate text-sm font-medium">
            {session.project ?? session.native_id}
          </span>
          <Badge variant="outline">{t(`kora.session.origin.${session.origin}`)}</Badge>
          {session.steerable ? (
            <Badge variant="outline" className="gap-1">
              <Radio aria-hidden className="size-3" />
              {t("kora.session.steerable")}
            </Badge>
          ) : null}
          <span className="ml-auto shrink-0 text-xs text-foreground-secondary">
            {t("kora.session.age", { age: formatAge(session.age_seconds) })}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground-secondary">
          <span className="font-mono">{session.executor_id}</span>
          <span className="font-mono">{session.native_id}</span>
          {session.cwd ? <span className="truncate">{session.cwd}</span> : null}
        </div>
        <div className="flex items-end gap-3">
          {session.last_line_preview ? (
            <p className="min-w-0 flex-1 line-clamp-2 text-sm text-foreground-secondary">
              {session.last_line_preview}
            </p>
          ) : (
            <p className="min-w-0 flex-1 text-sm italic text-foreground-muted">
              {t("kora.session.noPreview")}
            </p>
          )}
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-foreground-secondary transition-colors duration-instant group-hover:text-iris-bright">
            {t("kora.session.open")}
            <ChevronRight
              aria-hidden="true"
              className="size-3.5 transition-transform duration-instant group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
          </span>
        </div>
      </Link>
    </li>
  );
}

export function KoraPage() {
  const t = useT();
  // P4-7 (slice 2): paged listing — 50 rows per page, «Показать ещё»
  // appends while full pages keep coming.
  const sessions = useKoraSessionPages(50);
  // ME-041 (taxonomy §1.2 #3): kora.entered on the first honest verdict —
  // the list rendered, or the error state that replaced it.
  useKoraEntered(!sessions.isPending);
  // §9.3 honest-empty branching: the executor registry is an EXISTING read
  // (no new API). undefined count (query pending/failed or a gateway without
  // the agents capability) resolves to the scanner variant — it promises
  // nothing, while the connect CTA only shows when zero is a FACT.
  const executors = useExecutors();
  const executorsCount = executors.data?.items.length;
  const noExecutors = executorsCount === 0;

  // Owner-feedback hotfix: a 401 means the browser's session is not valid
  // on the server (https-born cookie withheld on http, 6h idle TTL) — the
  // sign-in CTA replaces EVERYTHING data-shaped (coverage panel included:
  // an empty «что вижу» grid under «не активна» would be its own lie).
  // 5xx / transport keeps the honest retry state below.
  const unauthorized = sessions.error !== null && isKoraUnauthorized(sessions.error);

  return (
    <section aria-labelledby="kora-title" className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 id="kora-title" className="text-xl font-semibold">
          {t("kora.title")}
        </h1>
        {/* Quiet demo chip — the expanded note (no internal dictionary)
         * rides the tooltip and the folded meta block below. */}
        <Badge variant="outline" className="gap-1" title={t("kora.week0Note")}>
          <ShieldCheck aria-hidden className="size-3" />
          {t("kora.week0Badge")}
        </Badge>
      </div>

      {unauthorized ? (
        <KoraSignInCta
          title={t("kora.list.inactiveTitle")}
          message={t("kora.list.inactiveHint")}
          refetch={sessions.refetch}
        />
      ) : (
        <>
          <h2 className="text-lg font-semibold">{t("kora.list.title")}</h2>

          {sessions.isPending ? (
            <div role="status" aria-label={t("kora.list.loading")}>
              <TableRowSkeleton rows={4} columns={3} />
            </div>
          ) : sessions.error ? (
            <EmptyState
              variant="error"
              title={t("kora.list.loadFailed")}
              techDetail={sessions.error.message}
              action={
                <Button variant="outline" onClick={() => void sessions.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : sessions.items.length === 0 ? (
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
          ) : (
            <>
              <ul className="space-y-3">
                {sessions.items.map((session) => (
                  <SessionRow key={session.id} session={session} />
                ))}
              </ul>
              {sessions.hasMore ? (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    disabled={sessions.isLoadingMore}
                    onClick={() => void sessions.loadMore()}
                  >
                    <ChevronDown aria-hidden className="size-4" />
                    {t("kora.list.loadMore")}
                  </Button>
                </div>
              ) : null}
            </>
          )}

          {/* Meta lives below the data (П2), folded — the single legal
           * first-screen exception (a genuinely empty domain) is handled by
           * the honest-empty lines above, not by onboarding furniture. */}
          <MetaDisclosure
            harnesses={sessions.coverage?.harnesses ?? []}
            gaps={sessions.coverage?.gaps ?? []}
          />
        </>
      )}
    </section>
  );
}
