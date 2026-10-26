import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAgentsMutationSource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import type {
  ModelProviderCreateInput,
  ModelProviderRotateInput,
} from "@/gateway/boardTypes";
import { keys } from "@/lib/queryKeys";

/**
 * Provider credential mutations (MF2, ux-blueprint wave MF2 under the
 * security verdict §5). UNLIKE the executor mutations hook, failures are
 * NOT toasted here: the connect dialog owns the error UI — the server's
 * reason surfaces INLINE verbatim (MF-FORM-ERR-SERVER, ux-blueprint §4.3).
 * The ui-token itself is attached by the adapter (`auth: true`); a 401
 * rides the adapter's global unauthorized flag like every owner act.
 *
 * The credential material exists ONLY as the mutation function's
 * argument — never in hook state, the query cache or draft storage (the
 * red line: write-path-once). Every success invalidates the whole models
 * family: the SSE `model.inventory.changed` frame is the fast path, the
 * invalidation is the at-most-once-stream safety net.
 */
export function useProviderMutations() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  const capable = isAgentsMutationSource(gateway);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: keys.agents.models.all });
  };

  const create = useMutation({
    mutationFn: (input: ModelProviderCreateInput) => {
      if (!isAgentsMutationSource(gateway)) {
        throw new Error("useProviderMutations: gateway has no agents capability.");
      }
      return gateway.createModelProvider(input);
    },
    onSuccess: invalidate,
  });

  const rotate = useMutation({
    mutationFn: ({
      providerKey,
      input,
    }: {
      providerKey: string;
      input: ModelProviderRotateInput;
    }) => {
      if (!isAgentsMutationSource(gateway)) {
        throw new Error("useProviderMutations: gateway has no agents capability.");
      }
      return gateway.rotateModelProvider(providerKey, input);
    },
    onSuccess: invalidate,
  });

  const removeCredential = useMutation({
    mutationFn: (providerKey: string) => {
      if (!isAgentsMutationSource(gateway)) {
        throw new Error("useProviderMutations: gateway has no agents capability.");
      }
      return gateway.deleteModelProviderCredential(providerKey);
    },
    onSuccess: invalidate,
  });

  return { create, rotate, removeCredential, capable };
}
