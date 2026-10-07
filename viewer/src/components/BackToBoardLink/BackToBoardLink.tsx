import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/i18n";

/**
 * The «← На борт» return button (07h §12 — owner directive after the v3
 * verdict: the exit used to live only in the top-right corner, «капец
 * неочевидно»). The public entry pages (/auth, /pair) sit OUTSIDE the Shell
 * — no sidebar, no crumbs — so the way back gets a NOTICEABLE controller in
 * the SAME slot in every phase (never migrates: muscle memory).
 *
 * Style — primary-OUTLINE, deliberately not the phase's primary action
 * (07h §12.1: «цветная вторая»): 1.5px iris edge, iris-bright text
 * (9.1:1 dark / 5.9:1 light — AA), myelin hover, strata-system active tint
 * (the ratified selected/active wash — never colour-alone: the arrow +
 * label carry the meaning), --color-focus ring (the ONE ring canon).
 * 44px tall — the page IS the mobile scenario (2.5.8).
 */
export function BackToBoardLink() {
  const t = useT();
  return (
    <Link
      to="/"
      data-testid="back-to-board"
      aria-label={t("auth.route.backAria")}
      className="inline-flex h-11 items-center gap-2 rounded-md border-[1.5px] border-iris px-4 text-sm font-medium text-iris-bright transition-colors duration-instant hover:bg-myelin-strong active:bg-strata-system focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
      {t("auth.route.backLabel")}
    </Link>
  );
}
