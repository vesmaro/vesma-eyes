import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import { koraTranscriptAnchorId, koraTranscriptFoldId } from "./koraWorkspaceModel";

/**
 * The transcript anchor wires (transcript-ux wave, owner directive:
 * «связность логов с ответами») — the state machine BOTH transcript
 * renderers share (zcode scroll + hermes scroll):
 * - `openFolds` — which «Сырой ход» disclosures are open (seq-keyed);
 * - `spotSeq` — the answer currently spotlit (a raw row was clicked);
 * - `flashFold` — the fold currently flashing (the answer's jump was used);
 * - `jumpToAnswer(seq)` / `jumpToRawWalk(seq)` — the two wire directions;
 *   scrolls honour prefers-reduced-motion (static jump, no smooth glide).
 *
 * Beats are STATIC outlines/tints held for one attention window — no
 * animation, so the reduced-motion contract pays nothing. Nothing is
 * persisted; the wires are session-local reading aids, never data.
 */

/** How long a spotlight/flash beat lives. */
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
  const [flashFold, setFlashFold] = useState<number | null>(null);
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
      setFlashFold(null);
    }, SPOTLIGHT_MS);
  };

  /** Raw row → its answer: scroll the anchor into view + spotlight it. */
  const jumpToAnswer = (seq: number) => {
    startBeat(() => setSpotSeq(seq));
    document
      .getElementById(koraTranscriptAnchorId(seq))
      ?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
  };

  /** Answer → its raw walk: open the fold, scroll it into view + flash. */
  const jumpToRawWalk = (seq: number) => {
    setOpenFolds((previous) => new Set(previous).add(seq));
    startBeat(() => setFlashFold(seq));
    requestAnimationFrame(() => {
      document
        .getElementById(koraTranscriptFoldId(seq))
        ?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
    });
  };

  const onFoldToggle = (seq: number, open: boolean) => {
    setOpenFolds((previous) => {
      const next = new Set(previous);
      if (open) next.add(seq);
      else next.delete(seq);
      return next;
    });
  };

  /** The polite announcement for the anchor jump (4.1.3). */
  const announce = spotSeq !== null ? t("kora.transcript.spotlightAnnounce") : "";

  return {
    openFolds,
    spotSeq,
    flashFold,
    jumpToAnswer,
    jumpToRawWalk,
    onFoldToggle,
    announce,
  };
}
