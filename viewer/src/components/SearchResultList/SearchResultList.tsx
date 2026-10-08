import type { CSSProperties } from "react";
import { SearchResultCard } from "@/components/SearchResultCard/SearchResultCard";
import { MemoryCardSkeleton } from "@/components/skeletons/Skeletons";
import type { SearchResult } from "@/gateway/types";
import "./SearchResultList.css";

/**
 * Staggered-entrance list of search results (component-inventory §3,
 * design-system.md §8.2): at most `STAGGER_SLOTS` items animate with a per-index
 * delay; the rest appear instantly. Loading shows skeleton cards.
 *
 * U4: every row carries the recall edge (15-WOW §3 «попадание в память») —
 * a 240ms iris flash along the left edge on arrival, played once per list
 * mount (the caller keys the list by the committed query, so a NEW query's
 * results arrive while a refetch of the SAME query does not replay). The
 * flash never runs on timers of its own — it rides the mount.
 */
export interface SearchResultListProps {
  results: SearchResult[];
  isLoading?: boolean;
  queryTerms?: string[];
  className?: string;
  /** Source search location (pathname + search) for the cards' `return=`. */
  returnSource?: { pathname: string; search: string };
}

/** Only the first five results get a stagger delay (motion budget §7). */
const STAGGER_SLOTS = 5;

export function SearchResultList({
  results,
  isLoading = false,
  queryTerms = [],
  className,
  returnSource,
}: SearchResultListProps) {
  if (isLoading) {
    return <MemoryCardSkeleton count={3} className={className} />;
  }
  return (
    <ul className={`space-y-4${className ? ` ${className}` : ""}`}>
      {results.map((result, index) => (
        <li
          key={result.id}
          className="search-result-enter search-result-recall"
          style={
            {
              "--stagger-delay":
                index < STAGGER_SLOTS
                  ? `calc(var(--duration-stagger) * ${index})`
                  : "0ms",
            } as CSSProperties
          }
        >
          <SearchResultCard result={result} queryTerms={queryTerms} returnSource={returnSource} />
        </li>
      ))}
    </ul>
  );
}
