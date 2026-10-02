import { EmptyState } from "@/components/EmptyState/EmptyState";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { StatusPanel } from "@/components/StatusPanel/StatusPanel";
import { StatGridSkeleton } from "@/components/skeletons/Skeletons";
import { Button } from "@/components/ui/button";
import { useMetrics, useStatus } from "@/hooks/useStatus";
import { isApiError } from "@/lib/errors";
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
 */
export function StatusPage() {
  const t = useT();
  const { adapterMode } = useAuth();
  const health = useStatus();
  const metrics = useMetrics();

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
