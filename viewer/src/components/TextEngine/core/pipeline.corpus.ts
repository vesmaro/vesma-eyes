import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { isElement } from "./hast";
import type { HastishNode } from "./hast";
import type { CorpusRawHtmlConfig, EnginePipeline } from "./pipeline";

/**
 * The CORPUS (curated) pipeline — rehype-raw → dropSubtrees → rehype-sanitize
 * (ADR 0020 Ф2): the one module allowed to import the sanitize stack, living
 * behind the `md-sanitize` vendor-chunk boundary.
 *
 * WHY A SEPARATE MODULE: core/pipeline.ts serves the untrusted profile, whose
 * import graph must never pull rehype-raw/rehype-sanitize/parse5 — after Ф2
 * only the curated docs path pays for sanitization (ADR 0020 Consequences:
 * «недоверенный путь перестаёт платить за sanitize-стек»). The split is
 * mechanical, not stylistic: a barrel re-export from core/index.ts would weld
 * this module onto TextEngine's lazy chunk, so curated renderers import
 * buildCorpusPipeline DIRECTLY from here. ESLint pins this file as the single
 * rehype-raw/rehype-sanitize import site in src.
 *
 * The ORDER below IS the security model (АРХКОМ-8): raw HTML must exist as
 * nodes BEFORE the sanitizer prunes them — sanitize-first would sanitize
 * nothing (raw text nodes are inert), raw-without-sanitize is the hole the
 * first wave's gate existed to prevent. The subtree-drop runs between them:
 * script/style/iframe vanish whole so their source never leaks as text.
 *
 * The call-site that SUPPLIES the config (drop list + schema) stays in
 * features/docs/Markdown.tsx — the curated profile's governance point.
 */

/** Cache keyed by the exact corpus config (drop list + schema identity). */
const corpusCache = new Map<CorpusRawHtmlConfig, EnginePipeline>();

/**
 * Build the curated raw-HTML pipeline. The same config returns the same
 * cached arrays: react-markdown v10 builds a fresh processor per render (no
 * memoization needed for correctness), but stable plugin-list identities keep
 * downstream props objects stable under re-renders. `rawHtml` must be a
 * stable module-level object — never an inline literal in render.
 */
export function buildCorpusPipeline(rawHtml: CorpusRawHtmlConfig): EnginePipeline {
  const cached = corpusCache.get(rawHtml);
  if (cached) return cached;

  const { dropSubtrees, schema } = rawHtml;
  const dropped = new Set(dropSubtrees);

  const rehypeDropSubtrees = () => (tree: HastishNode) => {
    const walk = (node: HastishNode) => {
      const children = node.children;
      if (children === undefined) return;
      const kept: HastishNode[] = [];
      for (const child of children) {
        if (isElement(child) && dropped.has(child.tagName ?? "")) continue;
        walk(child);
        kept.push(child);
      }
      (node as { children?: HastishNode[] }).children = kept;
    };
    walk(tree);
  };

  const built: EnginePipeline = {
    // remark layer — GFM everywhere, same as the untrusted profile.
    remarkPlugins: [remarkGfm],
    // The order IS the security model (АРХКОМ-8), pinned once here.
    rehypePlugins: [rehypeRaw, rehypeDropSubtrees, [rehypeSanitize, schema]],
  };
  corpusCache.set(rawHtml, built);
  return built;
}
