import { useSyncExternalStore } from "react";

/**
 * The Kora frame's viewport seam (blueprint-kw4 §6) — the JS half of the
 * responsive ladder. KW4 collapsed the ladder to TWO regimes and only one
 * of them is a render fact (the panel's own width handles lg..xl in CSS —
 * the seam var clamps 240–420, the tree fits at the minimum):
 *
 * - ≥lg (1024+): the TWO-zone 100vh frame — the host FIELD | the «Дерево
 *   и мета» panel, ONE seam (`--kora-right-w`); no page scroll (07l §1.2).
 * - <lg: the document flow (tree card → center card → meta card), the
 *   seams leave, the page scrolls (07l §1.5).
 *
 * Same pattern as features/tasks/boardViewport.ts (UI-22): a client-only
 * SPA, so matchMedia is available on the FIRST client render; the SSR/test
 * snapshot renders the FRAME (the documented default — the workspace tests
 * keep the two-zone DOM). The query string lives beside the `lg:` classes
 * it must agree with — Tailwind's lg=1024; kept in ONE place so a screen
 * change edits both.
 */

/** Tailwind `lg` — the 100vh two-zone frame (blueprint-kw4 §6). */
export const KORA_FRAME_QUERY = "(min-width: 1024px)";

function subscribe(query: string): (onChange: () => void) => () => void {
  return (onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  };
}

const subscribeFrame = subscribe(KORA_FRAME_QUERY);

/** ≥lg (Tailwind): the two-zone frame is on stage (no page scroll). Tests/
 * SSR: true — the frame, not the document flow, is the documented default. */
export function useIsFrameViewport(): boolean {
  return useSyncExternalStore(
    subscribeFrame,
    () => window.matchMedia(KORA_FRAME_QUERY).matches,
    () => true,
  );
}
