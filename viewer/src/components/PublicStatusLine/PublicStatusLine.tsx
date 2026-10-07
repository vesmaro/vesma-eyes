import { useBoardHealth } from "@/hooks/usePulse";
import { useT } from "@/i18n";

/**
 * The public-contour status line (07k §1.3): «vesma-eyes <version> · аноним»
 * under the entry card of the pages OUTSIDE the Shell (/auth, /pair — the
 * anonymous threat model). One source of truth for the version: the same
 * board-health read the sidebar footer speaks; when the gateway serves none
 * (mock playground, vesma L1) the line degrades honestly to
 * «vesma-eyes · аноним» — the same honest-absence rule, never a guessed
 * number. Anonymous is the only state a public entry page can truthfully
 * show (a live session is redirected off /auth before any paint).
 *
 * Not interactive by canon (07k §1.2): no hover/focus, no link, never
 * competes with the entry forms; the muted dot + text — never colour alone.
 */
export function PublicStatusLine() {
  const t = useT();
  const health = useBoardHealth();
  const version = health.data?.app_version;
  const line = version
    ? `vesma-eyes ${version} · ${t("auth.status.anonymous")}`
    : `vesma-eyes · ${t("auth.status.anonymous")}`;
  return (
    <p
      data-testid="public-status-line"
      className="flex items-center justify-center gap-2 text-caps tracking-caps text-foreground-muted"
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full bg-foreground-muted"
      />
      <span>{line}</span>
    </p>
  );
}
