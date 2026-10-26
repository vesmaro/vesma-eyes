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
import { GrantAccessDialog } from "./GrantAccessDialog";
import { hubZones, isRosterEmpty, providersOff } from "./modelsModel";
import type {
  BoardRosterRow,
  DiscoveredRosterRow,
  ProviderRow,
  ProviderSlot,
} from "./modelsModel";
import { useModelsRoster } from "./useModels";
import { useGrantMutations, useModelGrants } from "./useGrants";
import { useProviderMutations } from "./useProviders";
import { useI18n } from "@/i18n";
import { formatRelativeActivityTime } from "@/features/tasks/activityGrammar";

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

/** Relative time for the slot facts («использован 2 мин назад») — the
 * activityGrammar discipline, minute-scale honesty is enough for a
 * metadata slot. */
function relativeTime(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  const rtf = formatRelativeActivityTime(
    iso,
    lang === "ru" ? "ru" : "en",
    Date.now(),
  );
  return rtf;
}

/** The owner-registry card (MF2 + MF3): the STATUS SLOT is the only
 * emphasized element of the surface (blueprint «драматизм — ноль, кроме
 * одного места»); metadata only — fingerprint + dates + the slot-machine
 * facts; rotate/remove owner acts. Removal confirms IN the card. The
 * grants section (MF3) replaces the roadmap note with the real
 * management. */
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
  const usedAt = relativeTime(row.lastUsedAt, lang);
  const rejectedAt = relativeTime(row.rejectedAt, lang);
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
      {row.status === "rejected" && rejectedAt ? (
        <p className="mt-1 text-xs text-foreground-muted">
          {t("models.slot.rejectedAt", { when: rejectedAt })}
        </p>
      ) : row.status === "set" ? (
        <p className="mt-1 text-xs text-foreground-muted">
          {usedAt
            ? t("models.slot.usedAt", { when: usedAt })
            : t("models.slot.neverUsed")}
        </p>
      ) : null}
      {confirming ? (
        <p className="mt-1.5 text-xs text-foreground-secondary" role="note">
          {t("models.card.removeConfirm")}
        </p>
      ) : null}
      {/* MF3: the real access management replaces the MF2 roadmap note. */}
      <ProviderGrantsSection row={row} />
    </li>
  );
}

/** The grants section of one provider card (MF3, ux §3.3): the semantic
 * table (Кому/Тип/Статус/Выдан/Кем/Действие), the pause switch as a real
 * checkbox (never colour-only), the revoke confirm with the pull
 * consequence in the copy, and the PERMANENT pull promise note under the
 * table — the promise is text, not a tooltip. MF-GRANT-EMPTY states the
 * honest fact: no grants = the provider is board-only. */
function ProviderGrantsSection({ row }: { row: ProviderRow }) {
  const t = useT();
  const { lang } = useI18n();
  const { grants, selectorRegistry } = useModelGrants(row.providerKey);
  const { setEnabled, revoke } = useGrantMutations(row.providerKey);
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const connected = row.status !== null;

  return (
    <section className="mt-2 border-t border-border-subtle pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-medium text-foreground-secondary">
          {t("models.grants.title")}
        </h3>
        <span className="font-mono text-xs text-foreground-muted">
          {grants.length}
        </span>
        <Button
          className="ml-auto"
          variant="outline"
          size="sm"
          disabled={!connected}
          title={connected ? undefined : t("models.grants.needsKey")}
          onClick={() => setGrantDialogOpen(true)}
        >
          {t("models.grants.grantCta")}
        </Button>
      </div>
      {!connected ? (
        <p className="mt-1 text-xs text-foreground-muted">
          {t("models.grants.needsKey")}
        </p>
      ) : grants.length === 0 ? (
        <p className="mt-1.5 text-xs text-foreground-muted">
          {t("models.grants.empty")}
        </p>
      ) : (
        <table className="mt-1.5 w-full text-left text-xs">
          <thead>
            <tr className="text-foreground-muted">
              <th scope="col" className="py-1 pr-2 font-medium">
                {t("models.grants.colWho")}
              </th>
              <th scope="col" className="py-1 pr-2 font-medium">
                {t("models.grants.colKind")}
              </th>
              <th scope="col" className="py-1 pr-2 font-medium">
                {t("models.grants.colStatus")}
              </th>
              <th scope="col" className="py-1 pr-2 font-medium">
                {t("models.grants.colGranted")}
              </th>
              <th scope="col" className="py-1 pr-2 font-medium">
                {t("models.grants.colBy")}
              </th>
              <th scope="col" className="py-1 font-medium">
                {t("models.grants.colAction")}
              </th>
            </tr>
          </thead>
          <tbody>
            {grants.map((grant) => {
              const revoking = revokingId === grant.grantId;
              return (
                <tr key={grant.grantId} className="border-t border-border-subtle">
                  <td className="py-1 pr-2 font-mono">{grant.selectorValue}</td>
                  <td className="py-1 pr-2">
                    {grant.selectorKind === "host"
                      ? t("models.grants.kindHostRow")
                      : t("models.grants.kindExecutorRow")}
                  </td>
                  <td className="py-1 pr-2">
                    <label className="flex min-h-6 items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={grant.enabled}
                        disabled={setEnabled.isPending}
                        onChange={(event) =>
                          setEnabled.mutate({
                            grantId: grant.grantId,
                            enabled: event.target.checked,
                          })
                        }
                        aria-label={t("models.grants.switchLabel", {
                          who: grant.selectorValue,
                        })}
                        className="accent-iris-bright"
                      />
                      <span
                        className={
                          grant.enabled
                            ? "text-foreground-secondary"
                            : "text-foreground-muted"
                        }
                      >
                        {grant.enabled
                          ? t("models.grants.statusActive")
                          : t("models.grants.statusPaused")}
                      </span>
                    </label>
                  </td>
                  <td className="py-1 pr-2">
                    {formatDate(grant.createdAt, lang) ??
                      t("models.grants.unknownDate")}
                  </td>
                  <td className="py-1 pr-2">{grant.createdBy}</td>
                  <td className="py-1">
                    {revoking ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={revoke.isPending}
                          onClick={() =>
                            revoke.mutate(grant.grantId, {
                              onSuccess: () => setRevokingId(null),
                            })
                          }
                        >
                          {revoke.isPending
                            ? t("models.grants.revoking")
                            : t("models.grants.revokeConfirmCta")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRevokingId(null)}
                        >
                          {t("models.card.removeKeep")}
                        </Button>
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRevokingId(grant.grantId)}
                      >
                        {t("models.grants.revokeCta")}
                      </Button>
                    )}
                    {revoking ? (
                      <p className="mt-1 text-foreground-secondary" role="note">
                        {t("models.grants.revokeConfirm", {
                          who: grant.selectorValue,
                        })}
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {/* The pull promise, as text under the table (ux §3.3). */}
      <p className="mt-1.5 text-xs text-foreground-muted" role="note">
        {t("models.grants.pullPromise")}
      </p>
      <GrantAccessDialog
        open={grantDialogOpen}
        onOpenChange={setGrantDialogOpen}
        providerKey={row.providerKey}
        registry={selectorRegistry}
        existing={grants}
      />
    </section>
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
       * the h1 stays for the a11y outline only (registry-page precedent).
       * The connect CTA rides the page header row (wireframe §5.1: the
       * act lives at the top, next to the title), disabled WITH its
       * reason rendered in the zone card when the features are off. */}
      <h1 className="sr-only">{t("models.hub.title")}</h1>
      <div className="flex justify-end">
        <Button onClick={openConnect} disabled={off}>
          {t("models.hub.connectCta")}
        </Button>
      </div>

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
