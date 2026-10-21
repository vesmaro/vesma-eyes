import { useLocation, useSearchParams, Link } from "react-router";
import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { Button } from "@/components/ui/button";
import { isPulseSource } from "@/gateway/capabilities";
import { usePulse } from "@/hooks/usePulse";
import { useGateway } from "@/gateway/GatewayContext";
import { useT } from "@/i18n";
import { formatTimestamp } from "@/components/memory/memoryDisplay";
import { pulseFreshness } from "./pulseFreshness";
import { PulseFeed, PulseSkeleton } from "./PulseFeed";
import { pageGridClass } from "@/layout/pageGrid";

/**
 * `/memory/pulse` — the live memory pulse (redesign concept §2.1 / §4.2:
 * the rail-pulse pattern promoted to a page). One merged recency feed with
 * per-server provenance badges; the scope lives in the `?scope=` URL param
 * (`all` | one store name — names come from the feed's own per-server
 * report). Honest matrix: loading skeleton, error + retry (404 = unknown
 * scope with the server's own words), empty feed, degraded stores note.
 */
export function PulsePage() {
  const t = useT();
  const gateway = useGateway();
  const capable = isPulseSource(gateway);
  const [searchParams, setSearchParams] = useSearchParams();
  // UI-18 pair 10: the pulse URL (?scope= included) rides as `return=` on
  // every row link so the memory detail's back control leads back here.
  const location = useLocation();
  const scope = searchParams.get("scope") ?? "all";
  const pulse = usePulse({ scope, limit: 20 });

  if (!capable) {
    return <PulseUnsupported />;
  }

  // Scope options: "all" + the store names the feed itself reports.
  const scopes = [
    "all",
    ...new Set((pulse.data?.per_server ?? []).map((p) => p.server)),
  ];
  const setScope = (next: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "all") params.delete("scope");
        else params.set("scope", next);
        return params;
      },
      { replace: false },
    );
  };

  // D7 P5: the pulse must be distinguishable from the records list AND say
  // honestly when the feed went quiet — the threshold is derived from the
  // feed's own cadence (see pulseFreshness), never a fixed magic number.
  const items = pulse.data?.items ?? [];
  const freshness = pulseFreshness(items);

  return (
    <section aria-labelledby="pulse-title" className={pageGridClass("showcase", "space-y-4")}>
      <div>
        <h1 id="pulse-title" className="text-xl font-semibold">
          {t("pulse.title")}
        </h1>
        {/* D7 P5: why this page exists, and the way into its sibling — the
         * two memory faces answer different questions. */}
        <p className="mt-1 text-sm text-foreground-secondary">
          {t("pulse.subtitle")}{" "}
          <Link
            to="/memory"
            className="text-iris-bright underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {t("pulse.toRecords")}
          </Link>
        </p>
      </div>

      {/* Scope switcher (URL state — QA verdict §3: list state lives in URL). */}
      <div
        role="group"
        aria-label={t("pulse.scopeLabel")}
        className="flex flex-wrap gap-2"
      >
        {scopes.map((name) => (
          <Button
            key={name}
            variant={name === scope ? "default" : "outline"}
            size="sm"
            aria-pressed={name === scope}
            onClick={() => setScope(name)}
          >
            {name === "all" ? t("pulse.scopeAll") : name}
          </Button>
        ))}
      </div>

      {pulse.isPending ? (
        <div role="status" aria-label={t("pulse.loading")}>
          <PulseSkeleton />
        </div>
      ) : pulse.isError ? (
        <EmptyState
          variant="error"
          title={t("pulse.loadFailed")}
          message={pulse.error.message}
          action={
            <Button variant="outline" onClick={() => void pulse.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : (pulse.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          variant="empty"
          title={t("pulse.emptyTitle")}
          message={t("pulse.emptyMessage")}
        />
      ) : (
        <>
          {freshness.stalled ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-foreground-secondary"
            >
              <TriangleAlert
                className="mt-0.5 size-3.5 shrink-0 text-warning"
                aria-hidden="true"
              />
              {t("pulse.stalled", {
                days: freshness.newestAgeDays,
                date: formatTimestamp(freshness.newestAt),
              })}
            </p>
          ) : null}
          <PulseFeed
            items={pulse.data.items}
            perServer={pulse.data.per_server}
            returnSource={{ pathname: location.pathname, search: location.search }}
          />
        </>
      )}
    </section>
  );
}

/** Mnemos-mode honest state: the pulse is a merge-API view, not a vesma one. */
function PulseUnsupported() {
  const t = useT();
  return (
    <section aria-labelledby="pulse-title" className={pageGridClass("showcase", "space-y-4")}>
      <h1 id="pulse-title" className="text-xl font-semibold">
        {t("pulse.title")}
      </h1>
      <EmptyState
        variant="empty"
        title={t("pulse.unavailableTitle")}
        message={t("pulse.unavailableMessage")}
      />
    </section>
  );
}
