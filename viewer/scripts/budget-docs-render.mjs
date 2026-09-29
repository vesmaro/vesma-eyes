#!/usr/bin/env node
/**
 * Docs-render budget gate (ADR-0015 as amended by АРХКОМ-8; pools split per
 * ADR 0020 Ф2, budgets RE-BASELINED per ADR 0020 Ф3/ME-025): run AFTER
 * `npm run build`, exits non-zero on any breach.
 *
 * Re-baseline mechanics (Ф3, 2026-09-29 — measured on the 1.47.0-line tree):
 * budget = ceil(headroom × measured gzip), pools ×1.2 (~20%), entry ×1.1
 * (small tolerance — the entry gate is a drift alarm, not slack):
 *
 *   entry (eager base set: index.html scripts/preloads + static closure)
 *                                                    ≤ 297 KiB gzip
 *                   (measured 269.8: entry chunk 219.4 + md-core 49.8 +
 *                    preload-helper 0.6 — the ±0 entry guard, mechanical)
 *   md-core pool    dist/assets/md-core-*.js          ≤  60 KiB gzip
 *                   (react-markdown + remark-gfm and
 *                   the shared unified/micromark stack;
 *                   measured 49.8)
 *   md-sanitize     dist/assets/md-sanitize-*.js      ≤  65 KiB gzip
 *                   (rehype-raw + rehype-sanitize +
 *                   parse5/hast-util-raw — curated
 *                   docs path ONLY; measured 53.7)
 *   mermaid pool    mermaid.core chunk + the heaviest    ≤ 379 KiB gzip
 *                   single on-demand branch (diagram
 *                   engines for ONE diagram type;
 *                   measured 315.6 = core 165.1 + heaviest 150.5)
 *
 * Ф2 budgets (md-core 90 / md-sanitize 60 / mermaid 450) were set per-pool
 * before the pool contents settled; Ф3 re-baselines them to the ACTUAL
 * pools. md-sanitize's Ф2 budget (60) was only 11% over the actual pool —
 * the re-baseline to 65 is the honest ~20%, not a loosening of a drifting
 * gate. The entry gate is NEW in Ф3: the md-core eagerness comment below
 * relied on an informal «entry total stays ±0» — this gate is that guard.
 *
 * Reachability gates (ADR 0020 Ф2, mechanical, unchanged):
 * - the eager base set must stay within the entry budget (NEW Ф3);
 * - md-sanitize must NOT be in the eager base set (the static closure of
 *   index.html) — the entry and every eager page stay sanitize-free;
 * - md-core must NOT statically import md-sanitize — the untrusted profile
 *   (TextEngine/MarkdownView) never pays for sanitization;
 * - the mermaid library stays lazy: never statically reachable.
 *
 * The mermaid library is lazy: its entry must never be statically reachable
 * from index.html or any eagerly-loaded chunk. "Fence-page pool" accounting:
 * a page with diagrams downloads the core chunk (always) plus the diagram
 * engines for ONE diagram type (mermaid lazy-loads per type; no corpus page
 * uses more than one or two). The full on-demand closure (every diagram type
 * at once) is reported as info for ADR-0017.
 *
 * Usage: node scripts/budget-docs-render.mjs [--max-entry 297] [--max-md-core 60] [--max-md-sanitize 65] [--max-mermaid 379]
 */

import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = join(root, "dist", "assets");

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index !== -1 ? Number(args[index + 1]) : fallback;
}
const MAX_ENTRY_KIB = argValue("--max-entry", 297);
const MAX_MD_CORE_KIB = argValue("--max-md-core", 60);
const MAX_MD_SANITIZE_KIB = argValue("--max-md-sanitize", 65);
const MAX_MERMAID_KIB = argValue("--max-mermaid", 379);

const KIB = 1024;
const round1 = (value) => Math.round(value * 10) / 10;

// --- chunk graph ------------------------------------------------------------------
const jsFiles = readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
const chunks = new Map(); // name -> { gzip, raw, static: [], dynamic: [] }
for (const name of jsFiles) {
  const buffer = readFileSync(join(assetsDir, name));
  const source = buffer.toString("utf8");
  const refs = [...source.matchAll(/(?:from|import)\s*\(?\s*["']\.\/([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((target) => jsFiles.includes(target));
  const dynamic = [
    ...source.matchAll(/import\s*\(\s*["']\.\/([^"']+)["']\s*\)/g),
  ].map((match) => match[1]);
  chunks.set(name, {
    gzip: gzipSync(buffer).length / KIB,
    raw: buffer.length / KIB,
    static: refs.filter((target) => !dynamic.includes(target)),
    dynamic: [...new Set(dynamic.filter((target) => jsFiles.includes(target)))],
  });
}
const chunkOf = (name) =>
  chunks.get(name) ?? { gzip: 0, raw: 0, static: [], dynamic: [] };
const sumGzip = (names) =>
  [...names].reduce((sum, name) => sum + chunkOf(name).gzip, 0);

function closure(startNames, includeDynamic) {
  const seen = new Set(startNames);
  const queue = [...startNames];
  while (queue.length > 0) {
    const name = queue.pop();
    const nexts = includeDynamic
      ? [...chunkOf(name).dynamic, ...chunkOf(name).static]
      : chunkOf(name).static;
    for (const next of nexts) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

const report = [];
let failed = false;

// --- eager base set (index.html scripts/preloads + static closure) ----------------
const html = readFileSync(join(root, "dist", "index.html"), "utf8");
const eagerFromHtml = [
  ...html.matchAll(/(?:src|href)="[^"]*assets\/([^"/]+\.js)"/g),
]
  .map((match) => decodeURIComponent(match[1]))
  .filter((name) => jsFiles.includes(name));
const baseSet = closure(eagerFromHtml, false);

// --- entry gate (ADR 0020 Ф3 re-baseline, NEW) ------------------------------------
// The eager base set (everything index.html pulls statically) is the first-
// paint cost. The Ф2 header carried only an informal «entry total stays ±0»
// note — this gate is its mechanical form, so fixture prose or an accidental
// eager import cannot creep in silently. Fixtures/adapters may legitimately
// move BETWEEN eager chunks without changing the total — that is exactly the
// invariance we want from a drift alarm.
{
  const entryGzip = sumGzip(baseSet);
  const ok = entryGzip <= MAX_ENTRY_KIB;
  if (!ok) failed = true;
  report.push(
    `${ok ? "ok  " : "FAIL"} entry (eager base set, ${baseSet.size} chunks): ${round1(entryGzip)} KiB gzip ` +
      `(budget ≤${MAX_ENTRY_KIB})`,
  );
}

// --- md pools (ADR 0020 Ф2 split, budgets re-baselined Ф3) -------------------------
// md-core has NO direct eager-exclusion assert (it is deliberately hoisted
// into the entry by vite's transitive-import hoisting) — its eagerness is
// guarded by the entry budget above (a pool sneaking into the base set can
// only grow it, and the budget is pinned to the measured total).
const mdCoreChunks = jsFiles.filter((name) => name.startsWith("md-core-"));
if (mdCoreChunks.length === 0) {
  report.push("FAIL md-core: no chunk found — named pool missing from the build");
  failed = true;
} else {
  const gzip = sumGzip(mdCoreChunks);
  const ok = gzip <= MAX_MD_CORE_KIB;
  if (!ok) failed = true;
  report.push(
    `${ok ? "ok  " : "FAIL"} md-core (render pipeline, shared): ${round1(gzip)} KiB gzip ` +
      `(budget ≤${MAX_MD_CORE_KIB}; ${mdCoreChunks.join(", ")})`,
  );
}

const mdSanitizeChunks = jsFiles.filter((name) => name.startsWith("md-sanitize-"));
if (mdSanitizeChunks.length === 0) {
  report.push("FAIL md-sanitize: no chunk found — named pool missing from the build");
  failed = true;
} else {
  const gzip = sumGzip(mdSanitizeChunks);
  const ok = gzip <= MAX_MD_SANITIZE_KIB;
  if (!ok) failed = true;
  report.push(
    `${ok ? "ok  " : "FAIL"} md-sanitize (raw-HTML + sanitize, curated only): ${round1(gzip)} KiB gzip ` +
      `(budget ≤${MAX_MD_SANITIZE_KIB}; ${mdSanitizeChunks.join(", ")})`,
  );
  // ADR 0020 Ф2 reachability gate 1: the eager base set (static closure of
  // index.html) must not contain the sanitize pool — no eager page pays for
  // sanitization.
  const eager = mdSanitizeChunks.filter((name) => baseSet.has(name));
  if (eager.length > 0) {
    failed = true;
    report.push(
      `FAIL md-sanitize is EAGERLY reachable (in the base closure: ${eager.join(", ")}) — ` +
        `the entry/first paint would pay for the sanitize stack`,
    );
  } else {
    report.push("ok   md-sanitize not in the eager base set (entry stays sanitize-free)");
  }
  // ADR 0020 Ф2 reachability gate 2: md-core must not statically import
  // md-sanitize (the untrusted profile imports the pipeline too — escape-only
  // must stay statically free of the sanitize stack).
  const crossEdges = mdCoreChunks.filter((name) =>
    chunkOf(name).static.some((target) => mdSanitizeChunks.includes(target)),
  );
  if (crossEdges.length > 0) {
    failed = true;
    report.push(
      `FAIL md-core statically imports md-sanitize (chunks: ${crossEdges.join(", ")}) — ` +
        `the untrusted path would pay for sanitization`,
    );
  } else {
    report.push("ok   md-core has no static edge into md-sanitize (untrusted path stays lean)");
  }
}

// --- mermaid pool -----------------------------------------------------------------
// The mermaid entry keeps its natural chunk name (derived from
// mermaid.core.mjs) — pinning it to a manual chunk merges mermaid's internal
// per-diagram lazy chunks into one mega chunk (measured 735 KiB gzip).
const mermaidEntries = jsFiles.filter((name) => /^mermaid\.core-/.test(name));
if (mermaidEntries.length === 0) {
  report.push("FAIL mermaid: no mermaid.core-* chunk found in dist/assets");
  failed = true;
} else {
  const inBase = mermaidEntries.filter((name) => baseSet.has(name));
  const staticOffenders = [];
  for (const [name, chunk] of chunks) {
    if (mermaidEntries.includes(name) || !baseSet.has(name)) continue;
    if (chunk.static.some((target) => mermaidEntries.includes(target))) {
      staticOffenders.push(name);
    }
  }
  if (html.includes("mermaid")) {
    failed = true;
    report.push("FAIL mermaid chunk is referenced from index.html — it would load eagerly");
  } else if (inBase.length > 0 || staticOffenders.length > 0) {
    failed = true;
    report.push(
      `FAIL mermaid is statically reachable (in base closure: ${inBase.join(", ") || "—"}; ` +
        `static importers: ${staticOffenders.join(", ") || "—"})`,
    );
  } else {
    // Fence-page accounting: core closure (static deps only reachable from
    // it) + the HEAVIEST single on-demand branch = worst realistic page.
    const corePool = closure(mermaidEntries, false);
    for (const name of [...corePool]) {
      if (mermaidEntries.includes(name)) continue; // the entry IS the pool
      if (baseSet.has(name)) corePool.delete(name); // already eager on the page
    }
    const onDemand = new Set([...closure(corePool, true)].filter(
      (name) => !corePool.has(name) && !baseSet.has(name),
    ));
    const coreGzip = sumGzip(corePool);
    const heaviest = [...onDemand].reduce(
      (max, name) => Math.max(max, chunkOf(name).gzip),
      0,
    );
    const pageGzip = coreGzip + heaviest;
    const ok = pageGzip <= MAX_MERMAID_KIB;
    if (!ok) failed = true;
    report.push(
      `${ok ? "ok  " : "FAIL"} docs-mermaid (fence-page pool: core ${round1(coreGzip)} ` +
        `+ heaviest diagram branch ${round1(heaviest)}): ${round1(pageGzip)} KiB gzip ` +
        `(budget ≤${MAX_MERMAID_KIB})`,
    );
    const fullGzip = coreGzip + sumGzip(onDemand);
    const perDiagram = [...onDemand]
      .filter((name) => /Diagram/i.test(name))
      .map((name) => `${name.replace(/-[A-Za-z0-9_-]+\.js$/, "")}=${round1(chunkOf(name).gzip)}`);
    report.push(
      `info mermaid full on-demand closure (all diagram types at once): ${round1(fullGzip)} KiB gzip ` +
        `across ${onDemand.size + corePool.size} chunks; per-diagram: ${perDiagram.slice(0, 12).join(", ")}${perDiagram.length > 12 ? ", …" : ""}`,
    );
  }
}

console.log("docs-render budget (ADR-0015/АРХКОМ-8, pools split per ADR 0020 Ф2, budgets re-baselined Ф3/ME-025):");
for (const line of report) console.log("  " + line);
process.exit(failed ? 1 : 0);
