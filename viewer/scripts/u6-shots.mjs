#!/usr/bin/env node
/**
 * U6 visual acceptance shots (the wave's visual acceptance loop, step 1):
 * renders the built viewer (dist-smoke, mock adapter) in real chromium and
 * captures the acceptance frame map to ~/.local/opt/design-shots/u6-*.png.
 * Breakpoints: 1440 desktop full-page + 375 mobile baseline + a reduced-
 * motion pass. Presence flash: a real executor.online frame through the
 * mock bus, captured mid-decay.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4186;
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
    console.log(`[shots] ${name}`);
  };

  const newPage = async (context, url, settle = 2500) => {
    const page = await context.newPage();
    // The canonical wave look: «Колодец» (the dark palette is the spec's
    // default identity; the app default preference is "system" and headless
    // chromium is light — pin the well for the acceptance frames).
    await page.addInitScript(() => {
      try {
        localStorage.setItem("vesmaro.theme", "dark");
      } catch {
        /* storage unavailable — theme falls back as usual */
      }
    });
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(settle);
    return page;
  };

  try {
    // Desktop 1440.
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    // 1. Host cards with presence (the v12 dress).
    await shot(await newPage(ctx, `${BASE}agents/hosts`), "u6-agents-hosts-presence.png");
    // 2. The presence flash mid-decay (a REAL transition through the bus).
    {
      const page = await newPage(ctx, `${BASE}agents/hosts`);
      await page.evaluate(() => {
        window.VesmaMockBus?.emit("executor.online", {
          executor: {
            id: "exec-laptop-zcode",
            name: "zcode@laptop",
            harness: "zcode",
            host: "laptop",
            transport: "local-poll",
            capabilities: [],
            presence: "online",
          },
          prev_state: "offline",
          state: "online",
          last_seen_at: new Date().toISOString(),
        });
      });
      await sleep(200);
      await shot(page, "u6-agents-presence-flash.png");
      await page.close();
    }
    // 3. Исполнение.
    await shot(await newPage(ctx, `${BASE}agents/execution`), "u6-agents-execution.png");
    // 4. Подключение (registry).
    await shot(await newPage(ctx, `${BASE}agents/harnesses`), "u6-agents-harnesses.png");
    // 5. Система — зеркало в рельсе (>=1280) + composition.
    await shot(await newPage(ctx, `${BASE}system/settings`), "u6-system-mirror.png");
    // 6. Система — секции (status as the section sample).
    await shot(await newPage(ctx, `${BASE}system/status`), "u6-system-sections.png");
    // 7. Доки — хаб с карточками и статистикой.
    await shot(await newPage(ctx, `${BASE}docs/vesma-eyes`), "u6-docs-hub.png");
    // 8. Доки — RUS/ORIG переключение (ORIG pressed, the original body).
    {
      const page = await newPage(ctx, `${BASE}docs/mnemos/user/getting-started`);
      const group = page.locator("[role='group'][aria-label='Язык статьи: перевод или оригинал']");
      await group.locator("button", { hasText: "ORIG" }).click();
      await sleep(700);
      await shot(page, "u6-docs-rus-orig.png");
      await page.close();
    }
    // 9. Honest empties: the docs search zero-results popover + traces.
    {
      const page = await newPage(ctx, `${BASE}docs/vesma-eyes`);
      await page.fill("input[type='search']", "хоккейный-шайба-xyz");
      await sleep(600);
      await shot(page, "u6-docs-search-empty.png");
      await page.close();
      const traces = await newPage(ctx, `${BASE}system/traces`);
      await shot(traces, "u6-system-traces.png");
      await traces.close();
    }
    // 10. Reduced motion (the static mirror of the flash — OS emulation).
    {
      const rctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
      });
      await shot(await newPage(rctx, `${BASE}agents/hosts`), "u6-reduced-agents.png");
      await rctx.close();
    }
    await ctx.close();
    // 11. Mobile 375 baseline.
    {
      const mctx = await browser.newContext({
        viewport: { width: 375, height: 720 },
        deviceScaleFactor: 1,
      });
      await shot(await newPage(mctx, `${BASE}agents/hosts`), "u6-mobile-375-agents.png");
      await shot(await newPage(mctx, `${BASE}system/settings`), "u6-mobile-375-settings.png");
      await mctx.close();
    }
  } finally {
    await browser.close();
    preview.kill();
  }
  console.log(`[shots] done -> ${OUT}`);
}

main().catch((e) => {
  console.error(`[shots] ${e?.message ?? e}`);
  process.exit(1);
});
