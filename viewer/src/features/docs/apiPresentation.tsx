import { useMemo } from "react";
import { useNavigate } from "react-router";
import { ChevronDown } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  articleComponents,
  nodeText,
  EndpointChip,
  type HastishNode,
} from "@/components/TextEngine/core";
import { FOCUS_RING } from "@/components/TextEngine/core/constants";
import { type TocItem } from "./headingSlug";
import {
  groupToc,
  parseEndpointHeading,
  splitApiBody,
  type HttpMethod,
} from "./apiDocs";
import { buildArticleHooks } from "./Markdown";
import { CorpusMarkdown, type ArticleComponents } from "./Markdown";
import { handleTocClick } from "./tocScroll";

/**
 * API-board presentation (docs-api-readability wave, 2026-10-21).
 *
 * The generated board reference (gen_api_ref.py, category `api-board`) is
 * STRUCTURED markdown: `##` subgroup headers, `### \`METHOD\` \`/path\``
 * endpoint headings, `####` labeled subsections, a synthesized curl/JSON
 * example pair per operation. The default article typography renders that
 * as one undifferentiated stream — the owner's complaint. THIS module is
 * the opt-in presentation for those pages only:
 *
 *  - the body is split on top-level h2/h3 (fence-aware, same rule as
 *    extractHeadings — the split lives in apiDocs.ts) and every endpoint
 *    chunk renders inside a CARD (bordered, well-tinted section) — visible
 *    blocks instead of a wall;
 *  - an endpoint h3 renders as METHOD CHIP + mono path — since D3 (owner
 *    directive 2026-10-22) the CHIP is the ENGINE's (core EndpointChip):
 *    the same convention applies automatically on every OTHER docs page
 *    through articleComponents; this module keeps only the board-specific
 *    flow (cards for EVERY h3 chunk, ALL h4s as section labels — the
 *    generated corpus is trusted to be uniformly structured);
 *  - any non-endpoint h3 (schema appendix) keeps the factory typography
 *    minus the top margin — it is always the first child of its card;
 *  - the TOC rail nests endpoints under collapsible subgroup headers with
 *    a method-colored dot per endpoint.
 *
 * Token contract: zero new colors — chips/dots reuse the semantic palette
 * (iris-bright/success/warning/error) the same surfaces already use.
 * Security: the chunks render through CorpusMarkdown — the corpus pipeline
 * (rehype-raw → sanitize) and its ONE react-markdown import site are shared,
 * the wrappers are React DOM (never raw HTML), so the sanitizer boundary is
 * untouched. Pure logic lives in apiDocs.ts (this file exports ONLY
 * components — react-refresh contract).
 */

/** TOC dot: same semantic mapping as the chip (method text stays visible). */
const METHOD_DOT_CLASS: Record<HttpMethod, string> = {
  get: "bg-iris-bright",
  post: "bg-success",
  put: "bg-warning",
  patch: "bg-warning",
  delete: "bg-error",
};

function asHast(node: unknown): HastishNode | undefined {
  return node as HastishNode | undefined;
}

/**
 * The api-board component map: the factory typography with h3/h4
 * overridden. One map per body render — the shared slugger inside
 * `buildArticleHooks` consumes headings in document order across ALL
 * chunks, so ids match extractHeadings exactly.
 */
function buildApiComponents(pageSlug: string | undefined): ArticleComponents {
  const hooks = buildArticleHooks(pageSlug);
  const base = articleComponents(hooks);
  return {
    ...base,
    h3: ({ node, children }) => {
      const text = nodeText(asHast(node));
      const id = hooks.headingSlug(text);
      const endpoint = parseEndpointHeading(text);
      if (endpoint === null) {
        // Schema appendix (and any non-endpoint h3): factory look, minus
        // the top margin — it is always the first child of its card.
        return (
          <h3
            id={id}
            className="mb-4 mt-0 scroll-mt-24 text-base font-semibold text-foreground"
          >
            {children}
          </h3>
        );
      }
      // Endpoint h3: the ENGINE chip (core EndpointChip — the exact
      // reference chip, one implementation since D3) in the card-first
      // wrapper. The wrapper classes mirror articleComponents' convention
      // branch (mt-0: first child of the card); textContent stays the
      // heading's, so the accessible name and the TOC anchor never move.
      return (
        <h3
          id={id}
          className="mb-4 mt-0 flex flex-wrap items-center gap-x-2 gap-y-1 scroll-mt-24 text-base font-semibold text-foreground"
        >
          <EndpointChip endpoint={endpoint} />
        </h3>
      );
    },
    h4: ({ children }) => (
      // Labeled subsection (Параметры / Тело запроса / Ответы / Примеры):
      // small caps + a static marker bar — distinct from body text without
      // colour-only signalling.
      <h4 className="mt-7 mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground-secondary">
        <span aria-hidden="true" className="h-4 w-1 shrink-0 rounded-full bg-iris" />
        {children}
      </h4>
    ),
  };
}

/** The api-board article: endpoint cards + subgroup structure. */
export function ApiDocsBody({ body, pageSlug }: { body: string; pageSlug: string }) {
  const chunks = useMemo(() => splitApiBody(body), [body]);
  // Built per render ON PURPOSE (the factory's own discipline): the map
  // closes over a FRESH heading slugger per pass. A memoized map would keep
  // the slugger alive across re-renders and every re-render of a chunk
  // would double-count its headings — ids would drift to their -1 suffixes
  // and the TOC anchors would die. The scroll-spy therefore must not hold
  // element references across renders — useScrollSpy re-reads the live DOM.
  const components = buildApiComponents(pageSlug);
  return (
    <div>
      {chunks.map((chunk, index) =>
        chunk.kind === "card" ? (
          <section
            key={index}
            className="my-6 rounded-md border border-border-subtle bg-well p-4 sm:p-5"
          >
            <CorpusMarkdown source={chunk.markdown} components={components} />
          </section>
        ) : (
          <CorpusMarkdown key={index} source={chunk.markdown} components={components} />
        ),
      )}
    </div>
  );
}

/** TOC list with method dots (colour reinforces the method TEXT, 1.4.1).
 *  Clicks scroll programmatically — same handler as the plain TocList
 *  (tocScroll.ts; first-click/repeat-click discipline, D2 2026-10-22;
 *  review P2: the URL update goes through router.navigate). */
function TocMethodList({
  items,
  activeId,
}: {
  items: TocItem[];
  activeId: string | null;
}) {
  const navigate = useNavigate();
  return (
    <ul>
      {items.map((item) => {
        const active = item.id === activeId;
        const method = parseEndpointHeading(item.text)?.method ?? null;
        return (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              title={item.text}
              aria-current={active ? "location" : undefined}
              onClick={(event) => handleTocClick(event, item.id, navigate)}
              className={cn(
                "block truncate border-l-2 py-1.5 pl-3 pr-1 text-sm transition-colors duration-instant",
                item.depth === 3 && "pl-7",
                active
                  ? "border-iris font-medium text-iris-bright"
                  : "border-transparent text-foreground-secondary hover:text-foreground",
                FOCUS_RING,
              )}
            >
              {method !== null ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mr-1.5 inline-block size-1.5 shrink-0 rounded-full align-middle",
                    METHOD_DOT_CLASS[method],
                  )}
                />
              ) : null}
              {item.text}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Nested TOC tree: collapsible subgroup headers over method-dotted items.
 *  A headerless h2 (no h3 children) renders as a plain link row so every
 *  anchor stays reachable. Groups default OPEN — a collapsed group would
 *  hide the scroll-spy target; collapsing is the reader's explicit act. */
export function ApiTocTree({
  items,
  activeId,
}: {
  items: TocItem[];
  activeId: string | null;
}) {
  const groups = groupToc(items);
  return (
    <div>
      {groups.map((group, index) =>
        group.title === null || group.items.length === 0 ? (
          <TocMethodList
            key={group.id ?? `group-${index}`}
            items={
              group.title === null
                ? group.items
                : [
                    { depth: 2, text: group.title, id: group.id as string },
                    ...group.items,
                  ]
            }
            activeId={activeId}
          />
        ) : (
          <details key={group.id ?? `group-${index}`} open className="group/toc mb-1">
            <summary
              title={group.title ?? undefined}
              className={cn(
                "flex cursor-pointer select-none items-center justify-between gap-1 py-1 text-xs font-semibold uppercase tracking-wide text-foreground-secondary transition-colors duration-instant hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <span className="truncate">{group.title}</span>
              <ChevronDown
                className="size-3.5 shrink-0 text-foreground-muted transition-transform duration-instant group-open/toc:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <TocMethodList items={group.items} activeId={activeId} />
          </details>
        ),
      )}
    </div>
  );
}

/** TOC rail for api-board pages (lg+): sticky, grouped, method dots.
 *  w-64 shrink-0 pins the rail column in the page's justified flex row
 *  (owner directive 2026-10-22) — same geometry as TocRail. */
export function ApiTocRail({
  items,
  activeId,
}: {
  items: TocItem[];
  activeId: string | null;
}) {
  const t = useT();
  if (items.length < 2) return null;
  return (
    <aside className="hidden w-64 shrink-0 lg:block">
      <div className="sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto">
        <p className="mb-3 text-xs font-medium text-foreground-secondary">
          {t("docs.toc.title")}
        </p>
        <ApiTocTree items={items} activeId={activeId} />
      </div>
    </aside>
  );
}

/** Narrow-screen api TOC: the grouped tree inside the <details> above h1. */
export function ApiTocDetails({
  items,
  activeId,
}: {
  items: TocItem[];
  activeId: string | null;
}) {
  const t = useT();
  if (items.length < 2) return null;
  return (
    <details className="group mb-4 rounded-md border border-border-subtle bg-well lg:hidden">
      <summary
        className={cn(
          "flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-medium text-foreground",
          FOCUS_RING,
        )}
      >
        {t("docs.toc.title")}
        <ChevronDown
          className="size-4 text-foreground-muted transition-transform duration-instant group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="px-4 pb-3">
        <ApiTocTree items={items} activeId={activeId} />
      </div>
    </details>
  );
}
