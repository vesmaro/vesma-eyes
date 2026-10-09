#!/usr/bin/env node
/**
 * U7 light-theme («береста») AA audit — two legs:
 *
 * 1. TOKEN TABLE VERIFY: parse both theme columns of src/styles/tokens.css,
 *    recompute the WCAG 2.2 relative-luminance ratios for the documented
 *    pairs and compare against docs/design/02-TOKENS.md §4 (the light column
 *    and the worst-case columns). Finds CODE↔TABLE divergence.
 * 2. DOM PROBE: render the built viewer (dist-smoke) in LIGHT theme on the
 *    wave's key pages and flag any element whose computed foreground is a
 *    DARK-column colour while it sits OUTSIDE the sanctioned well-window
 *    scope (the «unthemed element» bug class — a hardcoded dark value or a
 *    variable that never re-resolves).
 *
 * Usage (from viewer/): node scripts/u7-light-audit.mjs
 * Exit 1 when a ratio diverges from the doc or a dark leak is found.
 */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4194;
const BASE = `http://localhost:${PORT}/app/`;

/* ---------- leg 1: token ratios ---------- */

function parseBlock(css, selector) {
  const re = new RegExp(`${selector.replace(/[[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
  const m = css.match(re);
  const out = new Map();
  if (!m) return out;
  for (const decl of m[1].split(";")) {
    const dm = decl.match(/(--[\w-]+)\s*:\s*([^;]+)/);
    if (dm) out.set(dm[1], dm[2].trim());
  }
  return out;
}

function lum(hex) {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = Number.parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg, bg) {
  const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 10) / 10;
}

/** CSS `color-mix(in srgb, src 15%, transparent)` composited over a solid
 * surface = an 8-bit gamma-space blend (the browser blends sRGB values). */
function tintOver(src, surface, alpha = 0.15) {
  const ch = (h, i) => Number.parseInt(h.replace("#", "").slice(i, i + 2), 16);
  return `#${[0, 2, 4]
    .map((i) =>
      Math.round(alpha * ch(src, i) + (1 - alpha) * ch(surface, i))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

const css = readFileSync(join(VIEWER_DIR, "src/styles/tokens.css"), "utf8");
const dark = parseBlock(css, ":root");
const light = parseBlock(css, '[data-theme="light"]');

/** Get a value: light column first, dark column fallback (:root). */
const val = (map, name) => (map.get(name) ?? "").toLowerCase();

const PAIRS = [
  // [name, fg token, bg token, doc dark, doc light(base col), level].
  // Doc light columns are ordered white/base/elevated (02-TOKENS §4 light
  // line); the well column is white, base is base. Tolerance 0.25 absorbs
  // the doc's 1-decimal rounding of values computed on adjacent strata.
  ["text-primary on base", "--color-text-primary", "--color-bg-base", 16.2, 15.3, "AA+"],
  ["text-primary on well", "--color-text-primary", "--color-bg-well", 15.0, 16.5, "AA+"],
  ["text-secondary on base", "--color-text-secondary", "--color-bg-base", 7.8, 7.4, "AA+"],
  ["text-secondary on well", "--color-text-secondary", "--color-bg-well", 7.4, 7.8, "AA+"],
  ["text-muted on base", "--color-text-muted", "--color-bg-base", 5.3, 5.0, "AA"],
  ["text-muted on well", "--color-text-muted", "--color-bg-well", 5.0, 5.4, "AA"],
  ["text-muted on elevated", "--color-text-muted", "--color-bg-elevated", 4.8, 4.8, "AA worst"],
  ["iris-bright on base", "--color-iris-bright", "--color-bg-base", 9.1, 5.3, "AA+"],
  ["iris-bright on well", "--color-iris-bright", "--color-bg-well", 8.6, 5.9, "AA+"],
  ["confidence on base", "--color-confidence", "--color-bg-base", 7.0, 5.5, "AA+"],
  ["confidence on well", "--color-confidence", "--color-bg-well", 6.7, 5.9, "AA+"],
  ["success on well", "--color-success", "--color-bg-well", 7.8, 6.2, "AA+"],
  ["warning on well", "--color-warning", "--color-bg-well", 7.6, 5.9, "AA+"],
  ["error on base", "--color-error", "--color-bg-base", 5.6, 8.4, "AA+"],
  ["error on well", "--color-error", "--color-bg-well", 5.3, 9.1, "AA"],
  ["border on base (1.4.11)", "--color-border", "--color-bg-base", 3.4, 4.3, "AA non-text"],
  ["border on well (1.4.11)", "--color-border", "--color-bg-well", 3.2, 4.7, "AA non-text"],
  ["focus on base (2.4.13)", "--color-focus", "--color-bg-base", 9.1, 6.8, "AA+"],
  ["focus on well (2.4.13)", "--color-focus", "--color-bg-well", 8.4, 7.3, "AA+"],
  ["web-tone-update on base", "--web-tone-update", "--color-bg-base", 6.8, 5.5, "AA+"],
  ["web-tone-update on scroll-bg", "--web-tone-update", "--color-scroll-bg", 6.4, 5.7, "AA+"],
];

let divergences = 0;
console.log("== leg 1: token table verify (docs/design/02-TOKENS.md §4) ==");
for (const [name, fg, bg, docDark, docLight, level] of PAIRS) {
  const d = ratio(val(dark, fg), val(dark, bg));
  const l = ratio(val(light, fg) || val(dark, fg), val(light, bg) || val(dark, bg));
  const bad =
    (docDark !== null && Math.abs(d - docDark) > 0.25) ||
    (docLight !== null && Math.abs(l - docLight) > 0.25);
  if (bad) divergences++;
  console.log(
    `  ${bad ? "DIVERGE" : "ok    "} ${name}: dark ${d} (doc ${docDark ?? "—"}) · light ${l} (doc ${docLight ?? "—"}) [${level}]`,
  );
}
// The AA floor itself (any pair below 4.5 text / 3.0 non-text is a fail
// regardless of the doc).
for (const [name, fg, bg, , , level] of PAIRS) {
  const floor = level.includes("non-text") ? 3.0 : 4.5;
  for (const [col, map] of [["dark", dark], ["light", light]]) {
    const r = ratio(val(map, fg) || val(dark, fg), val(map, bg) || val(dark, bg));
    if (r < floor) {
      divergences++;
      console.log(`  FAIL ${name} on ${col}: ${r} < ${floor}`);
    }
  }
}

// leg 1b — U7: the badge-tint pairs (15% tints over the badge surface). The
// error badge was found FAILING on dark (text-error 3.2 — the U3 doc row
// claimed 4.5 on an arithmetic slip); fixed by --color-error-text. The other
// four tints verified holding in both themes.
{
  const tintPairs = [
    ["confidence-text on confidence-tint", "--color-confidence", "--color-confidence", 5.2, 4.8],
    ["error-text on error-tint (token step)", "--color-error-text", "--color-error", 7.5, 7.0],
    ["success-text on success-tint", "--color-success", "--color-success", 5.8, 5.0],
    ["warning-text on warning-tint", "--color-warning", "--color-warning", 5.9, 4.8],
    ["iris-text on iris-tint", "--color-iris-bright", "--color-iris", 7.0, 5.0],
  ];
  console.log("== leg 1b: badge-tint composites (15% over well, both themes) ==");
  for (const [name, fgTok, srcTok, docD, docL] of tintPairs) {
    for (const [col, map] of [["dark", dark], ["light", light]]) {
      const surface = val(map, "--color-bg-well") || val(dark, "--color-bg-well");
      const src = val(map, srcTok) || val(dark, srcTok);
      const fg = val(map, fgTok) || val(dark, fgTok);
      const composite = tintOver(src, surface);
      const r = ratio(fg, composite);
      const doc = col === "dark" ? docD : docL;
      const bad = Math.abs(r - doc) > 0.25 || r < 4.5;
      if (bad) divergences++;
      console.log(
        `  ${bad ? "DIVERGE" : "ok    "} ${name} [${col}]: ${fg} on tint ${composite} — ${r} (doc ${doc})`,
      );
    }
  }
}

/* ---------- leg 2: DOM probe ---------- */

const PAGES = [
  ["overview", ""],
  ["tasks", "tasks"],
  ["memory", "memory"],
  ["kora", "kora"],
  ["agents", "agents/hosts"],
  ["system", "system/settings"],
  ["docs", "docs/vesma-eyes"],
];

const DARK_ONLY = ["#e6edf3", "#9aa7b4", "#7c8894", "#4fc2ce", "#c9933a"];

const PROBE_FN = (darkOnly) => {
  const leaks = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("[data-well-window], [data-well-legend]")) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.bottom < 0 || r.top > innerHeight) continue;
    // Direct text carriers only (leaf-ish elements with own text).
    const ownText = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
    );
    if (!ownText) continue;
    const color = cs.color.toLowerCase();
    const leaked = darkOnly.find(
      (hex) =>
        color === hex ||
        color === `rgb(${Number.parseInt(hex.slice(1, 3), 16)}, ${Number.parseInt(hex.slice(3, 5), 16)}, ${Number.parseInt(hex.slice(5, 7), 16)})`,
    );
    if (leaked) {
      leaks.push({
        tag: el.tagName.toLowerCase(),
        color,
        text: el.textContent.trim().slice(0, 50),
        cls: String(el.className).slice(0, 80),
      });
    }
  }
  return leaks;
};

function chromiumPath() {
  const cache = join(homedir(), ".cache", "ms-playwright");
  for (const dir of existsSync(cache)
    ? require("node:fs").readdirSync(cache).filter((n) => n.startsWith("chromium-")).sort().reverse()
    : []) {
    for (const bin of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
      const p = join(cache, dir, bin);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startPreview() {
  const child = spawn(
    join(VIEWER_DIR, "node_modules", ".bin", "vite"),
    ["preview", "--port", String(PORT), "--strictPort", "--outDir", "dist-smoke"],
    { cwd: VIEWER_DIR, stdio: ["ignore", "ignore", "inherit"] },
  );
  const deadline = Date.now() + 30_000;
  for (;;) {
    const up = await new Promise((res) => {
      const req = require("node:http").get(
        { hostname: "localhost", port: PORT, path: "/app/" },
        (r) => {
          r.resume();
          res(r.statusCode !== undefined && r.statusCode < 500);
        },
      );
      req.on("error", () => res(false));
      req.setTimeout(1200, () => {
        req.destroy();
        res(false);
      });
    });
    if (up) return child;
    if (Date.now() > deadline) {
      child.kill();
      throw new Error("preview never came up");
    }
    await sleep(400);
  }
}

async function main() {
  let leaks = 0;
  const playwright = require("playwright");
  const preview = await startPreview();
  try {
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ["--disable-gpu"],
      ...(chromiumPath() ? { executablePath: chromiumPath() } : {}),
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(() => {
      window.localStorage.setItem("vesmaro.theme", "light");
    });
    const page = await context.newPage();
    console.log("\n== leg 2: dark-colour leaks outside the well window (light theme) ==");
    for (const [name, route] of PAGES) {
      await page.goto(`${BASE}${route}`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(1800);
      const found = await page.evaluate(PROBE_FN, DARK_ONLY);
      if (found.length) {
        leaks += found.length;
        console.log(`  == ${name}: ${found.length} leak(s)`);
        for (const l of found)
          console.log(`    [${l.tag} ${l.color}] "${l.text}" :: ${l.cls}`);
      } else {
        console.log(`  == ${name}: clean`);
      }
    }
    await browser.close();
  } finally {
    preview.kill();
  }
  console.log(
    `\n[light] ${divergences === 0 && leaks === 0 ? "ALL GREEN" : `${divergences} table divergence(s), ${leaks} dark leak(s)`}`,
  );
  process.exit(divergences === 0 && leaks === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`[light] ${error?.message ?? error}`);
  process.exit(1);
});
