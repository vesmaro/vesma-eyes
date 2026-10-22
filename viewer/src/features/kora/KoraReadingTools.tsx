import { ArrowDownToLine, Search } from "lucide-react";
import { useT } from "@/i18n";

/**
 * The reading tools (07j §3 / 07i §4) — follow-tail + search with the
 * honest match count; ONE toolbar grammar for every transcript scroll.
 * KW2: extracted from KoraWorkzone (the zcode session view) so the «Все
 * ходы» zone mounts the SAME tools with its OWN state — the follow-tails
 * are separate by design (kora-rethink blueprint §8: the chat and the zone
 * never fight over the scroll; the zone follows only while it is the
 * expanded surface the reader is at the bottom of).
 */
export function KoraReadingTools({
  follow,
  onFollow,
  query,
  onQuery,
  matchCount,
  inputId = "kora-session-search",
}: {
  follow: boolean;
  onFollow: () => void;
  query: string;
  onQuery: (value: string) => void;
  matchCount: number | null;
  /** Unique per mount — two scrolls never share a label-for pair. */
  inputId?: string;
}) {
  const t = useT();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 px-4">
      <button
        type="button"
        aria-pressed={follow}
        onClick={onFollow}
        className="inline-flex min-h-12 md:min-h-6 items-center gap-1.5 rounded-sm px-2 text-xs text-foreground-secondary transition-colors duration-instant hover:text-foreground aria-pressed:text-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        <ArrowDownToLine aria-hidden className="size-3.5" />
        {t("kora.workzone.followTail")}
      </button>
      <div className="relative min-w-0 flex-1 sm:max-w-72">
        <label className="sr-only" htmlFor={inputId}>
          {t("kora.workzone.searchLabel")}
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-foreground-muted"
        />
        <input
          id={inputId}
          type="search"
          value={query}
          placeholder={t("kora.workzone.searchPlaceholder")}
          onChange={(event) => onQuery(event.target.value)}
          className="h-12 w-full rounded-md border border-border-subtle bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-foreground-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:h-7"
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
  );
}
