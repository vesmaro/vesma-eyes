#!/usr/bin/env node
/**
 * Chunk budget gate (ME-071 — docs/design/15-WOW §14.3.7, 12-UNION-ROADMAP
 * §1 п.5): the lazy living-extra chunk (web layer + satellite + SVG atlas),
 * the web-tones module and the W2 Весма keeper chunk must stay under hard
 * gzip ceilings so the always-on ambient layer never taxes the critical path.
 *
 *   living-extra  ≤ 4 KiB = 4096 B gzip   (15-WOW §14.3.7)
 *   web-tones     ≤ 2.5 KiB = 2560 B gzip (12-UNION-ROADMAP §1 п.5, v12.1;
 *                    re-based 2048 → 2560 by wave U2 2026-10-08: the honesty
 *                    of light («шина молчит — экран стоит», SPEC-2026-10-07)
 *                    lives here — the shared breath-window factory joined
 *                    the tone engine; the wave's own ceiling holds: every
 *                    load path stays ≤ 8 KiB total living engine
 *                    (2637 + 2148 + 2740 = 7525 B gzip measured).
 *   vesma         ≤ 3 KiB = 3072 B gzip   (12-UNION-ROADMAP §1 п.5, v12.2, W2)
 *
 * Reads viewer/dist after `vite build`; matches chunks by name mask
 * (chunk hash tolerated). HONESTY RULE: until a wave wires its chunk the
 * files do not exist — the gate reports that plainly and PASSES («файлов
 * нет — гейт пройдёт с волной»); a silent pass must stay distinguishable
 * from a measured pass in the output. The stand's naive estimates are NOT
 * the canon — the measure here is the real esbuild/rollup artifact.
 *
 * Usage (from viewer/): npm run budget   (chained after vite build)
 * Exit codes: 0 = pass (measured or no-files-yet), 1 = budget breach or
 * unreadable dist.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const BUDGETS = [
  { mask: "living-extra", limit: 4096 },
  { mask: "web-tones", limit: 2560 },
  { mask: "vesma", limit: 3072 },
];

const distRoot = join(fileURLToPath(new URL("..", import.meta.url)), "dist");

// W1 (ME-071): the living chunks are DYNAMIC chunks, and this project's
// dynamic chunks land in the dist ROOT (only static vendor pools live in
// dist/assets) — scan both, so the gate measures whatever rollup built.
let files;
try {
  files = (function collect(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isFile()) out.push(p);
      else out.push(...collect(p));
    }
    return out;
  })(distRoot).filter((p) => p.endsWith(".js"));
} catch {
  console.error(
    `[budget] FAIL: ${distRoot} is unreadable/missing — run \`vite build\` first.`,
  );
  process.exit(1);
}

let failures = 0;
let measured = 0;

for (const { mask, limit } of BUDGETS) {
  // Prefix-anchored match: `vesma-` must not catch unrelated chunks whose
  // name merely CONTAINS the mask (measured: `what-is-vesma-eyes-*.js`).
  const hits = files.filter((name) => basename(name).startsWith(`${mask}-`));
  if (hits.length === 0) continue;
  measured += 1;
  for (const name of hits) {
    const raw = statSync(name).size;
    const gz = gzipSync(readFileSync(name)).length;
    const ok = gz <= limit;
    if (!ok) failures += 1;
    console.log(
      `[budget] ${basename(name)}: gzip ${gz} B / limit ${limit} B ` +
        `(raw ${raw} B) — ${ok ? "PASS" : "FAIL"}`,
    );
  }
}

if (measured === 0) {
  console.log(
    "[budget] living-extra/web-tones/vesma: файлов нет в dist — гейт пройдёт " +
      "с W1/W2 (chunks not built yet; honest no-op, not a measured pass).",
  );
  process.exit(0);
}

if (failures > 0) {
  console.error(`[budget] FAIL: ${failures} chunk(s) over budget (15-WOW §14.3.7).`);
  process.exit(1);
}
console.log("[budget] all measured chunks within budget.");
