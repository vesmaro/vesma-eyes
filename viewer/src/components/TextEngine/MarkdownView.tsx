import { memo } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import {
  buildPipeline,
  themeComponents,
  type TextEngineTheme,
} from "./core";

/**
 * The markdown renderer behind TextEngine (UI-27) — ONE react-markdown +
 * remark-gfm point for ALL author-content surfaces (memory records, task
 * specs, agent reports). Lives in its own lazy chunk: it is loaded ONLY when
 * a text actually auto-detects as markdown (TextEngine's plain path never
 * renders this module, so preview cards made of plain prose never pay for
 * the parser).
 *
 * Ф1 (ADR 0020): this file now DELEGATES to text-engine/core — the pipeline
 * comes from buildPipeline (escape-only mode: no rehype-raw, no sanitize),
 * the typography from the memoized theme factory (compact/full byte-identical
 * to the pre-Ф1 variantClasses). The lazy-chunk boundary and the public props
 * are unchanged.
 *
 * SECURITY (SEC-4 — memory content is untrusted, never instructions):
 * - NO rehype-raw, NO dangerouslySetInnerHTML: raw HTML in the source is
 *   skipped by react-markdown's default (script/iframe/style/on*)
 *   attributes never reach the DOM.
 * - Link hrefs are whitelisted to http(s)/mailto; every other scheme
 *   (javascript:, data:, vbscript:, …) is stripped — the anchor renders
 *   as inert text, not as a link. External links get target=_blank +
 *   rel=noopener noreferrer nofollow.
 * - Image srcs are whitelisted to http(s); anything else renders nothing
 *   (no data:/relative tracking pixels or protocol tricks).
 * - CSP stays intact: script-src 'self' is never touched.
 *
 * Typography is design-token only (no literal colours/spacings) — the token
 * classes live in core/theme.tsx; both themes are served by the same tokens.
 */

// The untrusted pipeline, built once at module scope (escape-only mode omits
// rehype-raw entirely — see core/pipeline.ts). Module scope = the pipeline
// object is a stable reference for the lifetime of the lazy chunk.
const PIPELINE = buildPipeline({ mode: "escape-only" });

export interface MarkdownViewProps {
  source: string;
  /** compact — card previews; full — details and expanded bodies. */
  variant?: "compact" | "full";
  className?: string;
  /** Font passthrough (mono memories keep --font-mono via the caller). */
  style?: React.CSSProperties;
}

/**
 * Stable identity matters: TextEngine memoizes on props, and the components
 * map is rebuilt only when the variant actually changes (core/theme.tsx
 * caches one map per theme and returns it by reference).
 */
function MarkdownViewImpl({ source, variant = "full", className, style }: MarkdownViewProps) {
  const components = themeComponents(variant as TextEngineTheme);
  return (
    <div
      className={cn(
        // First/last block margins collapse into the container rhythm.
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        variant === "compact" ? "text-sm" : "text-base",
        className,
      )}
      style={style}
    >
      <ReactMarkdown
        remarkPlugins={PIPELINE.remarkPlugins}
        rehypePlugins={PIPELINE.rehypePlugins}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Default-exported for the lazy chunk boundary: TextEngine loads this module
 * via React.lazy(() => import("./MarkdownView")) — plain texts never fetch it.
 */
export const MarkdownView = memo(MarkdownViewImpl);
export default MarkdownView;