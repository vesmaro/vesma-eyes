import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { FileText } from "lucide-react";
import { useI18n, useT } from "@/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { docCategory, docCategoriesForProject } from "./categories";
import { DocCard, DocCardGrid } from "./DocCards";
import { DocsBreadcrumbs, DocsBackControl } from "./DocsBreadcrumbs";
import {
  firstParagraph,
  getManifest,
  localeForPage,
  retryManifest,
  parseFrontmatter,
  titleFor,
  useDocsManifestFailed,
} from "./manifest";
import { loadMarkdown } from "./markdownModules";
import { pagesLabel } from "./docsFormat";
import { DEFAULT_PROJECT, docProject, docUrl } from "./projects";
import { formatSyncDate } from "./sidecar";
import { DocsManifestError, DocsNotFound } from "./DocsRedirects";
import { DocsSearch } from "./DocsSearch";
import { DOCS_COLUMN, docsFieldClass } from "./docsField";

/**
 * `/docs/:project/c/:category` (design spec §4 + blueprint-hubs-nav-intro
 * W1): the category header, then the pages as DATA cards — the ONE card
 * grammar (title + the body's first paragraph + the version/sync stamp,
 * mono tabular; D-CARD-NO-DESC: no paragraph → no description, nothing is
 * invented). The rowInfos mechanics stay: descriptions come from the
 * already-bundled md modules — zero new network requests. The category
 * must belong to the URL's project — a cross-project URL is a miss.
 */

interface RowInfo {
  slug: string;
  title: string;
  description: string;
  lastVerified: string;
  project: string;
  /** Imported pages carry the reader-facing repo name for the meta line. */
  repoDisplay: string | null;
}

/** Rows of one category: manifest order + descriptions from the bodies. */
async function rowInfos(categorySlug: string, lang: "ru" | "en"): Promise<RowInfo[]> {
  const manifest = await getManifest();
  return Promise.all(
    manifest.pages
      .filter((page) => page.category === categorySlug)
      .map(async (page) => {
        const raw = await loadMarkdown(page.slug, localeForPage(page, lang));
        const parsed = raw ? parseFrontmatter(raw) : null;
        return {
          slug: page.slug,
          title: titleFor(page, lang),
          description: parsed ? firstParagraph(parsed.body) : "",
          lastVerified: page.lastVerified,
          project: page.project,
          repoDisplay: page.provenance?.repoDisplay ?? null,
        };
      }),
  );
}

function RowsSkeleton() {
  const t = useT();
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t("docs.loading")}
      aria-hidden="true"
    >
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="shimmer rounded-lg border border-border-subtle bg-well p-5"
          >
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryCards({ categorySlug }: { categorySlug: string }) {
  const t = useT();
  const { lang } = useI18n();
  // U6 honest error slot: a FAILED manifest build surfaces here with
  // «Повторить» instead of an eternal skeleton (the rejection previously
  // left `rows` null forever).
  const manifestFailed = useDocsManifestFailed();
  const [rows, setRows] = useState<RowInfo[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (manifestFailed) return undefined;
    let mounted = true;
    rowInfos(categorySlug, lang).then(
      (infos) => {
        if (mounted) setRows(infos);
      },
      // The manifest failure flag (useDocsManifestFailed) carries the UI
      // verdict — this handler only swallows the duplicate rejection.
      () => undefined,
    );
    return () => {
      mounted = false;
    };
  }, [categorySlug, lang, attempt, manifestFailed]);

  if (manifestFailed) {
    return (
      <DocsManifestError
        onRetry={() => {
          retryManifest();
          setRows(null);
          setAttempt((current) => current + 1);
        }}
      />
    );
  }
  if (rows === null) return <RowsSkeleton />;
  // D-CAT-EMPTY (defensive here — the manifest gate forbids empty
  // categories, but the honest zero beats a silent blank if one appears):
  // the counter speaks, the section never renders as if pages existed.
  if (rows.length === 0) {
    return (
      <p className="text-sm text-foreground-secondary">
        {/* The ONE page-count formatter (review P3) — the same phrase the
         * cards and the hub speak, not a hand-rolled key call. */}
        {pagesLabel(lang, 0, t)}
      </p>
    );
  }
  return (
    <DocCardGrid label={t("docs.category.pagesLabel")}>
      {rows.map((row) => (
        <DocCard
          key={row.slug}
          to={docUrl(row.slug)}
          icon={FileText}
          title={row.title}
          description={row.description === "" ? undefined : row.description}
          labels={{ here: t("docs.card.here"), open: t("docs.card.open") }}
          meta={
            <>
              {/* Own corpus: a version stamp (vX.Y.Z). Imported corpus: the
               * sync date in the reader's calendar form + the display repo. */}
              <span>
                {row.project === DEFAULT_PROJECT
                  ? `v${row.lastVerified}`
                  : formatSyncDate(row.lastVerified)}
              </span>
              {row.repoDisplay ? (
                <span className="text-foreground-muted">{row.repoDisplay}</span>
              ) : null}
            </>
          }
        />
      ))}
    </DocCardGrid>
  );
}

export function DocsCategoryPage() {
  const { project = "", category: categorySlug } = useParams();
  const t = useT();
  const projectMeta = docProject(project);
  const category = docCategory(categorySlug);
  // The category must live in THIS project's hub — cross-project URLs miss.
  const owned =
    projectMeta !== null &&
    category !== null &&
    docCategoriesForProject(projectMeta.slug).some(
      (entry) => entry.slug === category.slug,
    );
  if (!owned || !category) {
    return (
      <div className={docsFieldClass()}>
        <div className={DOCS_COLUMN}>
          <DocsNotFound />
        </div>
      </div>
    );
  }
  // The section's unified field (docsField — owner directive 2026-10-22):
  // the same centered 80ch column as the article pages, so the H1 axis and
  // the reading measure never jump between surfaces.
  return (
    <div className={docsFieldClass()}>
      <div className={DOCS_COLUMN}>
        {/* The unified trail (blueprint W2): Книга › Категория — the first
            crumb is the book's TOC, one click to the hub from any depth.
            W3: the context back control rides ABOVE the trail. */}
        <div className="mb-4">
          <DocsBackControl />
          <DocsBreadcrumbs project={projectMeta} category={category} />
        </div>
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <category.icon
              className="mt-1 size-5 shrink-0 text-foreground-secondary"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-foreground">
                {t(category.titleKey)}
              </h1>
              <p className="mt-1 text-sm text-foreground-secondary">
                {t(category.descriptionKey)}
              </p>
            </div>
          </div>
          <DocsSearch className="w-full md:max-w-xs" />
        </div>
        <CategoryCards categorySlug={category.slug} />
      </div>
    </div>
  );
}
