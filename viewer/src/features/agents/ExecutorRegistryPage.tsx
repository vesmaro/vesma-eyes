import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Check, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { TableRowSkeleton } from "@/components/skeletons/Skeletons";
import type { ExecutorItem, ExecutorListMeta } from "@/gateway/boardTypes";
import { isAgentsSource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import { useUiToken } from "@/features/ui-token/UiTokenContext";
import { useValidationNow } from "@/features/tasks/useValidationClock";
import { AgentsUnsupported } from "./AgentsUnsupported";
import { ConnectGuide } from "./ConnectGuide";
import { EnrollmentDialog } from "./EnrollmentDialog";
import { EnrollmentTokensPanel } from "./EnrollmentTokensPanel";
import {
  formatReportAge,
  isLifecycle,
  lifecycleBadgeVariant,
  lifecycleLabelKey,
  lifecycleNextKey,
  silentMaxAgeS,
} from "./lifecycle";
import { ExecutorMenu } from "./ExecutorMenu";
import { ExecutorSheet } from "./ExecutorSheet";
import {
  PRESENCE_DOT,
  PRESENCE_TEXT,
  formatPulseAge,
  lastSeenAgeS,
  presenceFromLastSeen,
  presenceLabelKey,
} from "./presence";
import { usePresenceFlash } from "./presenceLight";
import { orderRegistry } from "./registryOrder";
import type { RegistryBands } from "./registryOrder";
import { effectiveEnrollmentState } from "./enrollment";
import { ProvisionCard } from "./ProvisionCard";
import { useActiveProvisionJob } from "./useProvision";
import { useExecutors } from "./useAgents";
import { useEnrollments } from "./useEnrollment";
import { useExecutorMutations } from "./useExecutorMutations";
import { pageGridClass } from "@/layout/pageGrid";

/**
 * P3: %-garbage in a hash must never take the page down —
 * decodeURIComponent throws URIError, the caller renders null instead.
 */
function safeDecodeHash(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * `/agents/harnesses` — «Подключение агентов» (AGW-4, spec §1 wave 2): the
 * executor registry with management, answering the owner's «где интерфейс
 * подключения внешних агентов?».
 *
 * UX-overhaul §4.1 (Ф1, П2): the registry comes FIRST, configuration below —
 * the ProvisionCard folds under a disclosure («Подключить нового агента»)
 * and opens itself only when it is the answer: an EMPTY registry (the guide
 * becomes the first screen — the one legal meta-first case) or a LIVE
 * provision job (every state visible — no silent spinner). Order:
 * registry → connect card (folded) → tokens → guide.
 *
 * The page renders THREE bands from orderRegistry — the pending approval
 * queue FIRST (the page's main answer), then connected (enabled ahead of
 * disabled), revoked last as visibly dead-but-present rows; empty bands
 * render nothing (§1.1 — no counter furniture).
 *
 * Management goes through the gated write path (useExecutorMutations →
 * PATCH/DELETE /api/executors/{id}, ui-token; server error text lands in
 * toasts verbatim). Approve does NOT flip the routing flag — the toast
 * points at «Включить» (Amd 2 §4 honesty); revoke is the TERMINAL
 * kill-switch behind a confirm; delete is the HARD registry removal — the
 * confirm says the secret dies with the row, the name is freed and active
 * assignments keep their pins (two-clock rule).
 *
 * Identity (name/host/harness/version) is executor-claimed and
 * server-UNVERIFIED — every row wears the outline unverified chip (§2.2).
 * Presence reuses the strip's meta-TTL language (presence.ts) off the
 * shared 1 Hz ticker.
 */
export function ExecutorRegistryPage() {
  const t = useT();
  const gateway = useGateway();
  const capable = isAgentsSource(gateway);
  const executors = useExecutors();
  const mutations = useExecutorMutations();
  const uiToken = useUiToken();
  const enrollments = useEnrollments({ tokenPresent: uiToken.tokenPresent });
  const location = useLocation();
  const navigate = useNavigate();
  // Registry rows before the early return: the card deep-link below reads
  // them (plain derived data — no hook ordering hazard).
  const items = executors.data?.items ?? [];
  // The enrollment flow lands here: a used token's link points at the row
  // its registration minted (#executor-<id>) — scroll it into view.
  // P3: undecodable hashes are skipped, never thrown.
  useEffect(() => {
    if (!location.hash.startsWith("#executor-") || location.hash.startsWith("#executor-sheet-"))
      return;
    const decoded = safeDecodeHash(location.hash.slice(1));
    if (decoded === null) return;
    document.getElementById(decoded)?.scrollIntoView({ block: "center" });
  }, [location.hash]);

  // AGW-6 B: the settings-card deep-link (#executor-sheet-<id>) — the
  // enrollment token screen's «Открыть карточку» lands here. DERIVED from
  // the hash (no effect, no open-state): the card shows as long as the
  // hash names a row (the drawer itself waits out the registry load);
  // closing rewrites the URL without the hash.
  const sheetPrefix = "#executor-sheet-";
  const sheetRaw = location.hash.startsWith(sheetPrefix)
    ? safeDecodeHash(location.hash.slice(sheetPrefix.length))
    : null;
  const cardId = sheetRaw;
  const closeCard = (): void => {
    navigate(
      { pathname: location.pathname, search: location.search, hash: "" },
      { replace: true },
    );
  };

  // Dialog open state (the form is keyed inside — fresh per open).
  const [enrollmentOpen, setEnrollmentOpen] = useState(false);
  // AGW-11: the ≤3 live-token pre-flight count for the mint dialog — the
  // expiry-aware view state (a dead-but-unswept token must not eat quota).
  const now = useValidationNow();
  const liveTokens = (enrollments.data?.items ?? []).filter(
    (row) => effectiveEnrollmentState(row, now) === "created",
  ).length;

  if (!capable) {
    return <AgentsUnsupported />;
  }

  const meta = executors.data?.meta;
  const bands: RegistryBands =
    executors.isPending || executors.isError
      ? { pending: [], active: [], revoked: [] }
      : orderRegistry(items);

  return (
    <div className={pageGridClass("operational", "flex flex-col gap-3")}>
      {/* The breadcrumb current item + TopBar already carry «Подключение» —
       * the h1 stays for the a11y outline only (no visible duplication). */}
      <header className="flex items-center justify-end gap-2">
        <h1 className="sr-only">{t("agents.registry.title")}</h1>
        {/* AGW-5 phase 2: the enrollment entry point — mint a one-time
         * mne_ token, hand it to the remote machine, approve the result. */}
        <Button size="sm" onClick={() => setEnrollmentOpen(true)}>
          <UserPlus className="size-4" aria-hidden="true" />
          {t("agents.enrollment.title")}
        </Button>
      </header>

      {/* UX-overhaul §4.1 (Ф1): the working state first. An EMPTY registry
       * is the one legal meta-first case — the guide IS the answer there,
       * and the connect card below opens itself. */}
      {executors.isPending ? (
        <div role="status" aria-label={t("agents.registry.loading")}>
          <TableRowSkeleton rows={4} columns={3} />
        </div>
      ) : executors.isError ? (
        <EmptyState
          variant="error"
          title={t("agents.registry.failed")}
          techDetail={executors.error.message}
          action={
            <Button variant="outline" onClick={() => void executors.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <ConnectGuide />
      ) : (
        <div className="space-y-3">
          {bands.pending.length > 0 ? (
            <Band labelKey="agents.registry.band.pending" count={bands.pending.length}>
              {bands.pending.map((executor) => (
                <ExecutorRow
                  key={executor.id}
                  executor={executor}
                  meta={meta}
                  mutations={mutations}
                />
              ))}
            </Band>
          ) : null}
          {bands.active.length > 0 ? (
            <Band labelKey="agents.registry.band.active" count={bands.active.length}>
              {bands.active.map((executor) => (
                <ExecutorRow
                  key={executor.id}
                  executor={executor}
                  meta={meta}
                  mutations={mutations}
                />
              ))}
            </Band>
          ) : null}
          {bands.revoked.length > 0 ? (
            <Band labelKey="agents.registry.band.revoked" count={bands.revoked.length}>
              {bands.revoked.map((executor) => (
                <ExecutorRow
                  key={executor.id}
                  executor={executor}
                  meta={meta}
                  mutations={mutations}
                />
              ))}
            </Band>
          ) : null}
        </div>
      )}

      {/* AGW-11 (wave 4) + UX-overhaul §4.1 (Ф1): the connect card — the
       * registry's expansion entry point, FOLDED below the working state.
       * It opens itself when the registry is empty or a provision job is
       * live (the funnel is never hidden mid-run). */}
      <ProvisionDisclosure registryEmpty={!executors.isPending && !executors.isError && items.length === 0} />

      {/* Token statuses: live countdowns + terminal history (ui-gated read —
       * the panel carries its own login hint without a token). */}
      <EnrollmentTokensPanel
        enrollments={enrollments.data?.items ?? []}
        executors={items}
        tokenPresent={uiToken.tokenPresent}
        loading={enrollments.isPending}
        error={enrollments.isError}
      />

      {/* The connect path: the one-command flow in five steps + the honest
       * installer note + the manual-path pointer (REMOTE-EXECUTOR.md).
       * When the registry is empty the guide already led the screen above —
       * the tail copy would only repeat it. */}
      {executors.isPending || executors.isError || items.length === 0 ? null : (
        <ConnectGuide />
      )}

      <EnrollmentDialog
        open={enrollmentOpen}
        onOpenChange={setEnrollmentOpen}
        liveCount={liveTokens}
      />

      {/* AGW-6 B: the settings card (deep-link target + menu rows render
       * their own instances; one shared drawer per page is enough here). */}
      {cardId !== null ? (
        <ExecutorSheet
          executorId={cardId}
          open
          onOpenChange={(next) => {
            if (!next) closeCard();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * UX-overhaul §4.1 (Ф1): the connect card under a disclosure (П2). Folded
 * by default; opens itself while `registryEmpty` (the card is the empty
 * domain's answer) or while a provision job is LIVE (the funnel must stay
 * visible — «тихий отказ» запрещён). The owner's toggle wins over the
 * defaults once touched.
 */
function ProvisionDisclosure({ registryEmpty }: { registryEmpty: boolean }) {
  const t = useT();
  const { active } = useActiveProvisionJob();
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? (registryEmpty || active !== null);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setUserOpen(!open)}
        className="flex w-fit items-center gap-1.5 rounded-md px-1 py-1 text-left text-sm font-medium text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        {t("agents.provision.enrollTitle")}
      </button>
      {open ? <ProvisionCard /> : null}
    </div>
  );
}

/** One labeled band of registry rows; zero-size bands render nothing. */
function Band({
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

/** One dense registry row: presence · lifecycle pill · declared
 * meta · capabilities as chips · the state-appropriate owner actions. */
function ExecutorRow({
  executor,
  meta,
  mutations,
}: {
  executor: ExecutorItem;
  meta: ExecutorListMeta | undefined;
  mutations: ReturnType<typeof useExecutorMutations>;
}) {
  const t = useT();
  const now = useValidationNow();
  const revoked = executor.state === "revoked";
  const pending = executor.state === "pending";
  // U6 присутствие-свет: the row flares once on a REAL executor transition
  // (the same store the roster cards and the strip chips read).
  const flash = usePresenceFlash(executor.id);
  // Presence reuses the strip's exact meta-TTL language (§2.1/§5.1) —
  // pending rows may tick, revoked ones decay to offline honestly.
  const presence = presenceFromLastSeen(executor.last_seen, meta, now);
  const ageS = lastSeenAgeS(executor.last_seen, now);
  const presenceKey = presence ?? "unknown";
  const pulseAge =
    ageS !== null && presence !== null
      ? formatPulseAge(ageS, {
          minutes: t("agents.age.unitMinutes"),
          hours: t("agents.age.unitHours"),
          days: t("agents.age.unitDays"),
        })
      : "";
  const transport =
    executor.transport === "mesh-r4"
      ? t("agents.strip.transportMesh")
      : t("agents.strip.transportLocal");

  const ghostButton =
    "h-7 px-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright";
  // AGW-5 phase 2: the row-level context menu (TaskRowMenu posture) —
  // right-click anywhere on the row opens it at the pointer; the ⋯ trigger
  // beside the inline actions is the tab-reachable path.
  const [menu, setMenu] = useState<{
    open: boolean;
    position: { x: number; y: number } | null;
  }>({ open: false, position: null });

  return (
    <li
      id={`executor-${executor.id}`}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenu({ open: true, position: { x: event.clientX, y: event.clientY } });
      }}
      className={
        "rounded-md border bg-well px-2.5 py-1.5 text-sm shadow-well transition-colors duration-instant " +
        // U6 присутствие-свет: the one-shot transition flare (event-driven).
        (flash
          ? flash.tone === "online"
            ? "agents-presence-online "
            : "agents-presence-offline "
          : "") +
        (revoked
          ? // Dead identity: muted as a whole, no hover invitation.
            "border-border-subtle text-foreground-muted"
          : "border-border-subtle hover:border-iris-bright/40")
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Presence dot: colour + shape, SR label carries the verdict. */}
        <span aria-hidden="true" className="flex items-center">
          <span
            className={
              "size-2 shrink-0 rounded-full " +
              (PRESENCE_DOT[presenceKey] ?? PRESENCE_DOT.unknown)
            }
          />
          <span className="sr-only">{t(presenceLabelKey(presenceKey))}</span>
        </span>
        <span className="truncate font-medium">{executor.name}</span>
        {/* UXE-2 (07a §4): the honest lifecycle pill REPLACES the eternal
         * «не проверено» chip — state + report age + the next step. The
         * state list rides meta.lifecycle.states (server-owned); the age
         * reuses the presence ticker (same 1 Hz clock, same human units). */}
        <LifecyclePill executor={executor} meta={meta} now={now} />

        <span className="ml-auto flex items-center gap-1.5">
          {/* Approve stays INLINE — the pending queue is this page's main
           * answer (spec §1); the title carries the follow-up hint
           * (AGW-4 review P3: the hint lives at the decision point). */}
          {pending ? (
            <Button
              size="sm"
              className={ghostButton}
              title={t("agents.registry.approveHint")}
              onClick={() => mutations.approveExecutor(executor)}
            >
              <Check className="size-3.5" aria-hidden="true" />
              {t("agents.registry.approve")}
            </Button>
          ) : null}
          {/* Everything else lives in the context menu — one surface for
           * enable/disable, revoke, delete, copy id (same gated mutations). */}
          <ExecutorMenu
            executor={executor}
            open={menu.open}
            position={menu.position}
            onOpenChange={(open, position) => setMenu({ open, position })}
          />
        </span>
      </div>

      {/* Declared meta, mono (dense §1): harness · transport · version ·
       * host · last seen. On revoked rows the hint names the terminal
       * state instead of pretending a toggle exists. */}
      <p
        className={
          "mt-0.5 font-mono text-xs " +
          (PRESENCE_TEXT[presenceKey] ?? PRESENCE_TEXT.unknown)
        }
      >
        {executor.harness} · {transport}
        {executor.version ? ` · v${executor.version}` : ""}
        {executor.host ? ` · ${t("agents.registry.hostLabel")}: ${executor.host}` : ""} ·{" "}
        {t("agents.strip.lastSeen")}: {pulseAge || t("agents.executor.neverSeen")}
        {/* Origin (design §Threat model): the owner cross-checks WHERE a
         * pending row came from before approving it. */}
        {pending
          ? ` · ${t(
              executor.registered_via.startsWith("enrollment:")
                ? "agents.registry.viaEnrollment"
                : "agents.registry.viaMachine",
            )}`
          : ""}
        {revoked ? ` · ${t("agents.registry.revokedHint")}` : ""}
      </p>

      {/* Capabilities as STRUCTURE (§4.3): one chip per allowlist mapping —
       * never a comma-joined free-text blob. UXE-1 (07a §3.3): the empty
       * answer is «пока не назначены» + the what-next hint (label and
       * value can no longer repeat the same word). */}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className="text-xs text-foreground-muted">
          {t("agents.registry.capabilitiesLabel")}:
        </span>
        {executor.capabilities.length > 0 ? (
          executor.capabilities.map((capability) => (
            <span
              key={capability}
              className="rounded-sm border border-border-subtle px-1 py-0.5 font-mono text-xs text-foreground-secondary"
            >
              {capability}
            </span>
          ))
        ) : (
          <span
            className="text-xs text-foreground-muted"
            title={t("agents.registry.capabilitiesHint")}
          >
            {t("agents.executor.noCapabilities")}
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * UXE-2 (07a dictionary §4): the honest lifecycle pill — the replacement
 * for the dead «не проверено» chip. Anatomy per 07a §1.1:
 * `[state] + [last-report age] + [next step]` — the state list is
 * server-owned (`meta.lifecycle.states`), the age reuses the strip's
 * meta-TTL ticker pattern (same 1 Hz `useValidationNow` clock), the next
 * step is the hint line (title for sighted users; the SR text carries the
 * full verdict so the colour+title pairing is never load-bearing).
 */
function LifecyclePill({
  executor,
  meta,
  now,
}: {
  executor: ExecutorItem;
  meta: ExecutorListMeta | undefined;
  now: number;
}) {
  const t = useT();
  // Older boards (pre-UXE-2 server) omit `status` — fall back to the
  // presence-derived reading instead of crashing or guessing a state.
  const status = executor.status;
  if (!isLifecycle(status)) {
    const ageS = lastSeenAgeS(executor.last_seen, now);
    return (
      <Badge variant="outline" className="font-normal">
        {ageS !== null
          ? t("agents.lifecycle.next.offline", {
              age: formatPulseAge(ageS, {
                minutes: t("agents.age.unitMinutes"),
                hours: t("agents.age.unitHours"),
                days: t("agents.age.unitDays"),
              }),
            })
          : t("agents.executor.neverSeen")}
      </Badge>
    );
  }

  const ageText =
    status.last_report_age_s === ""
      ? t("agents.lifecycle.reportNever")
      : formatReportAge(status.last_report_age_s, {
          agoTemplate: t("agents.lifecycle.reportAgo"),
          never: t("agents.lifecycle.reportNever"),
          units: {
            minutes: t("agents.age.unitMinutes"),
            hours: t("agents.age.unitHours"),
            days: t("agents.age.unitDays"),
          },
        });
  const silentMax = silentMaxAgeS(meta);
  const nextVars =
    status.state === "awaiting-first-report" && silentMax !== null
      ? { silentMax: formatPulseAge(silentMax, {
          minutes: t("agents.age.unitMinutes"),
          hours: t("agents.age.unitHours"),
          days: t("agents.age.unitDays"),
        }) }
      : undefined;

  return (
    <Badge
      variant={lifecycleBadgeVariant(status.state)}
      title={[t(lifecycleLabelKey(status.state)), ageText, t(lifecycleNextKey(status.state), nextActionVars(nextVars))].join(" · ")}
      className="font-normal"
    >
      {t(lifecycleLabelKey(status.state))}
      {/* The age rides the pill where the state rests on the report clock
       * (07a: status is never alone); provisioning/approval ages live in
       * the tooltip — the actionable fact there is the DECISION, not time. */}
      {ageText && status.state !== "awaiting-approval" && status.state !== "provisioning" ? (
        <span className="font-normal text-foreground-secondary">· {ageText}</span>
      ) : null}
      <span className="sr-only">
        {t(lifecycleNextKey(status.state), nextActionVars(nextVars))}
      </span>
    </Badge>
  );
}

/** i18n var-bag normalisation (empty → undefined keeps templates clean). */
function nextActionVars(
  vars: Record<string, string> | undefined,
): Record<string, string> | undefined {
  return vars;
}
