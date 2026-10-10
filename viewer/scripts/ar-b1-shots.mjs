#!/usr/bin/env node
/**
 * agents-redesign B1 visual acceptance shots (the field workbench): the host
 * header + actions + «Сейчас» + «Недавно» per state — live host (both
 * themes + 375), off, revoked (tombstone + reconnect), pending, and the
 * honest idle/quiet. Frames -> /var/home/abyss/.local/opt/design-shots/ar-b1-*.png.
 *
 * Corpus note (honest): the smoke kora fixtures carry sessions for
 * exec-zcode-main/exec-vscode-lab/exec-pi-edge — NONE of them exists in the
 * board executor registry, so the sessions half of «Сейчас» renders its
 * honest empty on every smoke host; the LIVE-session path is proven by the
 * unit test with a seeded kora cache. The provisioning frame is likewise
 * blocked on a corpus decision (no provisioning executor in the smoke
 * fixtures — adding one ripples the shared registry tests).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4192;
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

  const newPage = async (context, url, { theme = "dark", settle = 3000 } = {}) => {
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
      // 1. The live host workbench (header + actions + Сейчас + Недавно).
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
      });
      const p1 = await newPage(ctx, `${BASE}agents/hosts/laptop`, { theme });
      await write(p1, `ar-b1-live-host-${theme}.png`);
      await p1.close();
      await ctx.close();

      // 2. The phone workbench (one column).
      if (theme === "dark" || theme === "light") {
        const mctx = await browser.newContext({
          viewport: { width: 375, height: 900 },
          deviceScaleFactor: 1,
        });
        const pm = await newPage(mctx, `${BASE}agents/hosts/laptop`, { theme });
        await write(pm, `ar-b1-live-host-375-${theme}.png`);
        await pm.close();
        await mctx.close();
      }

      // Dark-only state frames.
      if (theme === "dark") {
        const dctx = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          deviceScaleFactor: 1,
        });
        // off: the «Новые задачи не получает» block + a disabled action.
        const p2 = await newPage(dctx, `${BASE}agents/hosts/old-laptop`, { theme });
        await write(p2, "ar-b1-off-dark.png");
        await p2.close();
        // revoked: the tombstone + reconnect + the honest quiet.
        const p3 = await newPage(dctx, `${BASE}agents/hosts/old-host`, { theme });
        await write(p3, "ar-b1-revoked-dark.png");
        await p3.close();
        // pending: как в A1 (the decision pill) + the workbench below.
        const p4 = await newPage(dctx, `${BASE}agents/hosts/new-host`, { theme });
        await write(p4, "ar-b1-pending-dark.png");
        await p4.close();
        // idle: «Простаивает» in «Сейчас»; «Недавно» carries the host feed.
        const p5 = await newPage(dctx, `${BASE}agents/hosts/mesh-2`, { theme });
        await write(p5, "ar-b1-idle-dark.png");
        await p5.close();
        await dctx.close();
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
