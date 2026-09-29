import { useState, useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ChevronRight,
  Command,
  Keyboard,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useT } from "@/i18n";
import { useTaskInbox } from "@/features/tasks/useTasks";
import {
  sessionModeI18nKey,
  useSessionMode,
} from "@/features/ui-token/useSessionControl";
import { useBoardHealth } from "@/hooks/usePulse";
import { openPalette } from "@/lib/paletteState";
import { useHotkeys } from "./Hotkeys";
import { DocsSidebarGroups } from "@/features/docs/DocsSidebarGroups";
import {
  NAV_DOMAINS,
  activeDomain,
  domainCounterIds,
  isPathActive,
  sectionActive,
} from "./navItems";
import type { NavCounterId, NavDomain, NavSection } from "./navItems";
import { cn } from "@/lib/utils";

/**
 * Primary navigation (union И1, stand 03 §3 over the И0 token layer): the
 * two-layer domain sidebar — «Обзор» root + domains, sections revealing
 * under their domain. Domains with sections are COLLAPSIBLE groups (chevron,
 * ONE domain open at a time — the active route's domain auto-opens); the
 * active domain carries the 2px iris strip + its strata wash, the active
 * section the 6px recall dot. Phase-2+ domains stay honest disabled slots.
 *
 * Geometry (03 §3): 232px panel / 56px icon rail, both from the shell tokens
 * (--shell-sidebar-w / --shell-sidebar-rail-w). The collapsed rail hides
 * labels, chevrons, sections and counters (03 §3 «collapsed» state); every
 * row keeps the full name as `title` + `aria-label` (recognition over
 * recall).
 *
 * Expansion modes (UI-22 owner feedback, kept): >= md the inline sticky
 * panel flips with `collapsed` (persisted under vesmaro.sidebarCollapsed —
 * Shell owns the storage, `[` hotkey and the footer row share it); < md the
 * sidebar is the stand's OFF-CANVAS drawer — a Radix Dialog (И1: the
 * hand-rolled focus trap is retired; Radix owns the trap, Esc, the backdrop
 * and the focus return to the TopBar trigger). The overlay state is
 * SESSION-ONLY (a mobile toggle never touches the persisted desktop
 * intent), and the covered page still leaves the accessibility tree (ME-002
 * `inert` off lib/sidebarOverlayState — the store is driven by Shell).
 *
 * Labels via useT(); the brand lives in the TopBar now (03 §2).
 */

/**
 * The md breakpoint of the sidebar (Tailwind md = 768px). Kept in ONE place:
 * the expansion mode is state-driven (not CSS-forced), so the JS query and
 * any future Tailwind class must agree.
 */
const DESKTOP_QUERY = "(min-width: 768px)";

function subscribeDesktop(onChange: () => void): () => void {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * Viewport seam for the sidebar mode (UI-22). This is a client-only SPA:
 * matchMedia is available on the FIRST client render, so the phone never
 * sees a wrong-viewport frame; the SSR/test snapshot renders the desktop
 * panel (the historical renderToString behaviour).
 */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

/** Panel presentation modes: the inline desktop panel is expanded or the
 * 56px icon rail; the mobile drawer is always the full panel. */
type PanelMode = "expanded" | "rail" | "overlay";

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

/** The inline DESKTOP panel (>= md). Below md the sidebar is the drawer —
 * {@link MobileSidebar}, mounted by the Shell inside its Radix Dialog root. */
export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const t = useT();
  const isDesktop = useIsDesktop();
  if (!isDesktop) return null;
  return (
    <aside
      aria-label={t("nav.sections")}
      className={cn(
        "sticky top-topbar z-30 flex h-[calc(100dvh-var(--shell-topbar-h))] shrink-0 flex-col",
        // Order matters under tailwind-merge: the border COLOUR first, the
        // hairline WIDTH second (the reverse order gets merged away).
        "border-myelin-hairline border-r-hairline bg-well",
        "transition-[width] duration-normal ease-enter",
        collapsed ? "w-sidebar-rail" : "w-sidebar",
      )}
    >
      <SidebarPanel mode={collapsed ? "rail" : "expanded"} onToggle={onToggle} />
    </aside>
  );
}

/**
 * The mobile drawer (< md): a Radix Dialog PORTAL piece — renders ONLY the
 * Portal/Overlay/Content and must sit INSIDE the Shell's DialogPrimitive.Root
 * (the Root also hosts the TopBar Trigger, so Radix returns focus to it on
 * close). Radix owns the focus trap, Esc, the backdrop click and the focus
 * return; ME-002 (`inert` for the covered page) and the body scroll lock are
 * driven by the Shell off `open`. Controlled rendering: nothing mounts while
 * closed.
 */
export function MobileSidebar({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  if (!open) return null;
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay/80" />
      <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-sidebar flex-col border-r border-border-subtle bg-well shadow-float">
        <DialogPrimitive.Title className="sr-only">
          {t("nav.sections")}
        </DialogPrimitive.Title>
        <SidebarPanel
          mode="overlay"
          onToggle={() => onOpenChange(false)}
          onRequestClose={() => onOpenChange(false)}
        />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/**
 * The panel itself, shared by the inline aside and the mobile drawer.
 * `onRequestClose` (drawer only) fires when an auxiliary action (palette,
 * cheatsheet) takes over the screen.
 */
function SidebarPanel({
  mode,
  onToggle,
  onRequestClose,
}: {
  mode: PanelMode;
  onToggle: () => void;
  onRequestClose?: () => void;
}) {
  const t = useT();
  const { openHelp } = useHotkeys();
  const { pathname } = useLocation();
  const active = activeDomain(pathname);
  const expanded = mode !== "rail";

  // One domain open at a time (03 §3): the active route's domain auto-opens;
  // a click opens a chosen domain and closes the previous one. The sync is
  // the canonical render-time adjustment (no effect, no cascading commit).
  const [activeKey, setActiveKey] = useState<string | null>(active?.to ?? null);
  const [openKey, setOpenKey] = useState<string | null>(active?.to ?? null);
  if ((active?.to ?? null) !== activeKey) {
    setActiveKey(active?.to ?? null);
    setOpenKey(active?.to ?? null);
  }

  const hideLabels = expanded ? "min-w-0 truncate" : "hidden";

  return (
    <>
      {/* overflow-x-hidden closes the horizontal-scroll class entirely (UI-19):
       * however long a translation gets, no horizontal scrollbar can appear. */}
      <nav
        aria-label={t("nav.primary")}
        className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2"
      >
        <ul className="space-y-0.5">
          {NAV_DOMAINS.map((domain) => (
            <li key={domain.to}>
              <DomainRow
                domain={domain}
                open={openKey === domain.to}
                onOpenChange={(next) => setOpenKey(next ? domain.to : null)}
                activeDomain={active?.to === domain.to}
                expanded={expanded}
                hideLabels={hideLabels}
                pathname={pathname}
              />
              {/* The docs domain's THIRD layer (ADR 0016 / design spec §3):
               * project groups with nested categories, expanded from the
               * pathname alone. Owns its rail geometry + icon-rail fallback. */}
              {domain.to === "/docs" && active?.to === "/docs" && expanded ? (
                <DocsSidebarGroups collapsed={false} hideLabels={hideLabels} />
              ) : null}
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex shrink-0 flex-col gap-0.5 border-myelin-hairline border-t-hairline p-2">
        <FooterRow
          icon={Command}
          label={t("nav.palette")}
          hint="Ctrl K"
          expanded={expanded}
          onClick={() => {
            onRequestClose?.();
            openPalette();
          }}
        />
        <FooterRow
          icon={Keyboard}
          label={t("nav.cheatsheet")}
          hint="?"
          expanded={expanded}
          onClick={() => {
            onRequestClose?.();
            openHelp();
          }}
        />
        {mode === "overlay" ? (
          // The drawer's «Свернуть» closes the dialog — Radix returns focus
          // to the TopBar trigger; no key hint (its `[` toggles the rail).
          <DialogPrimitive.Close asChild>
            <FooterRow
              icon={PanelLeftClose}
              label={t("nav.collapse")}
              expanded
            />
          </DialogPrimitive.Close>
        ) : (
          <FooterRow
            icon={expanded ? PanelLeftClose : PanelLeftOpen}
            label={t(expanded ? "nav.collapse" : "nav.expand")}
            hint="["
            expanded={expanded}
            ariaExpanded={expanded}
            onClick={onToggle}
          />
        )}
        <SidebarStatusLine expanded={expanded} />
      </div>
    </>
  );
}

/** A sidebar footer row (03 §3 «подвал»): Палитра / Шпаргалка / Свернуть. */
function FooterRow({
  icon: Icon,
  label,
  hint,
  expanded,
  ariaExpanded,
  onClick,
}: {
  icon: typeof Command;
  label: string;
  /** The trailing key hint (mono, muted) — advertised keys all exist. */
  hint?: string;
  expanded: boolean;
  /** Panel state disclosure for the collapse row (stand 03 §3 footer). */
  ariaExpanded?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-expanded={ariaExpanded}
      className={cn(
        "flex h-10 w-full min-w-0 items-center rounded-md text-sm text-foreground-secondary",
        "transition-colors duration-instant",
        "hover:bg-myelin-strong hover:text-foreground",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        expanded ? "gap-3 px-3" : "justify-center px-0",
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      {expanded ? (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {hint ? (
            <span className="shrink-0 font-mono text-caps tracking-caps text-foreground-muted">
              {hint}
            </span>
          ) : null}
        </>
      ) : null}
    </button>
  );
}

/** Strata wash class per domain (03 §3 «активное состояние» + 02-TOKENS):
 * keyed by the domain root path; leaf domains carry no wash. */
const STRATA_CLASS: Partial<Record<string, string>> = {
  "/memory": "bg-strata-memory",
  "/tasks": "bg-strata-tasks",
  "/agents": "bg-strata-agents",
  "/docs": "bg-strata-docs",
  "/system": "bg-strata-system",
};

/**
 * One domain row: a plain LINK for leaf domains (Обзор, Кора, docs), a
 * GROUP TOGGLE (chevron, aria-expanded) for domains with sections, and the
 * honest disabled slot for phase-2+ domains (soonKey). The active domain
 * carries the 2px iris strip + its strata wash; the rail keeps icons only.
 */
function DomainRow({
  domain,
  open,
  onOpenChange,
  activeDomain,
  expanded,
  hideLabels,
  pathname,
}: {
  domain: NavDomain;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The ACTIVE route's domain (visual strip + wash), distinct from `open`. */
  activeDomain: boolean;
  expanded: boolean;
  hideLabels: string;
  pathname: string;
}) {
  const t = useT();
  const Icon = domain.icon;
  const label = t(domain.key);

  // Honest disabled slot (Phase 2+): visible, explained, inert.
  if (domain.soonKey) {
    const hint = t(domain.soonKey);
    return (
      <button
        type="button"
        disabled
        title={`${label} — ${hint}`}
        className={cn(
          "flex h-10 w-full min-w-0 cursor-not-allowed items-center rounded-md px-3 text-sm",
          "text-foreground-muted opacity-70",
          expanded ? "gap-3" : "justify-center px-0",
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        {expanded ? (
          <>
            <span className={hideLabels}>{label}</span>
            <span className="shrink-0 rounded-sm border border-border-subtle px-1 text-caps tracking-caps text-foreground-muted">
              {t("nav.soon")}
            </span>
          </>
        ) : null}
      </button>
    );
  }

  const counterIds = domain.aggregateCounters ? domainCounterIds(domain) : [];
  const hasSections = (domain.sections?.length ?? 0) > 0;
  const active = isPathActive(pathname, domain.to, domain.end);

  const rowClass = cn(
    "flex h-10 w-full min-w-0 items-center rounded-md text-sm transition-colors duration-instant",
    "hover:bg-myelin-strong hover:text-foreground",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    activeDomain ? "font-medium text-foreground" : "text-foreground-secondary",
    activeDomain && STRATA_CLASS[domain.to],
    expanded ? "gap-3 px-3" : "justify-center px-0",
  );

  const inner = (
    <>
      {/* The 2px iris strip of the active domain (03 §3) — sits in the nav's
       * px-2 gutter, like the stand's ::before. */}
      {activeDomain ? (
        <span
          aria-hidden="true"
          className="absolute -left-2 top-2 bottom-2 w-0.5 rounded-full bg-iris"
        />
      ) : null}
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      {expanded ? <span className={cn("flex-1", hideLabels)}>{label}</span> : null}
      {expanded && counterIds.length > 0 ? (
        <AggregateCountBadge ids={counterIds} />
      ) : null}
      {hasSections && expanded ? (
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-foreground-muted transition-transform duration-normal ease-enter",
            open && "rotate-90",
          )}
          aria-hidden="true"
        />
      ) : null}
    </>
  );

  return (
    <div className="relative">
      {/* Rail mode (03 §3 collapsed): sections are hidden, so a group domain
       * NAVIGATES to its root instead of toggling — the icon never dead-ends.
       * Expanded: the group toggles (chevron + aria-expanded). */}
      {hasSections && expanded ? (
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          title={label}
          aria-label={label}
          className={rowClass}
        >
          {inner}
        </button>
      ) : (
        <Link
          to={domain.linkTo ?? domain.to}
          title={label}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={rowClass}
        >
          {inner}
        </Link>
      )}
      {hasSections && expanded ? (
        // The reveal (03 §3): 240ms grid-rows animation. Closed sections
        // leave the tab order (visibility) — the stand's hidden-but-tabbable
        // flaw is not carried over. The RAIL renders no sections at all
        // (icons only, stand collapsed state).
        <div
          className={cn(
            "grid transition-[grid-template-rows,visibility] duration-normal ease-enter",
            open ? "grid-rows-[1fr] visible" : "grid-rows-[0fr] invisible",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <ul className="ml-9 space-y-0.5 py-0.5">
              {domain.sections?.map((section) => (
                <li key={section.to}>
                  <SectionLink
                    section={section}
                    siblings={domain.sections ?? []}
                    pathname={pathname}
                    hideLabels={hideLabels}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionLink({
  section,
  siblings,
  pathname,
  hideLabels,
}: {
  section: NavSection;
  /** The domain's full section list — master-detail highlighting must know
   * the sibling roots (sectionActive, ME-028). */
  siblings: readonly NavSection[];
  pathname: string;
  hideLabels: string;
}) {
  const t = useT();
  const label = t(section.key);
  // Honest disabled slot (UX-overhaul §6/§9.4 Ф1): visible, explained,
  // inert; the route behind it stays alive for bookmarks.
  if (section.soonKey) {
    const hint = t(section.soonKey);
    return (
      <button
        type="button"
        disabled
        title={`${label} — ${hint}`}
        className="flex h-9 w-full min-w-0 cursor-not-allowed items-center gap-2 rounded-md px-3 text-sm text-foreground-muted opacity-70"
      >
        <span className={hideLabels}>{label}</span>
        <span className="shrink-0 rounded-sm border border-border-subtle px-1 text-caps tracking-caps text-foreground-muted">
          {t("nav.soon")}
        </span>
      </button>
    );
  }
  // ME-028: master-detail lists own their detail routes; sibling exact roots
  // stay exclusive to their own rows (sectionActive).
  const active = sectionActive(pathname, section, siblings);
  return (
    <Link
      to={section.to}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-9 w-full min-w-0 items-center rounded-md px-3 text-sm transition-colors duration-instant",
        "hover:bg-myelin-strong hover:text-foreground",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        active ? "font-medium text-iris-bright" : "text-foreground-secondary",
      )}
    >
      {/* The 6px recall dot of the active section (03 §3). */}
      {active ? (
        <span
          aria-hidden="true"
          className="absolute -left-3 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-synapse-recall"
        />
      ) : null}
      <span className={hideLabels}>{label}</span>
      {section.counter === "inbox" ? <InboxCount /> : null}
    </Link>
  );
}

/**
 * Live inbox counter (Ф2): the count of NOT-yet-adopted queue records. One
 * cached read (no polling — the mirror changes via the server scanner);
 * hidden while unknown, zero or on incapable gateways (honest absence
 * instead of a dead "0"). Stand look: mono caps, muted (side-count).
 */
function InboxCount() {
  const t = useT();
  const count = useInboxCounterValue();
  if (count === null || count === 0) return null;
  return (
    <span
      title={t("tasks.inboxCount", { count })}
      aria-label={t("tasks.inboxCount", { count })}
      className="ml-auto inline-flex shrink-0 font-mono text-caps tracking-caps text-foreground-muted"
    >
      {count}
    </span>
  );
}

// --- Live counter sources (UI-30) ---------------------------------------------
//
// The sidebar counters read the SAME TanStack cache entries the pages use —
// one wire per source; a cache patch re-renders every badge that shows it.

/** `null` = the source is unknown (pending / error / incapable gateway) —
 * honest absence; callers never render a guessed number. */
interface NavCounterValues {
  inbox: number | null;
}

function useNavCounterValues(): NavCounterValues {
  return { inbox: useInboxCounterValue() };
}

/** The inbox reading that feeds BOTH the «Входящие» badge and the domain
 * aggregate: the same `tasks.inbox` cache entry `useTaskInbox` serves. */
function useInboxCounterValue(): number | null {
  const inbox = useTaskInbox();
  if (inbox.isPending || inbox.isError) return null;
  return inbox.data?.count ?? null;
}

/** Sum the requested counters; `null` when ANY source is unknown — a partial
 * sum would understate the badge. */
function navCounterSum(
  values: NavCounterValues,
  ids: readonly NavCounterId[],
): number | null {
  let sum = 0;
  for (const id of ids) {
    const value = values[id];
    if (value === null) return null;
    sum += value;
  }
  return sum;
}

/**
 * UI-30 (owner directive): the domain row's live badge = the AGGREGATE of
 * its sections' counters. Stand look (expanded): the mono caps side-count.
 * The rail hides counters (03 §3 collapsed) — the count returns with the
 * labels. Hidden while the sum is unknown or zero.
 */
function AggregateCountBadge({ ids }: { ids: readonly NavCounterId[] }) {
  const t = useT();
  const values = useNavCounterValues();
  const count = navCounterSum(values, ids);
  if (count === null || count <= 0) return null;
  const label = t("nav.newCount", { count });
  return (
    <span
      title={label}
      aria-label={label}
      className="shrink-0 font-mono text-caps tracking-caps text-foreground-muted"
    >
      {count}
    </span>
  );
}

/**
 * Footer status line (07k §1.2): 6px dot + «mnemos-eyes <version> · <session
 * status>» in caps-muted — NOT a link/button, never competing with the nav.
 * Authorized session → success dot (never colour-only — the text carries the
 * status). The rail collapses to dot + short version (07k §1.2); the version
 * comes from the live board health (hidden when the gateway serves none —
 * mock/legacy, the same honest absence as before the union).
 */
function SidebarStatusLine({ expanded }: { expanded: boolean }) {
  const t = useT();
  const sessionMode = useSessionMode();
  const health = useBoardHealth();
  const version = health.data?.app_version;
  const mode = t(sessionModeI18nKey(sessionMode));
  const authorized = sessionMode !== "readOnly";
  const full = version ? `mnemos-eyes ${version} · ${mode}` : `mnemos-eyes · ${mode}`;
  // Short version for the rail (07k §1.2 «1.41»): major.minor of either
  // "1.51.0" or "v1.51.0".
  const short = version?.replace(/^v?(\d+\.\d+).*/, "$1");
  if (!expanded && !short) return null;
  return (
    <p
      title={full}
      className={cn(
        "flex min-w-0 items-center gap-2 px-2 pb-1 pt-2",
        expanded ? "text-caps tracking-caps text-foreground-muted" : "justify-center",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          authorized ? "bg-success" : "bg-foreground-muted",
        )}
      />
      {expanded ? (
        <span className="min-w-0 truncate">{full}</span>
      ) : (
        <span className="font-mono text-caps tracking-caps text-foreground-muted">
          {short}
        </span>
      )}
    </p>
  );
}
