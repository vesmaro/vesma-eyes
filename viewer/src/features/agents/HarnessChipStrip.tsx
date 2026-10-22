import { useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import type {
  ExecutorItem,
  ExecutorListMeta,
} from "@/gateway/boardTypes";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { executorExecEnv, executorFoundTrail } from "./execEnvModel";
import {
  PRESENCE_DOT,
  presenceFromLastSeen,
  presenceLabelKey,
} from "./presence";
import { usePresenceFlashFor } from "./presenceLight";
import { ExecutorMenu } from "./ExecutorMenu";
import { ExecutorSheet } from "./ExecutorSheet";

/**
 * The harness CHIP STRIP of the host field (agents-workspace-ide W1
 * «Распустить сплетения», blueprint §2-3: the «Сплетения зоны» accordion
 * dissolves into this strip). ONE compact chip per harness member —
 * presence dot + name + harness type + the «среда исполнения» badge
 * (AGW-23) + the refusal badge (pending / owner-disabled / revoked) — the
 * GLANCE facts only. The lore structural labels are GONE (the «нейронов: N»
 * counter dies with the accordion); the inventory counters live inside the
 * sheet's inventory section, while the sessions-24h glance counter retires
 * WITH the accordion — no renderer anywhere (blueprint §2 dissolve map).
 * The strip's heading is the plain «Харнесы» noun.
 *
 * Operations (blueprint §5 reuse map — nothing re-implemented):
 * - chip CLICK = the ExecutorSheet DRAWER over the field — the same
 *   component /agents/harnesses opens, so the full ExecutorSheetForm and
 *   its freeze/stamp remount discipline are parity BY CONSTRUCTION;
 * - ⋯ / right-click = the ExecutorMenu in CONTROLLED mode (the gated
 *   useExecutorMutations actions, server-text toasts) — every harness
 *   mutation stays ≤2 interactions from the center.
 *
 * Honesty: a member-less strip renders the honest LINE (never an empty
 * block); an unreported exec-env keeps the reserved hidden geometry; a
 * presence verdict without the meta contract is «unknown», never guessed.
 * Motion (blueprint §7): no ambient in the working field — the one-shot
 * presenceLight flare on a REAL transition is the only light here.
 */
export function HarnessChipStrip({
  members,
  meta,
  now,
}: {
  members: readonly ExecutorItem[];
  meta: ExecutorListMeta | undefined;
  now: number;
}) {
  const t = useT();
  // The open settings drawer: the member id (session-only state — Radix
  // owns the focus trap and Esc; closing resets to null).
  const [sheetId, setSheetId] = useState<string | null>(null);
  return (
    <section
      aria-label={t("agents.hosts.harnessStripLabel")}
      className="space-y-1.5 px-6 pb-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
          {t("agents.hosts.harnessStripLabel")}
        </h3>
        {/* The contextual conveyor entry (C1): the connect action lives
         * where a harness would be added — beside the strip it serves; the
         * roster CTA and the header's quiet entry stay (one route, one
         * action, three doors). */}
        <Link
          to="/agents/harnesses?connect=1"
          className="flex min-h-12 md:min-h-6 whitespace-nowrap items-center rounded-sm px-1 text-xs text-foreground-secondary underline-offset-2 transition-colors duration-instant hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
        >
          {t("agents.hosts.actionAddHarness")}
        </Link>
      </div>
      {members.length === 0 ? (
        // The honest empty strip: a LINE that answers, never an empty block.
        <p className="text-sm text-foreground-muted">
          {t("agents.hosts.zoneEmpty")}
        </p>
      ) : (
        <ul className="flex flex-wrap items-center gap-1.5">
          {members.map((member) => (
            <HarnessChip
              key={member.id}
              member={member}
              meta={meta}
              now={now}
              onOpenSheet={() => setSheetId(member.id)}
            />
          ))}
        </ul>
      )}
      {/* The full workbench (7 sections) mounts ONLY with the open drawer —
       * never inside the chips (blueprint §7 perf note). */}
      {sheetId !== null ? (
        <ExecutorSheet
          executorId={sheetId}
          open
          onOpenChange={(open) => {
            if (!open) setSheetId(null);
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * One chip: the glance facts + the two operation entries. The chip BODY is
 * a button (opens the sheet, `aria-haspopup="dialog"`); the ⋯ trigger of
 * the controlled ExecutorMenu sits beside it (the tab-reachable menu path —
 * the contextmenu entry is a pointer-only convenience, WCAG 2.1.1). The
 * chip flares ONCE on a real member presence transition (presenceLight).
 */
function HarnessChip({
  member,
  meta,
  now,
  onOpenSheet,
}: {
  member: ExecutorItem;
  meta: ExecutorListMeta | undefined;
  now: number;
  onOpenSheet: () => void;
}) {
  const t = useT();
  const [menu, setMenu] = useState<{
    open: boolean;
    position: { x: number; y: number } | null;
  }>({ open: false, position: null });
  // The one-shot presence flare (event-driven, never background).
  const flash = usePresenceFlashFor([member.id]);
  // The SAME meta TTL projection the strip chips and the roster rows use.
  const presence = presenceFromLastSeen(member.last_seen, meta, now);
  const presenceKey = presence ?? "unknown";
  const execEnv = executorExecEnv(member);
  // AGW-23: the dedupe trail of the SAME installation rides the badge
  // tooltip (audit data of one fact — the chip geometry stays compact).
  const foundTrail = executorFoundTrail(member);
  const execEnvTitle = foundTrail.length
    ? `${t("agents.hosts.execEnvTooltip")}\n${t("agents.hosts.foundAtTooltip")}\n${foundTrail.join("\n")}`
    : t("agents.hosts.execEnvTooltip");
  const chipTitle = [
    t(presenceLabelKey(presenceKey)),
    ...(presenceKey === "unknown" ? [t("agents.presence.unknownHint")] : []),
    member.name,
    member.harness,
  ].join(" · ");

  return (
    <li>
      <div
        className={cn(
          "group/chip flex items-stretch gap-0.5 rounded-full",
          // The one-shot presence flare (success = arrival, warning =
          // departure; a tint, not a glow source).
          flash
            ? flash.tone === "online"
              ? "agents-presence-online"
              : "agents-presence-offline"
            : "",
        )}
      >
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={onOpenSheet}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({
              open: true,
              position: { x: event.clientX, y: event.clientY },
            });
          }}
          title={chipTitle}
          className={cn(
            "flex min-h-12 md:min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-subtle bg-well px-3 text-left text-sm transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
            member.state === "revoked" && "text-foreground-muted",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-2 shrink-0 rounded-full",
              PRESENCE_DOT[presenceKey] ?? PRESENCE_DOT.unknown,
            )}
          />
          {/* The presence word is the dot's SR text (WCAG 1.4.1 — meaning
           * never rides colour alone); the unknown non-verdict carries its
           * two-clock hint in the same breath. */}
          <span className="sr-only">
            {t(presenceLabelKey(presenceKey))}
            {presenceKey === "unknown"
              ? ` — ${t("agents.presence.unknownHint")}`
              : ""}
          </span>
          <span className="max-w-40 truncate font-medium">{member.name}</span>
          <span className="shrink-0 font-mono text-xs text-foreground-muted">
            {member.harness}
          </span>
          <RefusalBadges member={member} />
          {/* The «среда исполнения» slot (AGW-23): the agent's own surface
           * label when reported, the reserved hidden geometry when not —
           * absence is an answer, never a fabricated label. */}
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
        <span className="flex items-center">
          <ExecutorMenu
            executor={member}
            revealOnParentHover
            open={menu.open}
            position={menu.position}
            onOpenChange={(open, position) => setMenu({ open, position })}
          />
        </span>
      </div>
    </li>
  );
}

/**
 * The registry verdict badges («почему не возьмёт задачу»): pending /
 * owner-disabled / revoked — the visible word stays, the REASON becomes the
 * accessible name (`role="img"` + aria-label, no touch-dead title — the
 * UX-AUDIT A6 pattern, unchanged from the accordion rows it replaces).
 */
function RefusalBadges({ member }: { member: ExecutorItem }) {
  const t = useT();
  if (member.state === "pending") {
    return (
      <Badge
        variant="outline"
        role="img"
        aria-label={`${t("agents.hosts.pendingPill")}: ${t("agents.executor.pendingReason")}`}
        className="shrink-0 whitespace-nowrap font-normal"
      >
        {t("agents.hosts.pendingPill")}
      </Badge>
    );
  }
  if (member.state === "approved" && !member.enabled) {
    return (
      <Badge
        variant="outline"
        role="img"
        aria-label={`${t("agents.hosts.refusalDisabled")}: ${t("agents.executor.disabledReason")}`}
        className="shrink-0 whitespace-nowrap font-normal"
      >
        {t("agents.hosts.refusalDisabled")}
      </Badge>
    );
  }
  if (member.state === "revoked") {
    return (
      <Badge
        variant="outline"
        role="img"
        aria-label={`${t("agents.hosts.refusalRevoked")}: ${t("agents.registry.revokedHint")}`}
        className="shrink-0 whitespace-nowrap font-normal"
      >
        {t("agents.hosts.refusalRevoked")}
      </Badge>
    );
  }
  return null;
}
