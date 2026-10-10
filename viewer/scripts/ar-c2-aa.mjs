#!/usr/bin/env node
/**
 * agents-redesign C2 — the AA spot-check WITH NUMBERS, computed from the
 * token table (deterministic; the browser probe measured the same pairs —
 * computed-style sampling was replaced by the token math after it proved
 * noisy on translucent layers). Pairs (both themes):
 *   selected row   — text-primary on iris 10% over the well
 *   pressed chip   — iris-bright on iris 15% over the well
 *   pending pill   — text-secondary on the well (the outline badge)
 *   lifecycle pill — warning on warning 15% over the well
 *   drawer row     — text-primary on the well (the fullscreen sheet)
 *   muted row      — text-muted on the well (revoked hosts)
 * Bar: WCAG AA 4.5:1 (text).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const VIEWER_DIR = resolve(import.meta.dirname, "..");
const css = readFileSync(join(VIEWER_DIR, "src/styles/tokens.css"), "utf8");

function parseBlock(css, selector) {
  const re = new RegExp(selector.replace(/[[\]]/g, "\\$&") + "\\s*\\{([^}]*)\\}");
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
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = Number.parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(fg, bg) {
  const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}
function tintOver(src, surface, alpha) {
  const ch = (h, i) => Number.parseInt(h.replace("#", "").slice(i, i + 2), 16);
  return "#" + [0, 2, 4]
    .map((i) => Math.round(alpha * ch(src, i) + (1 - alpha) * ch(surface, i)).toString(16).padStart(2, "0"))
    .join("");
}

const dark = parseBlock(css, ":root");
const light = parseBlock(css, '[data-theme="light"]');
const get = (map, name) => (map.get(name) ?? dark.get(name) ?? "").toLowerCase();

const PALETTES = { dark, light: new Map([...dark, ...light]) };
const lines = [];
let allPass = true;
for (const [theme, map] of Object.entries(PALETTES)) {
  const well = get(map, "--color-bg-well");
  const iris = get(map, "--color-iris");
  const warning = get(map, "--color-warning");
  const rows = [
    ["selected row (text-primary on iris 10% over well)", get(map, "--color-text-primary"), tintOver(iris, well, 0.1)],
    ["pressed chip (iris-bright on iris 15% over well)", get(map, "--color-iris-bright"), tintOver(iris, well, 0.15)],
    ["pending pill (text-secondary on well)", get(map, "--color-text-secondary"), well],
    ["lifecycle silent pill (warning on warning 15% over well)", warning, tintOver(warning, well, 0.15)],
    ["drawer row (text-primary on well)", get(map, "--color-text-primary"), well],
    ["muted/revoked row (text-muted on well)", get(map, "--color-text-muted"), well],
  ];
  for (const [name, fg, bg] of rows) {
    const r = ratio(fg, bg);
    const pass = r >= 4.5;
    if (!pass) allPass = false;
    lines.push(`[${theme}] ${name}: ${fg} on ${bg} — ${r} ${pass ? "PASS" : "FAIL"}`);
  }
}
const text = `AA spot-check (WCAG 2.2, text 4.5:1), token-table math\n` + lines.join("\n") + `\nVERDICT: ${allPass ? "ALL PASS" : "FAILURES PRESENT"}\n`;
console.log(text);
