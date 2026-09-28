import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";
import type { HastishNode } from "./hast";
import { nodeText } from "./hast";
import { LINK_CLASS, MONO, isAllowedHref, isAllowedImageSrc } from "./constants";

/**
 * Typography themes of the unified text engine (ADR 0020, layer 2 — «одна
 * фабрика тем»). `compact`/`full` are the CURRENT TextEngine variantClasses
 * byte-identical (Ф1 gate: zero behavioral diff — «попутные улучшения
 * типографики запрещены»); `article` is a factory SLOT reserved for Ф2 (the
 * docs typography moves there) — Ф1 does not re-theme anything and docs keep
 * their own component map in features/docs/Markdown.tsx.
 *
 * SECURITY (SEC-4 — author content is untrusted, never instructions), pinned
 * per theme (untrusted profile): hrefs whitelisted to http(s)/mailto, image
 * srcs to http(s) absolute, task-list checkboxes disabled and
 * non-interactive. Tokens only — no literal colours/spacings.
 */
export type TextEngineTheme = "compact" | "full" | "article";

/**
 * Stable identity matters: react-markdown renders the components map inline
 * per render, and TextEngine memoizes on props — so the maps are built ONCE
 * per theme (module scope) and returned BY REFERENCE. The ME-005 review
 * flagged re-parse/element churn from per-render map construction; a stable
 * per-theme map keeps the element trees referentially stable across
 * re-renders of the same theme.
 */
const themeComponentsCache = new Map<TextEngineTheme, Components>();

export function themeComponents(theme: TextEngineTheme): Components {
  const cached = themeComponentsCache.get(theme);
  if (cached) return cached;
  const built = buildThemeComponents(theme);
  themeComponentsCache.set(theme, built);
  return built;
}

function buildThemeComponents(theme: TextEngineTheme): Components {
  switch (theme) {
    case "compact":
      return buildCompactFullComponents(true);
    case "full":
      return buildCompactFullComponents(false);
    case "article":
      // `article` is a Ф2 SLOT: until Ф2 lands the docs typography as its own
      // branch, it IS the `full` map — by reference (one map per resolved
      // theme), so Ф2's diff touches one factory branch only.
      return themeComponents("full");
  }
}

/**
 * The CURRENT TextEngine typography (compact/full), extracted verbatim from
 * MarkdownView.tsx — class strings byte-identical.
 */
function buildCompactFullComponents(compact: boolean): Components {
  return {
    h1: ({ children }) => (
      <h1
        className={cn(
          compact
            ? "mb-1 mt-2 text-sm font-semibold"
            : "mb-2 mt-4 text-lg font-semibold",
          "text-foreground",
        )}
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2
        className={cn(
          compact
            ? "mb-1 mt-2 text-sm font-semibold"
            : "mb-2 mt-4 text-md font-semibold",
          "text-foreground",
        )}
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3
        className={cn(
          compact
            ? "mb-1 mt-2 text-sm font-medium"
            : "mb-1.5 mt-3 text-base font-semibold",
          "text-foreground",
        )}
      >
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4
        className={cn(
          compact
            ? "mb-1 mt-2 text-sm font-medium"
            : "mb-1.5 mt-3 text-sm font-semibold",
          "text-foreground",
        )}
      >
        {children}
      </h4>
    ),
    h5: ({ children }) => (
      <h5 className="mb-1 mt-2 text-sm font-medium text-foreground">{children}</h5>
    ),
    h6: ({ children }) => (
      <h6 className="mb-1 mt-2 text-sm font-medium text-foreground-secondary">
        {children}
      </h6>
    ),
    p: ({ children }) => (
      <p className={compact ? "my-1 leading-snug" : "my-2 leading-relaxed"}>
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul className="my-2 list-disc space-y-1 pl-5 marker:text-foreground-muted">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-foreground-muted">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className={compact ? "leading-snug" : "leading-relaxed"}>{children}</li>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    a: ({ href, children }) => {
      if (!isAllowedHref(href)) {
        // Stripped scheme (javascript:, data:, …) or empty — inert text.
        return <span>{children}</span>;
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={LINK_CLASS}
        >
          {children}
        </a>
      );
    },
    blockquote: ({ children }) => (
      <blockquote className="my-2 border-l-2 border-iris-dim pl-3 text-foreground-secondary">
        {children}
      </blockquote>
    ),
    // Block code short-circuits here — the inner `code` never renders
    // (extraction keeps the text exact, like the docs renderer).
    pre: ({ node }) => {
      const hast = node as unknown as HastishNode | undefined;
      return (
        <pre
          style={MONO}
          className="my-2 overflow-x-auto rounded-md border border-border-subtle bg-elevated p-3 text-xs leading-relaxed text-foreground"
        >
          <code>{nodeText(hast)}</code>
        </pre>
      );
    },
    // Only INLINE code reaches `code` (block was short-circuited by pre).
    code: ({ children }) => (
      <code
        style={MONO}
        className="rounded-sm border border-border-subtle bg-elevated px-1 py-px text-[0.875em] text-foreground [overflow-wrap:anywhere]"
      >
        {children}
      </code>
    ),
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto rounded-md border border-border-subtle">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border-b border-border px-2.5 py-1.5 text-left text-xs font-medium text-foreground-secondary">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border-b border-border-subtle px-2.5 py-1.5 text-sm [tr:last-child_&]:border-b-0">
        {children}
      </td>
    ),
    img: ({ src, alt, title }) => {
      if (!isAllowedImageSrc(typeof src === "string" ? src : undefined)) {
        return null; // untrusted or relative src — no image, no broken icon
      }
      return (
        <img
          src={src}
          alt={alt ?? ""}
          title={title}
          loading="lazy"
          className="my-2 max-w-full rounded-md border border-border-subtle"
        />
      );
    },
    hr: () => <hr className="my-3 border-border-subtle" />,
    // GFM task-list checkboxes render disabled, never interactive (the
    // authored text is a document, not a form) — iris token accent.
    input: ({ node: _node, ...props }) => (
      <input
        {...props}
        disabled
        className="mr-1.5 size-3.5 align-middle accent-[var(--color-iris-bright)]"
      />
    ),
  };
}
