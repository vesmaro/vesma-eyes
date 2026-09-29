import { useCallback, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronUp } from "lucide-react";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { useTaskInbox } from "@/features/tasks/useTasks";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Пульт (07j §4 / 07l §2, union И1 honest cut): the bottom console strip of
 * the central column — 40px, caps «ПУЛЬТ», the [Дайджест | Эфир] segment
 * control, the «ждут владельца: N» badge from the REAL UI-30 inbox counter
 * (the same cache the sidebar badge reads; hidden while the source is
 * pending/failed — a fake 0 would lie; N=0 renders muted, still clickable).
 *
 * И1 decision (dressing map §1.2.3): the Пульт STARTS COLLAPSED — the 07j
 * smart-default (selection → auto-expand on Дайджест) would show an empty
 * tab in И1 (the digest has no source until И4), which is noise pretending
 * to be life. Expansion is an explicit click; the honest tab content:
 * Дайджест — empty-CTA + the REAL «читать транскрипт» action; Эфир — an
 * HonestLine naming what arrives. NO fixture feeds, NO demo pulses (12 §1).
 *
 * Persistence: `vesmaro.koraPanel` = "digest" | "ether" — written ONLY on
 * an explicit tab click (07j §4.2); garbage values reset to the digest
 * default, never throw. The collapsed/expanded state is session-only.
 */

const PANEL_STORAGE_KEY = "vesmaro.koraPanel";
type PultTab = "digest" | "ether";

function readPersistedTab(): PultTab {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    return raw === "ether" ? "ether" : "digest";
  } catch {
    return "digest";
  }
}

function persistTab(tab: PultTab): void {
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, tab);
  } catch {
    // Private mode / storage disabled — the in-memory choice still works.
  }
}

/** The real UI-30 counter: null while unknown (hidden badge), 0 = muted. */
function useWaitingCount(): number | null {
  const inbox = useTaskInbox();
  if (inbox.isPending || inbox.isError) return null;
  return inbox.data?.count ?? null;
}

export function KoraPult({ hasSession }: { hasSession: boolean }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<PultTab>(readPersistedTab);
  const waiting = useWaitingCount();

  // A tab click is EXPLICIT — that is the only thing the persist captures
  // (07j §4.2: «пишется только явным кликом по вкладке»); while collapsed
  // the click also expands (the map's strip carries the tabs).
  const selectTab = useCallback((next: PultTab) => {
    setTab(next);
    setExpanded(true);
    persistTab(next);
  }, []);

  return (
    // Flush seam under the work zone (07l §2 «стык без зазора»): the
    // central column's ONE contour comes from the workspace; the Пульт
    // contributes only the myelin seam.
    <section aria-label={t("kora.pult.title")} className="border-t border-myelin">
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 px-3">
        <span
          title={t("kora.pult.explain")}
          className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary"
        >
          {t("kora.pult.title")}
        </span>
        <div
          role="tablist"
          aria-label={t("kora.pult.tabsLabel")}
          className="flex items-center gap-1"
        >
          <button
            type="button"
            id="kora-pult-tab-digest"
            role="tab"
            aria-selected={tab === "digest"}
            aria-controls="kora-pult-panel"
            onClick={() => selectTab("digest")}
            className={cn(
              "min-h-6 rounded-sm px-2 text-xs transition-colors duration-instant focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
              tab === "digest"
                ? "bg-elevated font-medium text-foreground"
                : "text-foreground-secondary hover:text-foreground",
            )}
          >
            {t("kora.pult.digest")}
          </button>
          <button
            type="button"
            id="kora-pult-tab-ether"
            role="tab"
            aria-selected={tab === "ether"}
            aria-controls="kora-pult-panel"
            onClick={() => selectTab("ether")}
            className={cn(
              "min-h-6 rounded-sm px-2 text-xs transition-colors duration-instant focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
              tab === "ether"
                ? "bg-elevated font-medium text-foreground"
                : "text-foreground-secondary hover:text-foreground",
            )}
          >
            {t("kora.pult.ether")}
          </button>
        </div>
        {/* The strip names what will appear (07j §4.2 invitation) — the
         * non-clickable part never pretends to be an action. */}
        <span className="hidden min-w-0 flex-1 truncate text-xs text-foreground-muted sm:block">
          {t("kora.pult.hint")}
        </span>
        {/* The real inbox badge: hidden when the source is unknown, muted at
         * 0, always a link to the real /tasks/inbox route. */}
        {waiting !== null ? (
          <Link
            to="/tasks/inbox"
            title={t("kora.pult.waitingHint")}
            className={cn(
              "inline-flex min-h-6 items-center rounded-full border border-border-subtle px-2 font-mono text-xs tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
              waiting === 0
                ? "text-foreground-muted"
                : "border-iris/40 text-iris-bright",
            )}
          >
            {t("kora.pult.waiting", { n: waiting })}
          </Link>
        ) : null}
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="kora-pult-body"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex min-h-6 items-center gap-1 rounded-sm px-2 text-xs text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
        >
          {expanded ? (
            <ChevronUp aria-hidden className="size-4" />
          ) : (
            <ChevronDown aria-hidden className="size-4" />
          )}
          {expanded ? t("kora.pult.collapse") : t("kora.pult.expand")}
        </button>
      </div>
      {expanded ? (
        <div id="kora-pult-body" className="border-t border-myelin px-3 py-3">
          <div
            id="kora-pult-panel"
            role="tabpanel"
            aria-labelledby={
              tab === "digest" ? "kora-pult-tab-digest" : "kora-pult-tab-ether"
            }
            className="text-sm text-foreground-secondary"
          >
            {tab === "digest" ? (
              hasSession ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span>{t("kora.pult.digestEmpty")}</span>
                  <a
                    href="#kora-workzone"
                    className="inline-flex min-h-6 items-center text-sm text-iris-bright hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
                  >
                    {t("kora.pult.readTranscript")}
                  </a>
                </div>
              ) : (
                <p>{t("kora.pult.hint")}</p>
              )
            ) : (
              <HonestLine>{t("kora.pult.etherEmpty")}</HonestLine>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
