import { Component, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  GitCommitHorizontal,
  Languages,
} from "lucide-react";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/TextEngine/core/constants";
import { docCategory } from "./categories";
import { extractHeadings, type TocItem } from "./headingSlug";
import type { DocLocale } from "./markdownModules";
import {
  loadDocBody,
  localeForPage,
  titleFor,
  useDocsManifest,
  type DocPage,
  type DocProvenance,
} from "./manifest";
import { Markdown } from "./Markdown";
import { ApiDocsBody, ApiTocDetails, ApiTocRail } from "./apiPresentation";
import { DocsBreadcrumbs, DocsBackControl } from "./DocsBreadcrumbs";
import { DocsSearch } from "./DocsSearch";
import { DocsNotFound } from "./DocsRedirects";
import { formatSyncDate } from "./sidecar";
import { docSlugForPath } from "./docsNav";
import { handleTocClick } from "./tocScroll";
import {
  DEFAULT_PROJECT,
  docProject,
  docUrl,
  projectOfDocSlug,
} from "./projects";
import {
  DOCS_ARTICLE,
  DOCS_COLUMN,
  DOCS_GROUP_ROW,
  docsFieldClass,
} from "./docsField";

/**
 * `/docs/:project/*` (design spec §5/§6/§7/§9; blueprint-hubs-nav-intro W2):
 * the unified breadcrumb trail (Книга › Категория › Страница — replaces the
 * old category chip) → version badge → provenance badge (imported pages) →
 * locale badge → h1 → article
 * on the wide docs slot (max-w-docs-field, docs-a4-field — prose clamped to
 * the 80ch --measure-docs by the global.css .docs-article rule), TOC
 * rail (sticky, scroll-spy) NEXT to the
 * article from lg up, native <details> TOC above the h1 on narrow screens,
 * prev/next at the end confined to the page's OWN project (spec §9.7).
 *
 * Layout (owner directive 2026-10-22 + the group-centered revision of the
 * same day — the FINAL scheme, history below so the next iteration does
 * not relitigate it):
 *
 *   v1 (morning)  [article+TOC] centered as a GROUP (max-w-5xl) — rejected:
 *                 on wide windows the TOC sat mid-window, torn from the edge;
 *   v2 (noon)     article pinned left, rail on the right edge, slack as the
 *                 gutter — rejected: the article stuck to the sidebar;
 *   v3 (evening)  article centered BETWEEN sidebar and rail — rejected: the
 *                 rail sat at the window edge, torn from the article;
 *   FINAL         the GROUP [article 80ch | gap 32→64px | TOC 256px] is
 *                 centered in the field; the slack becomes equal OUTER
 *                 margins (industry convention — Stripe/MDN/Next.js: the
 *                 rail sits NEXT to the content). Schema + rationale in
 *                 docsField.ts; rail-less docs surfaces center the same
 *                 80ch column via the same helpers.
 */

function ArticleSkeleton() {
  const t = useT();
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t("docs.loading")}
      aria-hidden="true"
    >
      <Skeleton className="h-5 w-36 rounded-sm" />
      <Skeleton className="mt-3 h-7 w-2/3" />
      <div className="mt-6 space-y-3">
        {[100, 95, 80, 100, 90, 65].map((width, index) => (
          <Skeleton key={index} className={`h-4`} style={{ width: `${width}%` }} />
        ))}
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="max-w-docs">
        <ArticleSkeleton />
      </div>
    </div>
  );
}

/** TocList item — active state is shape + colour (WCAG 1.4.1, spec §5.3).
 *  Clicks scroll programmatically (tocScroll.ts): the first click lands,
 *  a repeat click re-lands, the URL stays shareable. */
function TocList({ items, activeId }: { items: TocItem[]; activeId: string | null }) {
  const navigate = useNavigate();
  return (
    <ul>
      {items.map((item) => {
        const active = item.id === activeId;
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
              {item.text}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Scroll-spy over the rendered h2/h3 ids (contract §8), rAF-throttled
 * window scroll/resize listener. NOT IntersectionObserver: the markdown
 * component maps are rebuilt per body (the slugger discipline), and every
 * spy state change re-renders the article — an IO that captured element
 * references would observe DETACHED nodes after the re-render and freeze
 * (the reproduced stuck-highlight defect). The listener re-reads the live
 * DOM every frame, so remounts cannot strand it; ids re-resolve per frame
 * (~40 getElementById calls, rAF-capped) — no measured cost.
 *
 * Active = the LAST heading above the sticky-chrome line (scroll-mt-24);
 * above the first heading nothing is active — the rail starts silent and
 * honest. Falls back to "no active item" without window scroll (tests,
 * ancient webviews) — the TOC stays usable as plain anchor links.
 */
function useScrollSpy(ids: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  const key = ids.join("|");
  useEffect(() => {
    if (key === "" || typeof window === "undefined") return undefined;
    let frame = 0;
    const measure = () => {
      frame = 0;
      let last: string | null = null;
      for (const id of ids) {
        const element = document.getElementById(id);
        if (element === null) continue;
        // Last heading whose top cleared the sticky line — the section the
        // reader is in. 120 ≈ scroll-mt (96) + a sliver of grace.
        if (element.getBoundingClientRect().top < 120) last = id;
        else break; // ids are document-ordered — the first below-line ends it
      }
      setActiveId(last);
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids array identity churns per render; the joined key is the real dependency
  }, [key]);
  return activeId;
}

/** TOC rail — hidden below lg (the <details> variant covers narrow widths).
 *  w-64 shrink-0 pins the rail column in the page's justified flex row
 *  (owner directive 2026-10-22) — the flex neighbour is the article. */
function TocRail({ items, activeId }: { items: TocItem[]; activeId: string | null }) {
  const t = useT();
  if (items.length < 2) return null; // empty TOC is noise — spec §5.3
  return (
    <aside className="hidden w-64 shrink-0 lg:block">
      <div className="sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto">
        <p className="mb-3 text-xs font-medium text-foreground-secondary">
          {t("docs.toc.title")}
        </p>
        <TocList items={items} activeId={activeId} />
      </div>
    </aside>
  );
}

/** Narrow-screen TOC: a native <details> right above the h1 (spec §11). */
function TocDetails({
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
        <TocList items={items} activeId={activeId} />
      </div>
    </details>
  );
}

interface BoundaryState {
  error: Error | null;
}

/** Markdown render boundary: error variant + honest «Повторить» (spec §10). */
class RenderBoundary extends Component<{ children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  render() {
    if (this.state.error !== null) {
      return (
        <RenderFallback
          message={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

function RenderFallback({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const t = useT();
  return (
    <EmptyState
      variant="error"
      title={t("docs.error.title")}
      detail={message.slice(0, 200)}
      action={
        <Button variant="outline" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      }
    />
  );
}

/**
 * Provenance badge — the freshness stamp (design spec §6.2, HonestLine
 * canon): «актуально для Vesma@abc1234 · пин от 23.10» — a passport, not
 * an alarm: outline variant, muted GitCommitHorizontal, static (local
 * clones — no upstream URL is guaranteed). The repo label is the
 * READER-FACING display name (directive 2026-10-23: the stamp speaks the
 * product name, `repo` stays the internal slug); the date is the PINNED
 * COMMIT's date (the pipeline is wall-clock-free by contract); the title
 * and aria-label carry the FULL form (whole SHA + dd.mm.yyyy date).
 */
function ProvenanceBadge({ provenance }: { provenance: DocProvenance }) {
  const t = useT();
  const full = t("docs.provenance.full", {
    repo: provenance.repoDisplay,
    sha: provenance.sha,
    date: formatSyncDate(provenance.syncedAt, true),
  });
  return (
    <Badge variant="outline" title={full} aria-label={full}>
      <GitCommitHorizontal
        className="mr-1 size-3.5 text-foreground-muted"
        aria-hidden="true"
      />
      {t("docs.provenance.badge", {
        repo: provenance.repoDisplay,
        sha: provenance.sha.slice(0, 7),
        date: formatSyncDate(provenance.syncedAt),
      })}
    </Badge>
  );
}

function PrevNext({ slug }: { slug: string }) {
  const t = useT();
  const { lang } = useI18n();
  const manifest = useDocsManifest();
  if (!manifest) return null;
  // Reading never crosses a project boundary (design spec §9.7): prev/next
  // walk THIS project's manifest slice; the last page draws no empty slot.
  const project = projectOfDocSlug(slug);
  const pages = manifest.pages.filter((page) => page.project === project);
  const slugs = pages.map((page) => page.slug);
  const index = slugs.indexOf(slug);
  if (index === -1) return null;
  const prev = index > 0 ? pages[index - 1] : null;
  const next = index < slugs.length - 1 ? pages[index + 1] : null;
  if (!prev && !next) return null;
  return (
    <nav
      aria-label={t("docs.prevNextNav")}
      className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {prev ? (
        <Link
          to={docUrl(prev.slug)}
          className={cn(
            "rounded-md border border-border-subtle p-4 transition-colors duration-instant",
            "hover:border-border hover:bg-elevated",
            FOCUS_RING,
          )}
        >
          <span className="flex items-center gap-1 text-xs text-foreground-muted">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {t("docs.prev")}
          </span>
          <span className="mt-1 block text-sm font-medium text-foreground">
            {titleFor(prev, lang)}
          </span>
        </Link>
      ) : null}
      {next ? (
        <Link
          to={docUrl(next.slug)}
          className={cn(
            "rounded-md border border-border-subtle p-4 transition-colors duration-instant",
            "hover:border-border hover:bg-elevated",
            FOCUS_RING,
          )}
        >
          <span className="flex items-center justify-end gap-1 text-right text-xs text-foreground-muted">
            {t("docs.next")}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </span>
          <span className="mt-1 block text-right text-sm font-medium text-foreground">
            {titleFor(next, lang)}
          </span>
        </Link>
      ) : null}
    </nav>
  );
}

export function DocsPage() {
  const { project = "", "*": splat = "" } = useParams();
  const { lang } = useI18n();
  const manifest = useDocsManifest();
  const slug = useMemo(() => docSlugForPath(project, splat), [project, splat]);
  const page = useMemo(
    () =>
      slug !== null
        ? (manifest?.pages.find((candidate) => candidate.slug === slug) ?? null)
        : null,
    [manifest, slug],
  );

  if (slug === null || page === null) {
    // A project namespace miss IS the redirect-map miss (design spec §8):
    // honest not-found with the CTA into the section root — in the SAME
    // centered 80ch column as every other docs surface.
    return (
      <div className={docsFieldClass()}>
        <div className={DOCS_COLUMN}>
          {manifest ? <DocsNotFound /> : <PageSkeleton />}
        </div>
      </div>
    );
  }
  // The key remounts the view per slug+language: state init replaces the
  // forbidden synchronous effect-reset (react-hooks/set-state-in-effect).
  return <ArticleView key={`${slug}:${lang}`} slug={slug} page={page} />;
}

/** Language self-names for the «на языке оригинала» badge (spec §7.2). */
const LANG_NAME_KEY = {
  ru: "docs.lang.ru",
  en: "docs.lang.en",
} as const;

/**
 * The RUS/ORIG bilingual switch (U6; SPEC-2026-10-07 «Доки: … билингв
 * RUS/ORIG; заново — механика RUS/ORIG»): the v12 PRESENTATION over the
 * main locale engine. Visible ONLY when the page is published in Russian
 * AND its original language is different — otherwise RUS and ORIG are the
 * same text and a switch would be a lie. The engine (loadDocBody +
 * localeForPage) is untouched: the switch selects a locale the page
 * PUBLISHES; the fallback chain never leaves the wire.
 *
 * A DATA control, zero living layer (the Доки verdict): pressing it swaps
 * the article — no transition, no fade.
 */
function BilingualSwitch({
  page,
  readingLocale,
  onPick,
}: {
  page: DocPage;
  readingLocale: DocLocale;
  onPick: (locale: DocLocale) => void;
}) {
  const t = useT();
  const options: ReadonlyArray<{
    locale: DocLocale;
    mark: string;
    labelKey: TranslationKey;
  }> = [
    { locale: "ru", mark: "РУС", labelKey: "docs.bilingual.rus" },
    { locale: page.originalLocale, mark: "ORIG", labelKey: "docs.bilingual.orig" },
  ];
  return (
    <div
      role="group"
      aria-label={t("docs.bilingual.group")}
      className="inline-flex shrink-0 items-center rounded-full border border-border-subtle bg-elevated p-0.5"
    >
      {options.map((option) => {
        const pressed = readingLocale === option.locale;
        return (
          <button
            key={option.locale}
            type="button"
            aria-pressed={pressed}
            onClick={() => onPick(option.locale)}
            className={cn(
              "flex min-h-7 items-center rounded-full px-3 text-xs font-medium transition-colors duration-instant",
              FOCUS_RING,
              pressed
                ? "bg-overlay text-iris-bright"
                : "text-foreground-secondary hover:text-foreground",
            )}
          >
            {option.mark}
            <span className="sr-only"> — {t(option.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

function ArticleView({ slug, page }: { slug: string; page: DocPage }) {
  const t = useT();
  const { lang } = useI18n();
  // The loaded body rides ITS locale: switching RUS/ORIG stales the old
  // text immediately (the skeleton takes over until the new body lands) —
  // the h1 and the body can never disagree. Writes happen ONLY inside the
  // load callback (no synchronous effect resets).
  const [result, setResult] = useState<{ locale: DocLocale; body: string } | null>(
    null,
  );
  const [failedFor, setFailedFor] = useState<DocLocale | null>(null);
  const [attempt, setAttempt] = useState(0);
  // U6 bilingual: the READING locale (the RUS/ORIG switch). Defaults to the
  // engine's effective locale; the parent keys this view by slug+UI lang,
  // so a UI-language change re-inits the choice honestly. SCOPE (the U6
  // verdict): the switch targets the IMPORTED corpus (the v12 canon's
  // RUS/ORIG = «перевод/оригинал» for the upsteam books; spec §51's open
  // paper «что переводится» = upstream). Own pages are Russian-ORIGINAL
  // mirrors — a RUS/ORIG pair would be a lie there (and their sidecar-less
  // originalLocale is glob-order dependent — a pre-existing main quirk the
  // badge path never exercises).
  const engineLocale = localeForPage(page, lang);
  const bilingual =
    page.project !== DEFAULT_PROJECT &&
    page.locales.includes("ru") &&
    page.originalLocale !== "ru";
  const [readingLocale, setReadingLocale] = useState<DocLocale>(engineLocale);

  useEffect(() => {
    let mounted = true;
    void loadDocBody(slug, readingLocale).then((loaded) => {
      if (!mounted) return;
      if (loaded === null) {
        setFailedFor(readingLocale);
        setResult(null);
      } else {
        setResult({ locale: readingLocale, body: loaded.body });
        setFailedFor(null);
      }
    });
    return () => {
      mounted = false;
    };
  }, [slug, readingLocale, attempt]);

  const staleResult = result !== null && result.locale !== readingLocale;
  const body = staleResult ? null : (result?.body ?? null);
  const failed = failedFor === readingLocale && !staleResult;
  const toc = useMemo(() => (body === null ? [] : extractHeadings(body)), [body]);
  const activeId = useScrollSpy(toc.map((item) => item.id));
  const category = docCategory(page.category);
  // The trail's book crumb (blueprint W2). The manifest gate keeps every
  // page's project in the registry — the null branch is defensive honesty.
  const projectMeta = docProject(page.project);
  // The generated board reference gets the API presentation: endpoint
  // cards, method chips, labeled subsections, nested TOC (docs-api-
  // readability). Every other page keeps the default article typography.
  const apiBoard = page.category === "api-board";
  // Locale policy (contract §6, spec §7.1): the page renders in its
  // EFFECTIVE locale. With the switch present the reader controls the
  // locale explicitly (the segment is the verdict); the «на языке
  // оригинала» badge stays for the NO-SWITCH fallback only — reading the
  // original because the UI language is not published.
  const localeOriginal = !bilingual && lang !== engineLocale;

  return (
    <div className={docsFieldClass()}>
      {/* The docs field (owner directive 2026-10-22 + group-centered revision
       * of the same day — the FINAL scheme, do not relitigate without the
       * owner; docs-a4-field 2026-10-24 widened the slot): [ article
       * min(1123px, field−rail−gap) | gap 32→64px | TOC 256px ], the GROUP
       * centered in the field (docsField.ts for the schema and rationale;
       * docs-tables-width W2 moved the measure 72ch → --measure-docs 80ch;
       * docs-a4-field capped the slot at the A4-landscape 1123px — prose
       * inside is clamped back to 80ch by the .docs-article rule in
       * global.css, tables/diagrams/code take the full slot).
       * The TOC sits NEXT to the article — the industry convention
       * (Stripe/MDN/Next.js); the slack becomes equal OUTER margins. At
       * 1280 the group still fills the field exactly (gap-8 keeps the
       * density). Below lg: the full-width reading column, no rail.
       * Rail-less docs surfaces (hub, category, not-found) keep the
       * centered 80ch column through DOCS_COLUMN. */}
      <div className={DOCS_GROUP_ROW}>
        {/* NO mx-auto here: the article is a flex ITEM of the centered group
         * — auto margins would absorb the group's slack and defeat
         * justify-center (measured: the rail jumped back to the window
         * edge). Centering is the ROW's job; mx-auto is for rail-less
         * pages' block columns (DOCS_COLUMN). */}
        <article className={DOCS_ARTICLE}>
          {/* The context back control sits OUTSIDE the defensive projectMeta
              gate (review P3): a return must survive even the impossible
              unknown-project branch — the trail, not the exit, may degrade. */}
          <DocsBackControl />
          {projectMeta ? (
            <div className="mb-3">
              <DocsBreadcrumbs
                project={projectMeta}
                category={category}
                pageTitle={titleFor(page, readingLocale)}
              />
            </div>
          ) : null}
          {/* Meta row: version badge → provenance badge → locale badge,
              RUS/ORIG + search right (design spec §6.1; the category chip
              left the row to the breadcrumb in W2). */}
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {page.project === DEFAULT_PROJECT ? (
                // The release badge is OUR versioning; imported pages carry
                // their freshness in the provenance badge instead (spec §6).
                <Badge variant="outline">
                  {t("docs.badge.verified", { version: page.lastVerified })}
                </Badge>
              ) : null}
              {page.provenance ? (
                <ProvenanceBadge provenance={page.provenance} />
              ) : null}
              {localeOriginal ? (
                <Badge variant="outline">
                  <Languages className="mr-1 size-3.5" aria-hidden="true" />
                  {t("docs.localeOriginal", { lang: t(LANG_NAME_KEY[engineLocale]) })}
                </Badge>
              ) : null}
              {bilingual ? (
                <BilingualSwitch
                  page={page}
                  readingLocale={readingLocale}
                  onPick={setReadingLocale}
                />
              ) : null}
            </div>
            <DocsSearch className="w-full sm:max-w-xs" />
          </div>

          {body === null ? (
            failed ? (
              <RenderFallback
                message=""
                onRetry={() => setAttempt((current) => current + 1)}
              />
            ) : (
              <ArticleSkeleton />
            )
          ) : (
            <>
              {apiBoard ? (
                <ApiTocDetails items={toc} activeId={activeId} />
              ) : (
                <TocDetails items={toc} activeId={activeId} />
              )}
              {/* h1 rides the READING locale — the title language always
                  matches the body language (spec §7.1). */}
              <h1 className="mt-4 text-xl font-semibold leading-tight text-foreground">
                {titleFor(page, readingLocale)}
              </h1>
              <RenderBoundary>
                {apiBoard ? (
                  <ApiDocsBody body={body} pageSlug={slug} />
                ) : (
                  <Markdown source={body} pageSlug={slug} />
                )}
              </RenderBoundary>
            </>
          )}

          <PrevNext slug={slug} />
        </article>
        {apiBoard ? (
          <ApiTocRail items={toc} activeId={activeId} />
        ) : (
          <TocRail items={toc} activeId={activeId} />
        )}
      </div>
    </div>
  );
}
