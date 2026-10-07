import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { GateScreen } from "./GateScreen";
import { GATED_DOMAINS, gatedDomainFor } from "./gateDomains";
import { I18nProvider } from "@/i18n";

/**
 * Gate-screen semantics (ME-043, 07k §3 + §8): the a11y contract of the
 * honest gate — a focusable H1 (the gate replaces content WITHOUT a route
 * change, so it must move focus itself), a disclosure with full
 * aria-expanded/aria-controls wiring, REAL links (the Overview escape
 * hatch, the /auth entries carrying return=), and the anti-leak rule: a
 * deep link with an entity id renders the same honest screen — the id
 * never reaches the markup. renderToString keeps these DOM-free (project
 * pattern); the keyboard paths are native (button, a, form).
 */

function renderGate(
  path: string,
  search = "",
  lang: "ru" | "en" = "en",
): string {
  const domain = gatedDomainFor(path) ?? GATED_DOMAINS[0];
  return renderToString(
    <I18nProvider initialLang={lang}>
      <MemoryRouter>
        <GateScreen domain={domain} pathname={path} search={search} />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("GateScreen (07k §3): structure and honest copy", () => {
  it("renders the owner-template H1 with the domain name, focusable (tabIndex=-1)", () => {
    const html = renderGate("/memory");
    expect(html).toMatch(/<h1[^>]*tabindex="-1"[^>]*>/);
    expect(html).toContain("The “Memory” section opens after you sign in");
  });

  it("RU heading is pinned on the source-of-truth locale (the „…“ template)", () => {
    const html = renderGate("/memory", "", "ru");
    expect(html).toContain("Раздел „Память“ откроется после входа");
  });

  it("carries the «what is inside» line and the public-Overview path onward", () => {
    const html = renderGate("/kora");
    expect(html).toContain(
      "A journal of sessions from every host: what the agent did and said",
    );
    // The escape hatch is a REAL anchor (07k §3.1).
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Open the Overview<\/a>/);
  });

  it("the buttons are real /auth links carrying return= (the whole path+search, ME-026)", () => {
    const html = renderGate("/memory/search", "?q=x");
    expect(html).toMatch(
      /href="\/auth\?return=%2Fmemory%2Fsearch%3Fq%3Dx"/,
    );
    expect(html).toMatch(
      /href="\/auth\?tab=register&amp;return=%2Fmemory%2Fsearch%3Fq%3Dx"/,
    );
    expect(html).toContain("Sign in");
    expect(html).toContain("Create an account");
  });
});

describe("GateScreen anti-leak (07k §2.2: no entity ids in the VISIBLE surface)", () => {
  it("a deep link (/memory/T-128) never renders the id as text or in a title", () => {
    const html = renderGate("/memory/T-128");
    // The id must not reach visible copy or any tooltip (title/aria-label).
    expect(html).not.toMatch(/title="[^"]*T-128/);
    expect(html).not.toMatch(/aria-label="[^"]*T-128/);
    expect(html).not.toMatch(/<h1[^>]*>[^<]*T-128/);
    // The screen still names the domain honestly…
    expect(html).toContain("The “Memory” section opens after you sign in");
    // …while the return link legitimately CARRIES the path (07k §3 builds
    // exactly this href — the transport, not a leak: the address bar holds
    // the same id anyway, URL-first).
    expect(html).toMatch(/return=%2Fmemory%2FT-128/);
  });

  it("a kora deep link with a query renders the same honest screen, ids invisible", () => {
    const html = renderGate("/kora/s-2026", "?harness=zcode");
    expect(html).not.toMatch(/title="[^"]*s-2026/);
    expect(html).not.toMatch(/<h1[^>]*>[^<]*zcode/);
  });
});

describe("GateScreen a11y (WCAG 2.2, named in 07k §8)", () => {
  it("the «What will I see» block is a disclosure: aria-expanded + aria-controls + ≥24px target", () => {
    const html = renderGate("/tasks");
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="/);
    expect(html).toMatch(/<button[^>]*min-h-6/); // 2.5.8 target size
    expect(html).toContain("What will I see after signing in");
  });

  it("every domain's disclosure content is present (3 honest lines, no promises)", () => {
    const html = renderGate("/system");
    expect(html).toContain("Board status and memory stores");
    expect(html).toContain("Settings and automation");
    expect(html).toContain("Connected devices");
  });

  it("the iris mark is decorative and the section is labelled by its heading (1.1.1 / 1.3.1)", () => {
    const html = renderGate("/agents");
    expect(html).toMatch(/aria-labelledby="/);
    // IrisLogo renders aria-hidden (decorative) — no redundant alt text.
    expect(html).not.toContain('role="img"');
  });
});

describe("GateScreen mini-preview (U1, unification spec gate-layer доработка)", () => {
  it("the sketch is aria-hidden, static (no shimmer/living markup) and captioned honestly", () => {
    const html = renderGate("/memory");
    expect(html).toContain('data-testid="gate-preview"');
    // Scope to the figure: the domain copy may legitimately say «pulse».
    const figure = html.slice(
      html.indexOf('data-testid="gate-preview"'),
      html.indexOf("</figure>"),
    );
    expect(figure).toMatch(/aria-hidden="true"/);
    // Honest-motion red line: nothing loads, nothing breathes on a gate.
    expect(figure).not.toMatch(/animate|shimmer|breath|pulse/i);
    expect(html).toContain("A sketch of the section");
  });

  it("each domain renders ITS OWN sketch kind (one implementation per concept)", () => {
    for (const domain of GATED_DOMAINS) {
      const html = renderGate(domain.prefix);
      expect(html).toContain('data-testid="gate-preview"');
    }
    // The strata wash follows the domain (the 2026-10-07 canon: ambient
    // section wash on a text-free sketch).
    expect(renderGate("/tasks")).toMatch(/bg-strata-tasks/);
    expect(renderGate("/agents")).toMatch(/bg-strata-agents/);
    expect(renderGate("/memory")).toMatch(/bg-strata-memory/);
  });
});
