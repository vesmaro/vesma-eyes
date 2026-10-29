# Git hooks — `scripts/githooks`

Install (one line, after clone):

```sh
git config core.hooksPath scripts/githooks
```

All three hooks run the SAME gate — `golden.sh`, the golden fixtures +
hostile corpus + viewer↔board token parity (8 vitest suites, ME-025 /
ADR 0020 Ф3). Why three hooks: `git merge` does not invoke `pre-commit`,
so a train merge used to bypass the render gate entirely
(card `git-merge-bypasses-golden-hook`); `post-merge` cannot roll a merge
back, so the fail-closed refusal lives at push time.

| hook | when | scope | on failure |
|---|---|---|---|
| `pre-commit` | every commit | viewer/ or `web/styles/tokens.css` staged | blocks the commit |
| `post-merge` | every merge (and pull-merge) | merge diff touched viewer/ or tokens.css (`ORIG_HEAD..HEAD`) | SHOUTS ONLY — banner «GOLDEN GATE FAILED ON MERGE — run npx vitest … before push»; the merge stands |
| `pre-push` | every non-delete push | ALWAYS | blocks the push (fail-closed) |

Direct run (repo root, needs node/npx on PATH):

```sh
bash scripts/githooks/golden.sh
```

`GOLDEN_UPDATE` is force-unset inside the gate — it always verifies.
Re-baselining is a deliberate out-of-hook act:

```sh
cd viewer && GOLDEN_UPDATE=1 npx vitest run src/features/docs/golden.pipelines.test.tsx
```

then a dedicated golden-update commit (see the golden test header).
