import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IrisLogo } from "@/components/IrisLogo/IrisLogo";
import { useT } from "@/i18n";
import { withReturn } from "@/lib/returnParams";
import type { GateDomain } from "./gateDomains";
import { GatePreview } from "./GatePreview";

/**
 * The v6 gate screen (union И1, 07k §3) — rendered in the Shell content slot
 * when an anonymous visitor opens a gated domain. Honest by construction:
 *
 * - it NAMES what is inside the domain and where else to look (the public
 *   Overview) — a path onward, never a dead end and never a paywall tease
 *   (no blurred content, no countdowns);
 * - it never hides the route: URL-first, no redirects — the breadcrumbs stay
 *   and the address bar keeps the real path. Entity ids from the URL never
 *   leak into the markup: the screen renders dictionary copy keyed by the
 *   DOMAIN only, so a deep link like /memory/T-128 shows the same honest
 *   screen as /memory;
 * - the buttons are REAL links to the /auth route carrying `return=` (the
 *   whole pathname+search, ME-026: the query must survive) so the signed-in
 *   user lands back where they started.
 *
 * A11y (07k §8): the H1 receives focus on mount and is announced politely
 * (the gate replaces content without a route change, so FocusMain does not
 * fire); the «Что я увижу после входа» block is a disclosure with
 * aria-expanded/aria-controls and a ≥24px target; the «Обзор» escape hatch
 * is a real anchor.
 */

/** Session-scoped persistence of the disclosure state (07k §3: «состояние
 * персистентно в сессии») — sessionStorage, guarded like every store. */
const SEE_MORE_KEY = "vesmaro.gateSeeMore";

function readSeeMore(): boolean {
  try {
    return sessionStorage.getItem(SEE_MORE_KEY) === "1";
  } catch {
    return false; // no storage / private mode — collapsed default
  }
}

function writeSeeMore(open: boolean): void {
  try {
    sessionStorage.setItem(SEE_MORE_KEY, open ? "1" : "0");
  } catch {
    // non-fatal by design
  }
}

export function GateScreen({
  domain,
  pathname,
  search,
}: {
  domain: GateDomain;
  /** The current location — the `return` payload for the auth route. */
  pathname: string;
  search: string;
}) {
  const t = useT();
  const headingId = useId();
  const listId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [seeMoreOpen, setSeeMoreOpen] = useState(readSeeMore);

  // The gate replaces the content slot WITHOUT a route change — move focus
  // to the H1 ourselves so keyboard/SR users land on the explanation, not
  // on whatever held focus in the gated page (07k §3).
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const domainName = t(domain.nameKey);
  const authHref = withReturn("/auth", pathname, search);
  const registerHref = withReturn("/auth?tab=register", pathname, search);

  return (
    <section
      aria-labelledby={headingId}
      data-testid="gate-screen"
      className="gate-enter mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center"
    >
      {/* The static iris mark (07k §3): 40px, no breath — the ambient
       * animation belongs to the TopBar brand alone (06 §4). */}
      <IrisLogo size={40} decorative className="shrink-0 opacity-70" />
      <h1
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="rounded-sm text-xl font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
      >
        {t("auth.gate.heading", { domain: domainName })}
      </h1>
      <p className="max-w-prose text-sm text-foreground-secondary">
        {t(domain.insideKey)}
      </p>
      <p className="max-w-prose text-sm text-foreground-secondary">
        {t("auth.gate.elsewhere")}{" "}
        <Link
          to="/"
          className="rounded-sm text-iris-bright underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {t("auth.gate.goOverview")}
        </Link>
      </p>

      {/* The U1 mini-preview (unification spec, gate-layer доработка): a
       * static structural sketch of the domain — shape, never content;
       * no blur, no shimmer (a paywall tease stays forbidden, 07k §0). */}
      <GatePreview domain={domain} />

      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button asChild variant="default" data-testid="gate-sign-in">
          <Link to={authHref}>{t("login.signIn")}</Link>
        </Button>
        <Button asChild variant="ghost" data-testid="gate-sign-up">
          <Link to={registerHref}>{t("auth.gate.signUp")}</Link>
        </Button>
      </div>

      <div className="mt-2 max-w-prose">
        <button
          type="button"
          aria-expanded={seeMoreOpen}
          aria-controls={listId}
          onClick={() => {
            setSeeMoreOpen((open) => {
              writeSeeMore(!open);
              return !open;
            });
          }}
          className="inline-flex min-h-12 md:min-h-6 items-center gap-1 rounded-sm text-xs text-foreground-muted underline-offset-2 transition-colors duration-instant hover:text-foreground-secondary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <ChevronRight
            className={
              "size-3 transition-transform duration-normal ease-enter" +
              (seeMoreOpen ? " rotate-90" : "")
            }
            aria-hidden="true"
          />
          {t("auth.gate.seeMore")}
        </button>
        {/* The panel rides in the DOM behind `hidden` (aria-controls stays
         * resolvable in both states; hidden removes it from the a11y tree
         * and the layout while collapsed). */}
        <ul
          id={listId}
          hidden={!seeMoreOpen}
          className="mt-2 space-y-1 text-sm text-foreground-secondary"
        >
          {domain.seeMoreKeys.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
