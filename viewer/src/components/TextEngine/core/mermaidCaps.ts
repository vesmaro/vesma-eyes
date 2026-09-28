import { unified } from "unified";
import remarkParse from "remark-parse";

/**
 * Hard size caps for mermaid on the UNTRUSTED profile (ADR 0020 Amendment 1,
 * ratified by the owner 2026-09-25, protective condition 2).
 *
 * The curated docs profile carries NO caps: its content is build-time
 * trusted and gated by the corpus integrity tests. Author content (agent
 * reports, memory records, task specs) is untrusted, so before the engine
 * spends a diagram render (and the 450 KiB lazy chunk load) on a fence, the
 * fence must pass these mechanical limits. Exceeding a cap is an HONEST
 * inert fallback — the fence renders as a plain code block, source fully
 * visible — never silent degradation and never a crash.
 *
 * Values (fixed here, not tuning knobs):
 * - FENCE CHARS  = 10_000 — generous for real agent diagrams (a large
 *   flowchart/sequence diagram is 1–3 KB; 10 KB ≈ many hundreds of edges),
 *   yet 2× under the app's own mermaid maxTextSize (20_000, the АРХКОМ-8
 *   constant exported from core/Mermaid.tsx — upstream's default is 50_000)
 *   so a hopeless fence is cut BEFORE the library chunk even loads.
 * - FENCES/SURFACE = 5 — far above any real report (1–2 diagrams); bounds
 *   the per-surface render passes, including the on-line theme-switch
 *   redraw of every mounted diagram (MutationObserver re-render).
 *   Worst case per surface: 5 × 10 KB = 50 KB of mermaid input.
 *
 * Both caps fail in the SAFE direction: a verdict can only refuse to render
 * (honest fallback), never render more than the budget allows.
 */

/** Max chars of a single mermaid fence body on the untrusted profile. */
export const MERMAID_UNTRUSTED_MAX_FENCE_CHARS = 10_000;

/** Max mermaid fences rendered as diagrams on ONE untrusted surface. */
export const MERMAID_UNTRUSTED_MAX_FENCES_PER_SURFACE = 5;

/** Per-fence size verdict (pure; the honest fallback is the caller's). */
export function fenceExceedsSizeCap(code: string): boolean {
  return code.length > MERMAID_UNTRUSTED_MAX_FENCE_CHARS;
}

/**
 * The fence COUNTER — same parser as the renderer (ME-013 review P1-1).
 *
 * The renderer intercepts a fence when react-markdown (remark-gfm over
 * micromark/remark-parse) produces a `code` node whose `lang` the mdast→hast
 * conversion turns into `language-mermaid` (hast.ts `languageOf` compares
 * EXACTLY, case included). Counting through the same parse removes the
 * entire scan-vs-parser drift class the review flagged: a line-regex missed
 * container-nested fences (blockquote `> ```mermaid`, list items — CommonMark
 * parses both into `code` nodes the renderer happily intercepts), letting N
 * diagrams render against a count of zero.
 *
 * A BARE `unified().use(remarkParse)` processor, not the engine pipeline:
 * fences are core CommonMark — remark-gfm (both profiles' remark layer)
 * adds tables/strikethrough/task lists and does not touch fence parsing —
 * and the caps module must not couple to the pipeline cache or the trust
 * modes. Same tokenization guarantees, minimal surface. `parse()` is
 * synchronous; the processor is frozen once at module scope.
 *
 * `lang` matching mirrors the renderer's predicate EXACTLY: mdast-util-to-hast
 * builds `language-` + `node.lang.split(/\s+/)[0]` (case kept), so the first
 * whitespace-separated word is the language. Whitespace can arrive from
 * character references too — micromark decodes them in info strings
 * (```mermaid&#32;x → lang "mermaid x"), which still RENDERS — an
 * exact-equality counter would undercount that shape back into the P1 the
 * review flagged (ME-013 review NF1). `&#32;mermaid` (leading space) splits
 * to an empty first word on BOTH sides — inert, consistently.
 */
const FENCE_COUNTER = unified().use(remarkParse);

/** Minimal structural mdast shape (no transitive type imports). */
interface MdastNode {
  type?: string;
  lang?: string | null;
  children?: readonly MdastNode[];
}

export function countMermaidFences(source: string): number {
  const tree = FENCE_COUNTER.parse(source) as MdastNode;
  let count = 0;
  const walk = (node: MdastNode): void => {
    if (
      node.type === "code" &&
      typeof node.lang === "string" &&
      node.lang.split(/\s+/)[0] === "mermaid"
    ) {
      count += 1;
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return count;
}
