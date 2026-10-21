import { useSyncExternalStore } from "react";

/** The board's md seam (Tailwind md = 768px), stated as "is desktop". */
export const BOARD_DESKTOP_QUERY = "(min-width: 768px)";

function subscribeBoardDesktop(onChange: () => void): () => void {
  const mql = window.matchMedia(BOARD_DESKTOP_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * True on/after Tailwind md; SSR/tests render the desktop board. The
 * Sidebar's viewport contract (UI-22): a client-only SPA, so matchMedia is
 * available on the FIRST client render — the phone never sees a
 * wrong-viewport frame; the SSR/test snapshot renders the desktop panel
 * (the historical renderToString behaviour). Kept in ONE place beside the
 * query string so the JS branch and any `max-md:`/`md:` classes agree.
 */
export function useIsDesktopBoard(): boolean {
  return useSyncExternalStore(
    subscribeBoardDesktop,
    () => window.matchMedia(BOARD_DESKTOP_QUERY).matches,
    () => true,
  );
}
