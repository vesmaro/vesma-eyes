#!/usr/bin/env node
/** Quick U7 mobile/desktop spot frames (visual acceptance loop, iteration N). */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4192;
const BASE = `http://localhost:${PORT}/app/`;
const OUT = "/var/home/abyss/.local/opt/design-shots";

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
  for (let i = 0; i < 40; i++) {
    const up = await new Promise((res) => {
      const req = require("node:http").get({ hostname: "localhost", port: PORT, path: "/app/" }, (r) => { r.resume(); res(r.statusCode < 500); });
      req.on("error", () => res(false));
      req.setTimeout(1000, () => { req.destroy(); res(false); });
    });
    if (up) return child;
    await sleep(400);
  }
  throw new Error("preview never came up");
}

async function main() {
  const playwright = require("playwright");
  mkdirSync(OUT, { recursive: true });
  const preview = await startPreview();
  try {
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ["--disable-gpu", "--font-render-hinting=none"],
      ...(chromiumPath() ? { executablePath: chromiumPath() } : {}),
    });
    // Mobile 375 spot frames
    const mobile = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
    const page = await mobile.newPage();
    const shot = async (name, fullPage = true) => {
      writeFileSync(join(OUT, name), await page.screenshot({ fullPage }));
      console.log(`[spot] ${name}`);
    };
    page.on("pageerror", (e) => console.error(`[pageerror] ${e.message}`));
    page.on("console", (m) => m.type() === "error" && console.error(`[console] ${m.text().slice(0, 200)}`));

    await page.goto(`${BASE}tasks`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(2000);
    await shot("spot-tasks-mobile-375.png");

    const opener = page.locator("header button.md\\:hidden").first();
    if (await opener.count()) {
      await opener.click();
      await sleep(800);
      await shot("spot-drawer-mobile-375.png", false);
      await page.keyboard.press("Escape");
      await sleep(400);
    }
    await page.goto(`${BASE}kora`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(2000);
    await shot("spot-kora-mobile-375.png");
    await page.goto(`${BASE}system/settings`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(1500);
    await shot("spot-settings-mobile-375.png");
    await mobile.close();

    // Desktop 1440 spot frames (topbar/board unchanged canon check)
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const dpage = await desktop.newPage();
    dpage.on("pageerror", (e) => console.error(`[pageerror] ${e.message}`));
    await dpage.goto(`${BASE}tasks`, { waitUntil: "load" });
    await dpage.evaluate(() => document.fonts.ready);
    await sleep(2000);
    writeFileSync(join(OUT, "spot-tasks-1440.png"), await dpage.screenshot({ fullPage: false }));
    console.log("[spot] spot-tasks-1440.png");
    await dpage.goto(`${BASE}system/settings`, { waitUntil: "load" });
    await dpage.evaluate(() => document.fonts.ready);
    await sleep(1500);
    writeFileSync(join(OUT, "spot-settings-1440.png"), await dpage.screenshot({ fullPage: false }));
    console.log("[spot] spot-settings-1440.png");
    await desktop.close();
    await browser.close();
  } finally {
    preview.kill();
  }
  console.log("[spot] done");
}
main().catch((e) => { console.error(`[spot] ${e?.message ?? e}`); process.exit(1); });
