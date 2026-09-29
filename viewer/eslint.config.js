import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Generated and build output are out of lint scope.
  { ignores: ["dist", "coverage", "node_modules", "src/types/openapi.d.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
    },
  },
  {
    // shadcn/ui convention co-locates cva variant exports with the component
    // (buttonVariants/badgeVariants) and ThemeProvider ships with useTheme;
    // splitting them would diverge from the upstream shadcn layout for a
    // dev-only HMR nicety. DensityProvider and HotkeysProvider follow the
    // same provider+hook pattern as ThemeProvider (Ф1). routes.tsx is the
    // route TABLE (data with embedded elements), not an HMR-able component.
    files: [
      "src/components/ui/**/*.{ts,tsx}",
      "src/components/theme-provider.tsx",
      "src/components/density-provider.tsx",
      "src/layout/Hotkeys.tsx",
      "src/app/routes.tsx",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // АРХКОМ-8 verdict: dangerouslySetInnerHTML is banned EVERYWHERE ("запре-
    // щён всюду"), not only in the docs feature — docs is the one sanctioned
    // HTML-injection surface and its escape hatches must not normalize else-
    // where. The docs-scoped block below re-states it with a docs-specific
    // message; for docs files the later block wins (flat config: last match),
    // everywhere else THIS one fires.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            "dangerouslySetInnerHTML is forbidden app-wide (АРХКОМ-8): HTML entering the DOM must pass the docs pipeline's sanitizer or an explicit, reviewed exception — never a raw escape hatch.",
        },
        {
          selector: "Property[key.name='dangerouslySetInnerHTML']",
          message:
            "dangerouslySetInnerHTML is forbidden app-wide (АРХКОМ-8): HTML entering the DOM must pass the docs pipeline's sanitizer or an explicit, reviewed exception — never a raw escape hatch.",
        },
      ],
    },
  },
  {
    // Docs security gates (АРХКОМ-8 rework of contract 2026-09-22 §9.1):
    // raw HTML is now ALLOWED but only through the pipeline
    // rehype-raw → rehype-sanitize(sanitizeSchema) — and dangerously-
    // SetInnerHTML stays banned at lint level everywhere, including the
    // one file allowed to open the pipeline.
    files: ["src/features/docs/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            "Docs gate (АРХКОМ-8): dangerouslySetInnerHTML is forbidden in the docs feature — sanitization runs inside the react-markdown pipeline.",
        },
        {
          selector: "Property[key.name='dangerouslySetInnerHTML']",
          message:
            "Docs gate (АРХКОМ-8): dangerouslySetInnerHTML is forbidden in the docs feature — sanitization runs inside the react-markdown pipeline.",
        },
        {
          // ME-022 (ME-013 P3-1): specifier-less (side-effect) imports and
          // `export *` carry no import names, so the no-restricted-imports
          // allowImportNames carve-outs above cannot see them — catch them
          // structurally. Type-only declarations always have specifiers, so
          // the type-import allowance stays intact.
          selector:
            "ImportDeclaration[source.value=/^(rehype-raw|rehype-sanitize|hast-util-sanitize)(\\/|$)/]:not(:has(ImportSpecifier))",
          message:
            "Docs gate (ME-022, ME-013 P3-1): a side-effect import still welds the sanitize stack onto this chunk — import the assembled pipeline (Markdown.tsx) or the schema config (sanitizeSchema.ts) instead.",
        },
        {
          selector:
            "ExportAllDeclaration[source.value=/^(rehype-raw|rehype-sanitize|hast-util-sanitize)(\\/|$)/]",
          message:
            "Docs gate (ME-022, ME-013 P3-1): `export *` re-exports the whole sanitize stack — it must not pass through docs modules.",
        },
      ],
    },
  },
  {
    // The app-wide single site for the privileged corpus pipeline (ADR 0020
    // Ф2 + review P2-2) and, since ME-013 (Amendment 1), for the mermaid
    // library too. FOUR restrictions live here. ME-022 (ME-013 P3-1/P3-2)
    // hardened the sanitize-stack pins: deep specifiers
    // ("rehype-sanitize/lib/index.js") and hast-util-sanitize itself are
    // restricted, not just the bare names. CONTROL SPLIT: this rule visits
    // only Import/Export declarations — dynamic import() is INVISIBLE to it;
    // the engine-wide grep-test in src/features/docs/architecture.test.ts
    // covers the dynamic half mechanically.
    // - rehype-raw/rehype-sanitize: the untrusted profile's import graph must
    //   stay statically free of the sanitize stack — the md-core/md-sanitize
    //   chunk split is only as real as this import rule.
    // - mermaid: since Amendment 1 the capability serves BOTH trust profiles
    //   and is rehomed to TextEngine/core/Mermaid.tsx — the ESLint invariant
    //   is «one mermaid import module», not «docs owns it». The lazy-chunk
    //   budget (ADR-0015, pool ≤450 KiB, never statically reachable) depends
    //   on this single dynamic import site.
    // - the pipeline.corpus MODULE itself: buildCorpusPipeline must be
    //   imported only by the curated wrapper (Markdown.tsx). A future lazy
    //   feature importing it would silently re-weld the md-sanitize pool into
    //   its chunk, and the budget gate would NOT catch it (gate 1 covers only
    //   the eager base set, gate 2 only md-core→md-sanitize edges) — so the
    //   boundary is lint-enforced. The group covers every specifier form:
    //   alias ("@/components/..."), relative ("./pipeline.corpus"), and the
    //   ".ts"-extension form. Exempt: the module itself, its test (identity
    //   pins), all other *.test files, Markdown.tsx and core/Mermaid.tsx
    //   (each gets its own union in the blocks below — later blocks win per
    //   flat-config merge).
    // This block is deliberately EARLY: feature blocks below override it with
    // UNIONS of their own pins (a later no-restricted-imports replaces, not
    // extends, for the files it matches).
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/components/TextEngine/core/pipeline.corpus.ts",
      "src/components/TextEngine/core/pipeline.corpus.test.ts",
      "src/components/TextEngine/core/Mermaid.tsx",
      "src/features/docs/Markdown.tsx",
      "src/**/*.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "rehype-raw",
              message:
                "ADR 0020 Ф2: rehype-raw is imported ONLY in TextEngine/core/pipeline.corpus.ts — anywhere else would weld the md-sanitize pool onto another import graph.",
            },
            {
              name: "rehype-sanitize",
              message:
                "ADR 0020 Ф2: rehype-sanitize is imported ONLY in TextEngine/core/pipeline.corpus.ts — the single sanitize gate is a chunk boundary, not just a lint nicety.",
            },
            {
              name: "mermaid",
              message:
                "ADR 0020 Amendment 1 (ME-013): mermaid is imported ONLY in TextEngine/core/Mermaid.tsx (its dynamic import IS the lazy chunk boundary) — import the MermaidDiagram component instead.",
            },
            {
              // ME-022 (ME-013 P3-2): the sanitize gate itself. Type-only
              // imports are compile-time-erased (no chunk impact); the
              // defaultSchema config allowance lives in the docs block below
              // (Ф2: the wrapper supplies the schema).
              name: "hast-util-sanitize",
              allowTypeImports: true,
              message:
                "ME-022 (ME-013 P3-2): hast-util-sanitize is the sanitizer itself — value imports live ONLY in TextEngine/core/pipeline.corpus.ts (type-only imports are allowed anywhere). A direct sanitize() call outside the pipeline bypasses the single sanitize gate.",
            },
          ],
          patterns: [
            {
              group: [
                "**/components/TextEngine/core/pipeline.corpus",
                "**/pipeline.corpus",
                "**/pipeline.corpus.ts",
              ],
              message:
                "ME-019 review P2-2: buildCorpusPipeline is consumed ONLY by features/docs/Markdown.tsx — a new importer would statically weld the md-sanitize vendor pool into its chunk, and the budget gate cannot see that (it checks the eager base set and md-core→md-sanitize edges only). Route the capability through the wrapper instead.",
            },
            {
              // ME-022 (ME-013 P3-1): deep specifiers are the same restricted
              // modules ("rehype-sanitize/lib/index.js" must not escape the
              // bare-name pin). allowTypeImports keeps compile-time-erased
              // type imports legal everywhere.
              group: [
                "rehype-raw/**",
                "rehype-sanitize/**",
                "hast-util-sanitize/**",
              ],
              allowTypeImports: true,
              message:
                "ME-022 (ME-013 P3-1): deep specifiers resolve to the same restricted sanitize stack — rehype-raw/rehype-sanitize/hast-util-sanitize value imports live ONLY in TextEngine/core/pipeline.corpus.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    // Since Ф2 (ADR 0020) the rehype-raw + rehype-sanitize pipeline lives in
    // core/pipeline.corpus.ts (the md-sanitize chunk boundary) — NO docs file
    // except the wrapper may touch the sanitize stack or import the corpus
    // pipeline module: the wrapper supplies the config (drop list + schema),
    // core assembles the order. Since ME-013 (Amendment 1) the mermaid
    // library lives in TextEngine/core/Mermaid.tsx — docs files import the
    // MermaidDiagram COMPONENT, never the library. This block REPLACES the
    // app-wide block above for docs files — the union of pins is repeated
    // here on purpose (flat config: last match wins).
    files: ["src/features/docs/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "rehype-raw",
              message:
                "Docs gate (АРХКОМ-8 + ADR 0020 Ф2): rehype-raw is imported only in TextEngine/core/pipeline.corpus.ts — the raw→sanitize order is assembled there; this file supplies the config instead.",
            },
            {
              name: "rehype-sanitize",
              message:
                "Docs gate (АРХКОМ-8 + ADR 0020 Ф2): rehype-sanitize is imported only in TextEngine/core/pipeline.corpus.ts — schemas must not multiply outside the single pipeline.",
            },
            {
              name: "mermaid",
              message:
                "Docs gate (АРХКОМ-8 + Amendment 1): mermaid is imported only in TextEngine/core/Mermaid.tsx — mount the MermaidDiagram component, never the library.",
            },
            {
              // ME-022 (ME-013 P3-2): sanitizeSchema.ts is the sanctioned
              // schema-config module (Ф2: the wrapper supplies the schema),
              // so the defaultSchema base and type-only imports stay legal in
              // docs; the sanitizer function itself does not.
              name: "hast-util-sanitize",
              allowImportNames: ["defaultSchema"],
              allowTypeImports: true,
              message:
                "Docs gate (ME-022, ME-013 P3-2): from hast-util-sanitize only the defaultSchema config and type-only imports are allowed in docs (sanitizeSchema.ts) — the sanitize() function itself runs ONLY inside TextEngine/core/pipeline.corpus.ts.",
            },
          ],
          patterns: [
            {
              group: [
                "**/components/TextEngine/core/pipeline.corpus",
                "**/pipeline.corpus",
                "**/pipeline.corpus.ts",
              ],
              message:
                "ME-019 review P2-2: only features/docs/Markdown.tsx imports buildCorpusPipeline — every other docs module goes through the wrapper.",
            },
            {
              // ME-022 (ME-013 P3-1): deep-specifier forms of the sanitize
              // stack, same allowances as the bare-name entry above.
              group: [
                "rehype-raw/**",
                "rehype-sanitize/**",
                "hast-util-sanitize/**",
              ],
              allowImportNames: ["defaultSchema"],
              allowTypeImports: true,
              message:
                "Docs gate (ME-022, ME-013 P3-1): deep specifiers resolve to the same restricted sanitize stack — only the defaultSchema config and type-only imports are allowed in docs.",
            },
          ],
        },
      ],
    },
  },
  {
    // Markdown.tsx is the ONE sanctioned consumer of buildCorpusPipeline (the
    // curated config call-site), but hosts NO pipeline imports and NO diagram
    // library: a static mermaid import here would weld the 450 KiB pool onto
    // every docs page and break the lazy-chunk budget; direct rehype imports
    // would bypass the single pipeline assembly in pipeline.corpus.ts. Union
    // restated because this block overrides the two above for this file.
    files: ["src/features/docs/Markdown.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "rehype-raw",
              message:
                "Docs gate (АРХКОМ-8 + ADR 0020 Ф2): rehype-raw is imported only in TextEngine/core/pipeline.corpus.ts — the wrapper supplies the config, never the plugins.",
            },
            {
              name: "rehype-sanitize",
              message:
                "Docs gate (АРХКОМ-8 + ADR 0020 Ф2): rehype-sanitize is imported only in TextEngine/core/pipeline.corpus.ts — the schema config stays here, the plugins live in core.",
            },
            {
              name: "mermaid",
              message:
                "Docs gate (АРХКОМ-8 + Amendment 1): mermaid must stay behind TextEngine/core/Mermaid.tsx's dynamic import — this file imports the MermaidDiagram component only.",
            },
            {
              // ME-022 (ME-013 P3-2): the wrapper consumes the ASSEMBLED
              // schema from sanitizeSchema.ts — it has no business with the
              // sanitize package itself (type-only imports excepted).
              name: "hast-util-sanitize",
              allowTypeImports: true,
              message:
                "Docs gate (ME-022, ME-013 P3-2): Markdown.tsx takes the schema from features/docs/sanitizeSchema.ts — hast-util-sanitize value imports live only in TextEngine/core/pipeline.corpus.ts (type-only imports allowed).",
            },
          ],
          patterns: [
            {
              // ME-022 (ME-013 P3-1): deep specifiers of the sanitize stack.
              group: [
                "rehype-raw/**",
                "rehype-sanitize/**",
                "hast-util-sanitize/**",
              ],
              allowTypeImports: true,
              message:
                "Docs gate (ME-022, ME-013 P3-1): deep specifiers resolve to the same restricted sanitize stack — Markdown.tsx imports the assembled pipeline and the schema config, never the packages.",
            },
          ],
        },
      ],
    },
  },
  {
    // TextEngine/core/Mermaid.tsx is the SINGLE mermaid import site (ADR 0020
    // Amendment 1, ME-013 — the capability serves both trust profiles). It
    // owns diagrams only: it must not grow its own raw-HTML pipeline or
    // import the corpus pipeline module (that would weld the md-sanitize
    // pool into the mermaid lazy chunk, and the budget gate cannot see it).
    // Union restated: this block overrides the app-wide block above for this
    // file (mermaid itself is obviously allowed here — the one exemption).
    files: ["src/components/TextEngine/core/Mermaid.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "rehype-raw",
              message:
                "Docs gate (АРХКОМ-8 + ADR 0020 Ф2): the raw-HTML pipeline lives only in TextEngine/core/pipeline.corpus.ts.",
            },
            {
              name: "rehype-sanitize",
              message:
                "Docs gate (АРХКОМ-8 + ADR 0020 Ф2): sanitize schemas live only in TextEngine/core/pipeline.corpus.ts's pipeline.",
            },
            {
              // ME-022 (ME-013 P3-2): the mermaid module hosts diagrams only.
              name: "hast-util-sanitize",
              allowTypeImports: true,
              message:
                "Docs gate (ME-022, ME-013 P3-2): the sanitize stack lives only in TextEngine/core/pipeline.corpus.ts — the mermaid chunk must not grow a sanitizer (type-only imports allowed).",
            },
          ],
          patterns: [
            {
              group: [
                "**/components/TextEngine/core/pipeline.corpus",
                "**/pipeline.corpus",
                "**/pipeline.corpus.ts",
              ],
              message:
                "ME-019 review P2-2: the mermaid lazy chunk must not import the corpus pipeline — md-sanitize would ride the diagram chunk.",
            },
            {
              // ME-022 (ME-013 P3-1): deep specifiers of the sanitize stack.
              group: [
                "rehype-raw/**",
                "rehype-sanitize/**",
                "hast-util-sanitize/**",
              ],
              allowTypeImports: true,
              message:
                "Docs gate (ME-022, ME-013 P3-1): deep specifiers resolve to the same restricted sanitize stack — the mermaid chunk must not grow a sanitizer.",
            },
          ],
        },
      ],
    },
  },
);
