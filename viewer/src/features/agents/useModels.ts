import { useQuery } from "@tanstack/react-query";
import { isAgentsSource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { GC_TIMES, STALE_TIMES } from "@/lib/queryClient";

/**
 * Models fleet roster hook (MF1, ux-blueprint wave MF1): the hub's ONE
 * read — `GET /api/models`, the single aggregation point (discovery-
 * contract §3, OQ-1). Open read over provenance-marked facts; no
 * credential field exists in the family (security verdict §5). SSE
 * `model.inventory.changed` frames invalidate the family key
 * (agentsEvents.ts — the frame is additive-reserved; the MF1 board emits
 * nothing yet).
 */
export function useModelsRoster() {
  const gateway = useGateway();
  const capable = isAgentsSource(gateway);
  return useQuery({
    queryKey: keys.agents.models.list(),
    queryFn: ({ signal }) => {
      if (!isAgentsSource(gateway)) {
        throw new Error("useModelsRoster: gateway has no agents capability.");
      }
      return gateway.modelsRoster(signal);
    },
    enabled: capable,
    staleTime: STALE_TIMES.agentsExecutors,
    gcTime: GC_TIMES.agentsExecutors,
  });
}
