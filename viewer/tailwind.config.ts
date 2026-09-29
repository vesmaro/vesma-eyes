import type { Config } from "tailwindcss";

/**
 * Tailwind maps every colour/typography/spacing/radius utility to the semantic
 * design tokens from `src/styles/tokens.css` (docs/design-system.md).
 * Components must never use literal colours — only these token-bound names.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // Theme switching is attribute-driven ([data-theme="light"]); dark tokens
  // live on :root, so Tailwind's own dark: modifier is not needed.
  darkMode: ["selector", '[data-theme="light"]'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        background: "var(--color-bg-base)",
        well: "var(--color-bg-well)",
        elevated: "var(--color-bg-elevated)",
        overlay: "var(--color-bg-overlay)",
        scroll: {
          bg: "var(--color-scroll-bg)",
          border: "var(--color-scroll-border)",
        },
        // Iris accent (teal — depth)
        iris: {
          dim: "var(--color-iris-dim)",
          DEFAULT: "var(--color-iris)",
          bright: "var(--color-iris-bright)",
          glow: "var(--color-iris-glow)",
          strong: "var(--color-iris-solid)", // AA solid fill under inverse text
          "strong-hover": "var(--color-iris-solid-hover)",
        },
        // Confidence accent (gold — value signal)
        confidence: {
          dim: "var(--color-confidence-dim)",
          DEFAULT: "var(--color-confidence)",
        },
        // Semantic status
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        error: "var(--color-error)",
        info: "var(--color-info)",
        // Text
        foreground: "var(--color-text-primary)",
        "foreground-secondary": "var(--color-text-secondary)",
        "foreground-muted": "var(--color-text-muted)",
        "foreground-inverse": "var(--color-text-inverse)",
        // Borders
        border: "var(--color-border)",
        "border-subtle": "var(--color-border-subtle)",
        "border-iris": "var(--color-border-iris)",
        // Neuro layer (И0, docs/design/02-TOKENS.md §2) — additive mappings;
        // no component consumes them yet (И1+ does), so the generated CSS
        // is unchanged until the utilities appear in markup.
        canvas: "var(--color-well-canvas)",
        focus: "var(--color-focus)",
        myelin: {
          hairline: "var(--myelin-hairline)",
          strong: "var(--myelin-strong)",
        },
        synapse: {
          idle: "var(--synapse-idle)",
          recall: "var(--synapse-recall)",
          write: "var(--synapse-write)",
          error: "var(--synapse-error)",
        },
      },
      // Neuro strata washes (canvas/hero surfaces only — never on text cards).
      backgroundImage: {
        "strata-memory": "var(--strata-memory)",
        "strata-tasks": "var(--strata-tasks)",
        "strata-agents": "var(--strata-agents)",
        "strata-docs": "var(--strata-docs)",
        "strata-system": "var(--strata-system)",
      },
      // Neuro glow ladder (activity = light; ≤2 sources per viewport).
      borderWidth: {
        hairline: "var(--line-hairline)",
        myelin: "var(--line-myelin)",
        focus: "var(--focus-ring-width)",
      },
      fontFamily: {
        ui: "var(--font-ui)",
        scroll: "var(--font-scroll)",
      },
      // Density (redesign concept §3.3): operational rows/lists consume the
      // user-driven tokens; airy surfaces pin to --row-h-airy deliberately.
      spacing: {
        row: "var(--row-h)",
        "row-airy": "var(--row-h-airy)",
        "list-gap": "var(--list-gap)",
        // Shell geometry (union И1 — stand 03 §2–§5): the one shell for all
        // screens. Powers h-topbar/top-topbar, w-sidebar/w-sidebar-rail,
        // h-crumbs/top-crumbs and w-search utilities.
        topbar: "var(--shell-topbar-h)",
        sidebar: "var(--shell-sidebar-w)",
        "sidebar-rail": "var(--shell-sidebar-rail-w)",
        crumbs: "var(--shell-crumbs-h)",
        search: "var(--shell-search-w)",
      },
      maxWidth: {
        scroll: "var(--measure-scroll)",
      },
      fontSize: {
        xs: "var(--text-xs)",
        sm: "var(--text-sm)",
        base: "var(--text-base)",
        md: "var(--text-md)",
        lg: "var(--text-lg)",
        xl: "var(--text-xl)",
        "2xl": "var(--text-2xl)",
        // Neuro micro scale (И0): caps labels, dense data, shell UI, body.
        caps: "var(--text-caps)",
        data: "var(--text-data)",
        ui: "var(--text-ui)",
        body: "var(--text-body)",
      },
      letterSpacing: {
        caps: "var(--tracking-caps)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        well: "var(--shadow-well)",
        raised: "var(--shadow-raised)",
        float: "var(--shadow-float)",
        modal: "var(--shadow-modal)",
        iris: "var(--shadow-iris)",
        // Neuro glow ladder (activity = light; ≤2 sources per viewport).
        "glow-iris": "var(--glow-iris)",
        "glow-gold": "var(--glow-gold)",
        "glow-live": "var(--glow-live)",
        "glow-error": "var(--glow-error)",
      },
      transitionDuration: {
        instant: "var(--duration-instant)",
        fast: "var(--duration-fast)",
        normal: "var(--duration-normal)",
        slow: "var(--duration-slow)",
        iris: "var(--duration-iris)",
        // Neuro: synapse pulse lifetime (reduced-motion zeroes it in CSS).
        impulse: "var(--duration-impulse)",
      },
      transitionTimingFunction: {
        "in-out": "var(--ease-in-out)",
        out: "var(--ease-out)",
        spring: "var(--ease-spring)",
        breath: "var(--ease-breath)",
        // Neuro pair: whatever enters with `enter` leaves with `exit`.
        enter: "var(--ease-enter)",
        exit: "var(--ease-exit)",
      },
    },
  },
  plugins: [],
} satisfies Config;
