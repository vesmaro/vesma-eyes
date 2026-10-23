#!/usr/bin/env node
/**
 * ux-palette-memory-results acceptance shots: the 1.81.0 journey — a palette
 * (⌘K) memory search over chat-captured records whose title field carries
 * the bare AUTHOR ROLE («User»). The stand serves the production build
 * (dist/, HTTP adapter) and intercepts POST /api/search with a four-record
 * «User»×4 fixture; every row must face a content-derived human label, the
 * v12 second story (the record's own scroll line) stays.
 *
 * Frames -> $OUT/palette-titles-{ru-1440,en-375}.png
 *   (OUT default: /var/home/abyss/.local/opt/design-shots)
 * Exit: 0 = every assert green; 1 = at least one FAIL (collected, not
 * fail-fast — one run reports the full picture).
 *
 * Usage (from viewer/):  node scripts/palette-titles-shots.mjs [--out DIR]
 *   — requires a fresh `npm run build` (dist/); the script checks the mtime.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4199;
const BASE = `http://localhost:${PORT}/app/`;
const DIST = join(VIEWER_DIR, "dist");
const OUT = (() => {
  const i = process.argv.indexOf("--out");
  return i !== -1 && process.argv[i + 1]
    ? resolve(process.argv[i + 1])
    : "/var/home/abyss/.local/opt/design-shots";
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The replayed wire: POST /api/search answers this array (the viewer
 * gateway's own shape — HttpAdapter.search expects a plain array of hits). */
const USER_X4_HITS = [
  {
    id: "rec-1",
    title: "User",
    content:
      "## User: Сборка падает на этапе линковки webview.\nАгент ответил, что виноват нестилированный импорт.",
    tags: ["project:vesma-eyes", "agent:zcode"],
    score: 0.92,
    search_type: "fts",
    server: "laptop",
  },
  {
    id: "rec-2",
    title: "User",
    content:
      "## User — Звуковая версия проходит проверку.\nЧистовая сборка без предупреждений.",
    tags: ["project:vesma-eyes", "agent:zcode"],
    score: 0.81,
    search_type: "semantic",
    server: "laptop",
  },
  {
    id: "rec-3",
    title: "User",
    content:
      "## User\n\nДа, если что — инициация со телефона.\nПозже повторю с ноутбука.",
    tags: ["project:vesma-eyes"],
    score: 0.74,
    search_type: "fts",
    server: "laptop",
  },
  {
    id: "rec-4",
    title: "User",
    content:
      "User research показал спрос на оффлайн-режим.\nДальше — больше: опрос на двести ответов.",
    tags: ["project:vesma-eyes"],
    score: 0.66,
    search_type: "hybrid",
    server: "laptop",
  },
];

async function startPreview() {
  const child = spawn(
    join(VIEWER_DIR, "node_modules", ".bin", "vite"),
    ["preview", "--port", String(PORT), "--strictPort", "--outDir", "dist"],
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
  if (!existsSync(DIST)) {
    console.error("[shots] dist/ missing — run `npm run build` first");
    process.exit(1);
  }
  const distAge = statSync(join(DIST, "index.html")).mtimeMs;
  const newestSrc = statSync(join(VIEWER_DIR, "src")).mtimeMs;
  if (distAge < newestSrc) {
    console.error("[shots] dist/ is STALE (src newer) — run `npm run build` first");
    process.exit(1);
  }

  const playwright = require("playwright");
  mkdirSync(OUT, { recursive: true });
  const preview = await startPreview();
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ["--disable-gpu", "--disable-lcd-text", "--font-render-hinting=none", "--force-color-profile=srgb"],
  });

  const results = [];
  const check = (name, pass, detail = "") => {
    results.push(pass);
    console.log(`[check] ${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
  };

  try {
    const run = async ({ width, height, lang, shot }) => {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.addInitScript(`
        try { localStorage.setItem("vesmaro.theme", "dark"); } catch {}
        try { localStorage.setItem("vesmaro.lang", ${JSON.stringify(lang)}); } catch {}
      `);
      // The one interception: the palette's memory leg gets the «User»×4
      // wire, everything else answers honestly empty (the palette needs no
      // board to open). The production adapter is the BoardAdapter — its
      // search is GET /api/mnemos/search answering {ok, results, errors}
      // (the merged search over the stores). Registration order matters —
      // playwright matches the LAST registered handler first, so the
      // catch-all goes down first.
      await page.route("**/api/**", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
      );
      await page.route("**/api/mnemos/search*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, results: USER_X4_HITS, errors: [] }),
        }),
      );
      await page.goto(BASE, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(2500);
      try {
        await page.getByRole("button", { name: "Got it" }).click({ timeout: 1500 });
        await sleep(300);
      } catch {
        /* no bubble */
      }
      await page.keyboard.press("Control+k");
      await sleep(600);
      await page.keyboard.type("сборка");
      // The debounced search (200 ms) + the four human rows.
      let rows = [];
      const deadline = Date.now() + 5000;
      for (;;) {
        rows = await page.evaluate(() =>
          [...document.querySelectorAll("[role='option']")].filter((o) =>
            (o.id || "").includes("memory"),
          ),
        );
        if (rows.length === 4 || Date.now() > deadline) break;
        await sleep(150);
      }
      check(
        `${shot}: four memory rows render`,
        rows.length === 4,
        `got ${rows.length}`,
      );
      const arias = await page.evaluate(() =>
        [...document.querySelectorAll("[role='option']")]
          .filter((o) => (o.id || "").includes("memory"))
          .map((o) => o.getAttribute("aria-label") ?? ""),
      );
      const roleWordLabels = arias.filter(
        (a) => a.startsWith("Memory: User —") || a.startsWith("Memory: User (") ||
               a.startsWith("Память: User —") || a.startsWith("Память: User ("),
      );
      check(
        `${shot}: no row's primary label is the bare role word`,
        roleWordLabels.length === 0,
        roleWordLabels.join(" | ").slice(0, 120),
      );
      check(
        `${shot}: rows are distinguishable (distinct labels)`,
        new Set(arias).size === arias.length && arias.length === 4,
      );
      const body = await page.evaluate(() => document.body.textContent ?? "");
      check(
        `${shot}: the mined headlines face the reader`,
        body.includes("Сборка падает на этапе линковки webview.") &&
          body.includes("Звуковая версия проходит проверку."),
      );
      check(
        `${shot}: v12 second story (the scroll line) still rides`,
        body.includes("Агент ответил") && body.includes("опрос на двести ответов"),
      );
      const buf = await page.screenshot({ fullPage: true });
      writeFileSync(join(OUT, shot), buf);
      console.log(`[shots] ${join(OUT, shot)}`);
      await context.close();
    };

    await run({ width: 1440, height: 1000, lang: "ru", shot: "palette-titles-ru-1440.png" });
    await run({ width: 375, height: 900, lang: "en", shot: "palette-titles-en-375.png" });
  } finally {
    await browser.close();
    preview.kill();
  }

  const failed = results.filter((r) => !r).length;
  console.log(`[shots] ${results.length - failed}/${results.length} checks green`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("[shots] crashed:", error?.message ?? error);
  process.exit(1);
});
