#!/usr/bin/env node
/**
 * W-C (ux-wc-mobile-kanban) visual-acceptance shots: the built viewer
 * (dist-smoke, mock adapter) at 375×812 — BEFORE/AFTER pairs for the mobile
 * kanban rework, plus the page-height number the done-report cites.
 *
 *   node scripts/wc-shots.mjs <prefix> [route] [outdir]
 *
 * Frames per run:
 *   <prefix>-tasks-kanban-375.png      — the board, full page
 *   <prefix>-tasks-kanban-1440.png     — the desktop board (no-regression)
 *   <prefix>-page-height-375.json      — scrollHeight + board metrics
 * With `--move` the run additionally drives the card ⋯ menu into the move
 * submenu on the 375 frame and captures the open menu + an aria snapshot.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4191;
const BASE = `http://localhost:${PORT}/app/`;

const PREFIX = process.argv[2] || "wc";
const WITH_MOVE = process.argv.includes("--move");
const OUT =
  (WITH_MOVE ? process.argv[process.argv.indexOf("--move") + 1] : undefined) ||
  process.argv[3] ||
  "/tmp/vesma-wc-shots";

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
    console.log(`[wc-shots] ${name}`);
  };

  try {
    // --- MOBILE 375 --------------------------------------------------------
    {
      const context = await browser.newContext({
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 1,
      });
      // A second-visit session (the one-time Весма intro bubble already
      // dismissed): the capture frames the BOARD, not the first-run
      // onboarding overlay that otherwise sits over the card-menu popup.
      await context.addInitScript(() => {
        window.sessionStorage.setItem("vesma.intro", "1");
      });
      const page = await context.newPage();
      await page.goto(`${BASE}tasks`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(2500);
      await shot(page, `${PREFIX}-tasks-kanban-375.png`);

      const metrics = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        columns: document.querySelectorAll("[data-column]").length,
        boardRegion: !!document.querySelector(
          '[aria-label*="анбан"], [aria-label*="anban"]',
        ),
      }));
      writeFileSync(
        join(OUT, `${PREFIX}-page-height-375.json`),
        JSON.stringify(metrics, null, 2),
      );
      console.log(
        `[wc-shots] height ${metrics.scrollHeight}px, columns ${metrics.columns}`,
      );

      if (WITH_MOVE) {
        // Drive the card ⋯ menu → «Переместить…» submenu and capture both,
        // plus an aria snapshot of the open move menu (the ≤3-tap path).
        // Dispatched clicks: the capture must not fight the one-time
        // onboarding bubble or the lane's internal scroll for hit targets.
        const card = page.locator("li[data-task-id]").first();
        await card.scrollIntoViewIfNeeded();
        await sleep(300);
        await card
          .getByRole("button", { name: /Действия с задачей|task actions/i })
          .first()
          .dispatchEvent("click");
        await sleep(400);
        await page.screenshot({ path: join(OUT, `${PREFIX}-move-menu-root-375.png`) });
        const moveItem = page
          .getByRole("menuitem", { name: /Переместить|Move to/i })
          .first();
        await moveItem.dispatchEvent("click");
        await sleep(400);
        await page.screenshot({
          path: join(OUT, `${PREFIX}-move-menu-columns-375.png`),
        });
        const menu = page.getByRole("menu", { name: /Меню задачи|task menu/i }).first();
        writeFileSync(
          join(OUT, `${PREFIX}-move-menu-aria-375.yml`),
          (await menu.ariaSnapshot()) ?? "",
        );
        console.log("[wc-shots] move-menu frames + aria captured");
      }
      await page.close();
      await context.close();
    }

    // --- DESKTOP 1440 (no-regression frame) ---------------------------------
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(`${BASE}tasks`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(2500);
      await shot(page, `${PREFIX}-tasks-kanban-1440.png`);
      const metrics = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        columns: document.querySelectorAll("[data-column]").length,
      }));
      writeFileSync(
        join(OUT, `${PREFIX}-page-height-1440.json`),
        JSON.stringify(metrics, null, 2),
      );
      await page.close();
      await context.close();
    }
  } finally {
    await browser.close();
    preview.kill();
  }
  console.log("[wc-shots] done");
}

main().catch((error) => {
  console.error(`[wc-shots] ${error?.stack ?? error?.message ?? error}`);
  process.exit(1);
});
