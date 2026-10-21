#!/usr/bin/env node
/**
 * ux-hygiene-followups visual acceptance shots (card ux-hygiene-followups-20261020):
 * renders the built viewer (dist-smoke, mock adapter) in real chromium and
 * captures every surface touched by the dead-opacity-utility replacements:
 *   tasks board + list search highlight, create-task dialog scrim (the
 *   ?wizard=1 deep link — no click needed), task activity hover, kora
 *   session list, memory pulse (degraded banner), docs hub (current card),
 *   settings hub (sticky nav + devices CTA hover), devices rows hover,
 *   command palette scrim + row hover, auth overlay scrim; a 375 mobile
 *   pass on the board/list/kora.
 * Every frame is best-effort: a missed trigger shoots the page anyway and
 * suffixes the name with `-missed` — the run never dies mid-pass.
 * Usage: node scripts/uxh-shots.mjs <out-dir>  (expects dist-smoke/ built —
 * VITE_ADAPTER=mock VITE_SMOKE_ALLOW_MOCK=1 npx vite build --outDir dist-smoke)
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4197;
const BASE = `http://localhost:${PORT}/app/`;
const OUT = process.argv[2] || "/tmp/vesma-hygiene-shots";

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
  if (!existsSync(join(VIEWER_DIR, "dist-smoke", "index.html"))) {
    throw new Error(
      "dist-smoke/ is missing — build it first: VITE_ADAPTER=mock VITE_SMOKE_ALLOW_MOCK=1 npx vite build --outDir dist-smoke",
    );
  }
  const preview = await startPreview();
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: chromiumPath(),
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--force-color-profile=srgb",
      "--disable-lcd-text",
      "--hide-scrollbars",
    ],
  });

  /** Best-effort: run `step`, never throw. */
  const best = async (step) => {
    try {
      await step();
    } catch {
      /* the frame still gets shot by the caller */
    }
  };

  /** One context pass; `mobile` switches the viewport, `theme` pins the
   * theme family (vesmaro.theme = the ThemeProvider registry key; without
   * it the system preference — light in headless — would decide). */
  async function pass(tag, { mobile = false, theme } = {}) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 375, height: 720 } : { width: 1440, height: 1000 },
      deviceScaleFactor: 2,
      locale: "ru-RU",
    });
    if (theme) {
      await context.addInitScript(
        ([key, value]) => localStorage.setItem(key, value),
        ["vesmaro.theme", theme],
      );
    }
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const shot = async (name) =>
      page.screenshot({ path: join(OUT, `${tag}-${name}.png`), fullPage: true });
    const settle = (ms = 1200) => sleep(ms);

    // Tasks board (kanban columns, card borders, blocked edge).
    await best(async () => {
      await page.goto(`${BASE}tasks`, { waitUntil: "networkidle" });
      await settle();
    });
    await shot("board");

    // Create-task dialog (the scrim behind it) — the wizard deep link.
    await best(async () => {
      await page.goto(`${BASE}tasks?wizard=1`, { waitUntil: "networkidle" });
      await page.getByRole("dialog").waitFor({ state: "visible" });
      await settle(500);
    });
    await shot((await page.locator("[role=dialog]").count()) > 0 ? "task-dialog" : "task-dialog-missed");

    // Task list + the BOARD cards with the title-search highlight (the
    // <mark> lives on the kanban card title — HighlightedTitle).
    await best(async () => {
      await page.goto(`${BASE}tasks/list?q=WF-1`, { waitUntil: "networkidle" });
      await settle();
    });
    await shot("list-search");
    await best(async () => {
      await page.goto(`${BASE}tasks?q=WF-1`, { waitUntil: "networkidle" });
      await settle();
    });
    await shot("board-search");

    // Task activity: hover a chart column (hover wash).
    await best(async () => {
      await page.goto(`${BASE}tasks/activity`, { waitUntil: "networkidle" });
      await settle();
      await page.locator("button[aria-pressed]").last().hover();
      await settle(300);
    });
    await shot("activity-hover");

    // Kora (selected session wash).
    await best(async () => {
      await page.goto(`${BASE}kora`, { waitUntil: "networkidle" });
      await settle();
    });
    await shot("kora");

    // Memory pulse (degraded-sources banner).
    await best(async () => {
      await page.goto(`${BASE}memory/pulse`, { waitUntil: "networkidle" });
      await settle();
    });
    await shot("pulse");

    // Docs hub (current project card edge).
    await best(async () => {
      await page.goto(`${BASE}docs/vesma-eyes`, { waitUntil: "networkidle" });
      await settle();
    });
    await shot("docs");

    // Settings hub: hover the devices CTA (quiet iris hover edge).
    await best(async () => {
      await page.goto(`${BASE}system/settings`, { waitUntil: "networkidle" });
      await settle();
      await page.getByRole("link", { name: /устройств|devices/i }).last().hover();
      await settle(300);
    });
    await shot("settings-hub");

    // Devices: hover a row.
    await best(async () => {
      await page.goto(`${BASE}system/devices`, { waitUntil: "networkidle" });
      await settle();
      await page.locator("li.rounded-md.border").last().hover();
      await settle(300);
    });
    await shot("devices-hover");

    // Command palette: open over tasks (retry — the hotkey listener
    // mounts with hydration), hover a row.
    await best(async () => {
      await page.goto(`${BASE}tasks`, { waitUntil: "networkidle" });
      await settle(800);
      for (let i = 0; i < 3 && (await page.locator("[role=dialog]").count()) === 0; i += 1) {
        await page.keyboard.press("ControlOrMeta+KeyK");
        await settle(1000);
      }
      await page.getByRole("option").first().hover();
      await settle(250);
    });
    await shot((await page.locator("[role=dialog]").count()) > 0 ? "palette" : "palette-missed");
    await best(async () => page.keyboard.press("Escape"));

    // Auth overlay (its own scrim): open from the TopBar «Войти».
    await best(async () => {
      await page.getByRole("button", { name: /войти|sign in/i }).first().click();
      await page.locator("[data-testid=auth-overlay]").waitFor({ state: "visible" });
      await settle(500);
    });
    await shot(
      (await page.locator("[data-testid=auth-overlay]").count()) > 0
        ? "auth-overlay"
        : "auth-overlay-missed",
    );

    await context.close();
  }

  try {
    await pass("d", { theme: "dark" });
    await pass("l", { theme: "light" });
    await pass("m", { mobile: true, theme: "dark" });
  } finally {
    await browser.close().catch(() => {});
    preview.kill();
  }
  console.log(`[uxh-shots] done → ${OUT}`);
}

main().catch((err) => {
  console.error("[uxh-shots] fatal:", err?.message ?? err);
  process.exit(1);
});
