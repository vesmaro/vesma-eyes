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
        // Phase 1 (blueprint §5.2): the functional HUD backdrop on canvas and
        // the palette backdrop tint — both themed (light values serve non-hero
        // light canvases; the hero pins the dark column via [data-well-window]).
        "hud-veil": "var(--hud-veil)",
        "palette-scrim": "var(--palette-scrim)",
        // Token-derived 15% tints (the /15 alpha pattern in Badge variants).
        // Tailwind v3 cannot resolve alpha modifiers against var() colours —
        // `bg-iris/15` silently produced NO utility; these generate real
        // color-mix() output bound to the same canon tokens.
        "iris-tint": "color-mix(in srgb, var(--color-iris) 15%, transparent)",
        "confidence-tint":
          "color-mix(in srgb, var(--color-confidence) 15%, transparent)",
        "success-tint":
          "color-mix(in srgb, var(--color-success) 15%, transparent)",
        "warning-tint":
          "color-mix(in srgb, var(--color-warning) 15%, transparent)",
        "error-tint": "color-mix(in srgb, var(--color-error) 15%, transparent)",
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
      },
      height: {
        // Phase 1: the Overview hero is the only full-height gesture (§5.2).
        "well-hero": "var(--well-hero-h)",
      },
      minHeight: {
        "well-hero": "var(--well-hero-h)",
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
        // Phase 1: the single display step — Overview hero only (§5.2).
        display: "var(--text-display)",
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
        // Phase 1: the palette's active-row leading edge (§6.2 — left focus
        // bar; the ring itself never moves layout).
        "inset-focus": "inset 2px 0 0 0 var(--color-focus)",
      },
      transitionDuration: {
        instant: "var(--duration-instant)",
        fast: "var(--duration-fast)",
        normal: "var(--duration-normal)",
        slow: "var(--duration-slow)",
        iris: "var(--duration-iris)",
        // Neuro: synapse pulse lifetime (reduced-motion zeroes it in CSS).
        impulse: "var(--duration-impulse)",
        // Phase 1 (§10): awakening wave + attention rhythm — reduced-motion
        // zeroes all three in tokens.css.
        awaken: "var(--duration-awaken)",
        attention: "var(--duration-attention)",
        "attention-hold": "var(--duration-attention-hold)",
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
