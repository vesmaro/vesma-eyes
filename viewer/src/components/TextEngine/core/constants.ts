import type { CSSProperties } from "react";

/**
 * Shared constants of the unified text engine (ADR 0020 Ф1). Single copy in
 * core; TextEngine's renderer consumes them from here — no second definition
 * anywhere (features/docs keeps its own copy until Ф2 drops the duplication).
 */

/** JetBrains Mono via token (the code font everywhere — docs precedent). */
export const MONO: CSSProperties = { fontFamily: "var(--font-mono)" };

export const LINK_CLASS =
  "text-iris-bright underline underline-offset-2 transition-colors duration-instant hover:decoration-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright";

/** Only these URL schemes may become live links (author content is untrusted). */
export function isAllowedHref(href: string | undefined): boolean {
  return typeof href === "string" && /^(https?:\/\/|mailto:)/i.test(href);
}

/** Images: http(s) absolute only — no data:, no protocol-relative tricks. */
export function isAllowedImageSrc(src: string | undefined): boolean {
  return typeof src === "string" && /^https?:\/\//i.test(src);
}
