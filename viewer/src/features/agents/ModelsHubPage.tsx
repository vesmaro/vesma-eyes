import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { TableRowSkeleton } from "@/components/skeletons/Skeletons";
import { isAgentsSource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import { pageGridClass } from "@/layout/pageGrid";
import { AgentsUnsupported } from "./AgentsUnsupported";
import { hubZones, isRosterEmpty } from "./modelsModel";
import type { BoardRosterRow, DiscoveredRosterRow } from "./modelsModel";
import { useModelsRoster } from "./useModels";

/**
 * `/agents/models` — хаб «Модели» (MF1, ux-blueprint §2/§5.1): the models
 * fleet roster in the Agents domain, next to Hosts/Execution (the
 * owner-registry family precedent — /agents/harnesses). ONE read:
 * `GET /api/models`, the single aggregation point (discovery-contract §3,
 * OQ-1); the page is a projection of provenance-marked facts.
 *
 * MF1 scope honesty (the wave cut, blueprint §7): NO connect CTA exists —
 * a control without an action behind it would be a lie (07a), the connect
 * form is MF2, grants are MF3. The three zones render in EVERY data state
 * (the static-roster precedent: no off-branch for facts):
 * - Подключённые провайдеры — the owner registry: honestly empty in MF1,
 *   the roadmap note names the wave (MF2) instead of a dead button;
 * - Найдено агентами — the mirror of agent-reported facts (the agent wire
 *   carries no models slice yet — the honest empty names that);
 * - Борд-ростер — the board-reported hermes cluster row (provenance
 *   badge, read-only, no key/grants).
 * NO credential field exists in the family by construction (security
 * verdict §5) — none is rendered or read anywhere on this surface.
 */

/** The auth enum fact on a mirror row — text always (never colour-only,
 * WCAG 1.4.1); the mapping is closed over the contract's enum. */
function mirrorAuthKey(auth: DiscoveredRosterRow["auth"]): TranslationKey {
  switch (auth) {
    case "configured":
      return "models.hub.mirrorAuthConfigured";
    case "anonymous":
      return "models.hub.mirrorAuthAnonymous";
    default:
      return "models.hub.mirrorAuthUnknown";
  }
}

function mirrorSourceKey(source: string | null): TranslationKey | null {
  if (source === "config") return "models.hub.sourceConfig";
  if (source === "probe") return "models.hub.sourceProbe";
  return null;
}

function Zone({
  labelKey,
  count,
  children,
}: {
  labelKey: TranslationKey;
  count: number;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <section aria-label={t(labelKey)}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground-secondary">
        {t(labelKey)}
        <span className="font-mono text-foreground-muted">{count}</span>
      </p>
      <ul className="mt-1 space-y-1.5">{children}</ul>
    </section>
  );
}

/** The board roster card (MF1: the hermes cluster row) — provider name,
 * provenance badge, the honest no-key fact, base_url, the models counter
 * with the 8-row cut and the «…и ещё N» overflow (MF-HUB-CAPS). */
function BoardCard({ row }: { row: BoardRosterRow }) {
  const t = useT();
  return (
    <li className="rounded-md border border-border-subtle bg-well px-3 py-2 text-sm shadow-well">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{row.provider}</span>
        <span className="text-xs text-foreground-muted">
          {t("models.hub.boardCluster")}
        </span>
        <Badge variant="outline">{t("models.hub.boardBadge")}</Badge>
        {/* The honest no-key fact (wireframe §5.1 «борд · без ключа»):
         * text, never colour-only. No credential field exists. */}
        <span className="text-xs text-foreground-muted">
          {t("models.hub.noKey")}
        </span>
        <span className="ml-auto font-mono text-xs text-foreground-muted">
          {t("models.hub.modelsCount", { count: row.models.length })}
        </span>
      </div>
      {row.baseUrl ? (
        <p className="mt-1 truncate font-mono text-xs text-foreground-muted">
          {row.baseUrl}
        </p>
      ) : null}
      {row.shownModels.length > 0 ? (
        <p className="mt-1.5 break-words text-xs text-foreground-secondary">
          {row.shownModels.join(" · ")}
          {row.modelsOverflow > 0 ? (
            <span className="text-foreground-muted">
              {" "}
              {t("models.hub.overflow", { count: row.modelsOverflow })}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-foreground-muted">
          {t("models.hub.mirrorEmpty")}
        </p>
      )}
      {row.defaultModel ? (
        <p className="mt-1 text-xs text-foreground-muted">
          {t("models.hub.defaultModel", { model: row.defaultModel })}
        </p>
      ) : null}
    </li>
  );
}

/** The mirror-zone card: WHERE the fact came from (seen-on attribution),
 * the auth enum fact, the source fact, the models counter + cut. MF1
 * renders no connect CTA on the row (the connect form is MF2). */
function DiscoveredCard({ row }: { row: DiscoveredRosterRow }) {
  const t = useT();
  const sourceKey = mirrorSourceKey(row.source);
  const firstSeen = row.seenOn[0];
  return (
    <li className="rounded-md border border-border-subtle bg-well px-3 py-2 text-sm shadow-well">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{row.provider}</span>
        {firstSeen ? (
          <span className="text-xs text-foreground-muted">
            {t("models.hub.mirrorSeenOn", { where: firstSeen.executorId })}
          </span>
        ) : null}
        <span className="text-xs text-foreground-muted">
          {t(mirrorAuthKey(row.auth))}
        </span>
        <span className="ml-auto font-mono text-xs text-foreground-muted">
          {t("models.hub.modelsCount", { count: row.models.length })}
        </span>
      </div>
      {row.baseUrl ? (
        <p className="mt-1 truncate font-mono text-xs text-foreground-muted">
          {row.baseUrl}
        </p>
      ) : null}
      {row.shownModels.length > 0 ? (
        <p className="mt-1.5 break-words text-xs text-foreground-secondary">
          {row.shownModels.join(" · ")}
          {row.modelsOverflow > 0 ? (
            <span className="text-foreground-muted">
              {" "}
              {t("models.hub.overflow", { count: row.modelsOverflow })}
            </span>
          ) : null}
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-foreground-muted">
        {sourceKey ? <span>{t(sourceKey)}</span> : null}
        {row.seenOnOverflow > 0 ? (
          <span>{t("models.hub.overflow", { count: row.seenOnOverflow })}</span>
        ) : null}
      </div>
    </li>
  );
}

export function ModelsHubPage() {
  const t = useT();
  const gateway = useGateway();
  const capable = isAgentsSource(gateway);
  const roster = useModelsRoster();

  if (!capable) {
    return <AgentsUnsupported />;
  }

  const zones = hubZones(roster.data);

  return (
    <div className={pageGridClass("operational", "flex flex-col gap-3")}>
      {/* The TopBar carries «Модели» (routeTitleKey → nav.agentsModels) —
       * the h1 stays for the a11y outline only (registry-page precedent). */}
      <h1 className="sr-only">{t("models.hub.title")}</h1>

      {roster.isPending ? (
        <div role="status" aria-label={t("models.hub.loading")}>
          <TableRowSkeleton rows={3} columns={2} />
        </div>
      ) : roster.isError ? (
        <EmptyState
          variant="error"
          title={t("models.hub.failed")}
          techDetail={roster.error.message}
          action={
            <Button
              variant="outline"
              onClick={() => void roster.refetch()}
            >
              {t("common.retry")}
            </Button>
          }
        />
      ) : isRosterEmpty(zones) ? (
        /* MF-HUB-EMPTY: the fact is stated, no CTA — the connect form is
         * MF2; a dead button would be a lie (07a). */
        <EmptyState
          variant="empty"
          title={t("models.hub.empty.title")}
          message={t("models.hub.empty.message")}
        />
      ) : (
        <>
          {/* MF1: the owner registry zone — honestly empty, the roadmap
           * note names the wave instead of a dead connect CTA. */}
          <Zone
            labelKey="models.hub.connectedTitle"
            count={zones.connectedCount}
          >
            <li className="rounded-md border border-border-subtle bg-well px-3 py-2 text-xs text-foreground-muted">
              {t("models.hub.connectedEmpty")}
            </li>
          </Zone>

          {/* The mirror zone: agent-reported facts (dedup by
           * provider+base_url — the projection merges defensively). */}
          <Zone labelKey="models.hub.mirrorTitle" count={zones.discovered.length}>
            {zones.discovered.length > 0 ? (
              zones.discovered.map((row) => (
                <DiscoveredCard key={`${row.provider} ${row.baseUrl}`} row={row} />
              ))
            ) : (
              <li className="rounded-md border border-border-subtle bg-well px-3 py-2 text-xs text-foreground-muted">
                {t("models.hub.mirrorEmpty")}
              </li>
            )}
          </Zone>

          {/* The board roster: provenance `board` rows, read-only, no
           * key/grants (blueprint §4.1 MF-HUB-LIVE). */}
          <Zone labelKey="models.hub.boardTitle" count={zones.board.length}>
            {zones.board.map((row) => (
              <BoardCard key={`${row.provider} ${row.baseUrl}`} row={row} />
            ))}
          </Zone>
        </>
      )}
    </div>
  );
}
