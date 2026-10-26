#!/usr/bin/env node
/**
 * MF2 visual acceptance shots (the wave's visual acceptance loop, step 1):
 * renders the built viewer (dist-smoke, mock adapter) in real chromium and
 * walks the CONNECT JOURNEY with the owner's eyes — the hub, the connect
 * form, the provider card with its key slot, the rotation dialog, the
 * removal confirm — at 1440 (ru + en) and 375 (ru), full-page.
 *
 * The typed credential is a FIXTURE PLACEHOLDER string; the mock adapter
 * (like the real board) keeps metadata only after the save.
 * Output: {OUT}/mf2-*.png.
 *
 * Build first: VITE_ADAPTER=mock VITE_SMOKE_ALLOW_MOCK=1 npx vite build --outDir dist-smoke
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4188;
const BASE = `http://localhost:${PORT}/app/`;
const OUT = process.argv[2] || "/var/home/abyss/.local/opt/design-shots";
const FIXTURE_KEY = "sk-qa-fake-credential-placeholder-0001";

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
    console.log(`[mf2-shots] ${name}`);
  };

  /** Fresh page in the given lang; lands on the hub. */
  const newPage = async (context, lang) => {
    const page = await context.newPage();
    await page.addInitScript((lang) => {
      try {
        localStorage.setItem("vesmaro.theme", "dark");
        localStorage.setItem("vesmaro.lang", lang);
      } catch {
        /* storage unavailable — theme/lang fall back as usual */
      }
    }, lang);
    await page.goto(`${BASE}agents/models`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(2500);
    return page;
  };

  /** Walk the journey once in THIS page's mock: connect → card. */
  const connectProvider = async (page, name, url) => {
    await page.getByRole("button", { name: /Подключить провайдера|Connect provider/ }).first().click();
    await page.fill("#provider-name", name);
    await page.fill("#provider-url", url);
    await page.fill("#provider-key", FIXTURE_KEY);
    await page.getByRole("button", { name: /Подключить провайдера|Connect provider/ }).last().click();
    await sleep(1200);
  };

  try {
    // Desktop 1440 ru — the journey: hub → dialog → connected card.
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const ru = await newPage(ctx, "ru");
    await shot(ru, "mf2-hub-fresh-1440-ru.png");
    await connectProvider(ru, "openrouter", "https://openrouter.ai/api/v1/");
    await shot(ru, "mf2-hub-card-1440-ru.png");

    // The rotation dialog over the connected card.
    await ru.getByRole("button", { name: "Заменить ключ" }).first().click();
    await sleep(600);
    await shot(ru, "mf2-rotate-dialog-1440-ru.png");
    await ru.keyboard.press("Escape");
    await sleep(400);

    // The removal confirm lives IN the card.
    await ru.getByRole("button", { name: "Удалить ключ" }).first().click();
    await sleep(400);
    await shot(ru, "mf2-remove-confirm-1440-ru.png");
    await ru.close();

    // Desktop 1440 en — parity shot of the connected hub.
    const en = await newPage(ctx, "en");
    await connectProvider(en, "openrouter", "https://openrouter.ai/api/v1/");
    await shot(en, "mf2-hub-card-1440-en.png");
    await en.close();
    await ctx.close();

    // Mobile 375 ru — the connected hub.
    const mobile = await browser.newContext({
      viewport: { width: 375, height: 720 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    const ruMobile = await newPage(mobile, "ru");
    await connectProvider(ruMobile, "openrouter", "https://openrouter.ai/api/v1/");
    await shot(ruMobile, "mf2-hub-card-375-ru.png");
    await ruMobile.close();
    await mobile.close();
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
