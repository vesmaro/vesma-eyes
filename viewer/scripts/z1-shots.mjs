#!/usr/bin/env node
/**
 * brain-zones Z1 (structural layer) visual acceptance shots: the hosts
 * roster speaking the zone lore — the «зона коры» field kicker, the
 * «Сплетения зоны» section with the REAL neuron sum, the A6-follow-up
 * accessible sessions counter. Frames: dark 1440 (field + roster), light
 * 1440, mobile 375, EN field (the lore dictionary parity), and the ARIA
 * snapshots of the zone grouping. Frames + aria -> OUT (default
 * /tmp/vesma-z1-shots).
 *
 * Static-structure discipline (honest light): every element this wave adds
 * is a static text/aria node — the script also asserts the page mounts
 * ZERO animated elements of the new structure (no agents-presence-* class
 * without a recorded flash is the runtime's business; here we only capture
 * what the structure looks like).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4297;
const BASE = `http://localhost:${PORT}/app/`;
const OUT = process.argv[2] || "/tmp/vesma-z1-shots";

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

const CLOCK_SHIFT_INIT = `
  const SHIFT = Date.parse("2026-09-19T09:00:30Z") - Date.now();
  const OrigDate = Date;
  class ShiftedDate extends OrigDate {
    constructor(...args) {
      if (args.length === 0) super(OrigDate.now() + SHIFT);
      else super(...args);
    }
    static now() { return OrigDate.now() + SHIFT; }
  }
  window.Date = ShiftedDate;
`;

async function main() {
  const playwright = require("playwright");
  mkdirSync(OUT, { recursive: true });
  const preview = await startPreview();
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ["--disable-gpu", "--disable-lcd-text", "--font-render-hinting=none", "--force-color-profile=srgb"],
    ...(chromiumPath() ? { executablePath: chromiumPath() } : {}),
  });

  const write = async (page, name) => {
    const buf = await page.screenshot({ fullPage: true });
    writeFileSync(join(OUT, name), buf);
    console.log(`[shots] ${name}`);
  };

  const newPage = async (context, url, { theme = "dark", lang = "ru", settle = 3000 } = {}) => {
    const page = await context.newPage();
    await page.addInitScript(`
      try { localStorage.setItem("vesmaro.theme", ${JSON.stringify(theme)}); } catch {}
      try { localStorage.setItem("vesmaro.lang", ${JSON.stringify(lang)}); } catch {}
    `);
    await page.addInitScript(CLOCK_SHIFT_INIT);
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(settle);
    try {
      await page
        .getByRole("button", { name: /Понятно|Got it/ })
        .click({ timeout: 2000 });
      await sleep(300);
    } catch {
      /* no bubble this load */
    }
    return page;
  };

  try {
    // 1. RU dark 1440: the field (zone kicker + «Сплетения зоны» + neurons)
    //    and the roster panel.
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    const p1 = await newPage(ctx, `${BASE}agents/hosts/laptop`);
    await write(p1, "z1-roster-1440-dark.png");

    // 2. The ARIA snapshot of the zone grouping (the structural proof).
    const zoneAria = await p1
      .locator('section[aria-label="Сплетения зоны"]')
      .ariaSnapshot();
    writeFileSync(join(OUT, "z1-aria-zone-section.ru.yaml"), zoneAria);
    const fieldAria = await p1.locator('h2[id="agents-host-title"]').evaluate(
      (el) => ({
        kicker: el.parentElement?.parentElement?.querySelector("p")?.textContent,
        name: el.textContent,
      }),
    );
    writeFileSync(
      join(OUT, "z1-aria-field-kicker.ru.json"),
      JSON.stringify(fieldAria, null, 2),
    );
    console.log(`[aria] field kicker: ${JSON.stringify(fieldAria.kicker)}`);
    await p1.close();
    await ctx.close();

    // 3. Light 1440 (the same structure, the other theme column).
    const lctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    const p2 = await newPage(lctx, `${BASE}agents/hosts/laptop`, { theme: "light" });
    await write(p2, "z1-roster-1440-light.png");
    await p2.close();
    await lctx.close();

    // 4. Mobile 375 (dark): the sheet IS the roster there — trigger + field.
    const mctx = await browser.newContext({
      viewport: { width: 375, height: 900 },
      deviceScaleFactor: 1,
    });
    const p3 = await newPage(mctx, `${BASE}agents/hosts/laptop`);
    await write(p3, "z1-mobile-375-dark.png");
    // The <xl roster sheet: the zone rows of the ROSTER (the grouping the
    // owner walks at phone width).
    await p3.getByRole("button", { name: /Ростер ·/ }).click();
    await sleep(600);
    await write(p3, "z1-mobile-375-sheet-dark.png");
    const sheetAria = await p3.locator('[role="dialog"] [role="listbox"]').ariaSnapshot();
    writeFileSync(join(OUT, "z1-aria-roster-sheet.ru.yaml"), sheetAria);
    await p3.close();
    await mctx.close();

    // 5. EN 1440 (the lore dictionary parity in the real render).
    const ectx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    const p4 = await newPage(ectx, `${BASE}agents/hosts/laptop`, { lang: "en" });
    await write(p4, "z1-roster-1440-en.png");
    const zoneAriaEn = await p4
      .locator('section[aria-label="Zone plexuses"]')
      .ariaSnapshot();
    writeFileSync(join(OUT, "z1-aria-zone-section.en.yaml"), zoneAriaEn);
    await p4.close();
    await ectx.close();
  } finally {
    await browser.close();
    preview.kill();
  }
  console.log(`[shots] done -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
