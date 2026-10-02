import { Suspense } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { pageGridClass } from "@/layout/pageGrid";
import { cn } from "@/lib/utils";

/**
 * Small route-level components (Ф1) kept apart from the pure route table in
 * routes.tsx — this file exports ONLY components so the react-refresh lint
 * rule stays meaningful everywhere else.
 */

function RouteFallback() {
  const t = useT();
  return (
    <div
      role="status"
      aria-label={t("app.loadingView")}
      aria-busy="true"
      className="space-y-4"
    >
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/** Suspend a lazy page with the shared route skeleton. */
export function Page({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

/**
 * The ONE not-found pattern (ME-072 A; the reference is the tasks 404):
 * explain + an action, never the bare «404» dead-end. Sits on the ONE page
 * grid (operational density) and is centred in the leftover viewport so a
 * wrong URL reads as a complete, oriented screen — title + human reason +
 * the way home. Every unknown `*` path lands here (`/system` redirects to
 * /system/status first, so the System root never 404s).
 */
export function NotFound() {
  const t = useT();
  return (
    <div
      className={cn(
        pageGridClass("operational"),
        "grid min-h-[60vh] place-items-center",
      )}
    >
      <EmptyState
        variant="not-found"
        title={t("app.notFoundTitle")}
        message={t("app.notFoundMessage")}
        action={
          <Button variant="outline" asChild>
            <Link to="/">{t("app.notFoundAction")}</Link>
          </Button>
        }
      />
    </div>
  );
}

/**
 * Replace-redirect for one legacy route; mounts as its route element. Fills
 * `:id`-style segments from the matched params and re-attaches the query
 * string so `/search?q=x` lands on `/memory/search?q=x`.
 */
export function LegacyRedirect({ to }: { to: string }) {
  const location = useLocation();
  const params = useParams();
  const target = to.replace(/:([^/]+)/g, (_, name: string) => params[name] ?? "");
  return <Navigate to={`${target}${location.search}`} replace />;
}
