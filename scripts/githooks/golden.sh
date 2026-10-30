#!/usr/bin/env bash
# Shared golden/hostile render + token-parity gate (ME-025, ADR 0020 Ф3) —
# ONE implementation, THREE callers:
#
#   pre-commit  (viewer/ or tokens.css staged → blocking, the commit refuses)
#   post-merge  (the merge touched the same paths → LOUD warning only: a
#                merge cannot be rolled back from a hook, so that caller
#                shouts and points at pre-push)
#   pre-push    (any non-delete push → fail-closed: the push refuses)
#
# The gate itself is identical everywhere: the golden fixtures
# (golden.pipelines.test.tsx — byte-pins of BOTH trust pipelines, with
# mutant-detection negative controls), the hostile corpus (sanitizeSchema /
# Markdown / mermaid-untrusted / pipeline.corpus tests) and the viewer↔board
# token parity. GitHub Actions runs NO viewer suite for this repo (only
# identity-guard + release/pytest) and is additionally billing-locked — so
# the blocking has to live in these hooks and the vitest suite.
#
# Why the three-hook shape (card git-merge-bypasses-golden-hook): git merge
# does NOT invoke pre-commit, and post-merge cannot block the merge — only
# pre-push can refuse. Golden protection must not depend on executor
# discipline, so the gate runs at every boundary that can carry viewer/
# changes into main.
#
# GOLDEN_UPDATE is force-unset — the gate always VERIFIES; baselining stays
# a deliberate out-of-hook act (GOLDEN_UPDATE=1 npx vitest run
# src/features/docs/golden.pipelines.test.tsx in viewer/, then a dedicated
# golden-update commit — see the golden test header). Caveat inherited from
# every vitest-based hook: the gate sees the WORKING TREE, not the index /
# the pushed sha — it is exact for the normal flow (push from a checkout of
# what you verified) and deliberately loud about everything else.
set -euo pipefail

toplevel="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo >&2 "✖ golden gate: not inside a git work tree — cannot locate viewer/"
  exit 1
}
cd "$toplevel/viewer" || {
  echo >&2 "✖ golden gate: viewer/ is missing at $toplevel"
  exit 1
}

if ! command -v npx >/dev/null 2>&1; then
  echo >&2 "✖ golden gate: npx/node not on PATH — cannot verify the render goldens (fail-closed)"
  exit 1
fi

if ! env -u GOLDEN_UPDATE npx vitest run \
  src/features/docs/golden.pipelines.test.tsx \
  src/features/docs/sanitizeSchema.test.ts \
  src/features/docs/Markdown.test.tsx \
  src/components/TextEngine/core/pipeline.corpus.test.ts \
  src/components/TextEngine/core/mermaidUntrusted.test.tsx \
  src/components/TextEngine/core/Mermaid.test.tsx \
  src/components/TextEngine/core/mermaidSvgXml.test.ts \
  src/styles/tokens.test.ts; then
  echo >&2 "✖ golden/hostile render + token-parity gate FAILED — a pipeline mutation, a hostile-vector escape or a viewer↔board token drift is in this tree"
  echo >&2 "  (deliberate golden re-baseline: GOLDEN_UPDATE=1 npx vitest run src/features/docs/golden.pipelines.test.tsx"
  echo >&2 "   in viewer/, commit the new goldens — see the golden test header)"
  exit 1
fi
