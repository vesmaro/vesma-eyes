import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTaskInbox } from "@/features/tasks/useTasks";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { KoraResizeHandle, seamPx } from "./KoraResizeHandle";
import { KoraEther } from "./KoraEther";
import type { KoraEtherRow } from "./koraEtherStore";
import {
  KORA_ETHER_DEFAULT,
  KORA_ETHER_MAX,
  KORA_ETHER_MIN,
  KORA_PULT_COLLAPSE_AT,
  KORA_PULT_MAX,
  KORA_PULT_MIN,
  clearKoraPultH,
  readKoraEtherW,
  readKoraPultH,
  writeKoraEtherW,
  writeKoraPultH,
} from "./koraFrameStorage";

/**
 * Пульт (U5 — the v7 стык + 15-WOW §3.2 «два крыла»): the bottom console of
 * the central column, docked flush under the scene (07l §2 — «стык без
 * зазора», the ONE contour is the workspace's). The collapsed state is a
 * 40px strip (caps «ПУЛЬТ» + the REAL «ждут владельца» badge from the UI-30
 * inbox counter); expansion deploys BOTH wings at once — the Дайджест of the
 * selected session on the left, the permanent Эфир on the right — superseding
 * the И1 tabs (the conductor sees the whole hall, not one musician). The
 * wings are separated by their own col-resize seam (the Эфир width, 280–480,
 * persists in `vesmaro.koraEtherW`).
 *
 * Height hardware (07l §3): auto by content (≤280px) or a fixed 160–420px
 * dragged/typed on the TOP seam; a drag/keyboard step below 120px means
 * «свернуть» (гистерезис); dblclick/Home resets to auto (the storage key is
 * removed, not zeroed). Persist = `vesmaro.koraPultH`, written ONLY on
 * commit (drag end / keyboard series end), never per frame. The
 * collapsed/expanded choice stays session-only (the И1 honest cut stands:
 * the Пульт STARTS COLLAPSED — an auto-expanded empty Дайджест would be
 * noise pretending to be life).
 *
 * Honesty unchanged from И1: the Дайджест names its empty state (no source
 * until the relay lands), the badge hides while its source is unknown (a
 * fake 0 would lie), the Эфир feeds ONLY from the real-bus ring.
 */

/** Auto-mode ceiling (07l §3.2: авто по контенту, пол 160, потолок 280). */
const KORA_PULT_AUTO_MAX = 280;

/** The real UI-30 counter: null while unknown (hidden badge), 0 = muted. */
function useWaitingCount(): number | null {
  const inbox = useTaskInbox();
  if (inbox.isPending || inbox.isError) return null;
  return inbox.data?.count ?? null;
}

export function KoraPult({
  hasSession,
  etherRows,
  hostFilter = null,
}: {
  hasSession: boolean;
  etherRows: readonly KoraEtherRow[];
  /** The page's ONE host filter (07j §3.2) — the ether wing follows it. */
  hostFilter?: string | null;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  /** 0 = auto mode (height by content, ≤280px) — the storage key's absence. */
  const [fixedH, setFixedH] = useState<number>(readKoraPultH);
  const [etherW, setEtherW] = useState<number>(readKoraEtherW);
  const waiting = useWaitingCount();

  // The measured auto height feeds the honest aria values in auto mode
  // (07l §3.3: «авто, 264 пикселя»). Unmeasured (older engines/tests) →
  // the valuetext degrades to plain «авто», never a fake number.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [autoH, setAutoH] = useState(0);
  useEffect(() => {
    const el = bodyRef.current;
    if (el === null || !expanded || fixedH !== 0) return;
    const measure = (): void => setAutoH(Math.round(el.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded, fixedH]);

  // The top-seam contract (KoraResizeHandle): a value defines the geometry
  // AND deploys; the collapse line means «свернуть» — and from the strip,
  // a deliberate move deploys (07l §3.2 гистерезис, mirrored for keyboard).
  const onPultValue = useCallback((next: number): void => {
    setFixedH(Math.min(KORA_PULT_MAX, Math.max(KORA_PULT_MIN, next)));
    setExpanded(true);
  }, []);
  const onPultCollapse = useCallback((): void => {
    setExpanded((value) => !value);
  }, []);
  const onPultCommit = useCallback((): void => {
    // Only a deployed fixed height is a persisted user decision; the auto
    // mode is the ABSENCE of the key (07l §3.2).
    if (fixedH > 0) writeKoraPultH(fixedH);
  }, [fixedH]);
  const onPultReset = useCallback((): void => {
    // Reset = auto mode: the key is REMOVED, not zeroed (07l §3.2).
    clearKoraPultH();
    setFixedH(0);
    setExpanded(true);
  }, []);

  const onEtherValue = useCallback((next: number): void => {
    setEtherW(next);
  }, []);
  const onEtherCommit = useCallback((): void => {
    writeKoraEtherW(etherW);
  }, [etherW]);
  const onEtherReset = useCallback((): void => {
    setEtherW(KORA_ETHER_DEFAULT);
    writeKoraEtherW(KORA_ETHER_DEFAULT);
  }, []);

  const pultValue = expanded ? (fixedH > 0 ? fixedH : autoH) : 40;
  const pultValueText = !expanded
    ? t("kora.resize.valueCollapsed", { n: 40 })
    : fixedH > 0
      ? seamPx(fixedH)
      : autoH > 0
        ? t("kora.resize.valueAutoPx", { n: autoH })
        : t("kora.resize.valueAuto");

  return (
    // Flush seam under the scene (07l §2): the workspace's ONE contour
    // carries the outer frame; the Пульт contributes the myelin seams.
    <section aria-label={t("kora.pult.title")} className="relative border-t border-myelin">
      {/* The TOP seam: row-resize on the strip's upper edge (07l §3.1) —
       * lives in both states (a drag down from the strip deploys). */}
      <KoraResizeHandle
        orientation="horizontal"
        label={t("kora.resize.pult.label")}
        tooltip={t("kora.resize.pult.tooltip")}
        min={KORA_PULT_MIN}
        max={KORA_PULT_MAX}
        value={pultValue}
        valueText={pultValueText}
        dragSign={1}
        collapseBelow={KORA_PULT_COLLAPSE_AT}
        onValue={onPultValue}
        onCommit={onPultCommit}
        onReset={onPultReset}
        onCollapse={onPultCollapse}
        className="absolute inset-x-0 top-0 -translate-y-1/2"
      />
      {/* The strip (40px): caps + the real badge + Развернуть. ME-072 №6
       * stands: a pure control row — the wing content lives in the body. */}
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 px-3 sm:flex-nowrap sm:overflow-x-auto">
        <span
          title={t("kora.pult.explain")}
          className="shrink-0 text-xs font-semibold uppercase tracking-wide text-foreground-secondary"
        >
          {t("kora.pult.title")}
        </span>
        <span aria-hidden className="min-w-0 flex-1" />
        {waiting !== null ? (
          <Link
            to="/tasks/inbox"
            title={t("kora.pult.waitingHint")}
            className={cn(
              "inline-flex min-h-6 shrink-0 items-center rounded-full border border-border-subtle px-2 font-mono text-xs tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
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
          className="inline-flex min-h-6 shrink-0 items-center gap-1 rounded-sm px-2 text-xs text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
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
        <div
          id="kora-pult-body"
          ref={bodyRef}
          style={
            {
              height: fixedH > 0 ? fixedH : undefined,
              maxHeight: fixedH > 0 ? undefined : KORA_PULT_AUTO_MAX,
              "--kora-ether-w": `${etherW}px`,
            } as React.CSSProperties
          }
          /* Fixed height wins; auto mode caps at the 280px ceiling and the
           * wings scroll inside (07l §4 — the wing is the scroll container,
           * the frame never grows). Below lg the wings stack (the seam and
           * the ether column leave with the frame geometry). */
          className="relative grid grid-cols-1 border-t border-myelin lg:grid-cols-[minmax(0,1fr)_var(--kora-ether-w)]"
        >
          {/* Wing 1 — the Дайджест of the selected session (honest И1
           * empties; the relay statuses arrive with the real relay). */}
          <div
            id="kora-pult-digest"
            role="region"
            aria-label={t("kora.pult.digest")}
            className="kora-scroll min-h-0 overflow-y-auto px-3 py-3"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
              {t("kora.pult.digest")}
            </p>
            <div className="mt-2 text-sm text-foreground-secondary">
              {hasSession ? (
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
              )}
            </div>
          </div>
          {/* Wing 2 — the permanent Эфир: the real-bus ring, honest empty. */}
          <div
            id="kora-pult-ether"
            role="region"
            aria-label={t("kora.pult.ether")}
            className="min-h-0 overflow-hidden border-t border-myelin px-3 py-3 lg:border-l lg:border-t-0"
          >
            <KoraEther
              rows={etherRows}
              hostFilter={hostFilter}
              className="flex h-full min-h-0 flex-col"
            />
          </div>
          {/* The wings seam (15-WOW §3.2: «свой шов-разделитель внутри
           * Пульта»): the Эфир column width, centered on the grid line. */}
          <KoraResizeHandle
            orientation="vertical"
            label={t("kora.resize.ether.label")}
            tooltip={t("kora.resize.ether.tooltip")}
            min={KORA_ETHER_MIN}
            max={KORA_ETHER_MAX}
            value={etherW}
            valueText={seamPx(etherW)}
            dragSign={1}
            onValue={onEtherValue}
            onCommit={onEtherCommit}
            onReset={onEtherReset}
            className="absolute inset-y-0 left-[var(--kora-ether-w)] hidden -translate-x-1/2 lg:flex"
          />
        </div>
      ) : null}
    </section>
  );
}
