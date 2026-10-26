#!/usr/bin/env node
/**
 * MF3 visual acceptance shots (the wave's visual acceptance loop, step 1):
 * renders the built viewer (dist-smoke, mock adapter) in real chromium and
 * walks the GRANTS JOURNEY with the owner's eyes — the provider card with
 * the MF3 slot facts (never used), the grants empty state («доступен
 * только борду»), the grant dialog (host/executor picker), the granted
 * table (active → paused), the revoke confirm — at 1440 (ru + en) and
 * 375 (ru), full-page.
 *
 * NOTE: the mock adapter cannot mint a provider-401, so the `rejected`
 * slot state is NOT in the shot set — its text/shape is pinned by the
 * vitest matrix (ModelsGrants.test.tsx) and renders through the SAME
 * slot component (a text swap, not a layout change).
 * Output: {OUT}/mf3-*.png.
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
const PORT = 4189;
const BASE = `http://localhost:${PORT}/app/`;
const OUT = process.argv[2] || "/var/home/abyss/.local/opt/design-shots";
const FIXTURE_KEY = "sk-qa-fake-credential-placeholder-0002";

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
    console.log(`[mf3-shots] ${name}`);
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

  /** Connect a provider so its card (and grants section) exists. */
  const connectProvider = async (page, name, url) => {
    await page.getByRole("button", { name: /Подключить провайдера|Connect provider/ }).first().click();
    await page.fill("#provider-name", name);
    await page.fill("#provider-url", url);
    await page.fill("#provider-key", FIXTURE_KEY);
    await page.getByRole("button", { name: /Подключить провайдера|Connect provider/ }).last().click();
    await sleep(1200);
  };

  try {
    // Desktop 1440 ru — the journey: connected card → grants empty →
    // dialog → granted table → paused → revoke confirm.
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const ru = await newPage(ctx, "ru");
    await connectProvider(ru, "openrouter", "https://openrouter.ai/api/v1/");
    await shot(ru, "mf3-card-grants-empty-1440-ru.png");

    // The grant dialog: the Хосты picker from the live registry.
    await ru.getByRole("button", { name: "Выдать доступ" }).first().click();
    await sleep(600);
    await shot(ru, "mf3-grant-dialog-1440-ru.png");
    await ru.locator("#grant-target-host-laptop").click();
    await ru.getByRole("button", { name: "Выдать доступ" }).last().click();
    await sleep(1200);
    await shot(ru, "mf3-card-grant-row-1440-ru.png");

    // Pause the grant (the switch in the Статус column). The toggle
    // invalidates + refetches, so the DOM node is replaced mid-action —
    // the raw element click bypasses playwright's state verification.
    await ru.locator('input[aria-label="Доступ для laptop"]').evaluate((el) => el.click());
    await sleep(1500);
    await shot(ru, "mf3-card-grant-paused-1440-ru.png");

    // The revoke confirm lives IN the row.
    await ru.getByRole("button", { name: "Отозвать", exact: true }).first().click();
    await sleep(400);
    await shot(ru, "mf3-revoke-confirm-1440-ru.png");
    await ru.close();

    // Desktop 1440 en — parity shot of the granted card.
    const en = await newPage(ctx, "en");
    await connectProvider(en, "openrouter", "https://openrouter.ai/api/v1/");
    await en.getByRole("button", { name: "Grant access" }).first().click();
    await sleep(600);
    await en.locator("#grant-target-host-laptop").click();
    await en.getByRole("button", { name: "Grant access" }).last().click();
    await sleep(1200);
    await shot(en, "mf3-card-grant-row-1440-en.png");
    await en.close();
    await ctx.close();

    // Mobile 375 ru — the granted card (the table wraps).
    const mobile = await browser.newContext({
      viewport: { width: 375, height: 720 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    const ruMobile = await newPage(mobile, "ru");
    await connectProvider(ruMobile, "openrouter", "https://openrouter.ai/api/v1/");
    await ruMobile.getByRole("button", { name: "Выдать доступ" }).first().click();
    await sleep(600);
    await ruMobile.locator("#grant-target-host-laptop").click();
    await ruMobile.getByRole("button", { name: "Выдать доступ" }).last().click();
    await sleep(1200);
    await shot(ruMobile, "mf3-card-grant-row-375-ru.png");
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
