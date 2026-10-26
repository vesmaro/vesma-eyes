import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  isAgentsMutationSource,
  isAgentsSource,
} from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import type { ModelGrantCreateInput } from "@/gateway/boardTypes";
import { keys } from "@/lib/queryKeys";
import { narrowGrantsPage } from "./modelsModel";
import type { GrantsPage } from "./modelsModel";

/**
 * MF3 sharing-grants hooks (ux-blueprint §3.3 under the security verdict
 * §5): the owner-side management of «кому доступен провайдер». The read
 * is roster-class (metadata only — selectors name spine entities, no
 * credential field exists in the family by construction); the writes are
 * the owner wall (ui-token, red line 6). Failures are NOT toasted here —
 * the caller renders the server reason inline (the MF2 dialog
 * discipline); every success invalidates the whole models family (the
 * SSE `model.inventory.changed` frame is the fast path, the invalidation
 * the safety net).
 */
export function useModelGrants(providerKey: string): GrantsPage & {
  readonly isPending: boolean;
} {
  const gateway = useGateway();
  const capable = isAgentsSource(gateway);
  const query = useQuery({
    queryKey: keys.agents.models.grants(providerKey),
    queryFn: ({ signal }) => {
      if (!isAgentsSource(gateway)) {
        throw new Error("useModelGrants: gateway has no agents capability.");
      }
      return gateway.listModelGrants(providerKey, signal);
    },
    enabled: capable && providerKey !== "",
    staleTime: 15_000,
  });
  const page = narrowGrantsPage(query.data);
  return { ...page, isPending: query.isPending };
}

export function useGrantMutations(providerKey: string) {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  const capable = isAgentsMutationSource(gateway);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: keys.agents.models.all });
  };

  const create = useMutation({
    mutationFn: (input: ModelGrantCreateInput) => {
      if (!isAgentsMutationSource(gateway)) {
        throw new Error("useGrantMutations: gateway has no agents capability.");
      }
      return gateway.createModelGrant(providerKey, input);
    },
    onSuccess: invalidate,
  });

  const setEnabled = useMutation({
    mutationFn: ({ grantId, enabled }: { grantId: string; enabled: boolean }) => {
      if (!isAgentsMutationSource(gateway)) {
        throw new Error("useGrantMutations: gateway has no agents capability.");
      }
      return gateway.setModelGrantEnabled(providerKey, grantId, enabled);
    },
    onSuccess: invalidate,
  });

  const revoke = useMutation({
    mutationFn: (grantId: string) => {
      if (!isAgentsMutationSource(gateway)) {
        throw new Error("useGrantMutations: gateway has no agents capability.");
      }
      return gateway.deleteModelGrant(providerKey, grantId);
    },
    onSuccess: invalidate,
  });

  return { create, setEnabled, revoke, capable };
}
