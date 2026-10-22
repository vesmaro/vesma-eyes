/**
 * TOC anchor navigation (owner directive 2026-10-22, slice D2).
 *
 * The page scrolls in the WINDOW (Shell.tsx «The page itself still scrolls
 * in the WINDOW on purpose»); the article headings carry `scroll-mt-24`
 * (96px) so a landing position clears the sticky top bar + crumbs row.
 *
 * Why clicks are handled PROGRAMMATICALLY instead of relying on the native
 * fragment jump — the reproduced root cause (traced on the stand): a
 * same-document fragment navigation creates a history entry whose
 * history.state is NULL, and react-router keys POP locations from
 * history.state.key — null → the shared "default" key, the SAME key the
 * page itself was loaded under. ScrollRestoration then treats the fragment
 * click as a re-visit of the page: it «restores» the position just saved
 * for the current entry (scrollY at click time) and calls
 * window.scrollTo(0, that) — cancelling the native fragment scroll (trace:
 `scrollTo(0, 0)` from the ScrollRestoration layout effect; the second
 * click on the same hash — another "default" entry — finally jumped).
 * Shell.tsx additionally passes a hash-aware ScrollRestoration getKey so
 * the whole defect CLASS dies for every hash link; this handler keeps the
 * TOC itself instant, sticky-offset aware and repeat-click safe.
 */

/** The `scroll-mt-24` the article headings carry — the sticky-chrome offset. */
const HEADING_SCROLL_MARGIN = 96;

/**
 * Instant scroll of the WINDOW to a heading, sticky offsets applied.
 * Focus deliberately STAYS on the invoking TOC link: the article re-renders
 * (and its markdown elements remount) on every scroll-spy section change —
 * a focus moved onto a heading would be silently dropped to <body> on the
 * next crossing. The link-held focus is the coherent TOC-browsing pattern
 * (Tab/arrow along the rail, aria-current announces the section).
 * `behavior: "instant"` deliberately overrides the html smooth-scroll rule
 * (global.css §13): a TOC jump is navigation chrome — the deterministic
 * landing (and the immediate scroll-spy feedback) beats a multi-thousand-
 * pixel animation. Returns false when the target is not in the DOM.
 */
export function scrollToHeading(id: string): boolean {
  if (typeof document === "undefined") return false;
  const element = document.getElementById(id);
  if (element === null) return false;
  const top = element.getBoundingClientRect().top + window.scrollY - HEADING_SCROLL_MARGIN;
  window.scrollTo({ top: Math.max(0, top), behavior: "instant" as ScrollBehavior });
  return true;
}

/**
 * Shared onClick for TOC anchors (regular + api rails and the narrow
 * <details> variant): plain unmodified left-clicks scroll programmatically;
 * modifier clicks (new tab/window, download…) and non-left buttons keep
 * the browser defaults. A missing target falls through to the native
 * behavior instead of dead-clicking.
 */
export function handleTocClick(
  event: {
    defaultPrevented: boolean;
    button: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    preventDefault(): void;
  },
  id: string,
): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  if (!scrollToHeading(id)) return; // not rendered yet — native fallback
  event.preventDefault();
  // Silent URL sync (copy/paste, history depth): pushState does not emit
  // popstate, so the router and its ScrollRestoration never see it —
  // nothing re-anchors the page out from under the reader.
  window.history.pushState(window.history.state, "", `#${id}`);
}
