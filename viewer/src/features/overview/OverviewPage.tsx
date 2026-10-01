import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { isBoardHealthSource, isPulseSource } from "@/gateway/capabilities";
import type { BoardHealthServer } from "@/gateway/boardTypes";
import { useGateway } from "@/gateway/GatewayContext";
import { usePulse, useBoardHealth } from "@/hooks/usePulse";
import { PulseFeed } from "@/features/memory-pulse/PulseFeed";
import { WellHero } from "./WellHero";
import { CockpitBusy } from "./CockpitBusy";
import { CockpitWaiting } from "./CockpitWaiting";
import {
  sessionModeI18nKey,
  useSessionMode,
} from "@/features/ui-token/useSessionControl";
import { useT } from "@/i18n";

/**
 * `/` — «Обзор» (blueprint §12.3, Phase 1 of «Кора-организм»): the page
 * opens with the WELL — one dark full-height hero canvas (`WellHero`), the
 * only bold element on the surface; the awakening plays once per session
 * and the rest is working quiet. Below the fold the cockpit blocks keep
 * their J1 order — «кто занят → что ждёт меня → что в памяти → строка
 * честности». Anti-dashification rules apply unchanged: a block with
 * nothing to say does not render, and every figure LEADS somewhere.
 */
export function OverviewPage() {
  const t = useT();
  const gateway = useGateway();
  const sessionMode = useSessionMode();
  const pulseCapable = isPulseSource(gateway);
  const healthCapable = isBoardHealthSource(gateway);
  // Top of the recency feed — the "what just happened" strip (limit 5).
  const pulse = usePulse({ scope: "all", limit: 5 });
  const health = useBoardHealth();

  const showStores =
    healthCapable && !(health.isSuccess && health.data.servers.length === 0);
  const showPulse = pulseCapable && !(pulse.isSuccess && pulse.data.items.length === 0);
  // The memory block exists only when at least one of its two halves speaks
  // (otherwise the honest state is absence — no empty section frame).
  const showMemory = showStores || showPulse;

  return (
    <section aria-labelledby="well-hero-title" className="mx-auto max-w-4xl space-y-8">
      {/* The well hero: display headline + HUD on the dark canvas (§12.3).
       * The page's single h1 lives inside (visible, --text-display). */}
      <WellHero />

      {/* КТО ЗАНЯТ (§3.1): executors' presence + the work counts, leading to
       * the agents/tasks surfaces. Renders its own honest states (zero
       * agents → the connect line; errors → HonestLine + retry). */}
      <CockpitBusy />

      {/* ЧТО ЖДЁТ МЕНЯ (§3.1 + persona round 1): ONE summary number-action —
       * the click leads to the most urgent list; quiet source rows under it.
       * Renders nothing while nothing waits. */}
      <CockpitWaiting />

      {/* ЧТО В ПАМЯТИ (§3.1): the store cards + the fresh-pulse strip — the
       * same live data as before, now under one cockpit title. */}
      {showMemory ? (
        <section aria-labelledby="overview-memory" className="space-y-3">
          <h2 id="overview-memory" className="text-lg font-semibold text-foreground">
            {t("cockpit.memoryTitle")}
          </h2>

          {showStores ? (
            health.isPending ? (
              <div role="status" aria-label={t("overview.storesLoading")}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              </div>
            ) : health.isError ? (
              <p role="status" className="text-sm text-foreground-secondary">
                {t("overview.storesError", { message: health.error.message })}
              </p>
            ) : (
              <ul className="grid gap-list-gap sm:grid-cols-2">
                {health.data.servers.map((server) => (
                  <li key={server.name}>
                    <StoreCard server={server} />
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {showPulse ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-sm font-medium text-foreground-secondary">
                  {t("overview.pulseTitle")}
                </h3>
                <Link
                  to="/memory/pulse"
                  className="inline-flex min-h-6 items-center gap-1 text-sm text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {t("overview.pulseAll")}{" "}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
              {pulse.isPending ? (
                <div
                  role="status"
                  aria-label={t("pulse.loading")}
                  className="text-sm text-foreground-secondary"
                >
                  {t("pulse.loading")}…
                </div>
              ) : pulse.isError ? (
                <p role="status" className="text-sm text-foreground-secondary">
                  {t("overview.pulseError", { message: pulse.error.message })}
                </p>
              ) : (
                <PulseFeed
                  items={pulse.data.items}
                  perServer={pulse.data.per_server}
                  compact
                />
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* UX-overhaul §3/§8 (Ф1): the honesty line — one sentence naming the
       * not-yet-live surfaces (persona-review wording). Не рендерится, когда
       * всё живое (сегодня — всегда: хранилища-реестр и метрики в работе). */}
      <HonestLine>{t("overview.honestyLater")}</HonestLine>

      {/* Session-aware mode line (fix/login-feedback) — same derivation as
       * the sidebar footer: states the live contract instead of the static
       * L1 read-only claim that kept lying after a login. */}
      <p className="text-center text-xs text-foreground-muted">
        {t(sessionModeI18nKey(sessionMode))}
      </p>
    </section>
  );
}

/**
 * One store health card — the ui-contract §7 dot rule: green only for a
 * healthy probe, never for "merely slow"; a failed probe shows its reason;
 * a disabled store says so in words (colour never carries the meaning
 * alone — WCAG 1.4.1).
 */
function StoreCard({ server }: { server: BoardHealthServer }) {
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
