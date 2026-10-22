#!/usr/bin/env node
/**
 * agents-workspace-ide W2 «Мета-панель» visual acceptance shots (the visual
 * acceptance loop, step 1): renders the built viewer (dist-smoke, mock
 * adapter) in real chromium and captures the W2 acceptance frames to
 * /var/home/abyss/.local/opt/design-shots (override with argv[2]).
 *
 * Frames: the ≥xl frame dark (the meta-panel: Присутствие / Пульс /
 * Настройки), the settings block expanded (verdict + hub links), the seam
 * mid-drag + the widened persist, the md..xl ladder (page scroll, «Пульс»
 * under the field, ribbon), and the 375 single-column smoke.
 *
 * LOCAL harness, not CI. Usage (from viewer/):
 *   VITE_ADAPTER=mock VITE_SMOKE_ALLOW_MOCK=1 npx vite build --outDir dist-smoke
 *   node scripts/ar-w2-shots.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4189;
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

/** The corpus-point clock shift (drifting with real time). */
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
    // Dismiss the nest-keeper welcome bubble — it floats over the panel's
    // bottom action and would photobomb the acceptance frames.
    try {
      await page.getByRole("button", { name: "Понятно" }).click({ timeout: 2000 });
      await sleep(300);
    } catch {
      /* no bubble this load */
    }
    return page;
  };

  try {
    // ── Desktop 1440 (≥xl — the frame regime). ──
    const dark = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    // 1. The W2 frame, dark: the meta-panel right of the seam.
    const p1 = await newPage(dark, `${BASE}agents/hosts`);
    await write(p1, "ar-w2-frame-dark.png");
    // 2. «Настройки» expanded: the routing verdict + the quiet hub links.
    {
      const settings = p1.getByRole("button", { name: /Настройки/ }).first();
      await settings.click();
      await sleep(400);
      await write(p1, "ar-w2-settings-open.png");
      // Collapse back for the next frame.
      await settings.click();
      await sleep(300);
    }
    // 3. The seam mid-drag + the widened persist (the A1 contract keeps
    //    ruling the panel edge).
    {
      const handle = p1.locator('[role="separator"][aria-orientation="vertical"]');
      const box = await handle.boundingBox();
      if (box === null) throw new Error("seam handle not found");
      const y = box.y + box.height / 2;
      await p1.mouse.move(box.x + box.width / 2, y);
      await p1.mouse.down();
      await p1.mouse.move(box.x + box.width / 2 - 60, y, { steps: 8 });
      await sleep(150);
      await write(p1, "ar-w2-seam-drag.png");
      await p1.mouse.up();
      await sleep(300);
      await write(p1, "ar-w2-frame-widened.png");
      await p1.close();
    }
    await dark.close();

    // ── md..xl ladder (900 — the honest page scroll; «Пульс» under the
    //    field, the ribbon, the roster trigger). ──
    const md = await browser.newContext({
      viewport: { width: 900, height: 1100 },
      deviceScaleFactor: 1,
    });
    const p2 = await newPage(md, `${BASE}agents/hosts`);
    await write(p2, "ar-w2-md-ladder.png");
    await p2.close();
    await md.close();

    // ── 375 (single column, ≥48px touch targets). ──
    const mobile = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 1,
    });
    const p3 = await newPage(mobile, `${BASE}agents/hosts`);
    await write(p3, "ar-w2-375.png");
    await p3.close();
    await mobile.close();
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
