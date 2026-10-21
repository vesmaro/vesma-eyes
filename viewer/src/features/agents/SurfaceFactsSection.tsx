import type { ExecutorItem } from "@/gateway/boardTypes";
import { useT } from "@/i18n";
import { executorSurfaceFacts } from "./execEnvModel";


/**
 * «Среда исполнения» (AGW-23/24, the card section): the executor's
 * surface-facts mirror — the runtime verdict (metal | pod), the per-
 * container distrobox verdicts and the k8s leg (nodes / pods / non-ok
 * verdicts), exactly as the agent's last discovery report mirrored it.
 *
 * Honesty: AGENT-reported, advisory, content-free (names/statuses/
 * counts only — never pod bodies or logs); every list is display-capped
 * with the honest «…и ещё N» overflow (the ME-064 pattern); a pre-v0.9
 * executor carries no facts at all — the section renders NOTHING, zero
 * geometry, honest absence.
 */
export function SurfaceFactsSection({ executor }: { executor: ExecutorItem }) {
  const t = useT();
  const facts = executorSurfaceFacts(executor);
  if (facts === null) return null;

  return (
    <section
      aria-label={t("agents.card.surfaceFacts")}
      className="flex flex-col gap-2"
    >
      <h3 className="text-xs font-medium text-foreground-secondary">
        {t("agents.card.surfaceFacts")}
      </h3>

      {/* The runtime verdict — the honest where-does-this-process-run. */}
      {facts.runtimeKind !== null ? (
        <p className="font-mono text-xs text-foreground-secondary">
          {t("agents.card.surfaceRuntime")}
          {": "}
          {facts.runtimeKind}
          {facts.runtimeNote !== null ? (
            <span className="text-foreground-muted"> · {facts.runtimeNote}</span>
          ) : null}
        </p>
      ) : null}

      {/* The distrobox containers the agent probed. */}
      {facts.containers.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-foreground-muted">
            {t("agents.card.surfaceContainers")}
          </p>
          <ul className="flex flex-col gap-0.5">
            {facts.containers.map((container, index) => (
              <li
                // Duplicate names recur in the server corpus (the same
                // container probed twice) — compose the key with the index
                // so React stops warning (ux-hygiene-followups-20261020).
                key={`${container.name}-${index}`}
                className="break-all font-mono text-xs text-foreground-secondary"
              >
                {container.name}
                {container.status !== null ? (
                  <span className="text-foreground-muted"> · {container.status}</span>
                ) : null}
                {container.verdict !== null ? (
                  <span className="text-foreground-muted"> · {container.verdict}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <OverflowLine count={facts.containersOverflow} />
        </div>
      ) : null}

      {/* The k8s leg, ONE unit: nodes then pods then non-ok verdicts. */}
      {facts.nodes.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-foreground-muted">
            {t("agents.card.surfaceNodes")}
          </p>
          <ul className="flex flex-col gap-0.5">
            {facts.nodes.map((node, index) => (
              <li
                key={`${node.name}-${index}`}
                className="break-all font-mono text-xs text-foreground-secondary"
              >
                {node.name}
                <span className="text-foreground-muted">
                  {" "}
                  ·{" "}
                  {node.ready === null
                    ? t("agents.card.surfaceReadyUnknown")
                    : node.ready
                      ? t("agents.card.surfaceReady")
                      : t("agents.card.surfaceNotReady")}
                </span>
                {node.kubeletVersion !== null ? (
                  <span className="text-foreground-muted">
                    {" "}
                    · {node.kubeletVersion}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <OverflowLine count={facts.nodesOverflow} />
        </div>
      ) : null}

      {facts.pods.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-foreground-muted">
            {t("agents.card.surfacePods")}
          </p>
          <ul className="flex flex-col gap-0.5">
            {facts.pods.map((pod, index) => (
              <li
                key={`${pod.name}-${index}`}
                className="break-all font-mono text-xs text-foreground-secondary"
              >
                {pod.execEnv ?? pod.name}
                {pod.phase !== null ? (
                  <span className="text-foreground-muted"> · {pod.phase}</span>
                ) : null}
                {pod.node !== null ? (
                  <span className="text-foreground-muted"> · {pod.node}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <OverflowLine count={facts.podsOverflow} />
        </div>
      ) : null}

      {facts.verdicts.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-foreground-muted">
            {t("agents.card.surfaceVerdicts")}
          </p>
          <ul className="flex flex-col gap-0.5">
            {facts.verdicts.map(([key, value], index) => (
              <li
                key={`${key}-${index}`}
                className="break-all font-mono text-xs text-foreground-secondary"
              >
                {key}: {value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** The honest «…и ещё N» overflow line (invisible at 0 — no filler). */
function OverflowLine({ count }: { count: number }) {
  const t = useT();
  if (count <= 0) return null;
  return (
    <p className="text-xs text-foreground-muted">
      {t("agents.card.inventoryOverflow", { count })}
    </p>
  );
}
