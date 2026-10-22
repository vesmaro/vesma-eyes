import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { HermesTranscript } from "./KoraHermesSource";
import { KoraReadingTools } from "./KoraReadingTools";
import { KoraResizeHandle, seamPx } from "./KoraResizeHandle";
import {
  KORA_BAND_AUTO_MAX,
  KORA_BAND_COLLAPSE_AT,
  KORA_BAND_MAX,
  KORA_BAND_MIN,
  clearKoraMovesH,
  readKoraMovesH,
  writeKoraMovesH,
} from "./koraFrameStorage";
import { useKoraBandHeight } from "./useKoraBandHeight";
import {
  NOOP_KORA_FRAME_EVENTS,
  type KoraFrameEventPoints,
} from "./koraFrameEvents";
import type { KoraHermesTranscriptPages } from "./useKora";

/**
 * The SECONDARY zone «Все ходы» (kora-rethink blueprint §4, KW2 «Живой
 * чат»): the raw transcript under the chat, its DEFAULT the collapsed
 * 40px strip (states.md K-MOVES-COLLAPSED — «свёрнутые ходы = канон»).
 * Expanding deploys the HermesTranscript UNCHANGED — the raw-walk folds,
 * kind tags, reasonings cut, tool-call names, SCARLET, the raw→answer
 * wires, the search with its honest counter; in search mode every cut
 * fold with a match opens (K-MOVES-SEARCH — a match must never hide
 * inside a folded walk). §10.2 gate: this zone re-renders the SAME
 * component the hermes session view served — the grammar is byte-for-byte
 * today's, the snapshots own it.
 *
 * Geometry (the ex-Пульт hardware, moved verbatim): the row-resize seam
 * ABOVE the strip — auto by content ≤280 / fixed 160–420, the <120
 * гистерезис folds, dblclick/Home resets to auto by REMOVING the key,
 * persist ONLY on commit (`vesmaro.koraMovesH`). Drag is instant (07l §0:
 * no size animation, transitions already duration-instant); reduced-motion
 * needs no mirror — sizes never animate.
 *
 * Follow-tail is the ZONE'S OWN (blueprint §8): it pins this scroll only
 * while expanded and the reader is at the bottom; the chat's tail lives in
 * the chat — two autos never fight, «следит развёрнутая зона, пользователь
 * ушёл вверх — не следим» is the scroll-pinning semantics of the shared
 * grammar (a scroll up simply stops the pinning; HermesTranscript owns it).
 *
 * VIRTUALIZATION BACKLOG (blueprint §8 — decide on numbers, not taste; KW3
 * measurement, kw3-shots.mjs, chromium headless 1440×900, mock stand
 * `?hermesMessages=big`): a 720-row / ~163k-char / 6317-node body deploys
 * in 43 ms median (spread 32–73 over 5 runs), long-task median 0 ms (one
 * 62 ms outlier) — pagination remains the only DOM boundary, no
 * virtualization needed; revisit when the median commit on real transcripts
 * passes ~100 ms or long-tasks become systematic (07l §12.4).
 */
export function KoraMovesZone({
  sessionId,
  pages,
  frameEvents = NOOP_KORA_FRAME_EVENTS,
}: {
  /** The transcript's session handle (null = the honest clean slate). */
  sessionId: string | null;
  /** The ONE hoisted messages read (the chat consumes the same pages). */
  pages: KoraHermesTranscriptPages;
  /** The frame telemetry call points (KW3): the zone toggle and the seam
   * commit ride them — a no-op until the taxonomy v1 revision lands. */
  frameEvents?: KoraFrameEventPoints;
}) {
  const t = useT();
  const band = useKoraBandHeight({
    readH: readKoraMovesH,
    writeH: writeKoraMovesH,
    clearH: clearKoraMovesH,
    min: KORA_BAND_MIN,
    max: KORA_BAND_MAX,
    collapsedValue: 40,
  });
  // The zone's OWN follow-tail and search (never the chat's).
  const [follow, setFollow] = useState(true);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matchCount =
    needle === ""
      ? null
      : pages.items.filter((item) => item.content.toLowerCase().includes(needle))
          .length;
  // The honest count: the rows READ so far; a live cursor beyond the loaded
  // pages is a «+», never an invented total.
  const caps = `${t("kora.moves.caps", { n: pages.items.length })}${pages.hasMore ? "+" : ""}`;
  // The honest seam valuetext (07l §3.3): the strip names itself collapsed,
  // the auto mode names «авто» with the measured height, the fixed names px.
  const seamValueText = !band.expanded
    ? t("kora.resize.collapsedPx", { n: 40 })
    : band.fixedH > 0
      ? seamPx(band.fixedH)
      : band.autoH > 0
        ? t("kora.resize.autoPx", { n: band.autoH })
        : t("kora.resize.auto");

  return (
    <section aria-label={t("kora.moves.region")} className="shrink-0">
      {/* The row-resize seam ABOVE the strip (the ex-Пульт hardware): pointer
       * drag + the full keyboard path, instant, persist on commit. Below lg
       * the frame reflows — the seam leaves with the geometry (KW3 tunes the
       * ladder; the strip itself still works). */}
      <KoraResizeHandle
        orientation="horizontal"
        label={t("kora.moves.seamLabel")}
        tooltip={t("kora.moves.seamTooltip")}
        min={KORA_BAND_MIN}
        max={KORA_BAND_MAX}
        value={band.seamValue}
        valueText={seamValueText}
        dragSign={1}
        collapseBelow={KORA_BAND_COLLAPSE_AT}
        onValue={band.onValue}
        onCommit={() => {
          band.onCommit();
          frameEvents.seamCommitted("moves");
        }}
        onReset={band.onReset}
        onCollapse={band.collapse}
        className="hidden h-6 w-full lg:flex"
      />
      {/* The 40px strip: caps + count (+ Развернуть/Свернуть). aria-expanded
       * carries the state; aria-controls binds the body. duration-instant —
       * no size animation (07l §0). */}
      <button
        type="button"
        aria-expanded={band.expanded}
        aria-controls="kora-moves-body"
        onClick={() => {
          // `to` is the state AFTER the click (the fact, not the intent).
          frameEvents.movesZoneToggled(band.expanded ? "collapsed" : "expanded");
          band.toggle();
        }}
        className={cn(
          "flex h-10 min-h-12 w-full items-center gap-2 border-t border-myelin px-4 text-left text-xs font-semibold uppercase tracking-wide text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright md:min-h-10",
        )}
      >
        <span className="min-w-0 truncate font-mono tabular-nums">{caps}</span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 normal-case">
          {band.expanded ? (
            <>
              <ChevronUp aria-hidden className="size-3.5" />
              {t("kora.moves.collapse")}
            </>
          ) : (
            <>
              <ChevronDown aria-hidden className="size-3.5" />
              {t("kora.moves.expand")}
            </>
          )}
        </span>
      </button>
      {band.expanded ? (
        <div
          id="kora-moves-body"
          ref={band.bodyRef}
          className="flex min-h-0 flex-col overflow-hidden border-t border-myelin"
          style={{
            height: band.fixedH > 0 ? band.fixedH : undefined,
            maxHeight: band.fixedH > 0 ? undefined : KORA_BAND_AUTO_MAX,
          }}
        >
          <KoraReadingTools
            follow={follow}
            onFollow={() => setFollow((value) => !value)}
            query={query}
            onQuery={setQuery}
            matchCount={matchCount}
            inputId="kora-moves-search"
          />
          <div className="kora-scroll mt-1 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <HermesTranscript
              sessionId={sessionId ?? "none"}
              pages={pages}
              follow={follow}
              query={query}
            />
            {pages.error !== null ? (
              <div className="mt-2 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void pages.refetch()}
                >
                  {t("common.retry")}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
