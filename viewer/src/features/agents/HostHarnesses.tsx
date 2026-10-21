import { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Puzzle,
  ScrollText,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  ExecutorItem,
  ExecutorListMeta,
} from "@/gateway/boardTypes";
import { Link } from "react-router";
import { useT, type TranslationKey } from "@/i18n";
import { cn } from "@/lib/utils";
import type { KoraSession } from "@/features/kora/koraTypes";
import { inventoryCategories } from "./harnessInventoryModel";
import { executorExecEnv, executorFoundTrail } from "./execEnvModel";
import {
  PRESENCE_DOT,
  PRESENCE_TEXT,
  presenceLabelKey,
} from "./presence";
import { usePresenceFlashFor } from "./presenceLight";
import { ExecutorSheetForm } from "./ExecutorSheet";

/**
 * «Сплетения зоны» (agents-redesign B2, blueprint §3.C.3; brain-zones Z1
 * structural layer, BRAIN-ZONES-VISUAL-DOC §2-3) — the heart of the field:
 * ONE accordion row per executor of the host, and the expansion is the FULL
 * working block IN PLACE — the ExecutorSheet's own form component (link ·
 * access · identity · capabilities · inventory · tech · danger), remounted
 * here with the SAME freeze/stamp discipline the sheet uses. Behavior
 * parity is by construction: the sheet and the accordion mount the one
 * form; nothing is re-implemented.
 *
 * Z1 speaks the lore vocabulary over the SAME data (no new endpoint, no
 * invention): the host is the cortex zone, each harness row is a PLEXUS,
 * and the zone's neurons are the members' agent-reported specialists (the
 * ME-064 counters summed — shown only when at least one member reported an
 * inventory; honest absence otherwise). A zone with no plexuses renders an
 * honest line, never an empty block.
 *
 * Row facts (one glance): presence word + dot, the name, the harness type,
 * the REFUSAL badge («почему не возьмёт задачу» — registry verdicts only:
 * pending / owner-disabled / revoked), the four inventory counters, the
 * sessions-in-24h count, and the «среда исполнения» badge (AGW-23 — the
 * agent's own surface label: "metal" / "distrobox:<name>" / "pod:<name>";
 * data-driven since the exec-env wave, the reserved empty geometry stays
 * when the agent reports none).
 */
export function HostHarnesses({
  members,
  meta,
  now,
  koraItems,
}: {
  members: readonly ExecutorItem[];
  meta: ExecutorListMeta | undefined;
  now: number;
  koraItems: readonly KoraSession[];
}) {
  const t = useT();
  // The zone's neuron count: the SUM of the members' agent-reported
  // specialists counters (ME-064, the same typed accessor the row counters
  // use). null when NO member reported a harness inventory — an honest
  // absence, never a fabricated 0.
  const neuronTotal = useMemo(() => {
    let total = 0;
    let reported = false;
    for (const member of members) {
      const env = member.harness_inventory?.[0];
      if (!env) continue;
      reported = true;
      const specialists = inventoryCategories(env).find(
        (category) => category.key === "specialists",
      );
      total += specialists?.count ?? 0;
    }
    return reported ? total : null;
  }, [members]);
  return (
    <section
      aria-label={t("agents.hosts.zoneStructureTitle")}
      className="space-y-1"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
          {t("agents.hosts.zoneStructureTitle")}
        </h3>
        <div className="flex items-center gap-2">
          {neuronTotal !== null ? (
            <span className="whitespace-nowrap font-mono text-xs tabular-nums text-foreground-muted">
              {t("agents.hosts.zoneNeuronsCounter", { n: neuronTotal })}
            </span>
          ) : null}
          {/* The contextual conveyor entry (C1: the connect action left the
           * nav — the field carries it where a harness would be added). */}
          <Link
            to="/agents/harnesses?connect=1"
            className="flex min-h-6 whitespace-nowrap items-center rounded-sm px-1 text-xs text-foreground-secondary underline-offset-2 transition-colors duration-instant hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
          >
            {t("agents.hosts.actionAddHarness")}
          </Link>
        </div>
      </div>
      {members.length === 0 ? (
        // The honest empty zone: a LINE that answers, never an empty block.
        <p className="px-2.5 py-2 text-sm text-foreground-muted">
          {t("agents.hosts.zoneEmpty")}
        </p>
      ) : (
        <ul className="space-y-1">
          {members.map((member) => (
            <HarnessRow
              key={member.id}
              member={member}
              meta={meta}
              now={now}
              sessions24={koraSessions24(koraItems, member.id, now)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The member's sessions with activity inside the last 24 hours. */
function koraSessions24(
  items: readonly KoraSession[],
  executorId: string,
  now: number,
): number {
  return items.filter(
    (session) =>
      session.executor_id === executorId &&
      Date.parse(session.last_activity_at ?? "") >= now - 24 * 60 * 60 * 1000,
  ).length;
}

/** One accordion row: the glance facts + the expanded workbench in place. */
function HarnessRow({
  member,
  meta,
  now,
  sessions24,
}: {
  member: ExecutorItem;
  meta: ExecutorListMeta | undefined;
  now: number;
  sessions24: number;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const flash = usePresenceFlashFor([member.id]);
  const presence = memberPresence(member, meta, now);
  const presenceKey = presence ?? "unknown";
  const execEnv = executorExecEnv(member);
  // AGW-23: the dedupe trail of the SAME installation rides the badge
  // tooltip (audit data of one fact — the row geometry stays reserved).
  const foundTrail = executorFoundTrail(member);
  const execEnvTitle = foundTrail.length
    ? `${t("agents.hosts.execEnvTooltip")}\n${t("agents.hosts.foundAtTooltip")}\n${foundTrail.join("\n")}`
    : t("agents.hosts.execEnvTooltip");

  return (
    <li
      className={cn(
        "rounded-md border bg-well",
        // The one-shot presence flare (event-driven, never background).
        flash
          ? flash.tone === "online"
            ? "agents-presence-online"
            : "agents-presence-offline"
          : "",
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`harness-body-${member.id}`}
        onClick={() => setExpanded((value) => !value)}
        className={cn(
          "flex min-h-11 w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2.5 py-2 text-left text-sm transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
          member.state === "revoked" && "text-foreground-muted",
        )}
      >
        {expanded ? (
          <ChevronDown aria-hidden className="size-4 shrink-0" />
        ) : (
          <ChevronRight aria-hidden className="size-4 shrink-0" />
        )}
        <span
          aria-hidden="true"
          className={cn(
            "size-2 shrink-0 rounded-full",
            PRESENCE_DOT[presenceKey] ?? PRESENCE_DOT.unknown,
          )}
        />
        <span
          className={cn(
            "shrink-0 text-xs",
            PRESENCE_TEXT[presenceKey] ?? PRESENCE_TEXT.unknown,
          )}
          title={
            presenceKey === "unknown" ? t("agents.presence.unknownHint") : undefined
          }
        >
          {t(presenceLabelKey(presenceKey))}
        </span>
        <span className="min-w-0 truncate font-medium">{member.name}</span>
        <span className="shrink-0 font-mono text-xs text-foreground-muted">
          {member.harness}
        </span>
        {member.state === "pending" ? (
          <Badge
            variant="outline"
            role="img"
            aria-label={`${t("agents.hosts.pendingPill")}: ${t("agents.executor.pendingReason")}`}
            className="shrink-0 whitespace-nowrap font-normal"
          >
            {t("agents.hosts.pendingPill")}
          </Badge>
        ) : null}
        {member.state === "approved" && !member.enabled ? (
          <Badge
            variant="outline"
            role="img"
            aria-label={`${t("agents.hosts.refusalDisabled")}: ${t("agents.executor.disabledReason")}`}
            className="shrink-0 whitespace-nowrap font-normal"
          >
            {t("agents.hosts.refusalDisabled")}
          </Badge>
        ) : null}
        {member.state === "revoked" ? (
          <Badge
            variant="outline"
            role="img"
            aria-label={`${t("agents.hosts.refusalRevoked")}: ${t("agents.registry.revokedHint")}`}
            className="shrink-0 whitespace-nowrap font-normal"
          >
            {t("agents.hosts.refusalRevoked")}
          </Badge>
        ) : null}
        <InventoryCounters member={member} />
        {/* UX-AUDIT A6 follow-up (Z1 wave, 2026-10-21): the sessions count
         * used to ride `title` only — dead on touch and unnamed for AT. The
         * SAME fix as the inventory counters: role="img" + aria-label (the
         * width-independent name) + the visible ≥lg word (presentational by
         * the img role). */}
        <span
          role="img"
          aria-label={`${t("agents.hosts.sessions24Tooltip")}: ${sessions24}`}
          className="ml-auto flex shrink-0 items-center gap-1 font-mono text-xs tabular-nums text-foreground-muted"
        >
          <MessageSquareIcon />
          {/* D12: the same colon form as the aria name — «сессии: 0», never
           * the count-first «0 сессии» that read as broken prose. */}
          <span className="hidden lg:inline">
            {t("agents.hosts.sessions24Short")}:{" "}
          </span>
          {sessions24}
        </span>
        {/* The «среда исполнения» slot (B2, filled data-driven by the
         * exec-env wave): the agent's own surface label when reported
         * (AGW-23), the reserved hidden geometry when not — absence is
         * an answer, never a fabricated "metal". */}
        {execEnv ? (
          <Badge
            data-slot="execution-env"
            variant="outline"
            title={execEnvTitle}
            className="shrink-0 whitespace-nowrap font-mono font-normal"
          >
            {execEnv}
          </Badge>
        ) : (
          <span data-slot="execution-env" className="hidden" aria-hidden="true" />
        )}
      </button>
      {expanded ? (
        <div id={`harness-body-${member.id}`} className="px-2.5 pb-3">
          <HarnessWorkbench member={member} />
        </div>
      ) : null}
    </li>
  );
}

/** Per-member presence from the SAME meta TTLs the roster rows use. */
function memberPresence(
  member: ExecutorItem,
  meta: ExecutorListMeta | undefined,
  now: number,
): string | null {
  if (!meta) return null;
  const at = Date.parse(member.last_seen);
  if (!Number.isFinite(at)) return null;
  if (now < at) return "online";
  const ageS = (now - at) / 1000;
  if (ageS <= meta.presence.online_max_age_s) return "online";
  if (ageS <= meta.presence.stale_max_age_s) return "stale";
  return "offline";
}

/** The four inventory category counters (specialists/skills/plugins/
 * instructions) — the honest ME-064 counts. UX-AUDIT A6 (2026-10-20): the
 * category name used to ride `title` only — dead on touch; now the ≥lg
 * breakpoint shows the WORD next to the glyph, and the accessible name is
 * a width-independent `role="img"` + aria-label (no title anywhere). */
const INVENTORY_GLYPHS: Record<string, React.ReactNode> = {
  specialists: <Users aria-hidden className="size-3" />,
  skills: <Sparkles aria-hidden className="size-3" />,
  plugins: <Puzzle aria-hidden className="size-3" />,
  instructions: <ScrollText aria-hidden className="size-3" />,
};

function InventoryCounters({ member }: { member: ExecutorItem }) {
  const t = useT();
  const env = member.harness_inventory?.[0];
  const counters = useMemo(() => {
    if (!env) return [];
    // The SAME typed accessor the inventory section uses (guards over the
    // untyped capabilities record; the counters are the FULL counts).
    return inventoryCategories(env).map((category) => ({
      key: category.key,
      count: category.count,
      labelKey: `agents.card.inventory${category.key[0].toUpperCase()}${category.key.slice(1)}` as TranslationKey,
    }));
  }, [env]);
  if (counters.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-foreground-muted">
      {counters.map(({ key, count, labelKey }) => (
        // role="img" (the glyph+count composite) gives the span a NAMABLE
        // role, so aria-label replaces the touch-unavailable title at EVERY
        // width; the visible ≥lg label is presentational by the img role.
        // D12 (панель 2026-10-21): the visible ≥lg form is the SAME colon
        // form as the aria name («специалисты: 39») — the old visible
        // «39 специалисты» read as broken prose; the colon form is the
        // counter-is-data convention and never declines.
        <span
          key={key}
          role="img"
          aria-label={`${t(labelKey)}: ${count}`}
          className="flex items-center gap-0.5 font-mono text-xs tabular-nums"
        >
          {INVENTORY_GLYPHS[key]}
          <span className="hidden lg:inline">{t(labelKey)}: </span>
          {count}
        </span>
      ))}
    </span>
  );
}

function MessageSquareIcon() {
  // A local glyph keeps the row's icon set tiny (no new dependency).
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/**
 * The expanded workbench: the ExecutorSheet's OWN form component (link ·
 * access · identity · capabilities · inventory · tech · danger) with the
 * sheet's freeze/stamp remount discipline — behavior parity by
 * construction, the mutation checklist rides the same buttons.
 */
function HarnessWorkbench({ member }: { member: ExecutorItem }) {
  const t = useT();
  const [formDirty, setFormDirty] = useState(false);
  const [frozenStamp, setFrozenStamp] = useState<string | null>(null);
  const stamp = `${member.id}|${member.updated_at}|${member.state}|${member.enabled}`;
  const handleDirty = useCallback(
    (next: boolean) => {
      setFormDirty(next);
      setFrozenStamp((prev) => (next ? (prev ?? stamp) : null));
    },
    [stamp],
  );
  return (
    <div className="flex flex-col gap-4 border-t border-myelin-hairline pt-3">
      <p className="sr-only">{t("agents.card.description")}</p>
      <ExecutorSheetForm
        key={formDirty && frozenStamp !== null ? frozenStamp : stamp}
        executor={member}
        onDirtyChange={handleDirty}
      />
    </div>
  );
}
