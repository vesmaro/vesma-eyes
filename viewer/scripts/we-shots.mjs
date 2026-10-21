#!/usr/bin/env node
/**
 * W-E (ux-we-navigation-language) visual-acceptance shots: the built viewer
 * (dist-smoke, mock adapter) at 1440 and 375 — the D8/D9/D12 frames:
 *
 *   <prefix>-overview-1440.png        — the daily menu WITHOUT placeholder rows
 *   <prefix>-overview-375.png         — touch frame: crumbs carry «Палитра», no «Ctrl K»
 *   <prefix>-traces-1440.png          — the placeholder page: h1 + honest line, NO filter
 *   <prefix>-harnesses-1440.png       — Connect: «агент» noun + visible skills hint
 *   <prefix>-kora-list-1440.png       — origin chips read «через релей» + tooltip
 *   <prefix>-menu-drawer-375.png      — the 375 drawer open: live sections only
 *   <prefix>-hosts-1440.png           — host card; with --hosts-dupes the stand
 *                                       injects a second hermes:api_server live
 *                                       session (TEMP fixture tweak, never committed)
 *
 *   node scripts/we-shots.mjs <prefix> [outdir]
 *
 * Prereq: dist-smoke exists (the honesty gate builds it with the mock stamp:
 * `npm run honesty` or `VITE_ADAPTER=mock npx vite build --outDir dist-smoke`).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4193;
const BASE = `http://localhost:${PORT}/app/`;

const PREFIX = process.argv[2] || "we";
const OUT = process.argv[3] || "/tmp/vesma-we-shots";

function chromiumPath() {
  const cache = join(homedir(), ".cache", "ms-playwright");
  for (const dir of existsSync(cache)
    ? require("node:fs")
        .readdirSync(cache)
        .filter((n) => n.startsWith("chromium-"))
        .sort()
        .reverse()
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
  const playwright = require("playwright");
  mkdirSync(OUT, { recursive: true });
  const preview = await startPreview();
  const browser = await playwright.chromium.launch({
    headless: true,
    args: [
      "--disable-gpu",
      "--disable-lcd-text",
      "--font-render-hinting=none",
      "--force-color-profile=srgb",
    ],
    ...(chromiumPath() ? { executablePath: chromiumPath() } : {}),
  });

  const shot = async (page, name) => {
    const buf = await page.screenshot({ fullPage: true });
    writeFileSync(join(OUT, name), buf);
    console.log(`[we-shots] ${name}`);
  };

  try {
    // --- DESKTOP 1440 ------------------------------------------------------
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      await context.addInitScript(() => {
        window.sessionStorage.setItem("vesma.intro", "1");
      });
      const page = await context.newPage();
      const settle = async (route) => {
        await page.goto(`${BASE}${route}`, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        await sleep(700);
      };

      await settle("");
      await shot(page, `${PREFIX}-overview-1440.png`);

      await settle("system/traces");
      await shot(page, `${PREFIX}-traces-1440.png`);

      await settle("agents/harnesses");
      await shot(page, `${PREFIX}-harnesses-1440.png`);

      await settle("kora");
      await shot(page, `${PREFIX}-kora-list-1440.png`);

      await settle("agents/hosts/laptop");
      await shot(page, `${PREFIX}-hosts-1440.png`);

      await context.close();
    }

    // --- TOUCH 375 ---------------------------------------------------------
    {
      // hasTouch flips the (hover:none)/(pointer:coarse) media — the kbd
      // hints must hide and the text label must show (D12). NOTE: isMobile
      // stays OFF — its device-metrics override misrasterises hidden spans
      // in headless captures (the DOM/matchMedia verdict and the paint
      // disagreed); hasTouch alone drives the media queries honestly.
      const context = await browser.newContext({
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 1,
        hasTouch: true,
      });
      await context.addInitScript(() => {
        window.sessionStorage.setItem("vesma.intro", "1");
      });
      const page = await context.newPage();
      await page.goto(`${BASE}`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(700);
      // VIEWPORT shots for the touch frames: Playwright's fullPage capture
      // re-evaluates media queries against the capture viewport — the
      // (hover:none)/(pointer:coarse) rules flip and hidden kbd hints
      // re-appear (capture artifact, probe-verified; not the product).
      await page.screenshot({
        path: join(OUT, `${PREFIX}-overview-375.png`),
        fullPage: false,
      });
      console.log(`[we-shots] ${PREFIX}-overview-375.png`);

      // The drawer: the daily menu at 375 — live sections only (D8).
      await page.getByRole("button", { name: "Открыть разделы" }).tap();
      await sleep(600);
      await page.screenshot({
        path: join(OUT, `${PREFIX}-menu-drawer-375.png`),
        fullPage: false,
      });
      console.log(`[we-shots] ${PREFIX}-menu-drawer-375.png`);

      await context.close();
    }
  } finally {
    await browser.close();
    preview.kill();
  }
  console.log(`[we-shots] done → ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
