/**
 * TOC anchor navigation (owner directive 2026-10-22, slice D2; review P2).
 *
 * The page scrolls in the WINDOW (Shell.tsx «The page itself still scrolls
 * in the WINDOW on purpose»); the article headings carry `scroll-mt-24`
 * (96px) so a landing position clears the sticky top bar + crumbs row.
 *
 * WHY THE CLICK IS HANDLED PROGRAMMATICALLY — the reproduced root cause
 * (traced on the stand): a same-document fragment entry carries
 * history.state = null, and react-router keys POP locations from
 * history.state.key — null resolves to the shared "default" key, the SAME
 * key the page itself was loaded under. ScrollRestoration then treats the
 * fragment click as a re-visit of the page and «restores» the position
 * just saved for the current entry over the browser's fragment scroll
 * (trace: `window.scrollTo(0, 0)` from the ScrollRestoration layout
 * effect; the second click on the same hash — another "default" entry —
 * finally jumped). Shell's scrollRestorationKey closes that defect class
 * for the router's OWN hash navigations.
 *
 * REVIEW P2 (2026-10-22): the first fix updated the URL with a raw
 * history.pushState copying the current router state — DIAGNOSED AND
 * DROPPED. A pushState entry is invisible to the router's save
 * bookkeeping: the router still believes it is on the hashless entry, so
 * on BACK it saved the CURRENT (anchor) scrollY under the page's key and
 * «restored» it — BACK stayed on the section. No history-state payload
 * can fix that at our layer; the entry must be ROUTER-OWNED. So the click
 * scrolls instantly (deterministic landing, sticky offsets) and the URL
 * update goes through router.navigate() — a real fragment navigation the
 * router keys by pathname+search+hash (own slot, restore misses, nothing
 * re-anchors the reader; BACK/FORWARD restore faithfully through the
 * router's own bookkeeping).
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
  const top =
    element.getBoundingClientRect().top + window.scrollY - HEADING_SCROLL_MARGIN;
  window.scrollTo({ top: Math.max(0, top), behavior: "instant" as ScrollBehavior });
  return true;
}

/**
 * Shared onClick for TOC anchors (regular + api rails and the narrow
 * <details> variant): plain unmodified left-clicks scroll programmatically
 * and sync the URL through the ROUTER (`navigate("#id")` — a router-owned
 * fragment entry); modifier clicks (new tab/window, download…) and
 * non-left buttons keep the browser defaults. A missing target falls
 * through to the native behavior instead of dead-clicking.
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
  navigate: (to: string) => void,
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
  navigate(`#${id}`);
}
