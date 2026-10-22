import type { TocItem } from "./headingSlug";
import {
  inlineMarkdownToText,
  parseEndpointHeading,
} from "@/components/TextEngine/core/apiConvention";
import type { ApiEndpointHeading } from "@/components/TextEngine/core/apiConvention";

// D3 (owner directive 2026-10-22): endpoint-heading parsing moved into the
// engine (TextEngine/core/apiConvention.ts) so the CONVENTION applies on
// every docs page, not only the generated board. This module re-exports
// the engine detection for its existing consumers (apiPresentation + the
// pinned tests) — one implementation, zero drift. The board SPLIT remains
// here: it is the generated-corpus flow (cards for EVERY h3 chunk), a
// different, stricter contract than the engine's conservative
// endpoint-only convention split.
export {
  HTTP_METHODS,
  inlineMarkdownToText,
  parseEndpointHeading,
} from "@/components/TextEngine/core/apiConvention";
export type {
  ApiEndpointHeading,
  HttpMethod,
} from "@/components/TextEngine/core/apiConvention";

export interface ApiChunk {
  /** "card" = endpoint (or schema) section → wrapped in a card section. */
  kind: "plain" | "card";
  markdown: string;
  heading: ApiEndpointHeading | null;
}

/**
 * Fence-aware split on top-level h2/h3 — the SAME heading and fence rules
 * as extractHeadings, so heading slugs stay in document order and the TOC
 * anchors always agree with the rendered ids.
 */
export function splitApiBody(body: string): ApiChunk[] {
  const chunks: ApiChunk[] = [];
  let kind: "plain" | "card" = "plain";
  let heading: ApiEndpointHeading | null = null;
  let lines: string[] = [];
  let inFence = false;

  const flush = () => {
    if (lines.some((line) => line.trim() !== "")) {
      chunks.push({ kind, markdown: lines.join("\n").trim(), heading });
    }
    lines = [];
  };

  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && /^###\s/.test(line)) {
      flush();
      kind = "card";
      heading = parseEndpointHeading(inlineMarkdownToText(line.replace(/^###\s+/, "")));
      lines = [line];
      continue;
    }
    if (!inFence && /^##\s/.test(line)) {
      flush();
      kind = "plain";
      heading = null;
      lines = [line];
      continue;
    }
    lines.push(line);
  }
  flush();
  return chunks;
}

export interface TocGroup {
  /** h2 header text; null = items before the first h2 (no header row). */
  title: string | null;
  id: string | null;
  items: TocItem[];
}

/** h2 starts a group; h3 nests under the current one (document order). */
export function groupToc(items: TocItem[]): TocGroup[] {
  const groups: TocGroup[] = [];
  for (const item of items) {
    if (item.depth === 2) {
      groups.push({ title: item.text, id: item.id, items: [] });
      continue;
    }
    if (groups.length === 0) groups.push({ title: null, id: null, items: [] });
    groups[groups.length - 1].items.push(item);
  }
  return groups;
}
