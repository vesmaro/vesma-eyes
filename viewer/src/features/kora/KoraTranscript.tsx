import { useEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { KoraTranscriptItem } from "./koraTypes";
import {
  formatTranscriptTime,
  groupKoraTranscript,
  koraTranscriptAnchorId,
  koraTranscriptFoldId,
  type KoraTranscriptGroup,
} from "./koraWorkspaceModel";
import { useTranscriptWires } from "./useTranscriptWires";
import type { KoraTranscriptPages } from "./useKora";

/**
 * The session scroll (07j §3 / 07d §3 canon, union И1): content in
 * --font-scroll (Lora) at the ≤72ch measure, mono tnum timestamps, live
 * load-more at the bottom (the frozen cursor GET — the tail re-reads by
 * USER action until the SSE bus lands in И4) and the reading tools in the
 * caller's toolbar: follow-tail (scroll pinning, not a fake tick) and
 * search-in-session with an honest match count over the loaded lines.
 *
 * transcript-ux wave (owner directive 2026-10-10): the scroll reads as
 * DRAMA, not as a dump —
 * - the role colours are distinct at a glance: the user query rides the
 *   iris (teal) wash, the assistant answer the confidence (gold) wash;
 *   tool/system rows stay the neutral service style;
 * - a redacted line (redaction_applied=true — the ONLY truth source) is
 *   marked SCARLET (--color-error-text, the U7 step) with a loud 🔒 and a
 *   plain-word note, the whole row accented in the error family;
 * - the raw walk (tool/system rows — how the agent thought and acted) is
 *   grouped around the answer that spawned it, folded under a «Сырой ход»
 *   disclosure, and wired one way: click a raw row → the answer scrolls
 *   into view and spotlights; the answer's «Сырой ход» summary opens its
 *   fold (that summary IS the reverse wire). Anchors are DOM ids; grouping
 *   is pure model code (groupKoraTranscript), the frozen linear seq stream
 *   is untouched.
 */

/**
 * The role chip tone vocabulary (tokens only) — shared with the hermes
 * transcript renderer (T004 slice 3), the SAME grammar for both sources.
 * The backgrounds ride the token-derived `-tint` color-mix utilities: the
 * old `bg-iris/15` spelling silently produced NO utility on var() colours
 * (Tailwind v3), so the chips had no background at all — fixed here.
 */
// eslint-disable-next-line react-refresh/only-export-components -- the tone maps and the highlight are the transcript's shared GRAMMAR, not a second module; splitting them would orphan the renderers that import them (the pre-existing KoraResizeHandle warning is the same trade-off).
export const ROLE_TONE: Record<string, string> = {
  user: "bg-iris-tint text-iris-bright",
  assistant: "bg-confidence-tint text-confidence",
  system: "bg-warning-tint text-warning",
  tool: "bg-elevated text-foreground-muted",
};

/**
 * The row-level drama (transcript-ux wave): query vs answer distinguished
 * by the strata washes (the canon list-row state signal) + a 2px left
 * accent in the same hue. Tokens only — the washes are the existing strata
 * names, the accents the existing semantic colours. Roles without an entry
 * here render neutral (the raw-walk style).
 */
// eslint-disable-next-line react-refresh/only-export-components -- same GRAMMAR trade-off as ROLE_TONE above: the row map shares the module with the renderers that consume it.
export const ROW_TONE: Record<string, string> = {
  user: "border-iris bg-strata-memory",
  assistant: "border-confidence bg-strata-agents",
};

/** The scarlet row accent for a redacted line — overrides the role wash. */
const REDACTED_ROW_TONE = "border-error bg-error-wash";

/**
 * The anchor-row tone of the transcript-ux grammar, shared by BOTH
 * transcript renderers (zcode scroll + hermes scroll): the scarlet
 * `redaction_applied` override wins over the role wash; roles without an
 * entry render neutral. The single source — renderers never copy the
 * strings.
 */
// eslint-disable-next-line react-refresh/only-export-components -- same GRAMMAR trade-off as the maps above: the tone helper is consumed by the renderers that import this module.
export function transcriptRowTone(role: string, redacted: boolean): string {
  return redacted ? REDACTED_ROW_TONE : (ROW_TONE[role] ?? "");
}

export function KoraTranscript({
  sessionId,
  pages,
  follow,
  query,
}: {
  sessionId: string;
  pages: KoraTranscriptPages;
  /** Follow-tail: pin the view to the bottom on content changes (07j §3). */
  follow: boolean;
  /** The active search-in-session query ("" = no filter). */
  query: string;
}) {
  const t = useT();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const needle = query.trim().toLowerCase();
  // Group over the FULL page first — a fold must stay bound to its REAL
  // spawner even in search mode (regrouping the filtered rows would fold a
  // raw row under a matching NEIGHBOUR answer — false attribution, P2
  // review 2026-10-20). The needle then keeps only the groups it touches:
  // the anchor matched OR any raw row matched.
  const groups = useMemo(() => {
    const all = groupKoraTranscript(pages.items);
    if (needle === "") return all;
    const hit = (content: string) => content.toLowerCase().includes(needle);
    return all.filter(
      (group) =>
        (group.anchor !== null && hit(group.anchor.content)) ||
        group.raw.some((item) => hit(item.content)),
    );
  }, [pages.items, needle]);

  // The anchor wires (transcript-ux wave): which folds are open, which
  // answer is spotlit — the shared hook (the hermes scroll rides the same
  // grammar). Component-local, nothing saved.
  const { openFolds, spotSeq, jumpToAnswer, onFoldToggle, announce } =
    useTranscriptWires();

  // Follow-tail: on every content change with follow ON, the view pins to
  // the bottom — scroll positioning only, no invented data beats.
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

  if (groups.length === 0) {
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
          <TranscriptBlock
            key={`${sessionId}:${group.anchor?.seq ?? `raw:${group.raw[0]?.seq ?? 0}`}`}
            group={group}
            needle={needle}
            forceOpen={forceOpen}
            openFolds={openFolds}
            spotSeq={spotSeq}
            onJumpToAnswer={jumpToAnswer}
            onFoldToggle={onFoldToggle}
          />
        ))}
      </ol>
      {/* Load-more rides the bottom of the scroll (07d: живая догрузка
       * снизу) — the frozen has_more is the honest end of the cursor. */}
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

/**
 * One grouped block: the dialog anchor row (user/assistant — the «Диалог»)
 * with its raw walk folded beneath, or — when a loaded page starts
 * mid-walk and the anchor lives on a previous page — the standalone raw
 * fold. The redacted anchor rides the scarlet row; the mark sits directly
 * under the content, OUTSIDE the fold, so folding never hides it. The
 * answer→raw-walk direction IS the fold summary itself (adjacent by
 * construction) — its programmatic wire had no consumer and was removed
 * (ux-hygiene-followups-20261020; обратное направление живёт в ката).
 */
export function TranscriptBlock({
  group,
  needle,
  forceOpen,
  openFolds,
  spotSeq,
  onJumpToAnswer,
  onFoldToggle,
}: {
  group: KoraTranscriptGroup<KoraTranscriptItem>;
  needle: string;
  forceOpen: boolean;
  openFolds: ReadonlySet<number>;
  spotSeq: number | null;
  onJumpToAnswer: (seq: number) => void;
  onFoldToggle: (seq: number, open: boolean) => void;
}) {
  if (group.anchor === null) {
    const head = group.raw[0]?.seq ?? 0;
    return (
      <li className="pt-1">
        <RawWalkFold
          seq={head}
          count={group.raw.length}
          open={forceOpen || openFolds.has(head)}
          onOpenChange={(open) => onFoldToggle(head, open)}
        >
          {group.raw.map((item) => (
            <RawRow key={item.seq} item={item} needle={needle} anchorSeq={null} />
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
      {/* Mono tnum time — the UTC HH:MM discipline of formatTimestamp. */}
      <span className="w-11 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums text-foreground-muted">
        {formatTranscriptTime(anchor.ts) || "\u00b7"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap break-words">
          <RoleChip role={anchor.role} />
          <Highlighted content={anchor.content} needle={needle} />
        </p>
        {redacted ? <RedactionMark /> : null}
        {group.raw.length > 0 ? (
          <RawWalkFold
            seq={anchor.seq}
            count={group.raw.length}
            open={forceOpen || openFolds.has(anchor.seq)}
            onOpenChange={(open) => onFoldToggle(anchor.seq, open)}
          >
            {group.raw.map((item) => (
              <RawRow
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

/** The role chip — the aria-hidden colour word (the row is announced by
 * its content + the row label; the chip is the visual grammar). */
export function RoleChip({ role }: { role: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mr-2 inline-block h-fit rounded-sm px-1.5 py-0.5 font-ui text-xs font-medium",
        ROLE_TONE[role] ?? ROLE_TONE.system,
      )}
    >
      {role}
    </span>
  );
}

/**
 * The SCARLET redaction mark (owner directive: the exposed-sensitive row
 * must shout): 🔒 + the plain-word note in the U7 --color-error-text step,
 * bold. Truth source = redaction_applied in the data — nothing is inferred,
 * nothing is invented.
 */
export function RedactionMark() {
  const t = useT();
  return (
    <p
      className="mt-1 flex items-center gap-1.5 font-ui text-xs font-semibold text-error-text"
      title={t("kora.transcript.redactedNote")}
    >
      <span aria-hidden>🔒</span>
      <span>{t("kora.transcript.redacted")}</span>
    </p>
  );
}

/**
 * The «Сырой ход» disclosure — the raw walk folded around the answer that
 * spawned it. A native details/summary (keyboard path for free); the count
 * is the honest number of raw entries. (The answer→raw-walk jump beat was
 * removed with its unconsumed wire — ux-hygiene-followups-20261020.)
 */
export function RawWalkFold({
  seq,
  count,
  open,
  onOpenChange,
  children,
}: {
  seq: number;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <details
      id={koraTranscriptFoldId(seq)}
      open={open}
      onToggle={(event) => onOpenChange((event.target as HTMLDetailsElement).open)}
      className="group/fold mt-1 rounded-md border-l border-border-subtle pl-2"
    >
      <summary
        title={t("kora.transcript.rawWalkHint")}
        className="inline-flex min-h-11 cursor-pointer select-none list-none items-center gap-1 rounded-sm font-ui text-xs text-foreground-muted transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:min-h-6 [&::-webkit-details-marker]:hidden"
      >
        <ChevronRight
          aria-hidden
          className="size-3.5 transition-transform duration-instant group-open/fold:rotate-90"
        />
        {t("kora.transcript.rawWalk")}
        <span className="font-mono tabular-nums">· {count}</span>
      </summary>
      <ul className="mb-1 mt-1 space-y-1">{children}</ul>
    </details>
  );
}

/** One raw-walk entry (tool/system row). When the anchor is on this page,
 * the entry is the click wire TO the answer; without an anchor (page-head
 * walk) it renders as plain text — no dead button. */
export function RawRow({
  item,
  needle,
  anchorSeq,
  onJumpToAnswer,
}: {
  item: KoraTranscriptItem;
  needle: string;
  anchorSeq: number | null;
  onJumpToAnswer?: (seq: number) => void;
}) {
  const t = useT();
  const body = (
    <>
      <span className="w-11 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums text-foreground-muted">
        {formatTranscriptTime(item.ts) || "\u00b7"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block whitespace-pre-wrap break-words">
          <RoleChip role={item.role} />
          {item.kind !== null && item.kind !== undefined && item.kind !== item.role ? (
            <span className="mr-2 inline-block h-fit rounded-sm border border-border-subtle px-1.5 py-0.5 font-mono text-xs text-foreground-muted">
              {item.kind}
            </span>
          ) : null}
          <Highlighted content={item.content} needle={needle} />
        </span>
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
    return (
      <li className="flex gap-2 rounded-r-md py-0.5 pr-1 text-sm leading-relaxed">
        {body}
      </li>
    );
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

/** Search highlight — an iris tint over the match, colour never the only signal. */
export function Highlighted({ content, needle }: { content: string; needle: string }) {
  if (needle === "") return <>{content}</>;
  const lower = content.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  let match = lower.indexOf(needle);
  let key = 0;
  while (match !== -1) {
    if (match > from) parts.push(content.slice(from, match));
    parts.push(
      <mark
        key={`m${key++}`}
        className="rounded-sm bg-iris-tint px-0.5 text-iris-bright"
      >
        {content.slice(match, match + needle.length)}
      </mark>,
    );
    from = match + needle.length;
    match = lower.indexOf(needle, from);
  }
  if (from < content.length) parts.push(content.slice(from));
  return <>{parts}</>;
}
