import { useEffect, useMemo, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { KoraTranscriptItem } from "./koraTypes";
import { formatTranscriptTime } from "./koraWorkspaceModel";
import type { KoraTranscriptPages } from "./useKora";

/**
 * The session scroll (07j §3 / 07d §3 canon, union И1): content in
 * --font-scroll (Lora) at the ≤72ch measure, mono tnum timestamps, the
 * redaction mark on masked entries, live load-more at the bottom (the
 * frozen cursor GET — the tail re-reads by USER action until the SSE bus
 * lands in И4) and the reading tools in the caller's toolbar: follow-tail
 * (scroll pinning, not a fake tick) and search-in-session with an honest
 * match count over the loaded lines.
 */

const ROLE_TONE: Record<string, string> = {
  user: "bg-iris/15 text-iris-bright",
  assistant: "bg-elevated text-foreground-secondary",
  system: "bg-warning/15 text-warning",
  tool: "bg-confidence/15 text-confidence",
};

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
  const items = useMemo(() => {
    if (needle === "") return pages.items;
    return pages.items.filter((item) => item.content.toLowerCase().includes(needle));
  }, [pages.items, needle]);

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
          <TranscriptLine
            key={`${sessionId}:${item.seq}`}
            item={item}
            needle={needle}
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
      <div ref={bottomRef} />
    </div>
  );
}

function TranscriptLine({
  item,
  needle,
}: {
  item: KoraTranscriptItem;
  needle: string;
}) {
  const t = useT();
  return (
    <li className="flex gap-3 text-sm leading-relaxed">
      {/* Mono tnum time — the UTC HH:MM discipline of formatTimestamp. */}
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
          <Highlighted content={item.content} needle={needle} />
        </p>
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

/** Search highlight — an iris tint over the match, colour never the only signal. */
function Highlighted({ content, needle }: { content: string; needle: string }) {
  if (needle === "") return <>{content}</>;
  const lower = content.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  let match = lower.indexOf(needle);
  let key = 0;
  while (match !== -1) {
    if (match > from) parts.push(content.slice(from, match));
    parts.push(
      <mark key={`m${key++}`} className="rounded-sm bg-iris/20 px-0.5 text-foreground">
        {content.slice(match, match + needle.length)}
      </mark>,
    );
    from = match + needle.length;
    match = lower.indexOf(needle, from);
  }
  if (from < content.length) parts.push(content.slice(from));
  return <>{parts}</>;
}
