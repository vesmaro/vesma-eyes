import { useEffect, useMemo, useRef } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  Highlighted,
  RawWalkFold,
  RedactionMark,
  RoleChip,
  transcriptRowTone,
} from "./KoraTranscript";
import {
  formatTranscriptTime,
  groupKoraTranscript,
  koraTranscriptAnchorId,
  type KoraTranscriptGroup,
} from "./koraWorkspaceModel";
import { useTranscriptWires } from "./useTranscriptWires";
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
 * tnum times, load-more over the contract's has_more — now with the
 * transcript-ux wave grammar (the SAME pieces, one shared module):
 * the dialog/raw-walk grouping (a raw row folds under the dialog row it
 * follows), the strata row washes, the SCARLET redaction mark at both
 * placements, and the log↔answer wires (click a raw row → its answer
 * spotlights; the answer's fold summary is the reverse wire by
 * construction). The hermes passthrough fields stay rendered honestly:
 * the display kind suffix (kind ≠ role), the collapsed reasoning block,
 * the tool-call names.
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
  const groups = useMemo(() => groupKoraTranscript(items), [items]);

  // The anchor wires — the shared state machine (the zcode scroll rides
  // the same hook). Component-local, nothing saved.
  const {
    openFolds,
    spotSeq,
    flashFold,
    jumpToAnswer,
    onFoldToggle,
    announce,
  } = useTranscriptWires();

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

  // Search mode opens every fold — a match inside a collapsed raw walk
  // would hide the very line the searcher asked for.
  const forceOpen = needle !== "";

  return (
    <div className="min-w-0">
      <ol className="max-w-scroll space-y-2 font-scroll">
        {groups.map((group) => (
          <HermesTranscriptBlock
            key={`${sessionId}:${group.anchor?.seq ?? `raw:${group.raw[0]?.seq ?? 0}`}`}
            group={group}
            needle={needle}
            forceOpen={forceOpen}
            openFolds={openFolds}
            spotSeq={spotSeq}
            flashFold={flashFold}
            onJumpToAnswer={jumpToAnswer}
            onFoldToggle={onFoldToggle}
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
      {/* 4.1.3: the anchor jump is announced politely. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
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

/**
 * One grouped hermes block: the same grammar as the zcode scroll's
 * TranscriptBlock, with the hermes passthrough kept honest — the kind tag
 * inline, the reasoning fold and the tool-call names riding their own row
 * (block-level, under the content, outside the raw-walk fold). Timestamp
 * fallback is the hermes canon's neutral label (Ф1), not the zcode dot.
 */
function HermesTranscriptBlock({
  group,
  needle,
  forceOpen,
  openFolds,
  spotSeq,
  flashFold,
  onJumpToAnswer,
  onFoldToggle,
}: {
  group: KoraTranscriptGroup<HermesMessage>;
  needle: string;
  forceOpen: boolean;
  openFolds: ReadonlySet<number>;
  spotSeq: number | null;
  flashFold: number | null;
  onJumpToAnswer: (seq: number) => void;
  onFoldToggle: (seq: number, open: boolean) => void;
}) {
  const t = useT();
  if (group.anchor === null) {
    const head = group.raw[0]?.seq ?? 0;
    return (
      <li className="pt-1">
        <RawWalkFold
          seq={head}
          count={group.raw.length}
          open={forceOpen || openFolds.has(head)}
          flash={flashFold === head}
          onOpenChange={(open) => onFoldToggle(head, open)}
        >
          {group.raw.map((item) => (
            <HermesRawRow key={item.seq} item={item} needle={needle} anchorSeq={null} />
          ))}
        </RawWalkFold>
      </li>
    );
  }
  const anchor = group.anchor;
  const redacted = anchor.redaction_applied;
  return (
    <li
      id={koraTranscriptAnchorId(anchor.seq)}
      className={cn(
        "flex gap-3 rounded-r-md border-l-2 py-1.5 pr-2 pl-1 text-sm leading-relaxed transition-colors duration-instant",
        transcriptRowTone(anchor.role, redacted),
        spotSeq === anchor.seq &&
          "outline outline-2 -outline-offset-2 outline-iris-bright",
      )}
    >
      <span className="w-11 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums text-foreground-muted">
        {formatTranscriptTime(anchor.ts) || t("kora.transcript.line")}
      </span>
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap break-words">
          <RoleChip role={anchor.role} />
          <HermesKindTag item={anchor} />
          <Highlighted content={anchor.content} needle={needle} />
        </p>
        <HermesRowExtras item={anchor} />
        {redacted ? <RedactionMark /> : null}
        {group.raw.length > 0 ? (
          <RawWalkFold
            seq={anchor.seq}
            count={group.raw.length}
            open={forceOpen || openFolds.has(anchor.seq)}
            flash={flashFold === anchor.seq}
            onOpenChange={(open) => onFoldToggle(anchor.seq, open)}
          >
            {group.raw.map((item) => (
              <HermesRawRow
                key={item.seq}
                item={item}
                needle={needle}
                anchorSeq={anchor.seq}
                onJumpToAnswer={onJumpToAnswer}
              />
            ))}
          </RawWalkFold>
        ) : null}
      </div>
    </li>
  );
}

/** The display-kind tag (kind ≠ role) — the hermes passthrough honesty. */
function HermesKindTag({ item }: { item: HermesMessage }) {
  if (item.kind === null || item.kind === item.role) return null;
  return (
    <span className="mr-2 inline-block h-fit rounded-sm border border-border-subtle px-1.5 py-0.5 font-mono text-xs text-foreground-muted">
      {item.kind}
    </span>
  );
}

/** The hermes passthrough beats — the collapsed reasoning fold and the
 * tool-call names — rendered on THEIR OWN row (whatever role it rides). */
function HermesRowExtras({ item }: { item: HermesMessage }) {
  const t = useT();
  const toolNames = hermesToolNames(item.tool_calls ?? null);
  return (
    <>
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
    </>
  );
}

/** One raw-walk hermes entry. When the anchor is on this read, the entry
 * is the click wire TO the answer; without an anchor (read-head walk) it
 * renders as plain text — no dead button. */
function HermesRawRow({
  item,
  needle,
  anchorSeq,
  onJumpToAnswer,
}: {
  item: HermesMessage;
  needle: string;
  anchorSeq: number | null;
  onJumpToAnswer?: (seq: number) => void;
}) {
  const t = useT();
  const body = (
    <>
      <span className="w-11 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums text-foreground-muted">
        {formatTranscriptTime(item.ts) || t("kora.transcript.line")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block whitespace-pre-wrap break-words">
          <RoleChip role={item.role} />
          <HermesKindTag item={item} />
          <Highlighted content={item.content} needle={needle} />
        </span>
        <HermesRowExtras item={item} />
        {item.redaction_applied ? <RedactionMark /> : null}
      </span>
      {anchorSeq !== null ? (
        <>
          <span aria-hidden className="shrink-0 self-center text-foreground-muted">
            ↩
          </span>
          <span className="sr-only">{t("kora.transcript.jumpToAnswer")}</span>
        </>
      ) : null}
    </>
  );
  if (anchorSeq === null) {
    return <li className="flex gap-2 rounded-r-md py-0.5 pr-1 text-sm leading-relaxed">{body}</li>;
  }
  return (
    <li className="rounded-r-md text-sm leading-relaxed transition-colors duration-instant hover:bg-elevated">
      <button
        type="button"
        title={t("kora.transcript.jumpToAnswer")}
        onClick={() => onJumpToAnswer?.(anchorSeq)}
        className="flex w-full gap-2 rounded-r-md py-0.5 pr-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        {body}
      </button>
    </li>
  );
}