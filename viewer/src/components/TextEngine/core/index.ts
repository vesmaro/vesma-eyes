/**
 * text-engine/core — the shared base renderer (ADR 0020 Ф1, layer 2): the
 * single home of the markdown pipeline factory (buildPipeline), the hast
 * utilities, the shared constants and the memoized theme factory
 * (compact/full today; `article` as the Ф2 slot).
 *
 * IMPORT RULES (ADR 0020, layer 3 + contract §3.3):
 * - core is reachable only from renderer modules that own a lazy-chunk
 *   boundary (TextEngine/MarkdownView today; the docs wrapper after Ф2).
 * - The TextEngine barrel (components/TextEngine/index.ts) must NOT
 *   re-export anything from core — the parser stays behind the dynamic
 *   import() (UI-27 chunking contract).
 * - features/docs keeps its own copies until Ф2 (Markdown.tsx untouched in
 *   Ф1); Ф2 delegates DocsMarkdown here and drops the duplication.
 */
export { buildPipeline } from "./pipeline";
export type {
  BuildPipelineInput,
  CorpusRawHtmlConfig,
  EnginePipeline,
  PipelineMode,
} from "./pipeline";
export { themeComponents } from "./theme";
export type { TextEngineTheme } from "./theme";
export { isElement, languageOf, nodeText } from "./hast";
export type { HastishNode } from "./hast";
export {
  LINK_CLASS,
  MONO,
  isAllowedHref,
  isAllowedImageSrc,
} from "./constants";