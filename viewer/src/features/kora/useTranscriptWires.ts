import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import { koraTranscriptAnchorId } from "./koraWorkspaceModel";

/**
 * The transcript anchor wires (transcript-ux wave, owner directive:
 * «связность логов с ответами») — the state machine BOTH transcript
 * renderers share (zcode scroll + hermes scroll):
 * - `openFolds` — which «Сырой ход» disclosures are open (seq-keyed);
 * - `spotSeq` — the answer currently spotlit (a raw row was clicked);
 * - `jumpToAnswer(seq)` — the one programmatic wire direction; scrolls
 *   honour prefers-reduced-motion (static jump, no smooth glide).
 *
 * The reverse direction (answer → raw walk) needs no wire: the fold
 * summary IS that affordance, adjacent to the answer by construction in
 * both renderers — a programmatic jumpToRawWalk had no consumer (removed
 * with its beat state in ux-hygiene-followups-20261020; обратное
 * направление живёт в ката).
 *
 * The spotlight beat is a STATIC outline held for one attention window —
 * no animation, so the reduced-motion contract pays nothing. Nothing is
 * persisted; the wires are session-local reading aids, never data.
 */

/** How long a spotlight beat lives. */
const SPOTLIGHT_MS = 1600;

/** Respect the reduced-motion contract on programmatic scrolls. */
function scrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

export function useTranscriptWires() {
  const t = useT();
  const [openFolds, setOpenFolds] = useState<ReadonlySet<number>>(() => new Set());
  const [spotSeq, setSpotSeq] = useState<number | null>(null);
  const beatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (beatTimer.current !== null) clearTimeout(beatTimer.current);
    },
    [],
  );

  const startBeat = (apply: () => void) => {
    apply();
    if (beatTimer.current !== null) clearTimeout(beatTimer.current);
    beatTimer.current = setTimeout(() => {
      setSpotSeq(null);
    }, SPOTLIGHT_MS);
  };

  /** Raw row → its answer: scroll the anchor into view + spotlight it. */
  const jumpToAnswer = (seq: number) => {
    startBeat(() => setSpotSeq(seq));
    document
      .getElementById(koraTranscriptAnchorId(seq))
      ?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
  };

  const onFoldToggle = (seq: number, open: boolean) => {
    setOpenFolds((previous) => {
      const next = new Set(previous);
      if (open) next.add(seq);
      else next.delete(seq);
      return next;
    });
  };

  /**
   * The polite announcement for the anchor jump (4.1.3). The 1-based
   * anchor ordinal rides along so two quick jumps NEVER produce the same
   * string — an unchanging live-region line can be skipped by screen
   * readers as a repeat (ux-hygiene-followups-20261020).
   */
  const announce =
    spotSeq !== null ? t("kora.transcript.spotlightAnnounce", { n: spotSeq + 1 }) : "";

  return {
    openFolds,
    spotSeq,
    jumpToAnswer,
    onFoldToggle,
    announce,
  };
}
