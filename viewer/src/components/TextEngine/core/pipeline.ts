import type { Options } from "react-markdown";
import type { Schema } from "hast-util-sanitize";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { isElement } from "./hast";
import type { HastishNode } from "./hast";

/**
 * Pipeline construction as a function of trust MODE (ADR 0020 Ф1 — «сборка
 * пайплайна как функции от режима»); the unified engine's single pipeline
 * factory.
 *
 * - `escape-only` omits rehype-raw entirely: react-markdown's default
 *   degrades raw HTML to inert text nodes — the untrusted profile adds
 *   nothing on top (SEC-4).
 * - `corpus` wires rehype-raw → rehypeDropSubtrees → rehype-sanitize(schema)
 *   exactly as today's curated docs pipeline (АРХКОМ-8: the ORDER is the
 *   security model — raw must exist as nodes before sanitize prunes, and
 *   script/style/iframe vanish whole so their source never leaks as text).
 *
 * Ф1 scope: only TextEngine's escape-only renderer consumes this (via
 * MarkdownView). features/docs/Markdown.tsx keeps its own pipeline until Ф2
 * moves it onto the core wrapper — this module pins the TARGET shape so the
 * Ф2 diff is a delegation, not a rewrite. The rehype-raw/rehype-sanitize
 * imports sit OUTSIDE the ESLint docs-feature gates (they scope
 * src/features/docs/**), and no Ф1 consumer passes corpus mode.
 */

/** Raw-HTML handling mode of a pipeline (trust is the import, never data). */
export type PipelineMode = "escape-only" | "corpus";

export interface CorpusRawHtmlConfig {
  /**
   * Element subtrees removed WHOLE before sanitize (script/style/iframe —
   * hast-util-sanitize would otherwise replace them with their children and
   * leak their source as visible text; АРХКОМ-8 hostile gate).
   */
  dropSubtrees: readonly string[];
  /** The sanitize schema — the security boundary (one schema, always applied). */
  schema: Schema;
}

export interface BuildPipelineInput {
  mode: PipelineMode;
  /** Required in corpus mode (raw-HTML capability); ignored in escape-only. */
  rawHtml?: CorpusRawHtmlConfig;
}

type PluginList = NonNullable<Options["remarkPlugins"]>;

export interface EnginePipeline {
  /** remark layer — GFM everywhere (tables, task lists, strikethrough). */
  remarkPlugins: PluginList;
  /** rehype layer — empty in escape-only; raw → drop → sanitize in corpus. */
  rehypePlugins: PluginList;
}

const REMARK_GFM_ONLY: PluginList = [remarkGfm];
const EMPTY_REHYPE: PluginList = [];

/** The one escape-only pipeline — created once, returned by reference. */
const ESCAPE_ONLY_PIPELINE: EnginePipeline = {
  remarkPlugins: REMARK_GFM_ONLY,
  rehypePlugins: EMPTY_REHYPE,
};

/** Cache keyed by the exact corpus config (drop list + schema identity). */
const corpusCache = new Map<CorpusRawHtmlConfig, EnginePipeline>();

/**
 * Build the plugin pipeline for a trust mode. The same mode/config returns
 * the same cached arrays: react-markdown v10 builds a fresh processor per
 * render (no memoization needed for correctness), but stable plugin-list
 * identities keep downstream props objects stable under re-renders.
 * `rawHtml` must be a stable module-level object — never an inline literal
 * in render.
 */
export function buildPipeline({ mode, rawHtml }: BuildPipelineInput): EnginePipeline {
  if (mode === "escape-only") {
    // NO rehype-raw, NO sanitize — nothing runs on the untrusted profile.
    return ESCAPE_ONLY_PIPELINE;
  }

  if (!rawHtml) {
    throw new Error(
      "buildPipeline: corpus mode requires rawHtml { dropSubtrees, schema }",
    );
  }
  const cached = corpusCache.get(rawHtml);
  if (cached) return cached;

  const { dropSubtrees, schema } = rawHtml;
  const dropped = new Set(dropSubtrees);

  // Verbatim from features/docs/Markdown.tsx (Ф2 moves the call here).
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
    remarkPlugins: REMARK_GFM_ONLY,
    // The order IS the security model (АРХКОМ-8), pinned once here.
    rehypePlugins: [rehypeRaw, rehypeDropSubtrees, [rehypeSanitize, schema]],
  };
  corpusCache.set(rawHtml, built);
  return built;
}
