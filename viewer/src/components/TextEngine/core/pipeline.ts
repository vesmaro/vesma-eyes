import type { Options } from "react-markdown";
import type { Schema } from "hast-util-sanitize";
import remarkGfm from "remark-gfm";

/**
 * Pipeline construction as a function of trust MODE (ADR 0020 Ф1 — «сборка
 * пайплайна как функции от режима»); the unified engine's single pipeline
 * factory — escape-only half.
 *
 * - `escape-only` omits rehype-raw entirely: react-markdown's default
 *   degrades raw HTML to inert text nodes — the untrusted profile adds
 *   nothing on top (SEC-4).
 * - `corpus` (raw → dropSubtrees → sanitize) lives in `./pipeline.corpus` —
 *   a SEPARATE module since Ф2. The split is load-bearing for the chunk
 *   budget, not stylistic: this module must stay statically free of the
 *   sanitize stack (rehype-raw/rehype-sanitize/parse5) so the untrusted
 *   import graph never pulls the `md-sanitize` vendor pool (ADR 0020 Ф2:
 *   «недоверенный путь перестаёт платить за sanitize-стек»). Curated
 *   renderers import buildCorpusPipeline directly from that module — the
 *   barrel (index.ts) deliberately does not re-export it.
 *
 * Ф2 scope: TextEngine/MarkdownView consumes escape-only (via MarkdownView);
 * features/docs/Markdown.tsx is the curated consumer of pipeline.corpus.
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

/**
 * Build the plugin pipeline for a trust mode. The escape-only pipeline is a
 * module-level singleton: react-markdown v10 builds a fresh processor per
 * render (no memoization needed for correctness), and the stable plugin-list
 * identities keep downstream props objects stable under re-renders.
 *
 * Corpus mode is intentionally NOT assembled here (see module doc): it throws
 * fail-closed and points at `./pipeline.corpus`, the module that owns the
 * rehype-raw → drop → sanitize order (АРХКОМ-8) behind the md-sanitize chunk
 * boundary. Ф2 flag: this rejection is the ONE behavioral change to the Ф1
 * signature, and it is unreachable in production — no Ф1 consumer passes
 * corpus mode (core.test.ts pinned that; the corpus tests moved to
 * pipeline.corpus.test.ts).
 */
export function buildPipeline({ mode }: BuildPipelineInput): EnginePipeline {
  if (mode === "corpus") {
    throw new Error(
      "buildPipeline: corpus mode moved to pipeline.corpus (buildCorpusPipeline) — " +
        "importing it here would weld the md-sanitize chunk onto the untrusted path",
    );
  }
  // NO rehype-raw, NO sanitize — nothing runs on the untrusted profile.
  return ESCAPE_ONLY_PIPELINE;
}
