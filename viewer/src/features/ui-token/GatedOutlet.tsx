import type { ReactNode } from "react";
import { useT } from "@/i18n";
import { gatedDomainFor } from "./gateDomains";
import { GateScreen } from "./GateScreen";
import { useAuthSession } from "./useAuthSession";

/**
 * The Shell content gate (union И1, 07k §2.2/§3): ONE interception point for
 * every gated route — the Shell wraps its <Outlet/> with this component, so
 * the route table stays gate-free (the parallel И1 branches must not
 * re-parent routes) and every path into a gated domain gets the same
 * honest gate screen: URL-first (no redirect, the address keeps the real
 * path), breadcrumbs intact, the page component never mounts for an
 * anonymous visitor (closed content does not even render, let alone flash).
 *
 * The three verdicts of useAuthSession:
 *   user      → the page renders (the server still owns the rights — this
 *               is the view layer, dressing map §1.1.6);
 *   pending   → the boot probe (ME-028) is still in flight: the slot is
 *               HELD with a polite status marker — neither the closed
 *               content nor the gate screen paints before the verdict
 *               (07k §5.1 p.3, the no-flash rule);
 *   anonymous → the gate screen (§3).
 *
   * Inactive deployments (mock playground, mnemos L1) render the outlet
   * untouched — `gatesActive` is false there, see useAuthSession.
 */
export function GatedOutlet({
  pathname,
  search,
  children,
}: {
  pathname: string;
  search: string;
  children: ReactNode;
}) {
  const t = useT();
  const { status, gatesActive } = useAuthSession();
  const domain = gatedDomainFor(pathname);

  if (!gatesActive || domain === null || status === "user") {
    return <>{children}</>;
  }
  if (status === "pending") {
    // A held slot (cascade P3-5): polite AND VISIBLE — a hung probe (its
    // own 10s abort) must not leave a sighted user staring at an empty
    // main. One honest line, no skeleton that would promise content (the
    // verdict may be a gate screen).
    return (
      <p
        role="status"
        data-testid="gate-pending"
        className="mx-auto max-w-xl px-4 py-16 text-center text-sm text-foreground-muted"
      >
        {t("auth.gate.checkingSession")}
      </p>
    );
  }
  // key={domain.prefix} (cascade P2): a gate-domain CHANGE remounts the
  // screen — the H1 focus effect and the entrance animation restart, so
  // SR/keyboard users are told they arrived at a NEW gate instead of the
  // text swapping silently under them (07k §8 focus discipline).
  return (
    <GateScreen
      key={domain.prefix}
      domain={domain}
      pathname={pathname}
      search={search}
    />
  );
}
