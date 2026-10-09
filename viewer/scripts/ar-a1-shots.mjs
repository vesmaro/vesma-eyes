#!/usr/bin/env node
/**
 * agents-redesign A1 visual acceptance shots (the visual acceptance loop,
 * step 1): renders the built viewer (dist-smoke, mock adapter) in real
 * chromium and captures the A1 acceptance frame map to
 * /var/home/abyss/.local/opt/design-shots/ar-a1-*.png.
 *
 * Frames: the ≥1280 frame dark + light (selected host), the empty roster
 * (driven through the REAL registry delete conveyor — no fixtures were
 * harmed), the pending host, the seam mid-drag, and the 375 mobile smoke.
 *
 * The mock fixtures carry the corpus-point timestamps (2026-09-19T09:00Z);
 * the acceptance frames need the corpus-authored presence variety (online /
 * silent / offline / awaiting-approval / revoked), so the script shifts the
 * page clock to the corpus point (drifting with real time) — the same
 * freeze-the-clock technique the unit suite uses (vi.setSystemTime); the UI
 * logic runs unmodified.
 *
 * LOCAL harness, not CI. Usage (from viewer/): node scripts/ar-a1-shots.mjs
 * (expects dist-smoke/ — run the honesty gate once or build with
 * VITE_ADAPTER=mock VITE_SMOKE_ALLOW_MOCK=1).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
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
    return page;
  };

  try {
    // ── Desktop 1440 (≥1280 — the frame regime). ──
    const dark = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    // 1. The frame, dark: /agents/hosts redirects to the first host.
    const p1 = await newPage(dark, `${BASE}agents/hosts`);
    await write(p1, "ar-a1-frame-dark.png");
    // 2. The seam MID-DRAG: pointer down on the separator, +120 px, shoot
    //    BEFORE pointerup (the 4px strong line + the live width change).
    {
      const handle = p1.locator('[role="separator"][aria-orientation="vertical"]');
      const box = await handle.boundingBox();
      if (box === null) throw new Error("seam handle not found");
      const y = box.y + box.height / 2;
      await p1.mouse.move(box.x + box.width / 2, y);
      await p1.mouse.down();
      await p1.mouse.move(box.x + box.width / 2 + 120, y, { steps: 8 });
      await sleep(150);
      await write(p1, "ar-a1-seam-drag.png");
      await p1.mouse.up();
      await sleep(300);
      // 3. The widened panel persists (commit) — the same page after drag.
      await write(p1, "ar-a1-frame-dark-widened.png");
      await p1.close();
    }
    // 4. The pending host selected (the «ждёт решения» row + field pill).
    {
      const p = await newPage(dark, `${BASE}agents/hosts/new-host`);
      await write(p, "ar-a1-pending-host.png");
      await p.close();
    }
    // 5. The empty roster: driven through the REAL registry delete conveyor
    //    (menu → Delete → confirm), then the frame renders the canonical
    //    empty + CTA. No fixture surgery — the same path an owner walks.
    {
      const p = await newPage(dark, `${BASE}agents/harnesses`, { settle: 2000 });
      p.on("dialog", (dialog) => void dialog.accept());
      for (;;) {
        const triggers = p.locator('button[aria-haspopup="menu"][aria-label^="Actions for executor"]');
        const count = await triggers.count();
        if (count === 0) break;
        await triggers.first().click();
        await p.getByRole("menuitem", { name: "Delete" }).click();
        await sleep(400);
      }
      await p.goto(`${BASE}agents/hosts`, { waitUntil: "load" });
      await sleep(2000);
      await write(p, "ar-a1-empty-roster.png");
      await p.close();
    }
    await dark.close();

    // ── Light theme (WCAG AA both themes — the selected row + pills). ──
    const light = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const pl = await newPage(light, `${BASE}agents/hosts`, { theme: "light" });
    await write(pl, "ar-a1-frame-light.png");
    await pl.close();
    await light.close();

    // ── Mobile 375 smoke (A2 owns the reflow; this must merely not break). ──
    const mobile = await browser.newContext({
      viewport: { width: 375, height: 720 },
      deviceScaleFactor: 1,
    });
    const pm = await newPage(mobile, `${BASE}agents/hosts`);
    await write(pm, "ar-a1-mobile-375.png");
    await pm.close();
    await mobile.close();
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
