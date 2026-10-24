import { Link, Navigate, useParams } from "react-router";
import { Languages } from "lucide-react";
import { useI18n, useT } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LINK_CLASS } from "@/components/TextEngine/core/constants";
import { DocCard, DocCardGrid } from "./DocCards";
import { DocsBreadcrumbs } from "./DocsBreadcrumbs";
import { docCategoriesForProject } from "./categories";
import { pagesLabel } from "./docsFormat";
import {
  localeForPage,
  retryManifest,
  titleFor,
  useDocsManifest,
  useDocsManifestFailed,
  type DocPage,
  type DocsManifest,
} from "./manifest";
import {
  docProject,
  docUrl,
  categoryUrl,
  DOC_PROJECTS,
  type DocProject,
} from "./projects";
import { formatSyncDate } from "./sidecar";
import { legacyDocsTarget } from "./legacyDocs";
import { DocsManifestError, DocsNotFound } from "./DocsRedirects";
import { DocsSearch } from "./DocsSearch";
import { DOCS_COLUMN, docsFieldClass } from "./docsField";

/**
 * `/docs/:project` — the hub cover (design spec §4): a book title page, not
 * a landing. One form for ALL projects: project icon + h1, ONE intro
 * paragraph (chrome i18n — L3 layer), an honest status line (locale coverage
 * + provenance for imported projects), «с чего начать» text links, then the
 * DATA card grids — the four hub books and the categories (blueprint-
 * hubs-nav-intro W1: the owner directive «карточки на ВСЕХ хабах» cancels
 * the анти-слоп verdict §14.10 FOR THE TOCs; the slop ban — tiles without
 * data — stays, every card carries its counters).
 */

/** Honest locale-coverage wording, derived from the manifest (spec §4.1.3). */
function coverageKey(pages: readonly DocPage[]): "both" | "ru" | "en" | "mixed" {
  const hasRu = pages.some((page) => page.locales.includes("ru"));
  const hasEn = pages.some((page) => page.locales.includes("en"));
  if (hasRu && hasEn) {
    return pages.every(
      (page) => page.locales.includes("ru") && page.locales.includes("en"),
    )
      ? "both"
      : "mixed";
  }
  return hasRu ? "ru" : "en";
}

/**
 * Provenance summary for the hub status line: first repo@sha, latest date.
 * Multi-source hubs (the api hub aggregates several pinned repositories)
 * report the SOURCE COUNT instead — one repo@sha would claim a single
 * origin the hub does not have; each page badge keeps the exact pin.
 * The repo label rides `repoDisplay` — the reader-facing display name
 * (directive 2026-10-23), never the internal slug.
 */
function hubProvenance(pages: readonly DocPage[]) {
  const repos = new Set<string>();
  let repo: string | null = null;
  let repoDisplay: string | null = null;
  let sha: string | null = null;
  let latest = "";
  for (const page of pages) {
    if (!page.provenance) continue;
    repos.add(page.provenance.repo);
    repo ??= page.provenance.repo;
    repoDisplay ??= page.provenance.repoDisplay;
    sha ??= page.provenance.sha;
    if (page.provenance.syncedAt > latest) latest = page.provenance.syncedAt;
  }
  // repoDisplay is assigned alongside repo (same loop body), so the two
  // null checks together narrow both labels to strings for the badge call.
  if (repo === null || repoDisplay === null || sha === null || latest === "") {
    return null;
  }
  return { repo, repoDisplay, sha, syncedAt: latest, sourceCount: repos.size };
}

function HubSkeleton() {
  const t = useT();
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t("docs.loading")}
      aria-hidden="true"
    >
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-3 h-4 w-full max-w-xl" />
      <Skeleton className="mt-2 h-4 w-2/3 max-w-md" />
      <div className="mt-8">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="shimmer border-b border-border-subtle px-4 py-4 last:border-b-0"
          >
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * U6 honest error slot (the honest-map rows 20–21 finding): a FAILED
 * manifest build is an explicit EmptyState with «Повторить» — never an
 * eternal skeleton. Zero living layer (the domain verdict): the error is
 * a standing state, only the Retry click moves anything.
 */
function HubError() {
  return <DocsManifestError onRetry={() => retryManifest()} />;
}

function StatusBadges({
  project,
  pages,
}: {
  project: DocProject;
  pages: readonly DocPage[];
}) {
  const t = useT();
  const provenance = project.upstream ? hubProvenance(pages) : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">
        <Languages className="mr-1 size-3.5" aria-hidden="true" />
        {t(`docs.hub.coverage.${coverageKey(pages)}`)}
      </Badge>
      {provenance ? (
        provenance.sourceCount > 1 ? (
          <Badge
            variant="outline"
            title={t("docs.provenance.multiSourceFull", {
              count: provenance.sourceCount,
              date: formatSyncDate(provenance.syncedAt, true),
            })}
            aria-label={t("docs.provenance.multiSourceFull", {
              count: provenance.sourceCount,
              date: formatSyncDate(provenance.syncedAt, true),
            })}
          >
            {t("docs.provenance.multiSource", {
              count: provenance.sourceCount,
              date: formatSyncDate(provenance.syncedAt),
            })}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            title={t("docs.provenance.full", {
              repo: provenance.repoDisplay,
              sha: provenance.sha,
              date: formatSyncDate(provenance.syncedAt, true),
            })}
            aria-label={t("docs.provenance.full", {
              repo: provenance.repoDisplay,
              sha: provenance.sha,
              date: formatSyncDate(provenance.syncedAt, true),
            })}
          >
            {t("docs.provenance.badge", {
              repo: provenance.repoDisplay,
              sha: provenance.sha.slice(0, 7),
              date: formatSyncDate(provenance.syncedAt),
            })}
          </Badge>
        )
      ) : null}
    </div>
  );
}

/** Per-hub statistics (U6, the v12 hub-card canon — счётчики это ДАННЫЕ):
 * page count, the corpus freshness stamp and the provenance line. Own
 * pages carry a version (lastVerified = vX.Y.Z); imported pages carry the
 * sync date from provenance. Empty data renders honest absence — the line
 * is simply not there. */
function hubStats(
  project: DocProject,
  pages: readonly DocPage[],
): { count: number; updated: string; prov: string | null; sources: number } {
  const provenance = project.upstream ? hubProvenance(pages) : null;
  let latest = "";
  for (const page of pages) {
    const stamp = page.provenance?.syncedAt ?? page.lastVerified;
    if (stamp > latest) latest = stamp;
  }
  return {
    count: pages.length,
    // Own corpus: a version stamp (vX.Y.Z). Imported corpus: the sync date
    // in the reader's calendar form (dd.mm.yyyy).
    updated:
      latest === ""
        ? ""
        : project.upstream
          ? formatSyncDate(latest, true)
          : `v${latest}`,
    // The card's provenance line speaks the DISPLAY name too (directive
    // 2026-10-23) — the slug stays an internal namespace.
    prov: provenance ? (provenance.repoDisplay ?? provenance.repo) : null,
    sources: provenance?.sourceCount ?? 0,
  };
}

/**
 * The hub cards (U6; blueprint-hubs-nav-intro W1 — the corpus map on EVERY
 * project hub): the v12 well-card grammar — the featured CURRENT hub first,
 * then the three siblings, each with its data counters (pages / freshness /
 * provenance, mono tabular). Counters are DATA; zero living layer (the
 * domain verdict). The current hub's card is marked aria-current and says
 * «вы здесь» instead of a CTA (D-CARD-CURRENT); the whole card is the route.
 */
/** Exported for the W1 state tests (D-CARD-CURRENT, the every-hub gate). */
export function HubCards({
  activeProject,
  manifest,
}: {
  activeProject: DocProject;
  manifest: DocsManifest;
}) {
  const t = useT();
  const { lang } = useI18n();
  return (
    <DocCardGrid label={t("docs.hub.cardsLabel")}>
      {DOC_PROJECTS.map((project) => {
        const pages = manifest.pages.filter((page) => page.project === project.slug);
        const stats = hubStats(project, pages);
        const current = project.slug === activeProject.slug;
        return (
          <DocCard
            key={project.slug}
            to={`/docs/${project.slug}`}
            icon={project.icon}
            title={project.name}
            description={t(project.ledeKey)}
            tall
            current={current}
            labels={{ here: t("docs.card.here"), open: t("docs.card.open") }}
            meta={
              <>
                <span>{pagesLabel(lang, stats.count, t)}</span>
                {stats.updated !== "" ? (
                  <span>{t("docs.hub.cardUpdated", { stamp: stats.updated })}</span>
                ) : null}
                {stats.prov ? (
                  <span className="text-foreground-muted">
                    {stats.sources > 1
                      ? t("docs.hub.cardMultiSource", { count: stats.sources })
                      : stats.prov}
                  </span>
                ) : null}
              </>
            }
          />
        );
      })}
    </DocCardGrid>
  );
}

function StartHere({
  project,
  manifest,
}: {
  project: DocProject;
  manifest: DocsManifest;
}) {
  const t = useT();
  const { lang } = useI18n();
  const pages = project.startSlugs
    .map((slug) => manifest.pages.find((page) => page.slug === slug))
    .filter((page): page is DocPage => page !== undefined);
  if (pages.length === 0) return null; // L3 not written yet — honest absence
  return (
    <div>
      <p className="text-xs font-medium text-foreground-secondary">
        {t("docs.hub.start")}
      </p>
      {/* One wrapping line of text links, « · » as punctuation (spec §4.1.4). */}
      <p className="mt-1 text-sm leading-relaxed">
        {pages.map((page, index) => (
          <span key={page.slug}>
            {index > 0 ? <span className="text-foreground-muted">{" · "}</span> : null}
            <Link
              to={docUrl(page.slug)}
              // The engine's link constant — the tail + focus ring used to be
              // re-inlined here (Ф3 dedup, byte-identical class list).
              className={LINK_CLASS}
            >
              {titleFor(page, localeForPage(page, lang))}
            </Link>
          </span>
        ))}
      </p>
    </div>
  );
}

/**
 * The category cards (blueprint-hubs-nav-intro W1 — the ONE card grammar on
 * the second level): same shape as the hub cards — icon + title + the i18n
 * lede + the honest page counter (D-CAT-EMPTY: a category without pages
 * shows «0 страниц», it never hides — hiding would lie about the TOC).
 */
/** Exported for the W1 state tests (D-CAT-EMPTY: the honest «0 страниц»). */
export function CategoryCards({
  project,
  manifest,
}: {
  project: DocProject;
  manifest: DocsManifest;
}) {
  const t = useT();
  const { lang } = useI18n();
  return (
    <DocCardGrid label={t("docs.hub.categories")}>
      {docCategoriesForProject(project.slug).map((category) => {
        const count = manifest.pages.filter(
          (page) => page.category === category.slug,
        ).length;
        return (
          <DocCard
            key={category.slug}
            to={categoryUrl(project.slug, category.slug)}
            icon={category.icon}
            title={t(category.titleKey)}
            description={t(category.descriptionKey)}
            labels={{ here: t("docs.card.here"), open: t("docs.card.open") }}
            meta={<span>{pagesLabel(lang, count, t)}</span>}
          />
        );
      })}
    </DocCardGrid>
  );
}

function HubCover({ project }: { project: DocProject }) {
  const t = useT();
  const Icon = project.icon;
  // Mounting the hook kicks the lazy manifest build (contract §7).
  const manifest = useDocsManifest();
  const manifestFailed = useDocsManifestFailed();
  const pages = manifest?.pages.filter((page) => page.project === project.slug);
  return (
    <div className={docsFieldClass()}>
      <div className={DOCS_COLUMN}>
        {/* The unified trail (blueprint W2): the book crumb IS this page —
            a lone aria-current crumb keeps the grammar uniform; below lg the
            hub has no docs parent, the line stays empty (the <lg verdict). */}
        <div className="mb-4">
          <DocsBreadcrumbs project={project} category={null} />
        </div>
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Icon
              className="mt-1 size-6 shrink-0 text-foreground-secondary"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-foreground">{project.name}</h1>
              <p className="mt-1 max-w-[60ch] text-sm text-foreground-secondary">
                {t(project.ledeKey)}
              </p>
            </div>
          </div>
          <DocsSearch className="w-full md:max-w-xs" />
        </div>
        {manifest && pages ? (
          <>
            <div className="mb-6">
              <StatusBadges project={project} pages={pages} />
            </div>
            <div className="mb-6">
              <StartHere project={project} manifest={manifest} />
            </div>
            {/* U6 + blueprint-hubs-nav-intro W1: the corpus map — v12 hub
             * cards with data counters on EVERY project hub; the /docs root
             * keeps its instant redirect into the default hub (design spec
             * §8 untouched). */}
            <div className="mb-6">
              <HubCards activeProject={project} manifest={manifest} />
            </div>
            <CategoryCards project={project} manifest={manifest} />
          </>
        ) : manifestFailed ? (
          <HubError />
        ) : (
          <HubSkeleton />
        )}
      </div>
    </div>
  );
}

export function DocsHubPage() {
  const { project = "" } = useParams();
  const meta = docProject(project);
  if (meta) return <HubCover project={meta} />;
  // Not a project segment — a legacy single-segment URL (/docs/<old slug>).
  // The map resolves synchronously from glob keys: no skeleton, no flicker
  // (design spec §8); a miss is the honest not-found.
  const target = legacyDocsTarget(`/docs/${project}`);
  if (target !== null) return <Navigate to={target} replace />;
  return (
    <div className={docsFieldClass()}>
      <div className={DOCS_COLUMN}>
        <DocsNotFound />
      </div>
    </div>
  );
}
