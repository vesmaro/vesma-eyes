#!/usr/bin/env node
/**
 * MF1 visual acceptance shots (the wave's visual acceptance loop, step 1):
 * renders the built viewer (dist-smoke, mock adapter) in real chromium and
 * captures the models fleet hub at 1440 full-page + 375 mobile full-page,
 * dark well theme, ru + en (the i18n pairs must read side by side).
 * Output: {OUT}/mf1-*.png.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4187;
const BASE = `http://localhost:${PORT}/app/`;
const OUT = process.argv[2] || "/var/home/abyss/.local/opt/design-shots";

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
    console.log(`[mf1-shots] ${name}`);
  };

  const newPage = async (context, url, lang) => {
    const page = await context.newPage();
    await page.addInitScript((lang) => {
      try {
        localStorage.setItem("vesmaro.theme", "dark");
        localStorage.setItem("vesmaro.lang", lang);
      } catch {
        /* storage unavailable — theme/lang fall back as usual */
      }
    }, lang);
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(2500);
    return page;
  };

  try {
    // Desktop 1440, ru (the owner's default) + en (parity).
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    await shot(await newPage(ctx, `${BASE}agents/models`, "ru"), "mf1-hub-1440-ru.png");
    await shot(await newPage(ctx, `${BASE}agents/models`, "en"), "mf1-hub-1440-en.png");
    await ctx.close();

    // Mobile 375, ru.
    const mobile = await browser.newContext({
      viewport: { width: 375, height: 720 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    await shot(await newPage(mobile, `${BASE}agents/models`, "ru"), "mf1-hub-375-ru.png");
    await mobile.close();
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
