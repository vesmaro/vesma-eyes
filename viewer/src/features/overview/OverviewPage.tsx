import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { StoreHealthCard } from "@/components/StoreHealthCard/StoreHealthCard";
import { isBoardHealthSource, isPulseSource } from "@/gateway/capabilities";
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
 * `/` — «Обзор» (SPEC-2026-10-07 «Обзор», v12 §3.1, amended by W-A D3 —
 * user-panel verdict 2026-10-21): the page still OPENS with the WELL in the
 * DOM (the h1 and the page's single bold element), but the PARK STATUS now
 * stands visually FIRST — «кто занят → что ждёт меня» occupy the first
 * screen and the well canvas follows (flex `order`, not DOM order, so the
 * heading structure and the reading order keep h1 → blocks → memory). The
 * owner's first glance answers «кто занят / что ждёт меня / что сломано»,
 * the contemplative canvas stays (owner-approved imagery, kept intact).
 * Anti-dashification rules apply unchanged: a block with nothing to say
 * does not render, and every figure LEADS somewhere.
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
    // Full-bleed root (U2): the hero spans the whole working zone; the
    // cockpit column re-applies the showcase measure itself, so every H1/H2
    // keeps the page-grid x while the canvas breaks out of it. W-A D3:
    // `gap-8` + explicit `order` (not space-y) — flex gap follows the
    // VISUAL order, so the reordered blocks keep their breathing room.
    <section
      aria-labelledby="well-hero-title"
      className="flex w-full flex-col gap-8"
    >
      <WellHero className="order-2" />

      <div className="mx-auto order-1 w-full max-w-4xl space-y-8">
        {/* КТО ЗАНЯТ (§3.1): executors' presence + the work counts, leading to
         * the agents/tasks surfaces. Renders its own honest states (zero
         * agents → the connect line; errors → HonestLine + retry). */}
        <CockpitBusy />

        {/* ЧТО ЖДЁТ МЕНЯ (§3.1 + persona round 1): ONE summary number-action —
         * the click leads to the most urgent list; quiet source rows under it.
         * Renders nothing while nothing waits. */}
        <CockpitWaiting />
      </div>

      <div className="mx-auto order-3 w-full max-w-4xl space-y-8">
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
                      <StoreHealthCard server={server} />
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
                    className="inline-flex min-h-12 md:min-h-6 items-center gap-1 text-sm text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
      </div>
    </section>
  );
}
