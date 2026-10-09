#!/usr/bin/env node
/**
 * U7 visual acceptance shots (the wave's visual acceptance loop, step 1):
 * renders the built viewer (dist-smoke, mock adapter) in real chromium and
 * captures the U7 frame map to ~/.local/opt/design-shots/u7-*.png.
 *
 * Frames:
 *   - theme PAIRS ×8 domains at 1440 (dark «колодец» / light «береста»):
 *     overview, tasks kanban, memory, kora, agents hosts, system settings,
 *     docs hub, connect conveyor;
 *   - MOBILE 375 ×8 key pages (dark) + the nav curtain open + the wizard;
 *   - the conveyors in the LIGHT theme (connect start + task wizard).
 * The light pass rides localStorage vesmaro.theme=light (the ThemeProvider's
 * registry key) — the same path a user's toggle takes.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4190;
const BASE = `http://localhost:${PORT}/app/`;
const OUT = process.argv[2] || "/var/home/abyss/.local/opt/design-shots";

const PAIR_DOMAINS = [
  ["overview", ""],
  ["tasks", "tasks"],
  ["memory", "memory"],
  ["kora", "kora"],
  ["agents", "agents/hosts"],
  ["system", "system/settings"],
  ["docs", "docs/vesma-eyes"],
  ["connect", "agents/harnesses?connect=1"],
];

const MOBILE_PAGES = [
  ["overview", ""],
  ["tasks", "tasks"],
  ["memory", "memory"],
  ["kora", "kora"],
  ["agents", "agents/hosts"],
  ["system", "system/settings"],
  ["docs", "docs/vesma-eyes"],
  ["connect", "agents/harnesses?connect=1"],
];

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
    console.log(`[shots] ${name}`);
  };

  /** One context per theme; the theme rides the registry key. */
  const newPage = async (theme, viewport) => {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
    });
    if (theme) {
      await context.addInitScript((t) => {
        window.localStorage.setItem("vesmaro.theme", t);
      }, theme);
    }
    const page = await context.newPage();
    await page.goto("about:blank");
    return { context, page };
  };

  try {
    // --- THEME PAIRS ×8 domains (1440) ------------------------------------
    for (const [name, route] of PAIR_DOMAINS) {
      for (const theme of ["dark", "light"]) {
        const { context, page } = await newPage(theme, {
          width: 1440,
          height: 900,
        });
        await page.goto(`${BASE}${route}`, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        await sleep(2500);
        await shot(page, `u7-${name}-${theme}-1440.png`);
        await page.close();
        await context.close();
      }
    }

    // --- MOBILE 375 ×8 key pages (dark) ------------------------------------
    {
      const { context, page } = await newPage("dark", {
        width: 375,
        height: 812,
      });
      for (const [name, route] of MOBILE_PAGES) {
        await page.goto(`${BASE}${route}`, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        await sleep(2200);
        await shot(page, `u7-${name}-mobile-375.png`);
      }
      // The nav curtain open (the U1 drawer over the tasks page).
      await page.goto(`${BASE}tasks`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(1500);
      const opener = page.locator("header button.md\\:hidden").first();
      if (await opener.count()) {
        await opener.click();
        await sleep(900);
        await shot(page, "u7-drawer-mobile-375.png");
        await page.keyboard.press("Escape");
      }
      // The task wizard on mobile (the U8 conveyor's mobile pass).
      await page.goto(`${BASE}tasks/list?wizard=1`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(2200);
      await shot(page, "u7-wizard-mobile-375.png");
      await page.close();
      await context.close();
    }

    // --- CONVEYORS in the LIGHT theme ---------------------------------------
    {
      const { context, page } = await newPage("light", {
        width: 1440,
        height: 900,
      });
      await page.goto(`${BASE}agents/harnesses?connect=1`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(2500);
      await shot(page, "u7-conveyor-connect-light-1440.png");

      await page.goto(`${BASE}tasks/list?wizard=1`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(2500);
      await page.fill("#create-text", "Светлая тема: черновик мастера задач");
      await page.fill("#create-project", "vesma-eyes");
      await shot(page, "u7-conveyor-wizard-light-1440.png");
      await page.close();
      await context.close();
    }
  } finally {
    await browser.close();
    preview.kill();
  }
  console.log("[shots] done");
}

main().catch((error) => {
  console.error(`[shots] ${error?.message ?? error}`);
  process.exit(1);
});
