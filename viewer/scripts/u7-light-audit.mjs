#!/usr/bin/env node
/**
 * Appearance-scope AA audit («береста» U7 + appearance presets
 * themes-presets-wave1) — two legs:
 *
 * 1. TOKEN TABLE VERIFY: parse EVERY theme scope of src/styles/tokens.css
 *    (dark :root = Колодец, [data-theme="light"] = Береста, and the preset
 *    scopes [data-theme="zhila"|"sozvezdia"|"prosvet"]), recompute the WCAG
 *    2.2 relative-luminance ratios for the documented pairs and compare
 *    against docs/design/02-TOKENS.md §4 (canon) / §7 (presets). Finds
 *    CODE↔TABLE divergence. Worst-case stratum is asserted per pair
 *    (elevated for text-muted, overlay for statuses on the presets).
 * 2. DOM PROBE: render the built viewer (dist-smoke) in each LIGHT-family
 *    scope (light + prosvet) on the wave's key pages and flag any element
 *    whose computed foreground is a DARK-column colour while it sits
 *    OUTSIDE the sanctioned well-window scope (the «unthemed element» bug
 *    class — a hardcoded dark value or a variable that never re-resolves).
 *
 * Usage (from viewer/): node scripts/u7-light-audit.mjs
 * Exit 1 when a ratio diverges from the doc, an AA floor is broken, or a
 * dark leak is found.
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
const SCOPES = [
  ["dark", parseBlock(css, ":root")],
  ["light", parseBlock(css, '[data-theme="light"]')],
  ["zhila", parseBlock(css, '[data-theme="zhila"]')],
  ["sozvezdia", parseBlock(css, '[data-theme="sozvezdia"]')],
  ["prosvet", parseBlock(css, '[data-theme="prosvet"]')],
];

/** Get a value: scope column first, dark column fallback (:root). */
const val = (map, name) => (map.get(name) ?? "").toLowerCase();

/**
 * Per-scope pair tables: [name, fg token, bg token, doc value, level].
 * Doc values are the 1-decimal columns of docs/design/02-TOKENS.md §4
 * (dark/light canon — unchanged by the presets wave) and §7 (the three
 * preset columns). Tolerance 0.25 absorbs the doc's rounding of values
 * computed on adjacent strata. `null` doc = not asserted in the doc
 * (the AA-floor pass below still applies).
 */
const PAIRS = [
  // [name, fg token, bg token, {dark, light, zhila, sozvezdia, prosvet}, level].
  ["text-primary on base", "--color-text-primary", "--color-bg-base", { dark: 16.0, light: 15.3, zhila: 15.5, sozvezdia: 16.8, prosvet: 14.4 }, "AA+"],
  ["text-primary on well", "--color-text-primary", "--color-bg-well", { dark: 15.0, light: 16.5, zhila: 14.2, sozvezdia: 16.0, prosvet: 15.9 }, "AA+"],
  ["text-secondary on base", "--color-text-secondary", "--color-bg-base", { dark: 7.7, light: 7.2, zhila: 9.2, sozvezdia: 8.1, prosvet: 6.8 }, "AA+"],
  ["text-secondary on well", "--color-text-secondary", "--color-bg-well", { dark: 7.2, light: 7.8, zhila: 8.4, sozvezdia: 7.7, prosvet: 7.5 }, "AA+"],
  ["text-muted on base", "--color-text-muted", "--color-bg-base", { dark: 5.2, light: 5.0, zhila: 5.9, sozvezdia: 5.5, prosvet: 5.4 }, "AA"],
  ["text-muted on well", "--color-text-muted", "--color-bg-well", { dark: 4.9, light: 5.4, zhila: 5.4, sozvezdia: 5.2, prosvet: 6.0 }, "AA"],
  ["text-muted on elevated", "--color-text-muted", "--color-bg-elevated", { dark: 4.7, light: 4.8, zhila: 5.1, sozvezdia: 5.0, prosvet: 5.2 }, "AA worst"],
  ["iris-bright on base", "--color-iris-bright", "--color-bg-base", { dark: 9.0, light: 5.5, zhila: 8.9, sozvezdia: 9.4, prosvet: 5.2 }, "AA+"],
  ["iris-bright on well", "--color-iris-bright", "--color-bg-well", { dark: 8.4, light: 5.9, zhila: 8.1, sozvezdia: 9.0, prosvet: 5.7 }, "AA+"],
  ["confidence on well", "--color-confidence", "--color-bg-well", { dark: 6.5, light: 5.9, zhila: 6.3, sozvezdia: 7.0, prosvet: 5.7 }, "AA+"],
  ["success on well", "--color-success", "--color-bg-well", { dark: 7.6, light: 6.2, zhila: 7.3, sozvezdia: 8.1, prosvet: 6.0 }, "AA+"],
  ["warning on well", "--color-warning", "--color-bg-well", { dark: 7.6, light: 5.9, zhila: 7.4, sozvezdia: 8.2, prosvet: 5.7 }, "AA+"],
  ["error on base", "--color-error", "--color-bg-base", { dark: 5.6, light: 8.4, zhila: 5.5, sozvezdia: 5.8, prosvet: 7.9 }, "AA+"],
  ["error on well", "--color-error", "--color-bg-well", { dark: 5.2, light: 9.1, zhila: 5.1, sozvezdia: 5.6, prosvet: 8.7 }, "AA"],
  ["error on elevated", "--color-error", "--color-bg-elevated", { dark: 5.0, light: 8.0, zhila: 4.8, sozvezdia: 5.4, prosvet: 7.5 }, "AA"],
  ["error on overlay", "--color-error", "--color-bg-overlay", { dark: null, light: null, zhila: 4.7, sozvezdia: 5.1, prosvet: 7.3 }, "AA (§7: modals are text-bearing)"],
  ["iris (text) on base", "--color-iris", "--color-bg-base", { dark: 4.6, light: null, zhila: 4.6, sozvezdia: 4.8, prosvet: null }, "AA text — dark presets only (canon allowance; light uses iris-bright)"],
  ["border on well (1.4.11)", "--color-border", "--color-bg-well", { dark: 3.2, light: 4.7, zhila: 4.1, sozvezdia: 3.4, prosvet: 5.6 }, "AA non-text"],
  ["border on elevated (1.4.11)", "--color-border", "--color-bg-elevated", { dark: 3.0, light: 4.2, zhila: 3.9, sozvezdia: 3.3, prosvet: 4.8 }, "AA non-text"],
  ["focus on canvas (2.4.13)", "--color-focus", "--color-well-canvas", { dark: 9.1, light: 6.1, zhila: 9.0, sozvezdia: 9.6, prosvet: 5.7 }, "AA+"],
  ["web-tone-update on base", "--web-tone-update", "--color-bg-base", { dark: 6.8, light: 5.5, zhila: 6.6, sozvezdia: 7.0, prosvet: 5.2 }, "AA+"],
  ["web-tone-update on scroll-bg", "--web-tone-update", "--color-scroll-bg", { dark: 6.4, light: 5.7, zhila: 6.3, sozvezdia: 6.8, prosvet: 5.5 }, "AA+"],
];

const BADGE_PAIRS = [
  // [name, fg token, source token, {dark, light, zhila, sozvezdia, prosvet}] —
  // text on the 15% source tint composited over THAT scope's well (U7 leg 1b,
  // generalized to every appearance scope).
  ["iris-text on iris-tint", "--color-iris-bright", "--color-iris", { dark: 7.0, light: 5.0, zhila: 6.9, sozvezdia: 7.7, prosvet: 4.8 }],
  ["confidence-text on confidence-tint", "--color-confidence", "--color-confidence", { dark: 5.2, light: 4.8, zhila: 4.9, sozvezdia: 5.6, prosvet: 4.6 }],
  ["warning-text on warning-tint", "--color-warning", "--color-warning", { dark: 5.9, light: 4.8, zhila: 5.6, sozvezdia: 6.5, prosvet: 4.6 }],
  ["success-text on success-tint", "--color-success", "--color-success", { dark: 5.8, light: 5.0, zhila: 5.7, sozvezdia: 6.4, prosvet: 4.8 }],
  ["error-text on error-tint (token step)", "--color-error-text", "--color-error", { dark: 7.5, light: 7.0, zhila: 7.0, sozvezdia: 8.0, prosvet: 6.7 }],
];

let divergences = 0;
console.log("== leg 1: token table verify (02-TOKENS.md §4 canon / §7 presets) ==");
for (const [name, fg, bg, doc, level] of PAIRS) {
  const parts = [];
  for (const [scope, map] of SCOPES) {
    const r = ratio(val(map, fg), val(map, bg));
    parts.push(`${scope} ${r}`);
    if (doc[scope] !== null && doc[scope] !== undefined && Math.abs(r - doc[scope]) > 0.25) {
      divergences++;
      parts.push(`DIVERGE (doc ${doc[scope]})`);
    }
  }
  console.log(`  ${name} [${level}]: ${parts.join(" · ")}`);
}
// The AA floor itself (any pair below 4.5 text / 3.0 non-text is a fail
// regardless of the doc). A `null` doc cell = the pair is NOT part of that
// scope's documented contract (iris-as-text does not exist in the light
// family — iris-bright is the text accent there; the canon columns carry no
// overlay rows) — the floor skips exactly the documented pair set.
for (const [name, fg, bg, doc, level] of PAIRS) {
  const floor = level.includes("non-text") ? 3.0 : 4.5;
  for (const [scope, map] of SCOPES) {
    if (doc[scope] === null || doc[scope] === undefined) continue;
    const r = ratio(val(map, fg), val(map, bg));
    if (r < floor) {
      divergences++;
      console.log(`  FAIL ${name} on ${scope}: ${r} < ${floor}`);
    }
  }
}

console.log("== leg 1b: badge-tint composites (15% over the scope well, all scopes) ==");
for (const [name, fgTok, srcTok, doc] of BADGE_PAIRS) {
  const parts = [];
  for (const [scope, map] of SCOPES) {
    const surface = val(map, "--color-bg-well") || val(SCOPES[0][1], "--color-bg-well");
    const src = val(map, srcTok) || val(SCOPES[0][1], srcTok);
    const fg = val(map, fgTok) || val(SCOPES[0][1], fgTok);
    const composite = tintOver(src, surface);
    const r = ratio(fg, composite);
    parts.push(`${scope} ${r}`);
    if (Math.abs(r - doc[scope]) > 0.25 || r < 4.5) {
      divergences++;
      parts.push(`DIVERGE (doc ${doc[scope]})`);
    }
  }
  console.log(`  ${name}: ${parts.join(" · ")}`);
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

/** DOM-probe presets (themes-presets-wave1): the light-family scopes —
 * dark text colours outside the well window are the leak class there. */
const PROBE_PRESETS = ["light", "prosvet"];

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
    for (const preset of PROBE_PRESETS) {
      // The bootstrap resolves vesmaro.appearance slots FIRST: seed both
      // the explicit family and the slot so the page boots in the preset.
      await context.addInitScript((preset) => {
        window.localStorage.clear();
        window.localStorage.setItem("vesmaro.theme", preset === "prosvet" ? "light" : preset);
        window.localStorage.setItem(
          "vesmaro.appearance",
          JSON.stringify({ lastDark: "well", lastLight: preset }),
        );
      }, preset);
      const page = await context.newPage();
      console.log(`\n== leg 2: dark-colour leaks outside the well window (${preset}) ==`);
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
      await page.close();
    }
    await browser.close();
  } finally {
    preview.kill();
  }
  console.log(
    `\n[scopes] ${divergences === 0 && leaks === 0 ? "ALL GREEN" : `${divergences} table divergence(s), ${leaks} dark leak(s)`}`,
  );
  process.exit(divergences === 0 && leaks === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`[scopes] ${error?.message ?? error}`);
  process.exit(1);
});
