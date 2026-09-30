import type { CSSProperties } from "react";

/**
 * Shared constants of the unified text engine (ADR 0020 Ф1). Single copy in
 * core — since Ф3 the docs feature consumes THESE constants too (the Ф2
 * copy-paste is gone; the last class-string duplicates were single-homed
 * here in Ф3). Import this module DIRECTLY (not the core barrel) from
 * non-renderer consumers: a constants import carries zero runtime deps,
 * while the barrel would pull the remark-gfm stack into the consumer's chunk
 * (the DocsSearch precedent, ME-019 review P2-3).
 */

/** JetBrains Mono via token (the code font everywhere — docs precedent). */
export const MONO: CSSProperties = { fontFamily: "var(--font-mono)" };

/**
 * The shared focus ring — single home since Ф3 (it was copy-pasted across
 * four docs-chrome files before). Part of LINK_CLASS; also imported standalone
 * by docs chrome (hub/category rows, sidebar) via THIS zero-dep module.
 */
export const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright";

export const LINK_CLASS =
  "text-iris-bright underline underline-offset-2 transition-colors duration-instant hover:decoration-2 " +
  FOCUS_RING;

/**
 * Search-hit <mark> styling (design spec §6) — the article profile's mark
 * theme AND the docs search UI's highlight class. Lives in constants (not
 * theme.tsx) so non-renderer consumers (DocsSearch) import THIS file alone:
 * a constants import carries zero runtime deps, while the core barrel would
 * pull the remark-gfm stack into the search chunk (ME-019 review P2-3).
 */
export const ARTICLE_MARK_CLASS =
  "rounded-sm bg-iris-tint px-0.5 text-foreground";

/** Only these URL schemes may become live links (author content is untrusted). */
export function isAllowedHref(href: string | undefined): boolean {
  return typeof href === "string" && /^(https?:\/\/|mailto:)/i.test(href);
}

/** Images: http(s) absolute only — no data:, no protocol-relative tricks. */
export function isAllowedImageSrc(src: string | undefined): boolean {
  return typeof src === "string" && /^https?:\/\//i.test(src);
}
