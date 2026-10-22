import { useSyncExternalStore } from "react";

/**
 * The Kora frame's viewport seams (kora-rethink states.md §6, KW3 «Узкие и
 * полировка») — the JS half of the responsive ladder. The ladder has THREE
 * regimes and the nav panel's PLACEMENT (not just its CSS) differs between
 * them, so the branch must be a render fact, not a stylesheet one:
 *
 * - ≥xl (1280+): the full THREE-column frame — nav | center | meta, both
 *   width seams live (07l §3).
 * - lg..xl (1024–1279): TWO columns — center + meta; the NAVIGATION blocks
 *   live as sections at the top of the meta panel (ONE panel scroll,
 *   navigation first); the center's chat+«Все ходы» split is kept.
 * - <lg: the document flow (nav card → center card → meta card), the seams
 *   leave, the page scrolls (07l §1.5).
 *
 * Same pattern as features/tasks/boardViewport.ts (UI-22): a client-only
 * SPA, so matchMedia is available on the FIRST client render; the SSR/test
 * snapshot renders the WIDE frame (the historical default — the existing
 * workspace tests keep their three-column DOM). The query strings live
 * beside the `xl:`/`lg:` classes they must agree with — Tailwind's lg=1024,
 * xl=1280; kept in ONE place so a screen change edits both.
 */

/** Tailwind `xl` — the three-column frame (states.md §6). */
export const KORA_WIDE_QUERY = "(min-width: 1280px)";
/** Tailwind `lg` — the 100vh app frame (both lg..xl and xl regimes). */
export const KORA_FRAME_QUERY = "(min-width: 1024px)";

function subscribe(query: string): (onChange: () => void) => () => void {
  return (onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  };
}

const subscribeWide = subscribe(KORA_WIDE_QUERY);
const subscribeFrame = subscribe(KORA_FRAME_QUERY);

/** ≥xl (Tailwind): the nav panel owns its column. Tests/SSR: true. */
export function useIsWideFrame(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(KORA_WIDE_QUERY).matches,
    () => true,
  );
}

/** ≥lg (Tailwind): the 100vh frame is on stage (no page scroll). Tests/SSR:
 * true — the frame, not the document flow, is the documented default. */
export function useIsFrameViewport(): boolean {
  return useSyncExternalStore(
    subscribeFrame,
    () => window.matchMedia(KORA_FRAME_QUERY).matches,
    () => true,
  );
}
