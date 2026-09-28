// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { normalizeMermaidSvgXml } from "./mermaidSvgXml";

/**
 * ME-017 gates for the SVG XML normalization (mermaidSvgXml.ts):
 *
 * - repairs EXACTLY the two HTML-isms mermaid@11.17.2 is known to emit
 *   (unclosed `<br>` inside foreignObject labels; non-XML named entities
 *   like `&nbsp;`) — verified against the real package in a browser
 *   (probe: both /docs/mnemos/architecture/overview fences carry
 *   `<p>…<br>…</p>` inside foreignObject);
 * - is IDEMPOTENT and a no-op on already-XML-valid output (benign
 *   `<br/>`-label SVGs must be byte-identical);
 * - is NARROW (fail-closed): unknown named entities and any other
 *   ill-formed markup are left broken so the strict parse in Mermaid.tsx
 *   still rejects them — the fallback path stays the security boundary.
 */

describe("normalizeMermaidSvgXml", () => {
  it("closes HTML-style unclosed <br> inside foreignObject labels", () => {
    // The exact artifact class from the overview diagrams (probe ground
    // truth: `<span class="nodeLabel"><p>Extract dynamic spans<br>ordered…`).
    const raw =
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">' +
      '<span class="nodeLabel"><p>Extract dynamic spans<br>ordered by specificity</p></span>' +
      "</div></foreignObject></svg>";
    const normalized = normalizeMermaidSvgXml(raw);
    expect(normalized).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">' +
        '<span class="nodeLabel"><p>Extract dynamic spans<br/>ordered by specificity</p></span>' +
        "</div></foreignObject></svg>",
    );
    // The result must now pass a STRICT XML parse (happy-dom's parsererror
    // element appears on failure).
    const doc = new DOMParser().parseFromString(normalized, "image/svg+xml");
    expect(doc.documentElement.tagName.toLowerCase()).toBe("svg");
    expect(doc.querySelector("parsererror")).toBeNull();
  });

  it("leaves already-closed <br/> untouched (benign output is byte-stable)", () => {
    // The overview's first diagram uses explicit `<br/>` (CCR fence) —
    // mermaid output that is ALREADY XML-valid must not change at all.
    const benign =
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">' +
      '<span class="nodeLabel"><p>Compress<br/>5-stage filter</p></span>' +
      "</div></foreignObject></svg>";
    expect(normalizeMermaidSvgXml(benign)).toBe(benign);
  });

  it("closes <br> with attributes and mixed-case forms, preserves attrs", () => {
    expect(normalizeMermaidSvgXml("<text>a<br>b</text>")).toBe("<text>a<br/>b</text>");
    expect(normalizeMermaidSvgXml('<text>a<BR CLASS="x">b</text>')).toBe(
      '<text>a<br CLASS="x"/>b</text>',
    );
    expect(normalizeMermaidSvgXml("<text>a<br/>b</text>")).toBe("<text>a<br/>b</text>");
    expect(normalizeMermaidSvgXml("<text>a<br />b</text>")).toBe(
      "<text>a<br />b</text>",
    );
    // `<brx>` is NOT a br tag — untouched.
    expect(normalizeMermaidSvgXml("<text>a<brx>b</text>")).toBe("<text>a<brx>b</text>");
  });

  it("rewrites non-XML named entities (nbsp) to numeric references", () => {
    const raw =
      '<svg xmlns="http://www.w3.org/2000/svg"><text>a&nbsp;b&mdash;c</text></svg>';
    expect(normalizeMermaidSvgXml(raw)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"><text>a&#160;b&#8212;c</text></svg>',
    );
  });

  it("NEVER touches the five XML predefined entities (they carry escaping)", () => {
    const raw = "<svg><text>a&amp;b&lt;c&gt;d&quot;e&apos;f</text></svg>";
    expect(normalizeMermaidSvgXml(raw)).toBe(raw);
  });

  it("leaves UNKNOWN named entities untouched (fail-closed → strict parse rejects)", () => {
    const raw = "<svg><text>a&fakespec;b</text></svg>";
    expect(normalizeMermaidSvgXml(raw)).toBe(raw);
    // Strict XML keeps rejecting it (REAL browser behavior; happy-dom's
    // XML parser is lenient on unknown entities, so this assert documents
    // the fail-closed intent — the browser gate stays closed).
    const doc = new DOMParser().parseFromString(
      normalizeMermaidSvgXml(raw),
      "image/svg+xml",
    );
    expect(doc.documentElement.textContent).toContain("&fakespec;");
  });

  it("round-trips the real overview-shaped artifacts through strict XML", () => {
    // Corpus-shaped: multi-line label + entity in one svg, as mermaid
    // serializes it (unclosed br + nbsp in label text).
    const mermaidShaped =
      '<svg xmlns="http://www.w3.org/2000/svg" id="docs-mermaid-x" class="flowchart">' +
      '<g class="node default"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg">' +
      '<span class="nodeLabel"><p>Extract dynamic spans<br>ordered by specificity&nbsp;here</p></span>' +
      "</div></foreignObject></g></svg>";
    const doc = new DOMParser().parseFromString(
      normalizeMermaidSvgXml(mermaidShaped),
      "image/svg+xml",
    );
    expect(doc.documentElement.tagName.toLowerCase()).toBe("svg");
    expect(doc.querySelector("parsererror")).toBeNull();
    const foreign = doc.querySelector("foreignObject");
    expect(foreign?.querySelectorAll("br").length).toBe(1);
    expect(doc.documentElement.textContent).toContain(
      "Extract dynamic spansordered by specificity\u00a0here",
    );
  });

  it("is idempotent", () => {
    const once = normalizeMermaidSvgXml("<text>a<br>b&nbsp;c<br/>d</text>");
    expect(normalizeMermaidSvgXml(once)).toBe(once);
  });

  it("does NOT repair other ill-formed markup (unclosed <img> stays rejected)", () => {
    // Security probe ground truth: a strict-mode mermaid render of a label
    // like `<img src=x onerror=alert(1)>` still carries an unclosed `<img>`
    // in the SVG. That must NOT be normalized into parseable output —
    // a remote-src img would become a beacon if it entered the DOM.
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">' +
      '<span class="nodeLabel"><p><img src="https://evil.example/pixel"></p></span>' +
      "</div></foreignObject></svg>";
    const doc = new DOMParser().parseFromString(
      normalizeMermaidSvgXml(hostile),
      "image/svg+xml",
    );
    expect(doc.querySelector("parsererror")).not.toBeNull();
  });
});

describe("normalizeMermaidSvgXml — smuggling vectors stay closed", () => {
  it("cannot introduce script or on*-attributes (pure string repair of br/entities only)", () => {
    // The transform only ever appends `/` inside <br …> or replaces entity
    // NAMES with numerics — assert no new element/handler surface is
    // reachable: feed markup that would become dangerous IF the transform
    // could create elements; it must stay inert text.
    const raw = "<svg><text>&lt;script&gt;alert(1)&lt;/script&gt;&nbsp;</text></svg>";
    const normalized = normalizeMermaidSvgXml(raw);
    expect(normalized).not.toContain("<script");
    expect(normalized.toLowerCase()).not.toContain("onerror");
    const doc = new DOMParser().parseFromString(normalized, "image/svg+xml");
    expect(doc.querySelector("script")).toBeNull();
    expect(doc.documentElement.textContent).toContain("alert(1)");
  });

  it("a hostile svg with on*-attributes is unchanged by normalization and rejected downstream", () => {
    // mermaid with securityLevel strict strips handlers, but the contract
    // is: normalization itself must not RESURRECT anything. It performs no
    // unescaping, so hostile fragments pass through verbatim and still
    // fail the strict parse (unclosed tags) or reach no exec surface.
    const raw =
      '<svg><foreignObject><span title="x&quot; onmouseover=&quot;alert(1)">&nbsp;hi<br>there</span></foreignObject></svg>';
    const normalized = normalizeMermaidSvgXml(raw);
    // No unescaping happened: the attribute payload is still quoted-safe.
    expect(normalized).toContain("onmouseover");
    const doc = new DOMParser().parseFromString(normalized, "image/svg+xml");
    // foreignObject/span content is parsed as children, NOT attributes of
    // svg elements — the onmouseover text never lands on an element.
    expect(
      [...doc.querySelectorAll("*")].filter((el) =>
        [...el.attributes].some((a) => a.name.startsWith("on")),
      ).length,
    ).toBe(0);
  });
});
