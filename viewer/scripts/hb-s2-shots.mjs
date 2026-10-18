#!/usr/bin/env node
/**
 * hb-s2 visual acceptance shots (hermes-bridge slice 2, T004): renders the
 * built viewer (dist-smoke, mock adapter) in real chromium and captures the
 * hermes-source frame map to ~/.local/opt/design-shots/hb-s2-*.png.
 * States: honest empty (pre-pull), ok after ONE manual pull, off slot with
 * the human reason, off pull failure, the slice-3 transcript placeholder,
 * mobile 375, both themes. Same discipline as u6-shots.mjs.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4193;
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

  /** A Kora page pinned to a theme; the mock adapter reads location.search
   * at construction (?hermesBridge=off demo knob). */
  const newKoraPage = async (context, { theme = "light", url = `${BASE}kora` } = {}) => {
    const page = await context.newPage();
    await page.addInitScript((pin) => {
      try {
        localStorage.setItem("vesmaro.theme", pin);
      } catch {
        /* storage unavailable — theme falls back as usual */
      }
    }, theme);
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(1800);
    return page;
  };

  /** The ONE filter select → the hermes source context. */
  const selectHermes = async (page) => {
    await page.selectOption("#kora-host-filter", "hermes");
    await sleep(900);
  };

  /** The ONE manual pull (the hermes context refresh button). */
  const clickRefresh = async (page) => {
    await page.getByRole("button", { name: /Обновить/ }).click();
    await sleep(1500);
  };

  try {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });

    // 1. The honest empty: hermes source selected, no pull yet.
    {
      const page = await newKoraPage(ctx);
      await selectHermes(page);
      await shot(page, "hb-s2-hermes-empty-1440-light.png");
      await page.close();
    }

    // 2. Ok after ONE manual pull (light + dark): rows + the ok status line.
    for (const theme of ["light", "dark"]) {
      const page = await newKoraPage(ctx, { theme });
      await selectHermes(page);
      await clickRefresh(page);
      await shot(page, `hb-s2-hermes-ok-1440-${theme}.png`);
      await page.close();
    }

    // 3. The honest off slot: ?hermesBridge=off, no pull.
    {
      const page = await newKoraPage(ctx, { url: `${BASE}kora?hermesBridge=off` });
      await selectHermes(page);
      await shot(page, "hb-s2-hermes-off-1440-light.png");
      await page.close();
    }

    // 4. The off pull failure: the human reason as the freshest fact.
    {
      const page = await newKoraPage(ctx, { url: `${BASE}kora?hermesBridge=off` });
      await selectHermes(page);
      await clickRefresh(page);
      await shot(page, "hb-s2-hermes-off-pull-1440-light.png");
      await page.close();
    }

    // 5. The slice-3 transcript placeholder (light + dark): a hermes
    // session clicked → the honest gap, head stays readable. The row is
    // clicked IN-PAGE (the SPA link) — a fresh goto would reload the mock
    // adapter with an empty registry (the pull IS the ingest, mock state
    // does not survive a reload) and 404 honestly instead.
    for (const theme of ["light", "dark"]) {
      const page = await newKoraPage(ctx, { theme });
      await selectHermes(page);
      await clickRefresh(page);
      await page.getByRole("link", { name: /hermes:api_server/ }).click();
      await sleep(1500);
      await shot(page, `hb-s2-hermes-transcript-1440-${theme}.png`);
      await page.close();
    }
    await ctx.close();

    // 6. Mobile 375 (light + dark): hermes source pulled, the header row
    // (title · count · refresh) wraps honestly.
    const mctx = await browser.newContext({
      viewport: { width: 375, height: 720 },
      deviceScaleFactor: 1,
    });
    for (const theme of ["light", "dark"]) {
      const page = await newKoraPage(mctx, { theme });
      await selectHermes(page);
      await clickRefresh(page);
      await shot(page, `hb-s2-hermes-375-${theme}.png`);
      await page.close();
    }
    await mctx.close();
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
