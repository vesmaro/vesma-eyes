#!/usr/bin/env node
/**
 * spc visual acceptance stand (specialists-interactive-cards, owner
 * directive 2026-10-21): renders the built viewer (dist-smoke, mock
 * adapter) in real chromium. Screens: the executor sheet's «Обнаружено на
 * хосте» section at 1440 and 375 — the record card open (the human
 * structure + the two specialist drilldowns), the raw name list under its
 * own cut, and the honest empty category. Same discipline as kw3-shots.mjs.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4197;
const BASE = `http://localhost:${PORT}/app/`;
const OUT = process.argv[2] || "/var/home/abyss/.local/opt/design-shots";

function chromiumPath() {
  const candidates = [
    join(homedir(), ".cache", "ms-playwright"),
    "/var/home/abyss/.distrobox/ubuntu/home/.cache/ms-playwright",
  ];
  for (const cache of candidates) {
    if (!existsSync(cache)) continue;
    for (const dir of require("node:fs")
      .readdirSync(cache)
      .filter((n) => n.startsWith("chromium-"))
      .sort()
      .reverse()) {
      for (const bin of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
        const p = join(cache, dir, bin);
        if (existsSync(p)) return p;
      }
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
  if (!existsSync(join(VIEWER_DIR, "dist-smoke", "index.html"))) {
    throw new Error(
      "dist-smoke/ is missing — build it first: VITE_ADAPTER=mock VITE_SMOKE_ALLOW_MOCK=1 npx vite build --outDir dist-smoke",
    );
  }
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

  /** Viewport shot after scrolling the record card into view — the sheet
   * scrolls internally, so fullPage cannot reach the section. */
  const shotCard = async (page, name) => {
    await page
      .locator("dl")
      .filter({ hasText: "Тип записи" })
      .first()
      .scrollIntoViewIfNeeded();
    await sleep(400);
    const buf = await page.screenshot();
    writeFileSync(join(OUT, name), buf);
    console.log(`[shots] ${name}`);
  };

  /**
   * Open the executor sheet and drill into the inventory: category open →
   * the first specialist's record card open. Returns the page ready for
   * the screenshot.
   */
  const openRecordCard = async (context, viewport) => {
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    await page.goto(`${BASE}agents/hosts`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(1800);
    // The harness chip opens the ExecutorSheet drawer.
    await page.getByRole("button", { name: /zcode@laptop/ }).first().click();
    await sleep(1200);
    // The inventory category disclosure («специалисты 39»).
    await page.getByRole("button", { name: /специалисты/ }).first().click();
    await sleep(600);
    // The record row → the record card.
    await page.getByRole("button", { name: /bathys-researcher/ }).first().click();
    await sleep(600);
    return page;
  };

  try {
    const context = await browser.newContext({ locale: "ru" });

    // 1440 — the desktop reading: sheet + the open specialist record card.
    const desktop = await openRecordCard(context, { width: 1440, height: 1000 });
    await shotCard(desktop, "spc-1440-record-card.png");
    // The raw name list under its own cut.
    await desktop.getByRole("button", { name: /сырой список имён/ }).click();
    await sleep(600);
    await shot(desktop, "spc-1440-raw-list.png");
    // The honest empty category (плагины: 0 → «имён нет»).
    await desktop.getByRole("button", { name: /^плагины/ }).click();
    await sleep(600);
    await shot(desktop, "spc-1440-empty-category.png");
    await desktop.close();

    // 375 — the phone reading: the same drill at the narrow frame.
    const phone = await openRecordCard(context, { width: 375, height: 812 });
    await shotCard(phone, "spc-375-record-card.png");
    await phone.close();

    // The deep link lands: ?specialist= seeds the execution filter.
    const seed = await context.newPage();
    await seed.setViewportSize({ width: 1440, height: 1000 });
    await seed.goto(
      `${BASE}agents/execution?specialist=gcw-tech-lead`,
      { waitUntil: "load" },
    );
    await sleep(2200);
    const seeded = await seed
      .locator('input[placeholder="специалист"]')
      .inputValue();
    console.log(`[shots] seed input value: «${seeded}»`);
    await shot(seed, "spc-1440-execution-seed.png");
    await seed.close();

    await context.close();
    console.log(`[shots] done → ${OUT}`);
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
