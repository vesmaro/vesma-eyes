import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Node-env test: read the sources straight from disk (Vitest stubs CSS
// imports, so `?raw` is unreliable for stylesheets here).
const tokensCss = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const boardTokensCss = readFileSync(
  new URL("../../../web/styles/tokens.css", import.meta.url),
  "utf8",
);
const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

/**
 * И0 drift guard (АРХКОМ 2026-09-28 — «Живая кора» v2 token wave):
 * locks tokens.css to the canon inventory of docs/design/02-TOKENS.md
 * (frozen v1 names + the v2 neuro layer), locks the И0 value evolution
 * (§5) and the WCAG 2.2 contrast pairs (§4), and keeps viewer ↔ board
 * token parity (ADR 0006). The index.html theme/density bootstrap guards
 * (ThemeProvider / DensityProvider contracts) are carried over unchanged.
 */

const COLOR_TOKENS = [
  "--color-bg-base",
  "--color-bg-well",
  "--color-bg-elevated",
  "--color-bg-overlay",
  "--color-iris-dim",
  "--color-iris",
  "--color-iris-bright",
  "--color-iris-glow",
  "--color-iris-solid",
  "--color-iris-solid-hover",
  "--color-confidence",
  "--color-confidence-dim",
  "--color-success",
  "--color-warning",
  "--color-error",
  "--color-info",
  "--color-text-primary",
  "--color-text-secondary",
  "--color-text-muted",
  "--color-text-inverse",
  "--color-border-subtle",
  "--color-border",
  "--color-border-iris",
  "--color-scroll-bg",
  "--color-scroll-border",
];

/** v2 neuro layer — colour-like names that BOTH themes must override. */
const NEURO_COLOR_TOKENS = [
  "--color-well-canvas",
  "--color-focus",
  "--myelin-hairline",
  "--myelin-strong",
  "--strata-memory",
  "--strata-tasks",
  "--strata-agents",
  "--strata-docs",
  "--strata-system",
  "--synapse-idle",
  "--synapse-recall",
  "--synapse-write",
  "--synapse-error",
  "--glow-iris",
  "--glow-gold",
  "--glow-live",
  "--glow-error",
];

/** v2 neuro layer — theme-independent additions (:root only). */
const NEURO_STATIC_TOKENS = [
  "--focus-ring-width",
  "--focus-ring-offset",
  "--line-hairline",
  "--line-myelin",
  "--text-caps",
  "--text-data",
  "--text-ui",
  "--text-body",
  "--tracking-caps",
  "--numeric-tnum",
];

/** Shell geometry (union И1 — stand 03-IA-NAVIGATION §2–§5, theme-independent
 * :root additions; the parity describe below keeps viewer ↔ board identical). */
const SHELL_GEOMETRY_TOKENS = [
  "--shell-topbar-h",
  "--shell-sidebar-w",
  "--shell-sidebar-rail-w",
  "--shell-crumbs-h",
  "--shell-search-w",
];

const TYPE_TOKENS = [
  "--font-ui",
  "--font-scroll",
  "--font-mono", // D11: rule/code content
  "--text-xs",
  "--text-sm",
  "--text-base",
  "--text-md",
  "--text-lg",
  "--text-xl",
  "--text-2xl",
  "--leading-tight",
  "--leading-normal",
  "--leading-relaxed",
  "--weight-regular",
  "--weight-medium",
  "--weight-semibold",
];

const SPACE_TOKENS = [
  "--space-1",
  "--space-2",
  "--space-3",
  "--space-4",
  "--space-5",
  "--space-6",
  "--space-8",
  "--space-10",
  "--space-12",
  "--space-16",
  "--space-24",
];

const RADIUS_TOKENS = [
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--radius-xl",
  "--radius-full",
];

// Density pair (redesign concept §3.3 / ARCHCOM-3 verdict §2 — additive).
const DENSITY_TOKENS = [
  "--row-h-dense",
  "--row-h-airy",
  "--row-h",
  "--list-gap",
  "--measure-scroll",
];

const SHADOW_TOKENS = [
  "--shadow-well",
  "--shadow-raised",
  "--shadow-float",
  "--shadow-modal",
  "--shadow-iris",
];

const MOTION_TOKENS = [
  "--duration-instant",
  "--duration-fast",
  "--duration-normal",
  "--duration-slow",
  "--duration-iris",
  "--duration-stagger",
  "--duration-impulse",
  "--ease-in-out",
  "--ease-out",
  "--ease-enter",
  "--ease-exit",
  "--ease-spring",
  "--ease-breath",
  "--duration-awaken",
  "--duration-attention",
  "--duration-attention-hold",
];

/**
 * Phase 1 «Кора-организм» (design blueprint v1.1 §5.2) — the seven new names
 * on the frozen canon. `--hud-veil`/`--palette-scrim` are themed pairs (the
 * light values serve NON-hero light canvases; the hero pins the dark column
 * via the `[data-well-window]` scope). `--text-display`/`--well-hero-h` are
 * theme-independent. The three durations are zeroed in BOTH reduced blocks.
 */
const PHASE1_THEMED_TOKENS = ["--hud-veil", "--palette-scrim"];
const PHASE1_STATIC_TOKENS = ["--text-display", "--well-hero-h"];

/** Board-only appendix (ADR 0006 freeze note in web/styles/tokens.css):
 * the ONLY custom properties the web track may define beyond the canon. */
const BOARD_ONLY_TOKENS = [
  "--color-tag-project",
  "--color-tag-agent",
  "--color-tag-type",
  "--color-tag-domain",
  "--color-avatar-fg",
  "--color-error-bright",
];

/**
 * v12 golden (ME-071 W0 — docs/design/15-WOW-DIRECTION §14.1, §14.3.7,
 * §14.6.1 §4): additive canon records, NO component consumes them yet
 * (W1 wires the web layer / satellite / tone engine). `--web-tone-update`
 * (сирень — sixth semantic color, owner directive v12.2) is the only
 * themed pair; everything else is theme-independent :root. Reduced
 * mirrors: durations only — alphas/geometry keep their values (reduced
 * web layer = static drawing, §14.1; satellite clamps to «Спокойный»,
 * §14.3.5).
 */
const V12_GOLDEN_STATIC_TOKENS = [
  "--web-node-alpha",
  "--web-edge-alpha",
  "--web-wave-alpha",
  "--web-wave-speed",
  "--duration-web-idle",
  "--satellite-size",
  "--satellite-rest",
  "--duration-flight",
  "--duration-flash-hold",
  "--duration-tone-temp",
  "--duration-tone-hold",
  "--duration-tone-fade",
];
const V12_GOLDEN_THEMED_TOKENS = ["--web-tone-update"];

// --- CSS parsing helpers --------------------------------------------------
//
// The files are flat (no nested rules outside @media wrappers), so a simple
// top-level block scanner suffices: a block opens at depth 0→1 with its
// selector text and closes at depth 1→0. Blocks inside @media (the
// reduced-motion overrides) are deliberately NOT part of the cascade maps —
// they are asserted textually in their own describes below.

/** Map of custom property → normalised value for every top-level block
 * whose selector list includes `selector`. */
function themeDecls(css: string, selector: string): Map<string, string> {
  const decls = new Map<string, string>();
  const open = /([^{]+)\{/;
  const lines = css.split("\n");
  let depth = 0;
  let active = false;
  let buffer = "";
  for (const line of lines) {
    if (depth === 0) {
      const match = open.exec(line);
      if (match !== null) {
        const selectors = match[1];
        active = selectors.split(",").some((part) => part.trim() === selector);
        depth = 1;
        buffer = "";
        continue;
      }
    }
    if (depth > 0) {
      const closes = (line.match(/\}/g) ?? []).length;
      const opens = (line.match(/\{/g) ?? []).length;
      if (closes > 0 && opens === 0) {
        if (active) {
          for (const [, name, value] of buffer.matchAll(
            /(--[a-z0-9-]+)\s*:\s*([^;]+);/g,
          )) {
            decls.set(name, value.trim().replace(/\s+/g, " ").toLowerCase());
          }
        }
        depth = 0;
        active = false;
        continue;
      }
      buffer += line;
      depth += opens - closes;
    }
  }
  return decls;
}

const darkDecls = themeDecls(tokensCss, ":root");
const lightDecls = themeDecls(tokensCss, '[data-theme="light"]');
const boardDarkDecls = themeDecls(boardTokensCss, ":root");
const boardLightDecls = themeDecls(boardTokensCss, '[data-theme="light"]');

/** Back-compat helper for the legacy inventory assertions. */
function blockProps(decls: Map<string, string>): Set<string> {
  return new Set(decls.keys());
}

/** Every custom property defined anywhere in the file (incl. the
 * `:root, [data-density]` combo and conditional blocks). */
function allProps(css: string): Set<string> {
  return new Set([...css.matchAll(/--[a-z0-9-]+(?=\s*:)/g)].map((m) => m[0]));
}

describe("tokens.css inventory (canon v2 — docs/design/02-TOKENS.md §1–§3)", () => {
  it("defines every color token in the dark theme (:root)", () => {
    const props = blockProps(darkDecls);
    for (const token of [...COLOR_TOKENS, ...NEURO_COLOR_TOKENS]) {
      expect(props, `${token} missing from dark theme`).toContain(token);
    }
  });

  it("overrides every color token in the light theme", () => {
    const props = blockProps(lightDecls);
    for (const token of [...COLOR_TOKENS, ...NEURO_COLOR_TOKENS]) {
      expect(props, `${token} missing from light theme`).toContain(token);
    }
  });

  it("defines typography, spacing, radius, shadow, motion and static neuro tokens", () => {
    const props = allProps(tokensCss);
    for (const token of [
      ...TYPE_TOKENS,
      ...SPACE_TOKENS,
      ...RADIUS_TOKENS,
      ...SHADOW_TOKENS,
      ...MOTION_TOKENS,
      ...NEURO_STATIC_TOKENS,
      ...PHASE1_STATIC_TOKENS,
      ...SHELL_GEOMETRY_TOKENS,
    ]) {
      expect(props, `${token} missing`).toContain(token);
    }
  });

  it("defines the Phase 1 themed pairs in BOTH themes", () => {
    for (const token of PHASE1_THEMED_TOKENS) {
      expect(
        blockProps(darkDecls),
        `${token} missing from dark theme`,
      ).toContain(token);
      expect(
        blockProps(lightDecls),
        `${token} missing from light theme`,
      ).toContain(token);
    }
  });

  it("defines the v12 golden tokens (additive canon — ME-071 W0)", () => {
    const props = allProps(tokensCss);
    for (const token of V12_GOLDEN_STATIC_TOKENS) {
      expect(props, `${token} missing`).toContain(token);
    }
    expect(
      blockProps(darkDecls),
      "--web-tone-update missing from dark theme",
    ).toContain("--web-tone-update");
    expect(
      blockProps(lightDecls),
      "--web-tone-update missing from light theme",
    ).toContain("--web-tone-update");
  });

  it("keeps the frozen iris seed value in both themes (ADR 0003 / D10)", () => {
    const seeds = tokensCss.match(/--color-iris:\s*#1a8a96/g) ?? [];
    // 3 declarations: dark :root + light block + the well-window scope
    // (Phase 1's dark-column pin for the hero — the VALUE stays frozen).
    expect(seeds).toHaveLength(3);
  });

  it("defines the density regime pair and the user-driven operational tokens", () => {
    const props = allProps(tokensCss);
    for (const token of DENSITY_TOKENS) {
      expect(props, `${token} missing`).toContain(token);
    }
  });

  it("drives [data-density]: compact maps the operational row onto dense", () => {
    const compact =
      tokensCss.match(/\[data-density="compact"\]\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(compact).toContain("--row-h: var(--row-h-dense)");
    // Comfortable is the default (:root block), compact is the override.
    const rootBlocks =
      tokensCss.match(/:root,\s*\[data-density="comfortable"\]\s*\{([^}]*)\}/)?.[1] ??
      "";
    expect(rootBlocks).toContain("--row-h:");
  });

  it("resolves shadows through the iris glow token", () => {
    expect(tokensCss).toMatch(/--shadow-iris:[^;]*var\(--color-iris-glow\)/);
  });
});

describe("И0 value evolution locks (02-TOKENS.md §5 — intentional deltas)", () => {
  it("dark: charcoal strata + WCAG-recomputed accents", () => {
    expect(darkDecls.get("--color-bg-well")).toBe("#12161d");
    expect(darkDecls.get("--color-bg-elevated")).toBe("#161b23");
    expect(darkDecls.get("--color-bg-overlay")).toBe("#1c222c");
    expect(darkDecls.get("--color-iris-bright")).toBe("#4fc2ce");
    expect(darkDecls.get("--color-iris-glow")).toBe("#4fc2ce40");
    expect(darkDecls.get("--color-iris-solid-hover")).toBe("#4fc2ce");
    expect(darkDecls.get("--color-border-iris")).toBe("#4fc2ce40");
    expect(darkDecls.get("--color-success")).toBe("#3fbf7f");
    expect(darkDecls.get("--color-warning")).toBe("#d9a03f");
    expect(darkDecls.get("--color-error")).toBe("#e0655c");
    expect(darkDecls.get("--color-info")).toBe("#4fc2ce");
    expect(darkDecls.get("--color-text-primary")).toBe("#e6edf3");
    expect(darkDecls.get("--color-text-secondary")).toBe("#9aa7b4");
    expect(darkDecls.get("--color-text-muted")).toBe("#7c8894");
    expect(darkDecls.get("--color-border")).toBe("#5e687e");
    expect(darkDecls.get("--color-scroll-bg")).toBe("#151a22");
    expect(darkDecls.get("--color-scroll-border")).toBe("#242931");
    // Neuro anchors.
    expect(darkDecls.get("--color-well-canvas")).toBe("#090b0f");
    expect(darkDecls.get("--color-focus")).toBe("#4fc2ce");
  });

  it("light: functional border + solid pair (theme defined, NOT yet activated — И5)", () => {
    expect(lightDecls.get("--color-border")).toBe("#6a7488");
    expect(lightDecls.get("--color-border-iris")).toBe("#1a8a9633");
    expect(lightDecls.get("--color-info")).toBe("#136e79");
    expect(lightDecls.get("--color-iris-solid")).toBe("#136e79");
    expect(lightDecls.get("--color-iris-solid-hover")).toBe("#0f5f6a");
    expect(lightDecls.get("--color-focus")).toBe("#0f5f6a");
    // No theme logic ships in И0: activation stays a data-attr concern (И5).
    expect(indexHtml).not.toContain('data-theme="light"');
  });

  it("motion: ambient breath moves to the 4–6s window; impulse joins the ladder", () => {
    expect(darkDecls.get("--duration-iris")).toBe("5000ms"); // v1: 3000ms
    expect(darkDecls.get("--duration-impulse")).toBe("240ms");
    expect(darkDecls.get("--ease-enter")).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
    expect(darkDecls.get("--ease-exit")).toBe("cubic-bezier(0.4, 0, 1, 1)");
  });
});

describe("Phase 1 value locks (design blueprint v1.1 §5.2 — Кора-организм)", () => {
  it("pins the seven new names to their blueprint values", () => {
    expect(darkDecls.get("--text-display")).toBe(
      "clamp(2.25rem, 3.5vw, 2.75rem)",
    );
    expect(darkDecls.get("--well-hero-h")).toBe(
      "clamp(520px, calc(100vh - 48px), 860px)",
    );
    expect(darkDecls.get("--hud-veil")).toBe("rgb(9 11 15 / 0.78)");
    expect(lightDecls.get("--hud-veil")).toBe("rgb(245 246 248 / 0.85)");
    expect(darkDecls.get("--palette-scrim")).toBe("rgb(9 11 15 / 0.55)");
    expect(lightDecls.get("--palette-scrim")).toBe("rgb(245 246 248 / 0.6)");
    expect(darkDecls.get("--duration-awaken")).toBe("1200ms");
    expect(darkDecls.get("--duration-attention")).toBe("320ms");
    expect(darkDecls.get("--duration-attention-hold")).toBe("2400ms");
  });

  it("the well-window scope pins the DARK column for the hero in both themes", () => {
    // The owner-approved exception-image (2026-10-01): the hero stands on
    // the dark canvas in light «береста» too — the veil follows the well,
    // not the page. The scope block must carry the exact dark values.
    for (const css of [tokensCss, boardTokensCss]) {
      const block = css.match(/\[data-well-window\]\s*\{([^}]*)\}/)?.[1] ?? "";
      expect(block, "well-window scope present").not.toBe("");
      expect(block).toContain("--color-well-canvas: #090b0f");
      expect(block).toContain("--hud-veil: rgb(9 11 15 / 0.78)");
      expect(block).toContain("--color-text-primary: #e6edf3");
      expect(block).toContain("--color-focus: #4fc2ce");
    }
    // Full lockstep (review P2-3): EVERY declaration in the [data-well-window]
    // scope must equal the dark :root value it mirrors — spot-checks above
    // let a drifted name pass silently, the map diff does not.
    for (const [css, dark] of [
      [tokensCss, darkDecls],
      [boardTokensCss, boardDarkDecls],
    ] as const) {
      const wellWindow = themeDecls(css, "[data-well-window]");
      expect(
        wellWindow.size,
        "the well-window scope must pin at least the hero surface set",
      ).toBeGreaterThan(0);
      for (const [name, value] of wellWindow) {
        expect(
          dark.get(name),
          `well-window ${name} must equal the dark :root column`,
        ).toBe(value);
      }
    }
  });
});

describe("v12 golden value locks (ME-071 W0 — 15-WOW §14.1/§14.3.7/§14.6.1 §4)", () => {
  it("pins the web-layer «Ткань коры» constants", () => {
    expect(darkDecls.get("--web-node-alpha")).toBe("0.05");
    expect(darkDecls.get("--web-edge-alpha")).toBe("0.07");
    expect(darkDecls.get("--web-wave-alpha")).toBe("0.08");
    expect(darkDecls.get("--web-wave-speed")).toBe("160px/s");
    expect(darkDecls.get("--duration-web-idle")).toBe("10000ms");
  });

  it("pins the satellite constants (creature Ø64 inside the 96×96 nest slot)", () => {
    expect(darkDecls.get("--satellite-size")).toBe("64px");
    expect(darkDecls.get("--satellite-rest")).toBe("60s");
    expect(darkDecls.get("--duration-flight")).toBe("800ms");
    // task.done gold flash hold (13.8 §2) — distinct from --duration-impulse
    // (240ms, pulse lifetime) and --duration-attention-hold (2400ms).
    expect(darkDecls.get("--duration-flash-hold")).toBe("600ms");
  });

  it("pins the tone layer with lilac as the sixth semantic color", () => {
    expect(darkDecls.get("--web-tone-update")).toBe("#a88fc7");
    expect(lightDecls.get("--web-tone-update")).toBe("#6e5a94");
    expect(darkDecls.get("--duration-tone-temp")).toBe("12000ms");
    expect(darkDecls.get("--duration-tone-hold")).toBe("60000ms");
    expect(darkDecls.get("--duration-tone-fade")).toBe("1200ms");
  });

  it("clamps the v12 durations in the OS reduced-motion block", () => {
    const mediaIndex = tokensCss.indexOf("@media (prefers-reduced-motion: reduce)");
    const flashIndex = tokensCss.indexOf("--duration-flash-hold", mediaIndex);
    const media = tokensCss.slice(
      mediaIndex,
      tokensCss.indexOf("}", flashIndex) + 1,
    );
    expect(media).toContain("--duration-web-idle: 0ms");
    expect(media).toContain("--duration-flight: 0ms");
    expect(media).toContain("--duration-tone-temp: 1500ms");
    expect(media).toContain("--duration-tone-hold: 1500ms");
    expect(media).toContain("--duration-tone-fade: 0ms");
    expect(media).toContain("--duration-flash-hold: 1500ms");
  });
});

describe("reduced-motion overrides (design-system.md §7, 06-MOTION §7)", () => {
  it("zeroes ambient and long transitions while keeping instant feedback", () => {
    const mediaIndex = tokensCss.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(mediaIndex).toBeGreaterThan(-1);
    // Slice the whole media block: from the query to the matching close brace
    // of the :root rule inside it.
    const rootInside = tokensCss.indexOf(":root", mediaIndex);
    const blockEnd = tokensCss.indexOf(
      "}",
      tokensCss.indexOf("--duration-impulse", rootInside),
    );
    const media = tokensCss.slice(mediaIndex, blockEnd + 1);
    expect(media).toContain("--duration-iris: 0ms");
    expect(media).toContain("--duration-slow: 0ms");
    expect(media).toContain("--duration-normal: 0ms");
    expect(media).toContain("--duration-fast: 80ms");
    expect(media).toContain("--duration-impulse: 0ms"); // pulses → static tint
    // Phase 1 durations join the reduced ladder (blueprint §5.2/§10).
    expect(media).toContain("--duration-awaken: 0ms"); // static graph immediately
    expect(media).toContain("--duration-attention: 0ms");
    expect(media).toContain("--duration-attention-hold: 0ms");
  });
});

// --- WCAG 2.2 contrast pairs (И0 invariant — 02-TOKENS.md §4) --------------
//
// The stand spec recomputed every pair against the v2 surfaces; these tests
// re-derive the ratios from the shipped hexes so a future token edit that
// silently breaks AA fails here, not in production. Thresholds: 4.5:1 for
// text (1.4.3), 3:1 for functional borders/focus (1.4.11 / 2.4.11).

type RGB = [number, number, number];

/** Parse one hex color out of a theme declaration map. */
function tokenHex(decls: Map<string, string>, token: string): RGB {
  const value = decls.get(token);
  expect(value, `${token} present`).toBeDefined();
  const match = /#([0-9a-f]{6})/.exec(value!);
  expect(match, `${token} is a 6-digit hex`).not.toBeNull();
  const hex = match![1];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. */
function luminance([r, g, b]: RGB): number {
  const channel = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Alpha-composite a 15% token tint over an opaque surface. */
function tint15(fg: RGB, bg: RGB): RGB {
  return fg.map((value, index) => 0.15 * value + 0.85 * bg[index]) as RGB;
}

/** Assert AA text contrast for fg-token on each surface-token. */
function expectTextOn(decls: Map<string, string>, fg: string, surfaces: string[]) {
  const fgRgb = tokenHex(decls, fg);
  for (const surface of surfaces) {
    const ratio = contrast(fgRgb, tokenHex(decls, surface));
    expect(
      ratio,
      `${fg} on ${surface}: ${ratio.toFixed(2)} — AA 4.5:1`,
    ).toBeGreaterThanOrEqual(4.5);
  }
}

/** Assert AA non-text (3:1) contrast for fg-token on each surface-token. */
function expectEdgeOn(decls: Map<string, string>, fg: string, surfaces: string[]) {
  const fgRgb = tokenHex(decls, fg);
  for (const surface of surfaces) {
    const ratio = contrast(fgRgb, tokenHex(decls, surface));
    expect(
      ratio,
      `${fg} on ${surface}: ${ratio.toFixed(2)} — 1.4.11 3:1`,
    ).toBeGreaterThanOrEqual(3);
  }
}

describe("contrast pairs — dark theme (02-TOKENS.md §4)", () => {
  const textSurfaces = ["--color-bg-base", "--color-bg-well", "--color-bg-elevated"];

  it.each([
    "--color-text-primary",
    "--color-text-secondary",
    "--color-text-muted", // worst case is elevated — 4.8:1 per spec
    "--color-iris-bright",
    "--color-confidence",
    "--color-success",
    "--color-warning",
    "--color-error",
    "--color-info", // v1 value failed on elevated (4.2) — v2 recomputed
    "--web-tone-update", // lilac «пришло обновление» — ≈6.8:1 on dark base (15-WOW §14.6.1 §4)
  ])("%s clears AA 4.5:1 on base/well/elevated", (token) => {
    expectTextOn(darkDecls, token, textSurfaces);
  });

  it("text-primary clears AA on the canvas floor", () => {
    expectTextOn(darkDecls, "--color-text-primary", ["--color-well-canvas"]);
  });

  it("iris (brand) is text-grade on base only; graphics-grade everywhere", () => {
    expectTextOn(darkDecls, "--color-iris", ["--color-bg-base"]);
    expectEdgeOn(darkDecls, "--color-iris", ["--color-bg-well", "--color-bg-elevated"]);
  });

  it("border and focus ring clear 1.4.11 / 2.4.11 3:1 on every surface", () => {
    expectEdgeOn(darkDecls, "--color-border", textSurfaces);
    expectEdgeOn(darkDecls, "--color-focus", textSurfaces);
  });

  it("inverse text clears AA on both solid iris fills", () => {
    const inverse = tokenHex(darkDecls, "--color-text-inverse");
    for (const fill of ["--color-iris-solid", "--color-iris-solid-hover"]) {
      const ratio = contrast(inverse, tokenHex(darkDecls, fill));
      expect(ratio, `${fill}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("contrast pairs — light theme (02-TOKENS.md §4; activated in И5)", () => {
  const textSurfaces = ["--color-bg-well", "--color-bg-base", "--color-bg-elevated"];

  it.each([
    "--color-text-primary",
    "--color-text-secondary",
    "--color-text-muted",
    "--color-iris-bright", // "bright" flips darker in light — AA text
    "--color-confidence",
    "--color-success",
    "--color-error",
    "--color-info",
    "--web-tone-update", // lilac light column #6e5a94 — ≈5.5:1 on light base (15-WOW §14.6.1 §4)
  ])("%s clears AA 4.5:1 on well/base/elevated", (token) => {
    expectTextOn(lightDecls, token, textSurfaces);
  });

  it("border and focus ring clear 1.4.11 / 2.4.11 3:1 on light surfaces", () => {
    expectEdgeOn(lightDecls, "--color-border", textSurfaces);
    expectEdgeOn(lightDecls, "--color-focus", textSurfaces);
  });

  it("inverse text clears AA on both solid iris fills", () => {
    const inverse = tokenHex(lightDecls, "--color-text-inverse");
    for (const fill of ["--color-iris-solid", "--color-iris-solid-hover"]) {
      const ratio = contrast(inverse, tokenHex(lightDecls, fill));
      expect(ratio, `${fill}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("warning badge contrast — /15 tint over the theme well (spec §3.1 ≥4.5)", () => {
  it("light: #8a5a17 on the tint clears AA (the AGW-2 P2-1 regression lock)", () => {
    const well = tokenHex(lightDecls, "--color-bg-well");
    const warning = tokenHex(lightDecls, "--color-warning");
    expect(warning).toEqual([0x8a, 0x5a, 0x17]);
    expect(contrast(warning, tint15(warning, well))).toBeGreaterThanOrEqual(4.5);
    const elevated = tokenHex(lightDecls, "--color-bg-elevated");
    expect(contrast(warning, well)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(warning, elevated)).toBeGreaterThanOrEqual(4.5);
  });

  it("dark: #d9a03f (v2) on the tint stays AA over the new charcoal well", () => {
    const well = tokenHex(darkDecls, "--color-bg-well");
    const warning = tokenHex(darkDecls, "--color-warning");
    expect(warning).toEqual([0xd9, 0xa0, 0x3f]); // v1 #b8852a → v2 (И0)
    expect(contrast(warning, tint15(warning, well))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("viewer ↔ board token parity (ADR 0006 — single source of truth)", () => {
  it("every canon custom property exists in both tracks with identical values", () => {
    for (const [name, value] of darkDecls) {
      expect(boardDarkDecls.get(name), `${name} missing on the board (dark)`).toBe(
        value,
      );
    }
    for (const [name, value] of lightDecls) {
      expect(boardLightDecls.get(name), `${name} missing on the board (light)`).toBe(
        value,
      );
    }
  });

  it("the board defines nothing beyond the canon set + its frozen appendix", () => {
    const boardOnlyDark = [...boardDarkDecls.keys()].filter(
      (name) => !darkDecls.has(name),
    );
    expect(boardOnlyDark.sort()).toEqual([...BOARD_ONLY_TOKENS].sort());
    const boardOnlyLight = [...boardLightDecls.keys()].filter(
      (name) => !lightDecls.has(name),
    );
    expect(boardOnlyLight.sort()).toEqual([...BOARD_ONLY_TOKENS].sort());
  });
});

describe("self-hosted fonts (T4)", () => {
  it("stacks the self-hosted variable families ahead of the static names", () => {
    expect(tokensCss).toMatch(/--font-ui:\s*"Inter Variable", "Inter"/);
    expect(tokensCss).toMatch(/--font-scroll:\s*"Lora Variable", "Lora"/);
    expect(tokensCss).toMatch(/--font-mono:[^;]*"JetBrains Mono"/);
  });

  it("serves fonts from the bundle, not Google Fonts", () => {
    expect(indexHtml).not.toContain("fonts.googleapis.com");
    expect(indexHtml).not.toContain("fonts.gstatic.com");
  });
});

describe("theme bootstrap (design-system.md §9)", () => {
  it("resolves the theme before first paint with the provider's contract", () => {
    // UI-23 migration: the new registry key first, the legacy fallback second.
    expect(indexHtml).toContain("vesmaro.theme");
    expect(indexHtml).toContain("mnemos-eyes:theme");
    expect(
      indexHtml.indexOf("vesmaro.theme"),
      "the new key must be consulted before the legacy one",
    ).toBeLessThan(indexHtml.indexOf("mnemos-eyes:theme"));
    expect(indexHtml).toContain("prefers-color-scheme"); // system default
    expect(indexHtml).toContain("dataset.theme"); // [data-theme] switching
  });

  it("carries a theme-color meta whose hexes match the resolved surface tokens", () => {
    // Blueprint §12.7: the meta follows the RESOLVED theme — the bootstrap
    // script writes the dark/light --color-bg-base values, the provider
    // re-reads the live token after mount. The hexes here are the guard
    // against drift between index.html and tokens.css.
    expect(indexHtml).toMatch(/<meta name="theme-color" content="#[0-9a-f]{6}"/);
    const darkBase = darkDecls.get("--color-bg-base")!;
    const lightBase = lightDecls.get("--color-bg-base")!;
    expect(darkBase).toMatch(/^#[0-9a-f]{6}$/);
    expect(lightBase).toMatch(/^#[0-9a-f]{6}$/);
    expect(indexHtml).toContain(darkBase);
    expect(indexHtml).toContain(lightBase);
  });
});

describe("motion attribute (UI-23, vesmaro.motion reduced branches)", () => {
  it("mirrors the reduced-motion durations for the forced regime", () => {
    expect(tokensCss).toContain('[data-motion="reduced"]');
    // The forced block must carry the same zeroed durations as the OS block.
    const forced =
      tokensCss.match(/\[data-motion="reduced"\]\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(forced).toContain("--duration-iris: 0ms");
    expect(forced).toContain("--duration-slow: 0ms");
    expect(forced).toContain("--duration-normal: 0ms");
    expect(forced).toContain("--duration-fast: 80ms");
    expect(forced).toContain("--duration-impulse: 0ms");
    expect(forced).toContain("--duration-awaken: 0ms");
    expect(forced).toContain("--duration-attention: 0ms");
    expect(forced).toContain("--duration-attention-hold: 0ms");
    // v12 golden (ME-071 W0): the forced regime mirrors the OS block.
    expect(forced).toContain("--duration-web-idle: 0ms");
    expect(forced).toContain("--duration-flight: 0ms");
    expect(forced).toContain("--duration-tone-temp: 1500ms");
    expect(forced).toContain("--duration-tone-hold: 1500ms");
    expect(forced).toContain("--duration-tone-fade: 0ms");
    expect(forced).toContain("--duration-flash-hold: 1500ms");
  });
});

describe("density bootstrap (Ф1, concept §3.3)", () => {
  it("applies the stored density before first paint with the provider's contract", () => {
    expect(indexHtml).toContain("vesmaro.density"); // storage key
    expect(indexHtml).toContain("dataset.density"); // [data-density] switching
    // Only compact is an override; anything else falls back to comfortable.
    expect(indexHtml).toMatch(/density === "compact" \? "compact" : "comfortable"/);
  });
});
