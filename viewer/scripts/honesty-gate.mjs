#!/usr/bin/env node
/**
 * The 5-second HONESTY GATE (wave U2; SPEC-2026-10-07 «Глубокая проработка
 * v12 до прода» п.6 + the U2 card's red line): any motion on the Overview
 * page must be caused by a REAL bus event — «первое дыхание из шины; шина
 * молчит — экран стоит». The gate loads the built viewer (mock adapter —
 * the mock bus is SILENT by default, which IS the premise), lets the page
 * settle, takes two full-page screenshots ≥5s apart and demands
 * PIXEL-IDENTICAL frames. Phantom motion (timers/cycles without an event)
 * fails here, not in review.
 *
 * Scenarios:
 *   1. silent    — default mock bus: two shots ≥5s apart MUST be identical.
 *   2. muted     — ?quiet=1 (the anti-fake gate pinned) over the same
 *                  silent bus: two shots ≥5s apart MUST be identical — the
 *                  mute gate never ADDS motion. (The gate deliberately does
 *                  NOT demand identity over a SPEAKING bus: the HUD ticker
 *                  is data, not decor — it updates in every regime, §13.3.)
 *   3. bus=demo  — positive control: the bounded demo bus SPEAKS, the page
 *                  moves: two shots ~1.4s apart must DIFFER (guards against
 *                  «passed because nothing can ever move»).
 *
 * Local gate, same discipline as smoke-render.mjs (build dist-smoke with
 * the mock adapter, serve via vite preview, drive real chromium). Browser
 * resolution: VESMARO_SMOKE_CHROMIUM_PATH > playwright cache. Do NOT use
 * --virtual-time-budget against this page (live-SSE pages hang it); the
 * script waits on real time.
 *
 * Usage (from viewer/):
 *   npm run honesty            # builds dist-smoke if missing, runs the gate
 *   node scripts/honesty-gate.mjs --rebuild --out /tmp/shots
 * Exit: 0 = every scenario green, 1 = at least one failure.
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const argValue = (flag, fallback) =>
  args.indexOf(flag) !== -1 && args[args.indexOf(flag) + 1]
    ? args[args.indexOf(flag) + 1]
    : fallback;

const VIEWER_DIR = resolve(import.meta.dirname, "..");
const DIST_SMOKE = join(VIEWER_DIR, "dist-smoke");
const PORT = 4174;
const BASE = `http://localhost:${PORT}/app/`;
const OUT_DIR = resolve(argValue("--out", join(VIEWER_DIR, "honesty-shots")));
const QUIET_GAP_MS = 5600; // ≥5s demanded by the gate
const SETTLE_MS = 2500; // lazy chunks + fonts + first paint calm-down

function resolvePlaywright() {
  const requireFromViewer = createRequire(join(VIEWER_DIR, "package.json"));
  try {
    return requireFromViewer("playwright");
  } catch {
    throw new Error(
      "playwright is not resolvable from viewer/ — run `npm ci` first",
    );
  }
}

function chromiumExecutablePath() {
  const explicit = process.env.VESMARO_SMOKE_CHROMIUM_PATH;
  if (explicit) return explicit;
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) return undefined;
  for (const dir of readdir(cache)
    .filter((name) => name.startsWith("chromium-"))
    .sort()
    .reverse()) {
    for (const binary of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
      const path = join(cache, dir, binary);
      if (existsSync(path)) return path;
    }
  }
  return undefined;

  function readdir(dir) {
    return require("node:fs").readdirSync(dir);
  }
}

function buildDistSmoke() {
  console.log("[honesty] building dist-smoke (VITE_ADAPTER=mock)…");
  execSync("npx tsc --noEmit -p tsconfig.json && npx vite build --outDir dist-smoke", {
    cwd: VIEWER_DIR,
    // The adapter pin (ME-043) forbids prod+mock unless the harness opts in.
    env: { ...process.env, VITE_ADAPTER: "mock", VITE_SMOKE_ALLOW_MOCK: "1" },
    stdio: "inherit",
  });
}

async function startPreview() {
  console.log(`[honesty] serving dist-smoke/ via vite preview on :${PORT}`);
  const child = spawn(
    join(VIEWER_DIR, "node_modules", ".bin", "vite"),
    ["preview", "--port", String(PORT), "--strictPort", "--outDir", "dist-smoke"],
    { cwd: VIEWER_DIR, stdio: ["ignore", "ignore", "inherit"] },
  );
  const deadline = Date.now() + 30_000;
  for (;;) {
    const up = await new Promise((resolveProbe) => {
      const req = require("node:http").get(
        { hostname: "localhost", port: PORT, path: "/app/" },
        (res) => {
          res.resume();
          resolveProbe(res.statusCode !== undefined && res.statusCode < 500);
        },
      );
      req.on("error", () => resolveProbe(false));
      req.setTimeout(1200, () => {
        req.destroy();
        resolveProbe(false);
      });
    });
    if (up) return child;
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`vite preview never came up on :${PORT}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function settledShot(context, url, name) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await sleep(SETTLE_MS);
  const shot = await page.screenshot({ fullPage: true });
  writeFileSync(join(OUT_DIR, name), shot);
  await page.close();
  return shot;
}

async function main() {
  const playwright = resolvePlaywright();
  mkdirSync(OUT_DIR, { recursive: true });
  if (hasFlag("--rebuild") || !existsSync(join(DIST_SMOKE, "index.html"))) {
    buildDistSmoke();
  }
  const preview = await startPreview();
  const executablePath = chromiumExecutablePath();
  const browser = await playwright.chromium.launch({
    headless: true,
    // Deterministic rasterization: headless-shell's GPU/LCD text paths can
    // jitter antialiasing on isolated glyph edges (a 2-pixel difference was
    // observed on an otherwise still page — not motion). Pin the raster.
    args: [
      "--disable-gpu",
      "--disable-lcd-text",
      "--font-render-hinting=none",
      "--force-color-profile=srgb",
    ],
    ...(executablePath ? { executablePath } : {}),
  });

  const results = [];
  const check = (ok, name, details = "") => {
    results.push({ ok: Boolean(ok), name });
    console.log(
      `  [${ok ? "OK  " : "FAIL"}] ${name}${ok || !details ? "" : ` — ${details}`}`,
    );
  };

  try {
    // 1. SILENT — the gate itself: a silent bus means a standing screen.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const a = await settledShot(context, BASE, "u2-honesty-silent-t0.png");
      console.log("[honesty] silent: waiting 5.6s of real time…");
      await sleep(QUIET_GAP_MS);
      const b = await settledShot(context, `${BASE}`, "u2-honesty-silent-t5.png");
      // Same context → the SECOND page loads caches but the sessionStorage
      // awakening flag is per-TAB: no events fired, so the flag was never
      // written; the well must stand identically anyway.
      const identical = a.equals(b);
      check(
        identical,
        "silent bus: two frames ≥5s apart are pixel-identical",
        identical ? "" : `bytes ${a.length} vs ${b.length}`,
      );
      await context.close();
    }

    // 2. MUTED — the anti-fake gate (?quiet=1) beats even a speaking bus.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const a = await settledShot(context, `${BASE}?quiet=1`, "u2-honesty-muted-t0.png");
      console.log("[honesty] muted: waiting 5.6s of real time…");
      await sleep(QUIET_GAP_MS);
      const b = await settledShot(
        context,
        `${BASE}?quiet=1`,
        "u2-honesty-muted-t5.png",
      );
      const identical = a.equals(b);
      check(
        identical,
        "muted (?quiet=1, silent bus): frames identical — mute adds no motion",
        identical ? "" : `bytes ${a.length} vs ${b.length}`,
      );
      await context.close();
    }

    // 3. POSITIVE CONTROL — a speaking bus moves the page.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(`${BASE}?bus=demo`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(2600); // three demo frames have landed by now
      const a = await page.screenshot({ fullPage: true });
      writeFileSync(join(OUT_DIR, "u2-honesty-bus-t2.png"), a);
      await sleep(1400); // the fourth frame lands; beads/drift move
      const b = await page.screenshot({ fullPage: true });
      writeFileSync(join(OUT_DIR, "u2-honesty-bus-t3.png"), b);
      await page.close();
      const differs = !a.equals(b);
      check(
        differs,
        "bus=demo positive control: a speaking bus moves the page",
        differs ? "" : "frames identical — the bus events reached nothing",
      );
      await context.close();
    }
  } finally {
    await browser.close();
    preview.kill();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n[honesty] ${results.length - failed.length}/${results.length} checks green` +
      (failed.length ? " — FAIL" : " — the light is honest"),
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(`[honesty] ${error?.message ?? error}`);
  process.exit(1);
});
