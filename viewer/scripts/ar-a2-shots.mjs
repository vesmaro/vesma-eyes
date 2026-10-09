#!/usr/bin/env node
/**
 * agents-redesign A2 visual acceptance shots (mobile reflow + keyboard path):
 * renders the built viewer (dist-smoke, mock adapter) in real chromium and
 * captures the A2 frame map to /var/home/abyss/.local/opt/design-shots/ar-a2-*.png.
 *
 * Frames: the md band (1024) and the 768 band in BOTH themes (ribbon + sheet
 * trigger + honest scroll), the 375 phone in both themes, the roster SHEET
 * open at 375 (fullscreen drawer) and at 1024 (right sheet), plus the sheet
 * rows' touch-height audit (≥48px) printed to the console.
 *
 * The corpus-point clock shift (see ar-a1-shots.mjs) supplies the fixture
 * presence variety; the UI logic runs unmodified. LOCAL harness, not CI.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4188;
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
  if (!existsSync(join(VIEWER_DIR, "dist-smoke", "index.html"))) {
    throw new Error(
      "dist-smoke/ is missing — build it first: VITE_ADAPTER=mock VITE_SMOKE_ALLOW_MOCK=1 npx vite build --outDir dist-smoke",
    );
  }
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

  const write = async (page, name) => {
    const buf = await page.screenshot({ fullPage: true });
    writeFileSync(join(OUT, name), buf);
    console.log(`[shots] ${name}`);
  };

  const newPage = async (context, url, { theme = "dark", settle = 2500 } = {}) => {
    const page = await context.newPage();
    await page.addInitScript(`
      try { localStorage.setItem("vesmaro.theme", ${JSON.stringify(theme)}); } catch {}
      try { localStorage.setItem("vesmaro.lang", "ru"); } catch {}
    `);
    await page.addInitScript(CLOCK_SHIFT_INIT);
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(settle);
    try {
      await page.getByRole("button", { name: "Понятно" }).click({ timeout: 2000 });
      await sleep(300);
    } catch {
      /* no bubble this load */
    }
    return page;
  };

  try {
    for (const theme of ["dark", "light"]) {
      // ── md band 1024 (768–1279): ribbon + trigger + honest scroll. ──
      const md = await browser.newContext({
        viewport: { width: 1024, height: 800 },
        deviceScaleFactor: 1,
      });
      const pmd = await newPage(md, `${BASE}agents/hosts`, { theme });
      await write(pmd, `ar-a2-md-1024-${theme}.png`);
      await pmd.close();
      await md.close();

      // ── 768 band: the narrow md edge. ──
      const n768 = await browser.newContext({
        viewport: { width: 768, height: 900 },
        deviceScaleFactor: 1,
      });
      const p768 = await newPage(n768, `${BASE}agents/hosts`, { theme });
      await write(p768, `ar-a2-768-${theme}.png`);
      await p768.close();
      await n768.close();

      // ── 375 phone: the drawer trigger + the one-column field. ──
      const ph = await browser.newContext({
        viewport: { width: 375, height: 720 },
        deviceScaleFactor: 1,
      });
      const pp = await newPage(ph, `${BASE}agents/hosts`, { theme });
      await write(pp, `ar-a2-mobile-375-${theme}.png`);
      // The drawer open (fullscreen <sm) + the touch-height audit.
      await pp.getByRole("button", { name: /Ростер · 5/ }).click();
      await sleep(800);
      const heights = await pp.evaluate(() =>
        [...document.querySelectorAll("[role='dialog'] [role='option']")].map(
          (row) => Math.round(row.getBoundingClientRect().height),
        ),
      );
      console.log(
        `[touch] sheet option heights (≥48 required): ${heights.join(", ")} — ${
          heights.every((h) => h >= 48) ? "PASS" : "FAIL"
        }`,
      );
      await write(pp, `ar-a2-sheet-375-open-${theme}.png`);
      await pp.close();
      await ph.close();

      // Only the dark pass needs the md sheet frame.
      if (theme === "dark") {
        const md2 = await browser.newContext({
          viewport: { width: 1024, height: 800 },
          deviceScaleFactor: 1,
        });
        const pm2 = await newPage(md2, `${BASE}agents/hosts`, { theme });
        await pm2.getByRole("button", { name: /Ростер · 5/ }).click();
        await sleep(800);
        await write(pm2, `ar-a2-sheet-1024-open-${theme}.png`);
        await pm2.close();
        await md2.close();
      }
    }
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
