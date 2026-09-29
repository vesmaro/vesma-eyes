import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Check, Copy } from "lucide-react";
import { Link } from "react-router";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
// The curated pipeline (rehype-raw → dropSubtrees → sanitize) comes from the
// core's corpus module — deliberately NOT the core barrel, which stays
// untrusted-safe (ADR 0020 Ф2 chunk split; ESLint pins pipeline.corpus.ts as
// the single rehype-raw/rehype-sanitize site in src).
import { buildCorpusPipeline } from "@/components/TextEngine/core/pipeline.corpus";
import { articleComponents, LINK_CLASS, MONO } from "@/components/TextEngine/core";
// ME-013 (ADR 0020 Amendment 1): the diagram component is an ENGINE
// capability now — TextEngine/core/Mermaid.tsx is the single mermaid import
// site and serves both trust profiles; the curated profile mounts it with
// NO caps (build-time trusted corpus, integrity gates).
import { MermaidDiagram } from "@/components/TextEngine/core/Mermaid";
import { createHeadingSlugger } from "./headingSlug";
import { resolveDocImageUrl } from "./docsAssets";
import { resolveDocLink } from "./docsLinks";
import { sanitizeSchema } from "./sanitizeSchema";

/**
 * The curated docs renderer — a THIN wrapper over text-engine/core (ADR 0020
 * Ф2): the pipeline is assembled by `buildCorpusPipeline`, the typography is
 * the core factory's `article` branch, and this file keeps only what is
 * docs-OWNED capability — the sanitize CALL-SITE (the drop list + schema
 * config below), the corpus link policy, the asset resolution, the copy
 * chrome and the mermaid lazy-chunk hook. Zero DOM drift is the gate: the
 * golden files pin every byte (F2 must be a ZERO diff, like F1).
 *
 * SECURITY (АРХКОМ-8): raw HTML IS rendered, but only after `rehype-raw` →
 * `rehype-sanitize(sanitizeSchema)` IN THAT ORDER — that order is pinned once
 * in core/pipeline.corpus.ts; the SCHEMA is the security boundary and its
 * construction + governance stay here, in the docs feature (one schema,
 * governance-PR only). dangerouslySetInnerHTML stays banned
 * (ESLint enforces; the sanitizer is the only HTML path).
 * GitHub parity: GFM tables, details/summary, kbd/sub/sup, task lists;
 * hostile content dies in the schema, not in the DOM. Element classes come
 * from the core theme factory's article branch — no class strings here. In-
 * body images resolve through docsAssets.ts (the one asset glob); absolute
 * http(s) srcs and unknown paths render as-is (CSP bounds the rest).
 * Links: /docs* stay SPA Links, anchors stay plain, and corpus-internal
 * references (our `slug.md`, upstream board slugs like `mnemos/user/sync`)
 * resolve through the manifest into project-scoped URLs (W1c — дефект из W2).
 * Leading provenance banners are cut at the MANIFEST BUILD (loadDocBody)
 * since Ф2 — the render path no longer strips (ADR 0020: «срез баннеров — в
 * сборку манифеста»); the sanitizer still drops any comment that slips
 * through as a second line of defence.
 */

/**
 * script/style/iframe subtrees are removed WHOLE, not schema-disallowed:
 * hast-util-sanitize replaces disallowed elements with their CHILDREN, so a
 * schema-only ban would leak the JS/CSS/frame source as visible text.
 * GitHub hides that content — so do we (АРХКОМ-8 hostile gate).
 *
 * The curated config: STABLE module-level identity (the pipeline cache is
 * keyed by it) — never an inline literal in render.
 */
const DROPPED_SUBTREES = ["script", "style", "iframe"] as const;

const CORPUS_RAW_HTML = {
  dropSubtrees: DROPPED_SUBTREES,
  schema: sanitizeSchema,
};

// The curated pipeline, built once at module scope: stable plugin-list
// identities for the lifetime of the chunk (same discipline as MarkdownView's
// escape-only pipeline).
const PIPELINE = buildCorpusPipeline(CORPUS_RAW_HTML);

/** Unresolvable .md reference — visibly broken, never a crash (W1c gate). */
const BROKEN_LINK_CLASS =
  "text-foreground-muted underline decoration-dashed underline-offset-2";

function CopyButton({ code }: { code: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    // Clipboard can be absent (permissions, offline webview) — stay silent.
    void navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      },
      () => undefined,
    );
  };
  return (
    <>
      <button
        type="button"
        onClick={copy}
        disabled={copied}
        aria-disabled={copied}
        aria-label={t("docs.copy.code")}
        className={cn(
          "absolute right-2 top-2 z-10 inline-flex size-8 items-center justify-center rounded-sm",
          "border border-border-subtle bg-elevated text-foreground-secondary",
          "transition-colors duration-instant hover:text-foreground",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
          copied && "cursor-default",
        )}
      >
        {/* Confirmation is the SHAPE (Copy → Check), not a colour — spec §7.2. */}
        {copied ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? t("docs.copy.done") : ""}
      </span>
    </>
  );
}

/** Fenced block chrome (docs-owned): language label + copy + EXACT code. */
function CodeBlock({
  code,
  language,
}: {
  code: string;
  language: string | undefined;
}) {
  return (
    <div className="relative my-4">
      {language ? (
        <span
          style={MONO}
          className="absolute left-3 top-2 text-xs text-foreground-muted"
          aria-hidden="true"
        >
          {language}
        </span>
      ) : null}
      <CopyButton code={code} />
      {/* Horizontal scroll, NEVER wrapping (copy must stay exact — spec §7.2). */}
      <pre
        style={MONO}
        className="overflow-x-auto rounded-md border border-border-subtle bg-elevated p-4 pt-8 text-sm leading-normal text-foreground"
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * The docs-owned hooks of the article theme: corpus link policy (below), the
 * asset glob, the mermaid lazy chunk and the copy chrome. The typography
 * itself comes from core (articleComponents) — class drift is impossible by
 * construction.
 */
function buildArticleHooks(pageSlug: string | undefined) {
  // A fresh slug counter per pass keeps h2/h3 anchors deterministic (same
  // heading order → same ids) while restarting per document by construction.
  const slug = createHeadingSlugger();
  return {
    headingSlug: slug,
    link: (href: string | undefined, children: React.ReactNode) => {
      if (!href) return <a className={LINK_CLASS}>{children}</a>;
      // Internal docs links stay in-app (no full reload); anchors are plain.
      if (href.startsWith("/docs")) {
        return (
          <Link to={href} className={LINK_CLASS}>
            {children}
          </Link>
        );
      }
      if (href.startsWith("#"))
        return (
          <a href={href} className={LINK_CLASS}>
            {children}
          </a>
        );
      // Corpus-internal references (slug.md / board slugs) → SPA links;
      // unresolvable .md refs render visibly broken — never a crash.
      const resolution = resolveDocLink(href, pageSlug);
      if (resolution.kind === "internal") {
        return (
          <Link to={resolution.to} className={LINK_CLASS}>
            {children}
          </Link>
        );
      }
      if (resolution.kind === "broken") {
        // A content bug the integrity gates should catch — signal it here
        // without crashing the page (W1c gate) and leave a console trace.
        console.warn(
          `[docs] unresolved markdown link "${href}" on page "${pageSlug ?? "?"}"`,
        );
        return (
          <a href={href} className={BROKEN_LINK_CLASS}>
            {children}
          </a>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
          {children}
        </a>
      );
    },
    imageSrc: resolveDocImageUrl,
    mermaid: (code: string) => <MermaidDiagram code={code} />,
    codeBlock: (block: { code: string; language: string | undefined }) => (
      <CodeBlock code={block.code} language={block.language} />
    ),
  };
}

export interface MarkdownProps {
  source: string;
  className?: string;
  /**
   * Slug of the page being rendered — the base for resolving corpus-relative
   * links (`slug.md`, `../x.md`) through the manifest. Undefined in tests
   * and previews: relative refs then resolve from the corpus root.
   */
  pageSlug?: string;
}

export function Markdown({ source, className, pageSlug }: MarkdownProps) {
  // Built per render: a fresh object of closures is cheap (and required —
  // the slugger restarts per document); the TYPOGRAPHY is the factory's,
  // so only the closures are fresh, never the class strings.
  const components = articleComponents(buildArticleHooks(pageSlug));
  return (
    <div className={cn("text-base leading-relaxed text-foreground", className)}>
      <ReactMarkdown
        remarkPlugins={PIPELINE.remarkPlugins}
        rehypePlugins={PIPELINE.rehypePlugins}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
