import { useQuery } from "@tanstack/react-query";
import { useGateway } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { GC_TIMES, STALE_TIMES } from "@/lib/queryClient";
import type { SearchParams } from "@/gateway/types";

/**
 * Unified search (FTS + semantic) — always-fresh (staleTime 0).
 * `enabled` gates the wire for on-demand callers (the Ф2 command palette
 * searches only while open AND the query is non-empty); the default stays
 * `true` — the existing /memory/search page behaviour is untouched.
 */
export function useSearch(params: SearchParams, options: { enabled?: boolean } = {}) {
  const gateway = useGateway();
  const enabled = options.enabled ?? true;
  return useQuery({
    queryKey: keys.search.results(params),
    queryFn: ({ signal }) => gateway.search(params, signal),
    enabled,
    staleTime: STALE_TIMES.search,
    gcTime: GC_TIMES.search,
  });
}
