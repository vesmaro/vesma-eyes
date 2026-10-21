import { EmptyState } from "@/components/EmptyState/EmptyState";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { StatusPanel } from "@/components/StatusPanel/StatusPanel";
import { StoreHealthCard } from "@/components/StoreHealthCard/StoreHealthCard";
import { StatGridSkeleton } from "@/components/skeletons/Skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useMetrics, useStatus } from "@/hooks/useStatus";
import { useBoardHealth } from "@/hooks/usePulse";
import { isApiError } from "@/lib/errors";
import { isBoardHealthSource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import { useAuth } from "@/features/auth/AuthContext";
import { useT } from "@/i18n";
import { pageGridClass } from "@/layout/pageGrid";

/**
 * `/status` — system health at a glance (component-inventory §7). Health and
 * metrics load through `useStatus` / `useMetrics`; each half fails and
 * retries independently.
 *
 * UX-overhaul §6 (Ф1, П1): the health panel renders WHENEVER health data is
 * in hand — a working system must never look broken because a sibling view
 * is unavailable (audit fact #3). Only `health.isError` keeps the fullscreen
 * EmptyState (health is genuinely absent); every metrics failure degrades to
 * ONE HonestLine under the live panel:
 * - board-mode 501 → «Метрики появятся позже…» (neutral incompleteness);
 * - any other metrics error → warning + Retry (live but partial).
 * Raw adapter error text never renders open — it rides `techDetail`.
 *
 * W-A (D2b, user-panel verdict 2026-10-21): the page also shows the STORES —
 * the same per-store probe the Overview cards read (`useBoardHealth`, the
 * shared query cache, no extra wire). «Состояние API: работает» can no
 * longer contradict the Overview's «laptop недоступно»: both surfaces name
 * the same stores with the same words. Anchored at #stores — the Overview's
 * degraded-stores alarm links here (W-A D2).
 */
export function StatusPage() {
  const t = useT();
  const gateway = useGateway();
  const { adapterMode } = useAuth();
  const health = useStatus();
  const metrics = useMetrics();
  const storesCapable = isBoardHealthSource(gateway);
  const stores = useBoardHealth();

  const metricsBoardUnavailable =
    adapterMode === "board" &&
    metrics.isError &&
    isApiError(metrics.error) &&
    metrics.error.status === 501;

  return (
    <section aria-labelledby="status-title" className={pageGridClass("operational", "space-y-4")}>
      <h1 id="status-title" className="text-xl font-semibold">
        {t("status.title")}
      </h1>

      {health.isPending || metrics.isPending ? (
        <div role="status" aria-label={t("status.loading")}>
          <StatGridSkeleton />
        </div>
      ) : health.isError ? (
        <EmptyState
          variant="error"
          title={t("status.unreachable")}
          message={t("status.unreachableMessage")}
          techDetail={health.error.message}
          action={
            <Button variant="outline" onClick={() => void health.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : (
        <>
          {/* Health is in hand — the panel renders, metrics or no metrics
           * (metrics.data is undefined on failure → health-only grid). */}
          <StatusPanel health={health.data} metrics={metrics.data} />

          {/* W-A (D2b): the stores speak here with the same cards and the
           * same honest states as the Overview (pending → skeleton, failed
           * wire → its line with a retry, empty registry → nothing — a block
           * with nothing to say does not render). */}
          {storesCapable ? (
            <section aria-labelledby="status-stores-title" id="stores" className="space-y-3">
              <div className="flex items-baseline justify-between gap-4">
                <h2 id="status-stores-title" className="text-lg font-semibold text-foreground">
                  {t("status.storesTitle")}
                </h2>
                <p className="text-xs text-foreground-muted">{t("status.storesHint")}</p>
              </div>
              {stores.isPending ? (
                <div role="status" aria-label={t("overview.storesLoading")}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                </div>
              ) : stores.isError ? (
                <HonestLine
                  tone="warning"
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void stores.refetch()}
                    >
                      {t("common.retry")}
                    </Button>
                  }
                >
                  {t("overview.storesError", { message: stores.error.message })}
                </HonestLine>
              ) : stores.data.servers.length === 0 ? null : (
                <ul className="grid gap-4 sm:grid-cols-2">
                  {stores.data.servers.map((server) => (
                    <li key={server.name}>
                      <StoreHealthCard server={server} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {metricsBoardUnavailable ? (
            <HonestLine>{t("status.metricsLater")}</HonestLine>
          ) : metrics.isError ? (
            <HonestLine
              tone="warning"
              action={
                <>
                  <Button variant="outline" onClick={() => void metrics.refetch()}>
                    {t("status.retryMetrics")}
                  </Button>
                  <Button variant="ghost" onClick={() => void health.refetch()}>
                    {t("status.refreshHealth")}
                  </Button>
                </>
              }
            >
              {t("status.metricsBroken")}
            </HonestLine>
          ) : null}
        </>
      )}
    </section>
  );
}
