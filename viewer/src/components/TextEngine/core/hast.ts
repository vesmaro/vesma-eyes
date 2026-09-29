/**
 * Minimal structural hast utilities — THE single copy for the unified text
 * engine (ADR 0020 Ф1, layer 2: "одна копия hast-утилит"; Ф2 moved
 * features/docs onto this module and Ф3 verified no copy remains — the
 * grep for the duplicate signatures returns empty).
 *
 * Same approach as the historical copies: a structural subset of hast that
 * avoids importing transitive type packages while staying assignable from
 * the real @types/hast elements.
 */
export interface HastishNode {
  type: string;
  value?: unknown;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: readonly HastishNode[];
}

export function isElement(node: HastishNode | undefined): boolean {
  return node !== undefined && node.type === "element";
}

export function nodeText(node: HastishNode | undefined): string {
  if (node === undefined) return "";
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(nodeText).join("");
}

/** `language-*` token of a code element (undefined when absent/unmatched). */
export function languageOf(node: HastishNode | undefined): string | undefined {
  const className = node?.properties?.className;
  if (!Array.isArray(className)) return undefined;
  const token = className.find(
    (name) => typeof name === "string" && name.startsWith("language-"),
  ) as string | undefined;
  return token?.slice("language-".length);
}
