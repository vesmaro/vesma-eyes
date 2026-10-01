# vesma-eyes — Design System Spec

> Status: **v2 «Живая кора»** (И0 token wave merged 2026-09-29, АРХКОМ
> 2026-09-28 verdict). Values below are the v2 canon; the full token spec
> (inventory, neuro layer, contrast pairs, v1→v2 delta table) lives in
> [design/02-TOKENS.md](design/02-TOKENS.md).
> Owner: `@GCW: Senior Frontend Developer`.
> Lore grounding: [design-brief.md](design-brief.md), [design/01-CHARTER.md](design/01-CHARTER.md).
> Implementation: tokens live in `viewer/src/styles/tokens.css` and
> `web/styles/tokens.css` (kept in parity per ADR 0006; enforced by
> `tokens.test.ts`).

---

## 1. Iris-accent decision: **deep-well teal** ✓

**Recommendation: teal/cyan (`--color-iris`)**, not Mnemosyne gold/amber.

**Rationale:** The lore is a *well of memory* — water, depth, dark reflections.
Teal reads as depth and introspection; it passes WCAG AA contrast on the dark
base at the chosen lightness level. Gold/amber skews warm and heroic — better
suited to a retrieval *triumph* accent than an ambient *gazing* interface.
Gold is reserved as a **confidence / highlight accent** (`--color-confidence`)
for high-confidence memories surfacing from depth, which makes the warm-cool
pairing semantically meaningful rather than decorative.

> Open question for Tech Lead/user: confirm teal vs gold as primary, or swap
> (gold primary, teal secondary for cluster graph edges). See §2.

---

## 2. Color tokens

### v2 delta (И0 — 2026-09-29)

The v1 values evolved (legal per ADR 0006 §8 — names stay frozen, values
recomputed to WCAG 2.2 AA): surfaces moved from the blue-violet bias to
**charcoal**; `--color-iris-bright` `#22b5c4` → `#4fc2ce` (~9:1 on base);
statuses recomputed (`success` live-anchor, `warning`/`error` research
anchors, `info` = bright iris — the v1 value failed AA on `elevated`);
`--duration-iris` 3000 ms → 5000 ms (4–6 s ambient window). The complete
delta table with rationale: [design/02-TOKENS.md](design/02-TOKENS.md) §5.
On top of the frozen names the **neuro layer** adds names only:
`--color-well-canvas`, `--color-focus` + focus-ring geometry, myelin
hairlines, `--strata-*` washes, `--synapse-*` pulse palette, `--glow-*`
ladder, the 11/13/15/17 px micro type scale, `--ease-enter/--ease-exit`
and `--duration-impulse`. No component consumes the neuro layer yet —
that is what waves И1+ are for.

### Dark theme (default — "phosphor well")

```css
/* src/styles/tokens.css — dark theme (default) */
:root {
  /* ── Strata ladder (charcoal; never #000) ───────────────────── */
  --color-well-canvas:    #090b0f;  /* NEW v2 — graph/hero canvas floor */
  --color-bg-base:        #0d0f14;  /* page background */
  --color-bg-well:        #12161d;  /* cards, panels, sidebar */
  --color-bg-elevated:    #161b23;  /* popovers, drawers, inputs */
  --color-bg-overlay:     #1c222c;  /* modal sheets + backdrop tint */
  --color-scroll-bg:      #151a22;  /* memory scroll "parchment" */
  --color-scroll-border:  #242931;

  /* ── Iris accent (teal — depth) ──────────────────────────────── */
  --color-iris-dim:       #0e4a52;  /* inactive iris states */
  --color-iris:           #1a8a96;  /* brand anchor, solid fills */
  --color-iris-bright:    #4fc2ce;  /* interactive text accent, ~9:1 on base */
  --color-iris-glow:      #4fc2ce40;/* halo; layer opacity ≤0.35 */
  --color-iris-solid:     #1a8a96;  /* fill under inverse text 4.7:1 */
  --color-iris-solid-hover: #4fc2ce;/* fill hover, inverse text 9.1:1 */

  /* ── Confidence accent (amber / gold — warmth, value) ────────── */
  --color-confidence:     #c9933a;  /* high-confidence memory highlight */
  --color-confidence-dim: #7a5520;  /* muted confidence */

  /* ── Semantic status (never color-only) ──────────────────────── */
  --color-success:        #3fbf7f;  /* live */
  --color-warning:        #d9a03f;
  --color-error:          #e0655c;
  --color-info:           #4fc2ce;  /* informational = bright iris */

  /* ── Text ────────────────────────────────────────────────────── */
  --color-text-primary:   #e6edf3;  /* main reading text */
  --color-text-secondary: #9aa7b4;  /* labels, captions, timestamps */
  --color-text-muted:     #7c8894;  /* worst-case 4.8:1 on elevated */
  --color-text-inverse:   #0d0f14;  /* text on light surfaces */

  /* ── Border / separator ──────────────────────────────────────── */
  --color-border-subtle:  #1c232e;  /* decorative separators only */
  --color-border:         #5e687e;  /* functional edge, ≥3:1 (1.4.11) */
  --color-border-iris:    #4fc2ce40;/* iris hover edge tint */

  /* ── Neuro layer (new names — see design/02-TOKENS.md §2) ────── */
  --color-focus: #4fc2ce;  --focus-ring-width: 2px;  --focus-ring-offset: 2px;
  --myelin-hairline: rgb(230 237 243 / 0.07);  --myelin-strong: rgb(230 237 243 / 0.14);
  --strata-memory: rgb(79 194 206 / 0.05);     --strata-tasks: rgb(122 138 158 / 0.05);
  --strata-agents: rgb(201 147 58 / 0.05);     --strata-docs: rgb(186 176 158 / 0.05);
  --strata-system: rgb(122 138 158 / 0.035);
  --synapse-idle: rgb(122 138 158 / 0.35);     --synapse-recall: #4fc2ce;
  --synapse-write: #c9933a;                    --synapse-error: #e0655c;
  --glow-iris: 0 0 24px rgb(79 194 206 / 0.35); --glow-gold: 0 0 24px rgb(201 147 58 / 0.30);
  --glow-live: 0 0 16px rgb(63 191 127 / 0.30); --glow-error: 0 0 16px rgb(224 101 92 / 0.30);
}
```

### Light theme («береста» — defined in И0, ACTIVATED in И5)

```css
[data-theme="light"] {
  --color-well-canvas:    #e6eaed;
  --color-bg-base:        #f5f6f8;
  --color-bg-well:        #ffffff;
  --color-bg-elevated:    #eff1f5;
  --color-bg-overlay:     #e4e7ef;
  --color-scroll-bg:      #fafbfc;
  --color-scroll-border:  #dee1ea;

  --color-iris-dim:       #9dd4db;
  --color-iris:           #1a8a96;
  --color-iris-bright:    #136e79;  /* "bright" flips darker in light — AA text */
  --color-iris-glow:      #1a8a9620;
  --color-iris-solid:     #136e79;  /* inverse text 7.5:1 */
  --color-iris-solid-hover: #0f5f6a;/* inverse text 8.6:1 */

  --color-confidence:     #8a5a17;  /* 5.9:1 on white */
  --color-confidence-dim: #e8c98a;

  --color-success:        #1d6e48;
  --color-warning:        #8a5a17;
  --color-error:          #8a2020;
  --color-info:           #136e79;

  --color-text-primary:   #1a1e2e;
  --color-text-secondary: #4a5268;
  --color-text-muted:     #636a80;  /* 4.8:1 on elevated */
  --color-text-inverse:   #f5f6f8;

  --color-border-subtle:  #dee1ea;
  --color-border:         #6a7488;  /* 4.7:1 on white */
  --color-border-iris:    #1a8a9633;

  /* Neuro layer — light values: dark myelin, dark strata tints of the
     same hues, glow alpha ×~0.7 (light surfaces scatter less). */
  --color-focus: #0f5f6a;
}
```

---

## 3. Typography

### Scale

```css
:root {
  /* ── UI font — humanist sans ─────────────────────────────────── */
  --font-ui:              "Inter", "Helvetica Neue", system-ui, sans-serif;

  /* ── Memory content — "scroll" feel ─────────────────────────── */
  /* Open question: serif (Lora) vs mono (JetBrains Mono) — see §9 */
  --font-scroll:          "Lora", "Georgia", serif;          /* recommended */
  /* alt: --font-scroll: "JetBrains Mono", "Fira Code", monospace; */

  /* ── Sizes (fluid scale, clamp-based) ───────────────────────── */
  --text-xs:   0.75rem;   /* 12px — captions, timestamps */
  --text-sm:   0.875rem;  /* 14px — secondary labels, tag badges */
  --text-base: 1rem;      /* 16px — body / memory list items */
  --text-md:   1.125rem;  /* 18px — memory detail content */
  --text-lg:   1.25rem;   /* 20px — section headings */
  --text-xl:   1.5rem;    /* 24px — view titles */
  --text-2xl:  2rem;      /* 32px — hero / empty state */

  /* ── Line heights ────────────────────────────────────────────── */
  --leading-tight:  1.25;
  --leading-normal: 1.5;
  --leading-relaxed:1.7;  /* for memory scroll content */

  /* ── Font weights ────────────────────────────────────────────── */
  --weight-regular: 400;
  --weight-medium:  500;
  --weight-semibold:600;

  /* ── Neuro micro scale (v2 — instrument density) ─────────────── */
  --text-caps: 0.6875rem;   /* 11px caps labels (+ --tracking-caps) */
  --text-data: 0.8125rem;   /* 13px dense operational data */
  --text-ui:   0.9375rem;   /* 15px base UI */
  --text-body: 1.0625rem;   /* 17px comfortable lists/cards */
  --tracking-caps: 0.04em;
  --numeric-tnum: tabular-nums;  /* all numbers: ids, counters, timers */
}
```

**Memory content** uses `--font-scroll` at `--text-md` / `--leading-relaxed` — the "scroll" reading feel. All UI chrome uses `--font-ui`.

---

## 4. Spacing

8 px grid. Token names map to multipliers.

```css
:root {
  --space-1:  0.25rem;  /*  4px */
  --space-2:  0.5rem;   /*  8px */
  --space-3:  0.75rem;  /* 12px */
  --space-4:  1rem;     /* 16px */
  --space-5:  1.25rem;  /* 20px */
  --space-6:  1.5rem;   /* 24px */
  --space-8:  2rem;     /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-24: 6rem;     /* 96px */
}
```

---

## 5. Radius

```css
:root {
  --radius-sm:   4px;   /* tag badges, small chips */
  --radius-md:   8px;   /* cards, panels */
  --radius-lg:   16px;  /* memory scroll, modal sheets */
  --radius-xl:   24px;  /* search bar (the "pupil" oval) */
  --radius-full: 9999px;/* iris logo, avatar, circular indicators */
}
```

---

## 6. Elevation / depth

The obsidian well layering system. Higher elevation = closer to the viewer.

```css
:root {
  --shadow-well:    0 1px 3px 0 rgba(0,0,0,.4);            /* resting card */
  --shadow-raised:  0 4px 12px 0 rgba(0,0,0,.5);           /* hover card */
  --shadow-float:   0 8px 24px 0 rgba(0,0,0,.6);           /* popover */
  --shadow-modal:   0 16px 48px 0 rgba(0,0,0,.7);          /* modal / sheet */
  --shadow-iris:    0 0 32px 8px var(--color-iris-glow);   /* iris pulse */
}
```

In light mode, shadow opacity values halve (applied via CSS custom property override inside `[data-theme="light"]`).

---

## 7. Motion tokens

```css
:root {
  /* ── Durations ───────────────────────────────────────────────── */
  --duration-instant:   80ms;
  --duration-fast:      150ms;
  --duration-normal:    250ms;
  --duration-slow:      400ms;
  --duration-stagger:   40ms;   /* per-item step (max 8 in chain) */
  --duration-impulse:   240ms;  /* v2 — synapse pulse lifetime */
  --duration-iris:      5000ms; /* v2 — breathing cycle, 4–6s window (was 3s) */

  /* ── Easing ──────────────────────────────────────────────────── */
  --ease-in-out:  cubic-bezier(0.4, 0, 0.2, 1);
  --ease-out:     cubic-bezier(0, 0, 0.2, 1);
  --ease-enter:   cubic-bezier(0.16, 1, 0.3, 1); /* v2 — entries */
  --ease-exit:    cubic-bezier(0.4, 0, 1, 1);    /* v2 — exits */
  --ease-spring:  cubic-bezier(0.34, 1.56, 0.64, 1); /* drag/reorder only */
  --ease-breath:  cubic-bezier(0.45, 0.05, 0.55, 0.95); /* slow iris breathing */
}

/* Respect reduced-motion globally */
@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-iris:   0ms;
    --duration-slow:   0ms;
    --duration-normal: 0ms;
    --duration-fast:   80ms; /* keep instant micro-feedback */
    --duration-impulse: 0ms; /* pulses → static tint */
  }
}
```

The forced user regime `vesmaro.motion="reduced"` mirrors the OS media
query declaration-for-declaration via `[data-motion="reduced"]` (applied by
`lib/motionStore.ts`). Full motion canon: [design/06-MOTION.md](design/06-MOTION.md).

### Motion budget

| Animation | Token | Notes |
| --- | --- | --- |
| Breathing iris (idle) | `--duration-iris` 5 s | Single `@keyframes breathe` on `IrisLogo`. Disabled at `prefers-reduced-motion`. v2: 3 s → 5 s (4–6 s ambient window; the T4 pupil keeps its own 4.8 s derived cycle). |
| Result card surface | `--duration-slow` 400 ms | `opacity 0→1` + `translateY 8px→0`. Staggered per-item (max 5 items). |
| Search pupil focus | `--duration-normal` 250 ms | Border-color + shadow expand on focus. |
| Tab / route transition | `--duration-fast` 150 ms | `opacity` only — no layout shift. |
| Tag badge hover | `--duration-instant` 80 ms | Background color only. |
| Error shake | `--duration-fast` 150 ms | `translateX` ±4 px × 2. Disabled at `prefers-reduced-motion`. |

**Hard rule:** maximum **1 ambient animation** running at any time (the breathing iris). All others are interaction-triggered.

---

## 8. Signature moments — concrete UI specs

### 8.1 Empty state / dashboard hero — "the well"

- Full-view centered layout: `IrisLogo` at 160 px diameter, iris-glow shadow.
- Tagline: `"a gaze into oneself"` — `--text-xl`, `--color-text-secondary`, `--font-ui`.
- Below: the `SearchBar` as the primary CTA — `--radius-xl` oval, `--color-iris` border on focus.
- Background: `--color-bg-base`, no pattern. Depth created by the iris glow alone.

### 8.2 Search — "pupil focus"

- Single bar, `--radius-xl`, spans 60% of the viewport width (min 320 px, max 640 px).
- On focus: `box-shadow` expands with `--shadow-iris`; border transitions to `--color-iris-bright`.
- Results surface below with staggered `opacity`+`translateY` entrance (max 5 staggered, rest instant).
- Search type indicator (FTS / semantic / hybrid) as a small `TagBadge` on the active result.

### 8.3 Memory detail — "the scroll"

- Card with `--radius-lg`, `--color-scroll-bg`, inner `--shadow-well`.
- Content in `--font-scroll`, `--text-md`, `--leading-relaxed`, `--color-text-primary`.
- Provenance bar at the top: agent name + timestamp in `--text-xs`, `--color-text-secondary`.
- Confidence score: amber `--color-confidence` dot indicator (●) beside the provenance bar.
- Tags row below content: `TagBadge` chips in `--color-bg-elevated`.
- Raw content toggle (collapsed by default) if `raw_content` differs from effective content.

### 8.4 Idle — "breathing iris"

```css
@keyframes breathe {
  0%, 100% { transform: scale(1);    opacity: 0.85; }
  50%       { transform: scale(1.04); opacity: 1;    }
}

.iris-breathing {
  animation: breathe var(--duration-iris) var(--ease-breath) infinite;
}
```

- Applied **only** to the `IrisLogo` on the dashboard/empty state.
- Stops when user interacts (search focus, navigation) — `animation-play-state: paused`.
- Removed entirely at `prefers-reduced-motion: reduce`.

---

## 9. Theming approach

- Tokens defined as CSS custom properties on `:root` (dark) and `[data-theme="light"]`.
- Tailwind config reads the tokens via `var(--...)` in the theme extension.
- shadcn/ui components inherit tokens via the Tailwind config; no inline style overrides.
- Theme is toggled by setting `document.documentElement.dataset.theme = "light"` (or removing attribute for dark).
- Persisted in `localStorage.getItem("vesmaro.theme")` (UI-23 migration, spec 2026-09-23 §4.2): the legacy `vesma-eyes:theme` is still READ as a fallback so an updated browser keeps its old choice — but never written; the legacy key dies out naturally. Choosing «Системная» removes both records.
- Default: system preference via `prefers-color-scheme` (followed live while no explicit choice exists). The settings hub offers all three positions (system/light/dark); the top-bar toggle stays two-position (dark↔light).

### 9.1 Preference registry (`vesmaro.*`, UI-23)

Canonical table per settings-hub-v2 spec §4.1 (descriptive mirror of
`viewer/src/lib/settingsRegistry.ts`; the drift guard lives in
`settingsRegistry.test.ts`):

| Ключ | Тип | Дефолт | Область | Владелец |
| --- | --- | --- | --- | --- |
| `vesmaro.lang` | enum `ru\|en` | `ru` | глобально | `src/i18n/index.ts` |
| `vesmaro.density` | enum `comfortable\|compact` | `comfortable` | глобально | `src/components/density-provider.tsx` |
| `vesmaro.theme` | enum `system\|light\|dark` | `system` | глобально | `src/components/theme-provider.tsx` (легаси-чтение `vesma-eyes:theme`) |
| `vesmaro.motion` | enum `system\|reduced` | `system` | глобально | `src/lib/motionStore.ts` (NEW v2: `reduced` форсит reduced-ветки независимо от ОС) |
| `vesmaro.boardStyle` | enum `groups\|classic` | `groups` | домен «Задачи» | `src/lib/boardStyleStore.ts` + `tasksViewPrefs.ts` |
| `vesmaro.sidebarCollapsed` | flag `1\|0` | `0` | глобально | `src/lib/sidebarState.ts` (потребитель `Shell.tsx`) |
| `vesmaro.agents.onboardingDone` | flag `1\|0` | `0` | компонент | `features/agents/executionPrefs.ts` (хаб умеет сбросить) |
| `vesmaro.tasksView` | — | — | — | УСТАРЕЛ (2026-09-22): маршрут — контракт; старые записи игнорируются |

Вне реестра (state-ключи, не preference): `vesmaro.taskGroups`,
`vesmaro.agents.terminalCollapsed`, `vesmaro.agents.feedCollapsed`;
учётные данные (`vesmaro.uiToken`, `vesmaro.boardToken`, auth-токен) — не
настройки. Область действия всех preference — устройство и браузер
(кросс-девайсной синхронизации нет, спека §4.4).

---

## 10. Open questions for Tech Lead / user

1. **Font choice for memory scroll content:** serif `Lora` (contemplative "scroll" feel) vs mono `JetBrains Mono` (technical "raw memory" feel). Both are defensible. Recommendation: Lora for default, with a mono variant for memories tagged `type:rule` or `type:code`.
2. **Iris accent confirmation:** teal recommended above; confirm or flip to gold-primary/teal-secondary.
3. **Graph library for cluster view:** `@xyflow/react` (React Flow) vs D3-force. React Flow is higher-level and better for labeled nodes; D3 gives more animation control for the "depth" metaphor. See [component-inventory.md](component-inventory.md) §8.
