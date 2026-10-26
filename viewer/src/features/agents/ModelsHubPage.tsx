import { useState } from "react";
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
import { ConnectProviderDialog } from "./ConnectProviderDialog";
import { hubZones, isRosterEmpty, providersOff } from "./modelsModel";
import type {
  BoardRosterRow,
  DiscoveredRosterRow,
  ProviderRow,
  ProviderSlot,
} from "./modelsModel";
import { useModelsRoster } from "./useModels";
import { useProviderMutations } from "./useProviders";
import { useI18n } from "@/i18n";

/**
 * `/agents/models` — хаб «Модели» (MF1 roster + MF2 provider connection,
 * ux-blueprint §2/§5.1): the models fleet roster in the Agents domain,
 * next to Hosts/Execution (the owner-registry family precedent —
 * /agents/harnesses). ONE read: `GET /api/models`, the single aggregation
 * point (discovery-contract §3, OQ-1); the page is a projection of
 * provenance-marked facts.
 *
 * MF2 scope (the wave cut, blueprint §7): the connect dialog, the key
 * STATUS SLOTS (`set | unset | unknown` — `rejected` wakes with MF3),
 * rotation and key removal, and the honest-off 503-family card
 * (MF-HUB-OFF). The connected zone cards carry METADATA ONLY — the
 * fingerprint is not the key, and no show/copy surface exists anywhere
 * (security verdict §5; the reveal toggle lives only inside the unsaved
 * form). Grants stay MF3: the card carries the roadmap note instead of a
 * dead control (07a).
 *
 * The three zones render in EVERY data state (the static-roster
 * precedent: no off-branch for facts); the off-branch exists only for
 * owner ACTS (MF-HUB-OFF).
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

/** The key-status slot text — the CLOSED verdict §5 machine (text always,
 * never colour-only; `unknown` covers the pre-answer frame). */
function slotKey(status: ProviderSlot): TranslationKey {
  switch (status) {
    case "set":
      return "models.slot.set";
    case "rejected":
      return "models.slot.rejected";
    default:
      return "models.slot.unset";
  }
}

function formatDate(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-US", {
    dateStyle: "medium",
  }).format(date);
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
          {/* MF1 review P3-2: the board card states its OWN fact — the
           * board roster does not «wait for agent reports» (agents never
           * report this row), the model list is simply not named. */}
          {t("models.hub.boardNoModels")}
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
 * the auth enum fact, the source fact, the models counter + cut. MF2
 * renders no connect CTA on the mirror row yet (the prefilled-connect
 * affordance rides MF4's reverse chips; the manual form covers it). */
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

/** The owner-registry card (MF2): the STATUS SLOT is the only emphasized
 * element of the surface (blueprint «драматизм — ноль, кроме одного
 * места»); metadata only — fingerprint + dates; rotate/remove owner acts.
 * Removal confirms IN the card: «Ключ будет удалён из хранилища…». */
function ProviderCard({
  row,
  onRotate,
}: {
  row: ProviderRow;
  onRotate: (row: ProviderRow) => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const { removeCredential } = useProviderMutations();
  const [confirming, setConfirming] = useState(false);
  const setAt = formatDate(row.createdAt, lang);
  return (
    <li className="rounded-md border border-border-subtle bg-well px-3 py-2 text-sm shadow-well">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{row.providerKey}</span>
        {/* The slot: the single emphasized fact; text, never colour-only. */}
        <span
          className="text-xs font-medium text-foreground-secondary"
          role="status"
        >
          {t(slotKey(row.status))}
        </span>
        {row.status === "set" && row.fingerprint ? (
          <span className="font-mono text-xs text-foreground-muted">
            fp {row.fingerprint}
            <span className="ml-1 font-sans normal-case">
              {t("models.slot.fingerprintHint")}
            </span>
          </span>
        ) : null}
        {setAt ? (
          <span className="text-xs text-foreground-muted">
            {t("models.slot.setAt", { date: setAt })}
          </span>
        ) : null}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {row.status === "set" ? (
            <>
              <Button variant="outline" size="sm" onClick={() => onRotate(row)}>
                {t("models.card.rotate")}
              </Button>
              {confirming ? (
                <span className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={removeCredential.isPending}
                    onClick={() =>
                      removeCredential.mutate(row.providerKey, {
                        onSuccess: () => setConfirming(false),
                      })
                    }
                  >
                    {removeCredential.isPending
                      ? t("models.card.removing")
                      : t("models.card.removeConfirmCta")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirming(false)}
                  >
                    {t("models.card.removeKeep")}
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirming(true)}
                >
                  {t("models.card.removeKey")}
                </Button>
              )}
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onRotate(row)}>
              {t("models.card.setKey")}
            </Button>
          )}
        </span>
      </div>
      {row.baseUrl ? (
        <p className="mt-1 truncate font-mono text-xs text-foreground-muted">
          {row.baseUrl}
        </p>
      ) : null}
      {confirming ? (
        <p className="mt-1.5 text-xs text-foreground-secondary" role="note">
          {t("models.card.removeConfirm")}
        </p>
      ) : null}
      {/* Grants are MF3: a roadmap note, never a dead control (07a). */}
      <p className="mt-1 text-xs text-foreground-muted">
        {t("models.grants.roadmap")}
      </p>
    </li>
  );
}

export function ModelsHubPage() {
  const t = useT();
  const gateway = useGateway();
  const capable = isAgentsSource(gateway);
  const roster = useModelsRoster();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rotateTarget, setRotateTarget] = useState<ProviderRow | null>(null);

  if (!capable) {
    return <AgentsUnsupported />;
  }

  const zones = hubZones(roster.data);
  const off = providersOff(roster.data);

  const openConnect = () => {
    setRotateTarget(null);
    setDialogOpen(true);
  };
  const openRotate = (row: ProviderRow) => {
    setRotateTarget(row);
    setDialogOpen(true);
  };

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
        /* MF-HUB-EMPTY: the fact is stated; the screen's ONE connect CTA
         * (canonical single-CTA rule) — disabled WITH its reason when the
         * credential features are honestly off (MF-HUB-OFF). */
        <EmptyState
          variant="empty"
          title={t("models.hub.empty.title")}
          message={t("models.hub.empty.message")}
          action={
            <Button onClick={openConnect} disabled={off}>
              {t("models.hub.connectCta")}
            </Button>
          }
        />
      ) : (
        <>
          {/* The owner registry zone (MF2): metadata cards with the key
           * slots; honest-off shows the named-reason card INSTEAD of a
           * dead CTA (the rule: show with an explanation, never hide). */}
          <Zone
            labelKey="models.hub.connectedTitle"
            count={zones.connectedCount}
          >
            {off ? (
              <li className="rounded-md border border-border-subtle bg-well px-3 py-2 text-sm">
                <p className="font-medium">{t("models.off.title")}</p>
                <p className="mt-0.5 text-xs text-foreground-muted">
                  {t("models.off.reason")}
                </p>
                <Button
                  className="mt-2"
                  variant="outline"
                  size="sm"
                  disabled={true}
                >
                  {t("models.hub.connectCta")}
                </Button>
              </li>
            ) : zones.connected.length > 0 ? (
              zones.connected.map((row) => (
                <ProviderCard key={row.providerKey} row={row} onRotate={openRotate} />
              ))
            ) : (
              <li className="rounded-md border border-border-subtle bg-well px-3 py-2 text-xs text-foreground-muted">
                {t("models.hub.connectedEmpty")}
              </li>
            )}
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

          {/* MF-HUB-OFF also disables the page-level CTA when the zones
           * are non-empty (the off card above carries the reason). */}
          <div className="flex justify-end">
            <Button onClick={openConnect} disabled={off}>
              {t("models.hub.connectCta")}
            </Button>
          </div>
        </>
      )}

      {/* The credential form: reveal covers the UNSAVED value only; the
       * saved key has no show/copy surface anywhere (verdict §5). */}
      <ConnectProviderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rotate={rotateTarget}
      />
    </div>
  );
}
