import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { BoardHealthServer } from "@/gateway/boardTypes";
import { useT } from "@/i18n";

/**
 * One store health card — shared by the Overview cockpit and /system/status
 * (W-A D2b): the SAME probe (GET /api/health) reads the same words on both
 * surfaces, so «работает» on Status can never contradict «недоступно» on the
 * Overview again. The ui-contract §7 dot rule: green only for a healthy
 * probe, never for "merely slow"; a failed probe shows its reason; a
 * disabled store says so in words (colour never carries the meaning alone —
 * WCAG 1.4.1). Dictionary keys stay under the `overview.*` namespace where
 * this card was born (one copy, two consumers — renaming keys would churn
 * the Overview tests for zero user-visible change).
 */
export function StoreHealthCard({ server }: { server: BoardHealthServer }) {
  const t = useT();
  const disabled = server.enabled === false;
  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-mono text-sm font-semibold">{server.name}</h3>
          {disabled ? (
            <Badge variant="outline">{t("overview.storeDisabled")}</Badge>
          ) : server.ok ? (
            <Badge variant="success">{t("overview.storeOk")}</Badge>
          ) : (
            <Badge variant="error">{t("overview.storeFail")}</Badge>
          )}
        </div>
        <p className="text-xs text-foreground-secondary">
          {server.group_name} ·{" "}
          {t("overview.storeMemories", { count: server.memories_total ?? 0 })}
        </p>
      </CardHeader>
      <CardContent>
        {disabled ? (
          <p className="text-xs text-foreground-muted">
            {t("overview.storeDisabledNote")}
          </p>
        ) : server.ok ? (
          <p className="font-mono text-xs text-foreground-secondary">
            {t("overview.storeLatency", { ms: server.latency_ms ?? 0 })}
          </p>
        ) : (
          <p className="text-xs text-error">
            {server.error ?? t("overview.storeFail")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
