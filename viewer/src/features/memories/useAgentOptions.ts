import { useQuery } from "@tanstack/react-query";
import { useGateway } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { GC_TIMES, STALE_TIMES } from "@/lib/queryClient";

/**
 * Distinct author names for the list agent filter (D7 — «фильтр по агенту»).
 * There is no dedicated `/agents` listing on the memory side, so this
 * aggregates a wide list client-side (honest fallback, the exact
 * `useProjectOptions` pattern): the `agent` field rides every Memory row.
 */
export function useAgentOptions(): string[] {
  const gateway = useGateway();
  const query = useQuery({
    queryKey: keys.memories.list({ limit: 500 }),
    queryFn: ({ signal }) => gateway.listMemories({ limit: 500 }, signal),
    staleTime: STALE_TIMES.memoriesList,
    gcTime: GC_TIMES.memoriesList,
  });

  if (!query.data) return [];
  return [...new Set(query.data.map((memory) => memory.agent).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}
