/**
 * The ScrollRestoration key contract (review P1, 2026-10-22 — blocking fix
 * for the first geometry attempt): react-router keys saved scroll positions
 * by getKey(location) and restores on it. Two regimes, deliberately:
 *
 * - FRAGMENT locations (hash present) → pathname+search+hash. A
 *   same-document fragment entry carries history.state = null, so the
 *   router would key it "default" — the SAME key the page itself was
 *   loaded under — and ScrollRestoration would «restore» the just-saved
 *   scrollY over the browser's fragment scroll (the reproduced
 *   click-1-doesn't-scroll defect). The hash slot is unique per anchor and
 *   never collides with the page's own entry.
 * - PLAIN locations → the router's location.key. A PUSH to an already
 *   visited page gets a FRESH key: the restore lookup MISSES and the page
 *   lands on top (scrollTo(0, 0)) — the expected navigation feel. Keying
 *   those by pathname+search (the first attempt) broke exactly this: a
 *   revisit inherited the stale offset saved by the previous visit, and
 *   the offset persisted in sessionStorage. A POP keeps the same key it
 *   left with, so back/forward still restore faithfully.
 */
export function scrollRestorationKey(location: {
  hash: string;
  key: string;
  pathname: string;
  search: string;
}): string {
  return location.hash
    ? `${location.pathname}${location.search}${location.hash}`
    : location.key;
}
