import type { ExecutorItem } from "@/gateway/boardTypes";

/**
 * AGW-23/24 pure projection: the «среда исполнения» badge value for ONE
 * roster row (the B2 reserved slot, blueprint §3.C.3). The payload is
 * AGENT-reported (advisory mirror, never authority) — every field is
 * narrowed defensively: a buggy agent degrades to the honest empty slot,
 * never to a crash or a fabricated surface label.
 *
 * Surface vocabulary (the agent's frozen v0.9.0 wire contract): "metal" —
 * the agent's own-namespace scan; "distrobox:<name>" — a probe inside that
 * container; "pod:<name>" — a cluster pod (the k8s leg). Anything else is
 * rendered verbatim-but-bounded — the agent's own honest label.
 */

/** The badge's display bound (mirrors the server's 60-char row bound). */
const EXEC_ENV_BOUND = 60;

/** Narrow one unknown value into a bounded surface label, or null. */
function narrowSurface(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, EXEC_ENV_BOUND) : null;
}

/**
 * The execution surface of THIS executor:
 * 1. the harness_inventory row of this harness (`name` === `harness` —
 *    the executor name is `<harness>@<host>` by construction), when the
 *    agent badged it (AGW-23);
 * 2. else the k8s pod leg whose `harness` matches — the pod executor's
 *    own inventory may be empty, but the cluster scan saw the pod
 *    (node match wins when the host string agrees — the 1.73.1
 *    Downward-API binding);
 * 3. else null — the reserved slot stays empty (honest absence, never a
 *    guessed "metal").
 */
export function executorExecEnv(member: ExecutorItem): string | null {
  for (const env of member.harness_inventory ?? []) {
    if (env.name === member.harness) {
      const surface = narrowSurface(env.exec_env);
      if (surface) return surface;
    }
  }
  const pods = member.exec_env_inventory?.k8s?.pods;
  if (Array.isArray(pods)) {
    let harnessMatch: string | null = null;
    for (const pod of pods) {
      if (pod === null || typeof pod !== "object") continue;
      if (pod["harness"] !== member.harness) continue;
      const surface = narrowSurface(pod["exec_env"]);
      if (!surface) continue;
      if (member.host && pod["node"] === member.host) return surface;
      harnessMatch ??= surface;
    }
    if (harnessMatch) return harnessMatch;
  }
  return null;
}
