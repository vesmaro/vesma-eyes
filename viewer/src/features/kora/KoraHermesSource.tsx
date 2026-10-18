import { useEffect, useMemo, useRef } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { Highlighted, ROLE_TONE } from "./KoraTranscript";
import { formatTranscriptTime } from "./koraWorkspaceModel";
import type { KoraHermesTranscriptPages } from "./useKora";
import type { HermesBridgeStatus, HermesMessage } from "./koraTypes";

/**
 * The hermes source status line (T004 slice 2, hermes-bridge FE): ONE
 * honest line under the Блок 2 header while the hermes context is active.
 * DATA only — the server's /status read is cheap and deterministic (no
 * live probe), so the line never pulses; the off-state is a quiet slot
 * with the human reason, never an error wall.
 *
 * States:
 * - pending: a skeleton row (no fake status);
 * - ok: «Hermes (кластер) — ok · N сессий в реестре»;
 * - off: «Hermes не подключён» + the server's human reason + owner hint;
 * - read error/transport: the failed line + retry (honest failure).
 */
export function HermesSourceLine({
  status,
  isPending,
  isError,
  pullError,
}: {
  status: HermesBridgeStatus | null;
  isPending: boolean;
  isError: boolean;
  /** The manual pull's failure — hermes_off/hermes_unavailable surface HERE
   * as the human reason (the code names the vocabulary, message is the copy). */
  pullError: Error | null;
}) {
  const t = useT();

  if (isPending) {
    return (
      <div
        role="status"
        aria-label={t("kora.hermes.statusLoading")}
        className="flex items-center gap-2 px-1"
      >
        <Skeleton className="h-4 w-48" data-testid="hermes-status-skeleton" />
      </div>
    );
  }

  // The manual-pull failure rides FIRST (it is the freshest fact — e.g. a
  // pull answered 502 hermes_unavailable after an ok status read).
  if (pullError !== null) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-1">
        <AlertTriangle aria-hidden className="size-4 shrink-0 text-warning" />
        <p className="min-w-0 flex-1 text-xs text-foreground-secondary">
          {pullError.message}
        </p>
      </div>
    );
  }

  if (isError || status === null) {
    return (
      <p className="px-1 text-xs text-foreground-secondary">
        {t("kora.hermes.statusUnknown")}
      </p>
    );
  }

  if (!status.configured || status.mode === "off") {
    return (
      <div className="rounded-md border border-border-subtle bg-well px-3 py-2">
        <p className="flex items-baseline gap-2 text-xs">
          <span className="font-semibold text-foreground-secondary">
            {t("kora.hermes.offTitle")}
          </span>
          <span aria-hidden className="size-2 shrink-0 translate-y-0.5 rounded-full bg-foreground-muted" />
          <span className="sr-only">{t("kora.hermes.stateOff")}</span>
        </p>
        <p className="mt-1 text-xs text-foreground-secondary">{status.detail ?? t("kora.hermes.offDefaultReason")}</p>
        <p className="mt-1 text-xs text-foreground-muted">{t("kora.hermes.offHint")}</p>
      </div>
    );
  }

  // ok: the data line — source name, state word, registry slice count.
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-foreground-secondary">
      <span className="font-semibold">{t("kora.hermes.sourceName")}</span>
      <span className="flex items-center gap-1">
        <span aria-hidden className={cn("size-2 rounded-full bg-success")} />
        {t("kora.hermes.stateOk")}
      </span>
      <span className="font-mono tabular-nums text-foreground-muted">
        {t("kora.hermes.registryCount", { n: status.registry_sessions })}
      </span>
    </p>
  );
}

/**
 * The hermes transcript scroll (T004 slice 3): the LIVE cluster transcript
 * through the SAME visual grammar as the zcode scroll — Lora ≤72ch, mono
 * tnum times, the redaction mark, load-more over the contract's has_more —
 * plus the hermes passthrough fields rendered honestly: the display kind
 * suffix (kind ≠ role), the collapsed reasoning block, the tool-call names.
 * READ-ONLY: the composer is a zcode-session affordance — the hermes chat
 * lives in the source view (no session selected).
 */
export function HermesTranscript({
  sessionId,
  pages,
  follow,
  query,
}: {
  sessionId: string;
  pages: KoraHermesTranscriptPages;
  follow: boolean;
  query: string;
}) {
  const t = useT();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const needle = query.trim().toLowerCase();
  const items = useMemo(() => {
    if (needle === "") return pages.items;
    return pages.items.filter((item) => item.content.toLowerCase().includes(needle));
  }, [pages.items, needle]);

  // Follow-tail: scroll pinning only, the same canon as the zcode scroll.
  useEffect(() => {
    if (follow && needle === "") {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [follow, needle, pages.items.length, pages.isLoadingMore]);

  if (pages.isPending) {
    return (
      <div
        role="status"
        aria-label={t("kora.transcript.loading")}
        className="max-w-scroll space-y-3 font-scroll"
      >
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    );
  }

  if (pages.error !== null) {
    return (
      <p role="alert" className="max-w-scroll text-sm text-error">
        {t("kora.transcript.loadFailed")} {pages.error.message}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="max-w-scroll font-scroll text-sm text-foreground-secondary">
        {needle !== ""
          ? t("kora.workzone.matches", { n: 0 })
          : t("kora.transcript.emptyMessage")}
      </p>
    );
  }

  return (
    <div className="min-w-0">
      <ol className="max-w-scroll space-y-4 font-scroll">
        {items.map((item) => (
          <HermesTranscriptLine
            key={`${sessionId}:${item.seq}`}
            item={item}
            needle={needle}
          />
        ))}
      </ol>
      {pages.hasMore ? (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={pages.isLoadingMore}
            onClick={() => void pages.loadMore()}
          >
            <ChevronDown aria-hidden className="size-4" />
            {t("kora.list.loadMore")}
          </Button>
        </div>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}

/** Tool-call names the FE can honestly read out of the verbatim dicts; a
 * call without a parsable name degrades to the bare count (never invented). */
function hermesToolNames(
  calls: readonly Record<string, unknown>[] | null,
): string[] {
  if (calls === null) return [];
  return calls
    .map((call) => {
      const fn = call["function"];
      if (typeof fn !== "object" || fn === null) return "";
      const name = (fn as Record<string, unknown>)["name"];
      return typeof name === "string" ? name : "";
    })
    .filter((name) => name !== "");
}

function HermesTranscriptLine({
  item,
  needle,
}: {
  item: HermesMessage;
  needle: string;
}) {
  const t = useT();
  const toolNames = hermesToolNames(item.tool_calls ?? null);
  const kindLabel = item.kind !== null && item.kind !== item.role ? item.kind : null;
  return (
    <li className="flex gap-3 text-sm leading-relaxed">
      <span className="w-11 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums text-foreground-muted">
        {formatTranscriptTime(item.ts) || t("kora.transcript.line")}
      </span>
      <div className="min-w-0">
        <p className="whitespace-pre-wrap break-words">
          <span
            aria-hidden
            className={cn(
              "mr-2 inline-block h-fit rounded-sm px-1.5 py-0.5 font-ui text-xs font-medium",
              ROLE_TONE[item.role] ?? ROLE_TONE.system,
            )}
          >
            {item.role}
          </span>
          {kindLabel !== null ? (
            <span className="mr-2 inline-block h-fit rounded-sm border border-border-subtle px-1.5 py-0.5 font-mono text-xs text-foreground-muted">
              {kindLabel}
            </span>
          ) : null}
          <Highlighted content={item.content} needle={needle} />
        </p>
        {item.reasoning ? (
          <details className="mt-1 text-xs text-foreground-muted">
            <summary className="cursor-pointer select-none">
              {t("kora.hermes.reasoning")}
            </summary>
            <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">
              {item.reasoning}
            </p>
          </details>
        ) : null}
        {item.tool_calls != null ? (
          <p className="mt-0.5 font-mono text-xs text-foreground-muted">
            {toolNames.length > 0
              ? `${t("kora.hermes.toolCalls", { n: item.tool_calls.length })}: ${toolNames.join(", ")}`
              : t("kora.hermes.toolCalls", { n: item.tool_calls.length })}
          </p>
        ) : null}
        {item.redaction_applied ? (
          <p
            className="mt-0.5 font-ui text-xs text-foreground-muted"
            title={t("kora.transcript.redactedNote")}
          >
            {t("kora.transcript.redacted")}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** The verbatim-highlight reuse: the same iris tint over the match as the
 * zcode scroll — one search grammar, two sources (exported by the shared
 * transcript renderer). */