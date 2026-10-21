#!/usr/bin/env node
/**
 * The AMBIENT breath shots (D1b-ambient, 2026-10-21) — the visual evidence
 * pair for the reformed doctrine «тихая шина = ноль СОБЫТИЙНОГО движения;
 * амбиент-дыхание живёт в капах». Drives the SAME mock-adapter dist-smoke
 * as honesty-gate.mjs and captures:
 *
 *   breath-<W>-t0/t1.png — two full-page frames ~5s apart (half the
 *       --duration-web-idle period): MUST differ, and the decoded-pixel
 *       delta is REPORTED (the undulation is a caps-bounded whisper, not a
 *       repaint: maxΔRGB stays small; the count is confined to the vein /
 *       well regions). <W> = 1440 and 375 (both breakpoint poles).
 *   quiet-<W>-t0/t1.png — the same page under ?quiet=1: two frames ≥5s
 *       apart must be pixel-still (the noise tolerance: ≤24 px at ΔRGB ≤16).
 *
 * The html[data-ambient] carrier value is logged per frame (the well's CSS
 * breath reads it — evidence the ambient layer is actually on).
 *
 * Usage (from viewer/): node scripts/amb-shots.mjs [--out /tmp/vesma-amb-shots]
 * Exit 0 = breathing present in caps + quiet stands; 1 = a contract broke.
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const argValue = (flag, fallback) =>
  args.indexOf(flag) !== -1 && args[args.indexOf(flag) + 1]
    ? args[args.indexOf(flag) + 1]
    : fallback;

const VIEWER_DIR = resolve(import.meta.dirname, "..");
const DIST_SMOKE = join(VIEWER_DIR, "dist-smoke");
const PORT = Number.parseInt(process.env.VESMARO_AMB_PORT ?? "", 10) || 4188;
const BASE = `http://localhost:${PORT}/app/`;
const OUT_DIR = resolve(argValue("--out", "/tmp/vesma-amb-shots"));
const BREATH_GAP_MS = 5000; // half the 10s always-wave period
const QUIET_GAP_MS = 5600; // the honesty ≥5s discipline
const SETTLE_MS = 2500;
const NOISE_PIXELS = 24;
const NOISE_DELTA = 16;

function resolvePlaywright() {
  const requireFromViewer = createRequire(join(VIEWER_DIR, "package.json"));
  try {
    return requireFromViewer("playwright");
  } catch {
    throw new Error("playwright is not resolvable from viewer/ — run `npm ci` first");
  }
}

function chromiumExecutablePath() {
  const explicit = process.env.VESMARO_SMOKE_CHROMIUM_PATH;
  if (explicit) return explicit;
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) return undefined;
  for (const dir of require("node:fs")
    .readdirSync(cache)
    .filter((name) => name.startsWith("chromium-"))
    .sort()
    .reverse()) {
    for (const binary of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
      const path = join(cache, dir, binary);
      if (existsSync(path)) return path;
    }
  }
  return undefined;
}

const ADAPTER_STAMP = join(DIST_SMOKE, ".adapter-mock");

function buildDistSmoke() {
  console.log("[amb] building dist-smoke (VITE_ADAPTER=mock)…");
  execSync(
    "npx tsc --noEmit -p tsconfig.json && npx vite build --outDir dist-smoke",
    {
      cwd: VIEWER_DIR,
      env: { ...process.env, VITE_ADAPTER: "mock", VITE_SMOKE_ALLOW_MOCK: "1" },
      stdio: "inherit",
    },
  );
  writeFileSync(ADAPTER_STAMP, "mock\n");
}

async function startPreview() {
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

/** Decoded-pixel diff of two PNG buffers, measured on a canvas in the page. */
async function pixelDiff(browser, a, b) {
  if (a.equals(b)) return { equal: true, pixels: 0, maxDelta: 0, ratio: 0 };
  const page = await browser.newPage();
  try {
    return await page.evaluate(
      async ([aB64, bB64]) => {
        const load = (b64) =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = `data:image/png;base64,${b64}`;
          });
        const [ia, ib] = await Promise.all([load(aB64), load(bB64)]);
        if (ia.width !== ib.width || ia.height !== ib.height)
          return { equal: false, pixels: -1, maxDelta: -1 };
        const canvas = document.createElement("canvas");
        canvas.width = ia.width;
        canvas.height = ia.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(ia, 0, 0);
        const da = ctx.getImageData(0, 0, ia.width, ia.height).data;
        ctx.clearRect(0, 0, ia.width, ia.height);
        ctx.drawImage(ib, 0, 0);
        const db = ctx.getImageData(0, 0, ib.width, ib.height).data;
        let pixels = 0;
        let maxDelta = 0;
        for (let i = 0; i < da.length; i += 4) {
          const delta = Math.max(
            Math.abs(da[i] - db[i]),
            Math.abs(da[i + 1] - db[i + 1]),
            Math.abs(da[i + 2] - db[i + 2]),
            Math.abs(da[i + 3] - db[i + 3]),
          );
          if (delta > 0) {
            pixels += 1;
            if (delta > maxDelta) maxDelta = delta;
          }
        }
        return {
          equal: false,
          pixels,
          maxDelta,
          ratio: pixels / (ia.width * ia.height),
        };
      },
      [a.toString("base64"), b.toString("base64")],
    );
  } finally {
    await page.close();
  }
}

async function pair(context, url, stem, gapMs) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await sleep(SETTLE_MS);
  const carrier = await page.evaluate(
    () => document.documentElement.dataset.ambient ?? "(absent)",
  );
  const a = await page.screenshot({ fullPage: true });
  writeFileSync(join(OUT_DIR, `${stem}-t0.png`), a);
  await sleep(gapMs);
  const b = await page.screenshot({ fullPage: true });
  writeFileSync(join(OUT_DIR, `${stem}-t1.png`), b);
  await page.close();
  return { a, b, carrier };
}

async function main() {
  const playwright = resolvePlaywright();
  mkdirSync(OUT_DIR, { recursive: true });
  if (
    !existsSync(join(DIST_SMOKE, "index.html")) ||
    !existsSync(ADAPTER_STAMP)
  ) {
    buildDistSmoke();
  }
  const preview = await startPreview();
  const executablePath = chromiumExecutablePath();
  const browser = await playwright.chromium.launch({
    headless: true,
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
    results.push(Boolean(ok));
    console.log(
      `  [${ok ? "OK  " : "FAIL"}] ${name}${details ? ` — ${details}` : ""}`,
    );
  };

  try {
    for (const [w, h, label] of [
      [1440, 900, "desktop"],
      [375, 667, "mobile"],
    ]) {
      const context = await browser.newContext({
        viewport: { width: w, height: h },
        deviceScaleFactor: 1,
      });
      const { a, b, carrier } = await pair(
        context,
        BASE,
        `breath-${w}`,
        BREATH_GAP_MS,
      );
      const diff = await pixelDiff(browser, a, b);
      check(
        !diff.equal && diff.pixels > 0,
        `breath ${label} (${w}px): two frames ~5s apart DIFFER — the well/veins undulate`,
        `pixels ${diff.pixels}, maxΔRGB ${diff.maxDelta}, html[data-ambient]=${carrier}`,
      );
      // The caps, measured. Per-pixel ceiling 160 = the PHYSICAL bound of the
      // cap-bounded layers: the ±4px well drift slides SOLID iris nodes over
      // the dark well floor (a node/bg edge flips ≈127 per channel), the vein
      // sheen adds ≤ ~0.13 alpha over the hairline. Anything LARGER would
      // mean a layer outside the caps. Area: ≤5% of the page may change —
      // the undulation is a whisper, never a repaint (measured ≈1%).
      check(
        diff.maxDelta > 0 && diff.maxDelta <= 160 && diff.ratio <= 0.05,
        `breath ${label} (${w}px): the delta stays in caps (≤5% of pixels, maxΔRGB ≤160)`,
        `pixels ${diff.pixels} (${(diff.ratio * 100).toFixed(2)}%), maxΔRGB ${diff.maxDelta}`,
      );
      console.log(`[amb] html[data-ambient]=${carrier} (${label})`);
      await context.close();
    }

    for (const [w, h, label] of [[1440, 900, "desktop"]]) {
      const context = await browser.newContext({
        viewport: { width: w, height: h },
        deviceScaleFactor: 1,
      });
      const { a, b, carrier } = await pair(
        context,
        `${BASE}?quiet=1`,
        `quiet-${w}`,
        QUIET_GAP_MS,
      );
      const diff = await pixelDiff(browser, a, b);
      const stands =
        diff.equal ||
        (diff.pixels <= NOISE_PIXELS && diff.maxDelta <= NOISE_DELTA);
      check(
        stands,
        `quiet ${label} (${w}px): ?quiet=1 stands ≥5.6s (≤${NOISE_PIXELS} noise px at ΔRGB ≤${NOISE_DELTA})`,
        `pixels ${diff.pixels}, maxΔRGB ${diff.maxDelta}, html[data-ambient]=${carrier}`,
      );
      check(
        carrier === "false",
        `quiet ${label}: the ambient carrier is OFF under ?quiet=1`,
        `html[data-ambient]=${carrier}`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
    preview.kill();
  }

  const failed = results.filter((ok) => !ok).length;
  console.log(
    `\n[amb] ${results.length - failed}/${results.length} checks green` +
      (failed ? " — FAIL" : " — the web undulates within caps"),
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(`[amb] ${error?.message ?? error}`);
  process.exit(1);
});
