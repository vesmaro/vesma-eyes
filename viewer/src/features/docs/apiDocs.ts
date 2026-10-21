import { inlineMarkdownToText, type TocItem } from "./headingSlug";

/**
 * Pure logic of the api-board presentation (docs-api-readability, 2026-10-21)
 * — deliberately JSX-free so the react-refresh component contract of the
 * .tsx sibling stays clean. Everything here is deterministic and directly
 * unit-testable: body splitting, endpoint-heading parsing, TOC grouping.
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

/** "GET /api/memories" → { get, /api/memories }; anything else → null. */
export function parseEndpointHeading(text: string): ApiEndpointHeading | null {
  const match = /^([A-Za-z]+)\s+(\/\S+)\s*$/.exec(text);
  if (match === null) return null;
  const method = match[1].toLowerCase();
  if (!HTTP_METHODS.includes(method as HttpMethod)) return null;
  return { method: method as HttpMethod, path: match[2] };
}

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
