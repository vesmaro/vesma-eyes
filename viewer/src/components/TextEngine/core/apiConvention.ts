/**
 * API-reference CONVENTION detection for the article (curated docs)
 * typography — owner directive 2026-10-22, slice D3 «engine-semantic-style»:
 * the api-board presentation style (docs-api-readability wave — method
 * chips, endpoint cards, labeled parameter sections — the owner's approved
 * reference) must apply AUTOMATICALLY, by convention, on every docs page
 * including upstream mirrors, with ZERO changes to the content files.
 *
 * THE DETECTION RULES (conservative — an unstyled block is always preferred
 * over a false positive; corpus-verified, see apiConvention.test.ts):
 *
 * 1. ENDPOINT HEADINGS — `parseEndpointHeading`: the heading text, after
 *    inline-markdown stripping (backticks/links/emphasis), must be
 *    EXACTLY «METHOD /path»:
 *      - METHOD ∈ get|put|post|patch|delete (case-insensitive; the chip
 *        renders the lowercase form — the accessible name keeps the full
 *        heading text INCLUDING the enumeration prefix, colour is never
 *        the sole carrier);
 *      - path is a single token starting with "/" (no spaces — a trailing
 *        prose word kills the match: «GET /etc/hosts back» stays plain);
 *      - ONE tolerated prefix: an enumeration marker «N.» / «N) » (the
 *        mnemos A2A mirror numbers its endpoints: «1. POST /v1/sessions»).
 *    Corpus calibration: every one of the 272 h2/h3 headings matching this
 *    shape across the whole corpus lives in upstream API mirrors; the
 *    curated en/ru corpus has zero matches. ATX only: `extractHeadings`
 *    and the card split parse «#» headings; a setext endpoint heading
 *    (underlined with ===/---) would still chip via the rendered-heading
 *    branch but get NO TOC entry and NO card — a theoretical class with
 *    zero occurrences in the corpus, left honestly unstyled.
 *
 * 2. PARAMETER SECTION HEADINGS (h4) — `isParameterSectionHeading`: a
 *    FIXED vocabulary of reference-section labels (Параметры/Parameters,
 *    Тело запроса/Request body, Ответ/Ответы/Response(s),
 *    Пример(ы)/Example(s) + qualified forms «Пример запроса», «Request
 *    body (optional)»), prefix-matched on a word boundary after inline
 *    stripping and lowercasing. H4s outside the vocabulary («Замечания»,
 *    «MemoryManager», «Ответственность») keep the factory look — the label
 *    style is applied by the ENGINE only inside the convention's own
 *    context, never page-wide.
 *
 * 3. ENDPOINT CARDS — `splitConventionSections`: a fence-aware body split
 *    on top-level h2/h3 (the SAME heading + fence discipline as
 *    extractHeadings, so TOC anchors and rendered ids stay in agreement).
 *    A section is a CARD iff its own heading parses as an endpoint; all
 *    other sections (preamble, group headers, schema appendices) stay
 *    plain. Returns null when the body has NO endpoint sections — the
 *    caller renders single-pass and the DOM is byte-identical to the
 *    pre-convention renderer (golden-pinned).
 *
 * SCOPE: the article (curated docs) branch ONLY. The untrusted profile
 * (compact/full — escape-only, ADR 0020 SEC-4) never enters this module:
 * no pipeline change, no new capability, the sanitizer boundary untouched.
 * Chips/cards are React DOM wrappers, never raw HTML.
 *
 * Single-source note: features/docs/apiDocs.ts re-exports the endpoint
 * parsing from here (its public surface is pinned by apiPresentation
 * tests); features/docs/headingSlug.ts re-exports inlineMarkdownToText.
 * Pure, JSX-free, zero module dependencies — react-refresh safe.
 */

export type HttpMethod = "get" | "put" | "post" | "patch" | "delete";

export const HTTP_METHODS: readonly HttpMethod[] = [
  "get",
  "put",
  "post",
  "patch",
  "delete",
];

export interface ApiEndpointHeading {
  method: HttpMethod;
  path: string;
}

/**
 * Strip inline markdown so heading TEXT (and its parses) are plain. Moved
 * here from features/docs/headingSlug.ts (D3): the convention parser runs
 * on RAW markdown heading lines and needs the same stripping the TOC
 * extractor applies — one implementation, both consumers.
 *
 * CODE SPANS ARE PROTECTED (D3 anchor-contract fix): the `` ` ``
 * contents are preserved verbatim while the emphasis cleanup (`*`/`_`)
 * runs, then restored. The old blanket `[*_]` strip deleted underscores
 * INSIDE code spans, so a heading like "`PATCH` `/api/hooks/{rule_id}`"
 * produced a TOC id («…ruleid») that never matched the RENDERED heading id
 * («…rule_id», which keeps the code-span text) — every underscore-bearing
 * endpoint row in the TOC was a dead link. The rendered heading text is
 * the source of truth; the extractor now agrees with it.
 */
/** Code-span mask marker: NUL + index + NUL (NUL never survives in text). */
const CODE_MASK = "\u0000";
const CODE_MASK_RE = new RegExp(`${CODE_MASK}(\\d+)${CODE_MASK}`, "g");

export function inlineMarkdownToText(line: string): string {
  const codes: string[] = [];
  const masked = line.replace(/`([^`]*)`/g, (_match, code: string) => {
    codes.push(code);
    return `${CODE_MASK}${codes.length - 1}${CODE_MASK}`;
  });
  return (
    masked
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      // Underscore emphasis ONLY at word boundaries — CommonMark forbids
      // intraword `_` emphasis, so `session_id`, `{rule_id}` paths survive
      // verbatim. (The old blanket `[*_]` sweep mangled every snake_case
      // token, in rendered heading text twice over.) A leftover stray
      // marker is tolerated — a visible asterisk beats a broken API path.
      .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, "$1$2")
      .replace(CODE_MASK_RE, (_match, index: string) => codes[Number(index)] ?? "")
      .trim()
  );
}

/** "GET /api/memories" → { get, /api/memories }; anything else → null. */
const ENDPOINT_RE = /^(?:\d+[.)]\s+)?([A-Za-z]+)\s+(\/\S+)\s*$/;

/**
 * The enumeration marker of an endpoint heading, verbatim ("1. ") — the
 * chip heading renders it BEFORE the chip so the accessible name keeps the
 * full heading text (review P3: the prefix is part of the mirror's heading,
 * dropping it changed the accessible name). Single source with ENDPOINT_RE.
 */
export function enumerationPrefix(text: string): string {
  return /^(?:\d+[.)]\s+)?/.exec(inlineMarkdownToText(text))?.[0] ?? "";
}

/** See module docstring rule 1. Raw heading text in (inline md allowed). */
export function parseEndpointHeading(text: string): ApiEndpointHeading | null {
  const match = ENDPOINT_RE.exec(inlineMarkdownToText(text));
  if (match === null) return null;
  const method = match[1].toLowerCase();
  if (!HTTP_METHODS.includes(method as HttpMethod)) return null;
  return { method: method as HttpMethod, path: match[2] };
}

/**
 * Parameter/reference section labels — rule 2. Prefix + word-boundary:
 * «Пример запроса», «Request body (optional)», «Ответ — 201» match;
 * «Ответственность», «Замечания», «MemoryManager» do not.
 */
const PARAM_SECTION_PREFIXES: readonly string[] = [
  // EN
  "parameters",
  "request body",
  "response",
  "responses",
  "example",
  "examples",
  "configuration",
  // RU
  "параметры",
  "тело запроса",
  "ответ",
  "ответы",
  "пример",
  "примеры",
  "конфигурация",
];

/** See module docstring rule 2. Raw heading text in (inline md allowed). */
export function isParameterSectionHeading(text: string): boolean {
  const plain = inlineMarkdownToText(text).toLowerCase();
  if (plain === "") return false;
  return PARAM_SECTION_PREFIXES.some(
    (prefix) => plain === prefix || plain.startsWith(`${prefix} `),
  );
}

/** The reference endpoint-card chrome (byte-identical in both consumers). */
export const ENDPOINT_CARD_CLASS =
  "my-6 rounded-md border border-border-subtle bg-well p-4 sm:p-5";

/**
 * Chip = border + text in one semantic colour; bg stays the card surface
 * (the api-board reference mapping — moved here as the single home in D3;
 * features/docs/apiPresentation.tsx imports it).
 */
export const METHOD_CHIP_CLASS: Record<HttpMethod, string> = {
  get: "border-iris-bright text-iris-bright",
  post: "border-success text-success",
  put: "border-warning text-warning",
  patch: "border-warning text-warning",
  delete: "border-error text-error",
};

/** Top-level headings the convention flow splits on — h2/h3, as the TOC. */
const CONVENTION_HEADING_RE = /^(#{2,3})\s+(.+?)\s*#*\s*$/;

export interface ConventionSection {
  /** Endpoint heading of the section, null = plain section. */
  endpoint: ApiEndpointHeading | null;
  markdown: string;
}

/**
 * Fence-aware split into convention sections — rule 3. Null when the body
 * has NO endpoint sections (the caller keeps the single-pass render).
 */
export function splitConventionSections(body: string): ConventionSection[] | null {
  const sections: ConventionSection[] = [];
  let lines: string[] = [];
  let endpoint: ApiEndpointHeading | null = null;
  let inFence = false;
  let found = false;

  const flush = () => {
    if (lines.some((line) => line.trim() !== "")) {
      sections.push({ endpoint, markdown: lines.join("\n").trim() });
      if (endpoint !== null) found = true;
    }
    lines = [];
  };

  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence) {
      const match = CONVENTION_HEADING_RE.exec(line);
      if (match !== null) {
        flush();
        endpoint = parseEndpointHeading(match[2]);
        lines = [line];
        continue;
      }
    }
    lines.push(line);
  }
  flush();
  return found ? sections : null;
}
