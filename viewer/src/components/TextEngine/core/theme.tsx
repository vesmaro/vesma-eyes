import type { Components } from "react-markdown";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isElement, languageOf, nodeText } from "./hast";
import type { HastishNode } from "./hast";
import {
  ARTICLE_MARK_CLASS,
  LINK_CLASS,
  MONO,
  isAllowedHref,
  isAllowedImageSrc,
} from "./constants";
import { MermaidDiagram } from "./Mermaid";
import { fenceExceedsSizeCap } from "./mermaidCaps";

/**
 * Typography themes of the unified text engine (ADR 0020, layer 2 — «одна
 * фабрика тем»). `compact`/`full` are the CURRENT TextEngine variantClasses
 * byte-identical (Ф1 gate: zero behavioral diff — «попутные улучшения
 * типографики запрещены»).
 *
 * Ф2: `article` is the DOCS typography branch — the curated profile's class
 * strings moved here verbatim from features/docs/Markdown.tsx (zero DOM
 * drift; the golden files are the gate). Docs-OWNED capabilities stay behind
 * `ArticleThemeHooks` and are injected by the wrapper (features/docs/
 * Markdown.tsx): heading slugs, link policy, image resolution and the
 * copyable code-block chrome never enter core — core owns the TYPOGRAPHY,
 * the docs feature owns the corpus capabilities. ME-013 (Amendment 1)
 * moved ONE capability INTO the engine: mermaid is no longer docs-owned —
 * the compact/full `pre` branch intercepts mermaid fences for BOTH
 * untrusted themes behind the hard caps (./mermaidCaps), sharing the same
 * strict lazy component (./Mermaid) the curated wrapper mounts directly.
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
const themeComponentsCache = new Map<string, Components>();

/**
 * Untrusted-profile theme maps. `options.mermaidFencesInert` (ME-013, ADR
 * 0020 Amendment 1 protective condition 2) renders every mermaid fence of
 * the surface as a plain code block — the honest fallback when the SOURCE
 * exceeds the fences-per-surface cap (the verdict is computed once per text
 * by the caller and delivered as a build option, because per-instance
 * counting at render time would race with React's render order). Cache key
 * includes the flag, so both map identities stay stable by reference.
 */
export interface ThemeOptions {
  mermaidFencesInert?: boolean;
}

export function themeComponents(
  theme: TextEngineTheme,
  options: ThemeOptions = {},
): Components {
  if (theme === "article") {
    // The article typography needs per-document hooks (heading slugs restart
    // per document; link policy needs the page slug) — a hookless map cannot
    // exist, so a bare request fails closed instead of silently aliasing
    // another theme (Ф2 replaced the Ф1 «article IS full» placeholder).
    throw new Error(
      "themeComponents(article) requires per-document hooks — use articleComponents(hooks) from core/theme",
    );
  }
  const key = `${theme}:${options.mermaidFencesInert === true ? "inert-mermaid" : "default"}`;
  const cached = themeComponentsCache.get(key);
  if (cached) return cached;
  const built = buildThemeComponents(theme, options);
  themeComponentsCache.set(key, built);
  return built;
}

function buildThemeComponents(
  theme: TextEngineTheme,
  options: ThemeOptions,
): Components {
  switch (theme) {
    case "compact":
      return buildCompactFullComponents(true, options);
    case "full":
      return buildCompactFullComponents(false, options);
    case "article":
      // Unreachable (guarded in themeComponents) — kept for exhaustiveness.
      throw new Error("article theme is built by articleComponents(hooks)");
  }
}

/**
 * Docs-OWNED capabilities injected into the article typography by the
 * curated wrapper. Every hook is a docs-feature concern (manifest, router,
 * lazy mermaid chunk, clipboard chrome) — core stays ignorant of all five.
 */
export interface ArticleThemeHooks {
  /**
   * GitHub-style heading slug of the CURRENT document. The wrapper creates a
   * FRESH slugger per render pass — ids stay deterministic per document and
   * restart per document by construction; the factory never owns slug state.
   */
  headingSlug(text: string): string;
  /**
   * Curated link policy: renders the anchor for a markdown href — SPA Links
   * for /docs*, plain anchors, manifest-resolved corpus references, visibly
   * broken unresolvable .md refs, noopener/_blank for the rest.
   */
  link(href: string | undefined, children: ReactNode): ReactNode;
  /** In-body image src resolution (the one docs asset glob; unknown pass through). */
  imageSrc(src: string | undefined): string | undefined;
  /** Mermaid fence → diagram element (Mermaid.tsx lazy chunk boundary). */
  mermaid(code: string): ReactNode;
  /**
   * Fenced block code chrome: language label + copy affordance + the EXACT
   * code text (horizontal scroll, never wrapping). Receives the primitives
   * the factory already extracted from the hast node.
   */
  codeBlock(block: { code: string; language: string | undefined }): ReactNode;
}

/**
 * The article (curated docs) typography, built around the caller's hooks.
 * Built per call on purpose: the map closes over per-document hooks (a fresh
 * slugger per pass), so — unlike compact/full — there is deliberately NO
 * by-reference cache here. The docs wrapper has always built its map per
 * render (cheap object of closures); class DRIFT is what this factory
 * prevents, and the golden files pin every byte of it.
 *
 * The search-hit mark class lives in ./constants (single home; re-exported
 * by the barrel for renderer consumers).
 */
export function articleComponents(hooks: ArticleThemeHooks): Components {
  return {
    h1: ({ node, children }) => (
      // The page h1 renders outside the md body; a body h1 is a content bug
      // the integrity test catches — render it, styled, at least honestly.
      <h1
        id={hooks.headingSlug(nodeText(asHast(node)))}
        className="mb-4 scroll-mt-24 text-xl font-semibold text-foreground"
      >
        {children}
      </h1>
    ),
    h2: ({ node, children }) => (
      <h2
        id={hooks.headingSlug(nodeText(asHast(node)))}
        className="mb-4 mt-10 scroll-mt-24 text-lg font-semibold text-foreground"
      >
        {children}
      </h2>
    ),
    h3: ({ node, children }) => (
      <h3
        id={hooks.headingSlug(nodeText(asHast(node)))}
        className="mb-3 mt-8 scroll-mt-24 text-base font-semibold text-foreground"
      >
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-base font-medium text-foreground">{children}</h4>
    ),
    // Upstream typography (design spec §9.2): h5–h6 share one honest look —
    // text-sm/medium. Order stays visible; TOC remains h2/h3 only.
    h5: ({ children }) => (
      <h5 className="text-sm font-medium text-foreground">{children}</h5>
    ),
    h6: ({ children }) => (
      <h6 className="text-sm font-medium text-foreground-secondary">{children}</h6>
    ),
    p: ({ children }) => (
      <p className="mb-4 text-base leading-relaxed text-foreground">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="mb-4 list-disc space-y-2 pl-6 marker:text-foreground-muted">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-4 list-decimal space-y-2 pl-6 marker:text-foreground-muted">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="text-base leading-relaxed text-foreground">{children}</li>
    ),
    a: ({ href, children }) => (
      <>{hooks.link(href, children)}</>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mb-4 border-l-2 border-iris-dim pl-4 text-foreground-secondary">
        {children}
      </blockquote>
    ),
    // Block code short-circuits here (the inner `code` never renders).
    // mermaid fences are intercepted FIRST (АРХКОМ-8): they become
    // diagrams, not code blocks — the pre wrapper is skipped entirely.
    pre: ({ node }) => {
      const hast = asHast(node);
      const codeNode = (hast?.children ?? []).find(isElement);
      if (languageOf(codeNode) === "mermaid") {
        return <>{hooks.mermaid(nodeText(codeNode))}</>;
      }
      return (
        <>
          {hooks.codeBlock({
            code: nodeText(codeNode),
            language: languageOf(codeNode),
          })}
        </>
      );
    },
    // Everything reaching `code` is INLINE code (spec §7.1) — except a
    // mermaid fence arriving without a pre parent (raw-HTML edge): it goes
    // to the diagram component as well, never through the inline styling.
    code: ({ node, children }) => {
      const hast = asHast(node);
      if (languageOf(hast) === "mermaid") {
        return <>{hooks.mermaid(nodeText(hast))}</>;
      }
      return (
        <code
          style={MONO}
          className="rounded-sm border border-border-subtle bg-elevated px-1.5 py-px text-sm text-foreground [overflow-wrap:anywhere]"
        >
          {children}
        </code>
      );
    },
    table: ({ children }) => (
      <div className="mb-4 overflow-x-auto rounded-md border border-border-subtle">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="[overflow-wrap:anywhere] border-b border-border px-3 py-2 text-left text-sm font-medium text-foreground-secondary">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="[overflow-wrap:anywhere] border-b border-border-subtle px-3 py-2 text-sm text-foreground [tr:last-child_&]:border-b-0">
        {children}
      </td>
    ),
    img: ({ src, alt, title }) => (
      <img
        src={hooks.imageSrc(typeof src === "string" ? src : undefined)}
        alt={alt ?? ""}
        title={title}
        loading="lazy"
        className="mb-4 max-w-full rounded-md border border-border-subtle"
      />
    ),
    hr: () => <hr className="my-8 border-border-subtle" />,
    mark: ({ children }) => <mark className={ARTICLE_MARK_CLASS}>{children}</mark>,
  };
}

/** react-markdown hands `node` typed as `any`-ish ExtraProps — narrow once here. */
function asHast(node: unknown): HastishNode | undefined {
  return node as HastishNode | undefined;
}

/**
 * The CURRENT TextEngine typography (compact/full), extracted verbatim from
 * MarkdownView.tsx — class strings byte-identical.
 *
 * ME-013 (ADR 0020 Amendment 1): mermaid fences are an ENGINE capability on
 * the untrusted profile too. `pre` intercepts `language-mermaid` fences and
 * mounts the shared diagram component (core/Mermaid.tsx — strict, lazy)
 * behind the per-fence SIZE cap of ./mermaidCaps; a fence over the cap, or
 * any fence at all when the caller declared the surface inert (over the
 * fences-per-surface cap), falls back to the theme's OWN plain code block —
 * the honest inert fallback: source fully visible, no diagram, no crash.
 * No caps and no interception exist on the article (curated) branch — the
 * wrapper owns that profile's policy.
 */
function buildCompactFullComponents(
  compact: boolean,
  options: ThemeOptions,
): Components {
  /** The theme's plain code block — also the honest cap fallback shape. */
  const inertPre = (code: string) => (
    <pre
      style={MONO}
      className="my-2 overflow-x-auto rounded-md border border-border-subtle bg-elevated p-3 text-xs leading-relaxed text-foreground"
    >
      <code>{code}</code>
    </pre>
  );
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
    // (extraction keeps the text exact, like the docs renderer). Mermaid
    // fences go to the diagram component behind the Amendment 1 caps
    // (docblock above); everything else keeps the plain code block.
    pre: ({ node }) => {
      const hast = node as unknown as HastishNode | undefined;
      const code = nodeText(hast);
      if (
        languageOf((hast?.children ?? []).find(isElement)) === "mermaid" &&
        !options.mermaidFencesInert
      ) {
        return fenceExceedsSizeCap(code) ? (
          inertPre(code)
        ) : (
          <MermaidDiagram code={code} />
        );
      }
      return inertPre(code);
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
