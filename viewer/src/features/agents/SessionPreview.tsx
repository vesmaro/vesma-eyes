import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Copy, ExternalLink, MoreHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { HermesTranscript } from "@/features/kora/KoraHermesSource";
import { KoraTranscript } from "@/features/kora/KoraTranscript";
import type { KoraCoverage, KoraSession } from "@/features/kora/koraTypes";
import {
  koraSessionName,
  sessionCoverageSupport,
} from "@/features/kora/koraWorkspaceModel";
import {
  useKoraHermesTranscriptPages,
  useKoraTranscriptPages,
} from "@/features/kora/useKora";

/**
 * The S-SESSION preview (agents-workspace-ide W3 «Сессия в центре»,
 * states.md §1 + blueprint §4/§9): the selected live session's READ-ONLY
 * transcript preview in the host field's center — the EXACT Kora reading
 * grammar (KoraTranscript / HermesTranscript over the shared
 * useTranscriptWires state machine) with a mini-meta block of the registry
 * fields and [Открыть в Корe] as the PRIMARY CTA.
 *
 * §9 COORDINATION (binding): the chat surface lives ONLY in Kora. This
 * preview mounts no composer, no pult, no model picker, no search toolbar —
 * ever, regardless of wave order. The test-pinned guard asserts the
 * composer's absence in the rendered preview (agentside.w3.test).
 *
 * WIRE LIFECYCLE (blueprint §7): this component is the ONLY transcript-wire
 * carrier in the field — it mounts ONLY while a resolved session is
 * selected and unmounts on switch/close, so the kora transcript read lives
 * exactly as long as the selection (the 1 Hz ticker stays the single shared
 * beat). The gateway context above this component serves the «Сейчас»
 * registry read (the pre-existing W2 carrier) — no second live stream is
 * created here.
 *
 * SOURCE ROUTING mirrors KoraWorkspace: the «hermes:<native>» id prefix is
 * the routing fact — the LIVE hermes messages leg; registry ids ride the
 * zcode transcript leg. The disabled leg stays a no-op (enabled: false), a
 * guaranteed-404 call is never made.
 *
 * A11y: the preview is a labelled region; on mount the focus lands on the
 * session title (the selection IS a navigation); Esc inside the preview and
 * the ✕ button both return to S-HOST-LIVE (the route without the session
 * segment); the operations menu follows the ExecutorMenu posture
 * (aria-haspopup trigger + right-click entry, role="menu" of real items,
 * Esc closes the MENU first — it stops propagation, the session stays).
 */

/** Preview transcript page size — the Kora scroll's own page (one cursor
 * GET per page, «Показать ещё» rides the same frozen has_more honesty). */
const PREVIEW_PAGE_SIZE = 50;

const MENU_WIDTH_PX = 220;
const MENU_HEIGHT_PX = 160;
const VIEWPORT_MARGIN_PX = 8;

export function SessionPreview({
  session,
  hostRouteId,
  coverage,
}: {
  session: KoraSession;
  /** The host route segment — the ✕/Esc return target (S-HOST-LIVE). */
  hostRouteId: string;
  /** The registry coverage (the same read the field already holds). */
  coverage: KoraCoverage | null;
}) {
  const t = useT();
  const navigate = useNavigate();
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The ops menu: open + the contextmenu anchor (null = anchored to the ⋯
  // trigger — the ExecutorMenu two-mode grammar).
  const [menu, setMenu] = useState<{ open: boolean; position: MenuPosition | null }>({
    open: false,
    position: null,
  });

  // §9 source routing: the id prefix picks the ONE live transcript leg.
  const hermesDeepLink = session.id.startsWith("hermes:");
  const pages = useKoraTranscriptPages(
    hermesDeepLink ? undefined : session.id,
    PREVIEW_PAGE_SIZE,
  );
  const hermesPages = useKoraHermesTranscriptPages(
    hermesDeepLink ? session.id : undefined,
    PREVIEW_PAGE_SIZE,
  );

  // The selection IS a navigation: the focus lands on the preview's title
  // one frame after mount (the Shell's FocusMain runs first — the host
  // title effect's precedent). NO preventScroll here: the preview mounts
  // ABOVE the «Сейчас» block, so the field's preserved scrollTop would
  // otherwise leave the header above the view — the focus scroll brings
  // the selection into view (visibility follows focus).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      titleRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [session.id]);

  const close = useCallback((): void => {
    navigate(`/agents/hosts/${hostRouteId}`);
  }, [hostRouteId, navigate]);

  // Esc/close → S-HOST-LIVE (states.md §1). The listener sits on the
  // preview's own subtree: the operations menu consumes its own Esc
  // (stopPropagation — the MENU closes, the session stays), and the Radix
  // overlays (roster sheet, dialogs) portal OUTSIDE this subtree, so their
  // Esc never reaches here.
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }
    event.preventDefault();
    close();
  };

  const support = sessionCoverageSupport(coverage, session.harness);

  return (
    <section
      aria-label={t("agents.hosts.session.label")}
      onKeyDown={onKeyDown}
      className="mx-6 mb-3 rounded-md border border-myelin bg-elevated"
      // data-hook for the test guards (composer absence, wire lifecycle).
      data-agents-session-preview="true"
    >
      {/* Header: label + name + the operations (menu, close). */}
      <div
        className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2"
        onContextMenu={(event) => {
          // The pointer-only convenience entry (WCAG 2.1.1 — the ⋯ trigger
          // is the keyboard path); the menu opens at the pointer.
          event.preventDefault();
          setMenu({ open: true, position: { x: event.clientX, y: event.clientY } });
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
          {t("agents.hosts.session.label")}
        </p>
        <h3
          ref={titleRef}
          tabIndex={-1}
          className="min-w-0 truncate text-sm font-semibold outline-none"
        >
          {koraSessionName(session)}
        </h3>
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full bg-success presence-dot-live"
        />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <SessionOpsMenu
            session={session}
            open={menu.open}
            position={menu.position}
            onOpenChange={(next, position) => setMenu({ open: next, position })}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("agents.hosts.session.closeAria")}
            onClick={close}
            className="size-12 md:size-7 p-0"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>

      {/* Mini-meta: the registry fields, the «О сессии» grammar in short —
       * real facts only, nothing derived or invented. */}
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 px-3 py-2 text-xs">
        <dt className="text-foreground-secondary">{t("kora.about.harness")}</dt>
        <dd className="break-words font-mono">
          {session.harness} · {session.executor_id} · {session.native_id}
        </dd>
        <dt className="text-foreground-secondary">{t("kora.about.started")}</dt>
        <dd title={session.started_at ?? undefined} className="font-mono tabular-nums">
          {session.started_at ?? "—"}
        </dd>
        <dt className="text-foreground-secondary">{t("kora.about.lastActivity")}</dt>
        <dd
          title={session.last_activity_at ?? undefined}
          className="font-mono tabular-nums"
        >
          {session.last_activity_at ?? "—"}
        </dd>
        <dt className="text-foreground-secondary">{t("kora.about.coverage")}</dt>
        <dd>
          {support !== null ? (
            t(`kora.sessionCov.${support === "lists-only" ? "partial" : support}`)
          ) : (
            <span className="text-foreground-muted">{t("kora.sessionCov.unknown")}</span>
          )}
        </dd>
      </dl>

      {/* The primary CTA + the §9 honesty note (chat lives only in Kora). */}
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
        <Button asChild type="button" size="sm">
          <Link to={`/kora/${encodeURIComponent(session.id)}`}>
            <ExternalLink aria-hidden="true" className="size-3.5" />
            {t("agents.hosts.session.openInKora")}
          </Link>
        </Button>
        <p className="text-xs text-foreground-muted">
          {t("agents.hosts.session.readonlyNote")}
        </p>
      </div>

      {/* The READ-ONLY transcript (the Kora reading grammar as-is: pending/
       * error/empty states render inside). follow=OFF: the preview reads
       * from the beginning, and the tail-pinning scrollIntoView would yank
       * the FIELD's own scroll (the one scroll owner here — a nested
       * scroll would trap the wheel). No search toolbar in the preview. */}
      <div
        aria-label={t("agents.hosts.session.transcriptLabel")}
        role="region"
        className="px-3 pb-3"
      >
        {hermesDeepLink ? (
          <HermesTranscript
            sessionId={session.id}
            pages={hermesPages}
            follow={false}
            query=""
          />
        ) : (
          <KoraTranscript
            sessionId={session.id}
            pages={pages}
            follow={false}
            query=""
          />
        )}
      </div>
    </section>
  );
}

// --- the session operations menu ---------------------------------------------------

interface MenuPosition {
  x: number;
  y: number;
}

/**
 * The session op menu (states.md S-SESSION) — the ExecutorMenu posture, the
 * session's REAL operations only (nothing invented: the board contract has
 * no session mutations): open in Kora, copy the deep link, copy the id.
 * Controlled + pointer-positioned like the strip's menu; the ⋯ trigger is
 * the keyboard path.
 */
function SessionOpsMenu({
  session,
  open,
  position,
  onOpenChange,
}: {
  session: KoraSession;
  open: boolean;
  position: MenuPosition | null;
  onOpenChange: (open: boolean, position: MenuPosition | null) => void;
}) {
  const t = useT();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "failed">("idle");

  const close = useCallback(
    (refocus = true): void => {
      onOpenChange(false, null);
      if (refocus) triggerRef.current?.focus();
    },
    [onOpenChange],
  );

  // Outside press dismisses (the menu closes, the session stays).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        close();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  // Focus the first item when the menu opens.
  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )
      ?.focus();
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      // Consume the Esc: the MENU closes, the preview stays (S-SESSION).
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ];
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next = items[(current + delta + items.length) % items.length];
    next.focus();
  };

  const copyText = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("ok");
    } catch {
      setCopyState("failed");
    }
    close();
  };

  const popupStyle: React.CSSProperties = position
    ? {
        left: Math.max(
          VIEWPORT_MARGIN_PX,
          Math.min(position.x, window.innerWidth - MENU_WIDTH_PX),
        ),
        top: Math.max(
          VIEWPORT_MARGIN_PX,
          Math.min(position.y, window.innerHeight - MENU_HEIGHT_PX),
        ),
      }
    : {};

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onBlur={(event) => {
        // Tab out dismisses (WCAG 2.1.2 — no orphan popup).
        const next = event.relatedTarget;
        if (!next || !wrapperRef.current?.contains(next as Node)) {
          onOpenChange(false, null);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("agents.hosts.session.menuTriggerAria", {
          name: koraSessionName(session),
        })}
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(!open, null);
        }}
        className="inline-flex size-12 md:size-7 items-center justify-center rounded-sm text-foreground-secondary transition-colors duration-instant hover:bg-elevated hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t("agents.hosts.session.menuLabel")}
          style={popupStyle}
          onKeyDown={onKeyDown}
          className={cn(
            "min-w-44 rounded-md border border-border-subtle bg-well p-1 shadow-modal",
            position ? "fixed z-30" : "absolute right-0 top-full z-30 mt-1",
          )}
        >
          <Link
            role="menuitem"
            to={`/kora/${encodeURIComponent(session.id)}`}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
            onClick={() => close(false)}
          >
            <ExternalLink aria-hidden="true" className="size-3.5" />
            <span className="flex-1">{t("agents.hosts.session.openInKora")}</span>
          </Link>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
            onClick={(event) => {
              event.stopPropagation();
              void copyText(
                `${window.location.origin}/kora/${encodeURIComponent(session.id)}`,
              );
            }}
          >
            <Copy aria-hidden="true" className="size-3.5" />
            <span className="flex-1">{t("kora.about.copyLink")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
            onClick={(event) => {
              event.stopPropagation();
              void copyText(session.id);
            }}
          >
            <Copy aria-hidden="true" className="size-3.5" />
            <span className="flex-1">{t("agents.menu.copyId", { id: session.id })}</span>
          </button>
        </div>
      ) : null}

      {/* The clipboard verdict (4.1.3 polite status; the Kora AboutBody
       * grammar). Lives OUTSIDE the popup — the popup unmounts on copy. */}
      {copyState !== "idle" ? (
        <span
          role="status"
          className={cn(
            "pointer-events-none absolute right-0 top-full mt-1 whitespace-nowrap text-xs",
            copyState === "ok" ? "text-success" : "text-error",
          )}
        >
          {copyState === "ok"
            ? t("kora.about.copied")
            : t("kora.about.copyFailed")}
        </span>
      ) : null}
    </div>
  );
}
