import { useMemo } from "react";
import { Link, useLocation } from "react-router";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/TextEngine/core/constants";
import { resolveReturnTarget } from "@/lib/returnParams";
import { routeTitle } from "@/layout/navItems";
import { categoryUrl, hubUrl, type DocProject } from "./projects";
import type { DocCategory } from "./categories";

/**
 * The unified in-page breadcrumb trail (blueprint-hubs-nav-intro W2): the
 * ONE grammar «Книга › Категория › Страница» on EVERY docs surface, above
 * the meta row. The first crumb is ALWAYS the book's TOC (the project hub —
 * «вход из любого места»: any page reaches the TOC in one click, any
 * category of its book in two). The last crumb is plain text with
 * aria-current="page" (never a link — concept §2.2). This is the docs
 * section's own trail INSIDE the field — the Shell's top-bar crumb row is a
 * different surface and stays untouched.
 *
 * The <lg verdict (accepted): the narrow line shows ONLY the parent —
 * «‹ Категория» above an article, «‹ Книга» above a category; the hub has
 * no docs parent, so its trail is a ≥lg-only single crumb and the narrow
 * line stays clean (no horizontal scroll — spec question W2 #2).
 *
 * On an article the trail REPLACES the old category chip above the meta row
 * — one navigation grammar, the chip would be a duplicate (spec W2 #1).
 */

const CRUMB_LINK =
  "inline-flex min-h-6 items-center rounded-sm text-sm text-foreground-secondary transition-colors duration-instant hover:text-foreground";

export function DocsBreadcrumbs({
  project,
  category,
  pageTitle,
}: {
  project: DocProject;
  /** The book chapter the current page sits in (null on the hub itself). */
  category: DocCategory | null;
  /** Set on an article: the trail's terminus rides the READING locale, the
   * same string the h1 renders (the crumb never argues with the title). */
  pageTitle?: string;
}) {
  const t = useT();
  const book = { to: hubUrl(project.slug), label: project.name };
  // <lg parent: the immediate docs parent of the current surface (verdict:
  // only the parent — a narrow line must not scroll). The hub has none.
  const parent =
    pageTitle !== undefined && category !== null
      ? { to: categoryUrl(project.slug, category.slug), label: t(category.titleKey) }
      : category !== null
        ? book
        : null;

  return (
    <div className="min-w-0">
      {/* ≥lg: the full trail. On the hub the book crumb is the page itself —
       * a lone aria-current crumb keeps the grammar uniform on every surface. */}
      <nav aria-label={t("docs.breadcrumbs.label")} className="hidden lg:block">
        <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
          <li className="flex min-w-0 items-center gap-1.5">
            {category !== null || pageTitle !== undefined ? (
              <Link to={book.to} className={cn(CRUMB_LINK, FOCUS_RING)}>
                {book.label}
              </Link>
            ) : (
              <span
                aria-current="page"
                className="inline-flex min-h-6 items-center truncate font-medium text-foreground"
              >
                {book.label}
              </span>
            )}
          </li>
          {category !== null ? (
            <li className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="shrink-0 text-foreground-muted">
                ›
              </span>
              {pageTitle !== undefined ? (
                <Link
                  to={categoryUrl(project.slug, category.slug)}
                  className={cn(CRUMB_LINK, FOCUS_RING)}
                >
                  {t(category.titleKey)}
                </Link>
              ) : (
                <span
                  aria-current="page"
                  className="inline-flex min-h-6 items-center truncate font-medium text-foreground"
                >
                  {t(category.titleKey)}
                </span>
              )}
            </li>
          ) : null}
          {pageTitle !== undefined ? (
            <li className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="shrink-0 text-foreground-muted">
                ›
              </span>
              <span
                aria-current="page"
                title={pageTitle}
                className="inline-flex min-h-6 items-center truncate font-medium text-foreground"
              >
                {pageTitle}
              </span>
            </li>
          ) : null}
        </ol>
      </nav>
      {/* <lg: the parent only — «‹ Категория» / «‹ Книга». */}
      {parent ? (
        <nav aria-label={t("docs.breadcrumbs.label")} className="lg:hidden">
          <Link
            to={parent.to}
            className={cn(
              "inline-flex min-h-8 items-center gap-0.5 text-sm text-foreground-secondary transition-colors duration-instant hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <ChevronLeft className="size-4 shrink-0 text-foreground-muted" aria-hidden="true" />
            {parent.label}
          </Link>
        </nav>
      ) : null}
    </div>
  );
}

/**
 * The docs context back control (blueprint W3, UI-18): reads `?return=` on
 * ANY docs surface and renders «← назад к …» ABOVE the breadcrumb trail —
 * but ONLY when the target survives resolveReturnTarget (D-RET-VALID).
 * Every rejection is SILENT (D-RET-NONE): absent param, a non-Shell path,
 * a scheme/protocol-relative garbage value, the self-return — the control
 * is simply not there, never an error, never a disabled button. A dead
 * target is honest too (D-RET-DEAD): we don't pre-validate, the target
 * page answers for itself. Internal docs links never carry the param, so
 * ordinary browsing inside the section never grows a back control.
 */
export function DocsBackControl() {
  const t = useT();
  const { pathname, search } = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const target = resolveReturnTarget({
    searchParams,
    currentPathname: pathname,
    currentSearch: search,
  });
  const queryStart = target === null ? -1 : target.indexOf("?");
  const targetPathname =
    target === null ? "" : queryStart === -1 ? target : target.slice(0, queryStart);
  // Docs-side self-return guard (UI-18 §2.3, consumption side): the
  // transport rejects the EXACT self (pathname+search with the param); a
  // param-less return pointing at the SAME docs route would render «назад»
  // to the page itself — a lie. returnParams.ts stays untouched (blueprint
  // §5: consume only).
  if (target === null || targetPathname === pathname) return null;
  // The same title grammar as the Shell back control: the target's route
  // name, «Назад: …» as the accessible name (WCAG 2.4.4 — the name carries
  // the destination), «назад к …» as the visible label (the blueprint's
  // wording; the arrow icon is aria-hidden decoration).
  const place = routeTitle(targetPathname, t) ?? t("nav.backFallback");
  return (
    <div className="mb-2">
      <Link
        to={target}
        aria-label={t("nav.backTo", { place })}
        className={cn(
          "inline-flex min-h-8 items-center gap-1 rounded-sm text-sm text-foreground-secondary transition-colors duration-instant hover:text-foreground",
          FOCUS_RING,
        )}
      >
        <ArrowLeft className="size-4 shrink-0 text-foreground-muted" aria-hidden="true" />
        <span className="truncate">{t("docs.back.label", { place })}</span>
      </Link>
    </div>
  );
}
