/**
 * Heading anchors (contract §8): GitHub-style slugs for h2/h3 — lowercase,
 * punctuation dropped, spaces → hyphens, cyrillic kept. Used by BOTH the
 * renderer (Markdown.tsx ids) and the TOC extractor, so the anchors always
 * agree.
 */

// D3: the inline-markdown stripper moved into the engine
// (TextEngine/core/apiConvention.ts) — the convention parser needs the
// exact same stripping; re-exported here so every existing consumer keeps
// its import path.
import { inlineMarkdownToText } from "@/components/TextEngine/core/apiConvention";
export { inlineMarkdownToText } from "@/components/TextEngine/core/apiConvention";

export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}

export interface HeadingSlugger {
  (text: string): string;
}

/** Stateful per-document slugger: duplicates get GitHub's -1/-2 suffixes. */
export function createHeadingSlugger(): HeadingSlugger {
  const counts = new Map<string, number>();
  return (text: string) => {
    const base = slugifyHeading(text) || "heading";
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
  };
}

export interface TocItem {
  depth: 2 | 3;
  text: string;
  id: string;
}

/**
 * TOC of a page body: h2 (top level) + h3 (nested), in document order.
 * Fence-aware — headings inside code blocks do not exist.
 */
export function extractHeadings(body: string): TocItem[] {
  const slug = createHeadingSlugger();
  const items: TocItem[] = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = inlineMarkdownToText(match[2]);
    if (text === "") continue;
    items.push({ depth: match[1].length as 2 | 3, text, id: slug(text) });
  }
  return items;
}
