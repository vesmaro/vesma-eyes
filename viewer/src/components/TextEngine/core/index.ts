/**
 * text-engine/core — the shared base renderer (ADR 0020 Ф1, layer 2): the
 * single home of the markdown pipeline factory (buildPipeline), the hast
 * utilities, the shared constants and the memoized theme factory
 * (compact/full) plus the article typography factory (articleComponents —
 * the Ф2 docs branch).
 *
 * IMPORT RULES (ADR 0020, layer 3 + contract §3.3):
 * - core is reachable only from renderer modules that own a lazy-chunk
 *   boundary (TextEngine/MarkdownView; the docs wrapper after Ф2).
 * - The TextEngine barrel (components/TextEngine/index.ts) must NOT
 *   re-export anything from core — the parser stays behind the dynamic
 *   import() (UI-27 chunking contract).
 * - THIS barrel is the UNTRUSTED-SAFE import point: everything it re-exports
 *   is statically free of the sanitize stack. The curated pipeline lives in
 *   `./pipeline.corpus` (buildCorpusPipeline) and is deliberately NOT
 *   re-exported here — importing it pulls the md-sanitize vendor pool, so
 *   only curated renderers (features/docs/Markdown.tsx) import that module
 *   directly (ADR 0020 Ф2 chunk split; ESLint pins pipeline.corpus.ts as the
 *   single rehype-raw/rehype-sanitize site).
 */
export { buildPipeline } from "./pipeline";
export type {
  BuildPipelineInput,
  CorpusRawHtmlConfig,
  EnginePipeline,
  PipelineMode,
} from "./pipeline";
export { themeComponents, articleComponents } from "./theme";
export type { ArticleThemeHooks, TextEngineTheme } from "./theme";
export { isElement, languageOf, nodeText } from "./hast";
export type { HastishNode } from "./hast";
export {
  ARTICLE_MARK_CLASS,
  LINK_CLASS,
  MONO,
  isAllowedHref,
  isAllowedImageSrc,
} from "./constants";
