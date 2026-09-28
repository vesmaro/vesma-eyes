/**
 * ME-017: make mermaid's SVG output XML-valid BEFORE the strict
 * `DOMParser("image/svg+xml")` parse in Mermaid.tsx.
 *
 * Defect (ME-011 review, verified against mermaid@11.17.2 in a real
 * browser): mermaid serializes multi-line labels inside `foreignObject`
 * with HTML-style UNCLOSED `<br>` (markdown-it's `br` renderer emits
 * `<br>`, e.g. `<p>Extract dynamic spans<br>ordered by specificity</p>`),
 * and some label paths emit HTML named entities (`&nbsp;` — dist replaces
 * label spaces with it). Both are legal HTML but NOT well-formed XML, so
 * the strict parser returns a `parsererror` document and every diagram
 * with a multi-line label fell back to raw source.
 *
 * Security posture (fail-closed): this is a NARROW, allowlisted
 * normalization — it repairs exactly the two artifact classes mermaid is
 * known to emit. Everything else that fails strict XML (e.g. an
 * attacker-influenced label that DOMPurify let through as an unclosed
 * `<img src=…>`) is LEFT BROKEN and therefore still rejected by the
 * strict parse — the fallback path stays the security boundary. It does
 * NOT parse leniently, does not add elements, and never touches the five
 * XML predefined entities (`&amp;` `&lt;` `&gt;` `&quot;` `&apos;`), which
 * are the escaping markers itself.
 */

/** Named entities mermaid can emit that XML 1.0 does not predefine. */
const NAMED_ENTITY_CODEPOINTS: Readonly<Record<string, number>> = {
  nbsp: 160,
  mdash: 8212,
  ndash: 8211,
  hellip: 8230,
  laquo: 171,
  raquo: 187,
  lsquo: 8216,
  rsquo: 8217,
  ldquo: 8220,
  rdquo: 8221,
  bull: 8226,
  middot: 183,
  copy: 169,
  reg: 174,
  trade: 8482,
  times: 215,
  larr: 8592,
  uarr: 8593,
  rarr: 8594,
  darr: 8595,
};

/** XML 1.0 predefined entities — NEVER rewritten (they carry escaping). */
const XML_PREDEFINED = new Set(["amp", "lt", "gt", "quot", "apos"]);

/**
 * Close HTML-style `<br>` tags: `<br>` / `<br ...>` → `<br/>`.
 * Already-closed forms (`<br/>`, `<br />`) do not match and are preserved
 * byte-for-byte; attribute values are copied verbatim.
 */
function closeBrTags(svg: string): string {
  return svg.replace(/<br((?:\s[^<>]*?)?)>/gi, (match, attrs: string | undefined) =>
    attrs !== undefined && attrs.trimEnd().endsWith("/")
      ? match
      : `<br${attrs ?? ""}/>`,
  );
}

/**
 * Rewrite known non-XML named entities to numeric character references
 * (`&nbsp;` → `&#160;`). Unknown named entities are left untouched so the
 * strict parser keeps rejecting them (fail-closed).
 */
function rewriteNamedEntities(svg: string): string {
  return svg.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name: string) =>
    XML_PREDEFINED.has(name)
      ? match
      : NAMED_ENTITY_CODEPOINTS[name] !== undefined
        ? `&#${NAMED_ENTITY_CODEPOINTS[name]};`
        : match,
  );
}

/**
 * Normalize the two known HTML-isms in mermaid's SVG serialization so the
 * string is well-formed XML. Pure string transform: no parsing, no
 * element creation, no structural change — a benign SVG with `<br/>`
 * labels passes through unchanged (asserted in tests).
 */
export function normalizeMermaidSvgXml(svg: string): string {
  return closeBrTags(rewriteNamedEntities(svg));
}
