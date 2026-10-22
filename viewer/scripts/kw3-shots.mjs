#!/usr/bin/env node
/**
 * kw3 visual acceptance + perf stand (kora-rethink KW3 «Узкие и полировка»):
 * renders the built viewer (dist-smoke, mock adapter) in real chromium.
 * Screens: the responsive LADDER at its three regimes — ≥xl 1440 (three
 * columns), lg..xl 1100 (two columns, the nav sections atop the meta panel),
 * <lg 375 (the document flow, the moves strip as a collapsed section) —
 * plus the deployed zone, EN parity of the narrow frame, and the PERF
 * MEASUREMENT (blueprint §8 backlog): the «Все ходы» expansion commit on a
 * >500-visible-line transcript (720 synthetic rows via ?hermesMessages=big),
 * timed as click → next painted frame + the long-task tail (a time-to-
 * interactive proxy). Same discipline as kw2-shots.mjs.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4196;
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

  /** A Kora page pinned to a theme. */
  const newKoraPage = async (context, { theme = "light", url = `${BASE}kora/hermes` } = {}) => {
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

  /** Deploy the «Все ходы» zone (the strip toggle). */
  const expandMoves = async (page) => {
    await page.click('button[aria-controls="kora-moves-body"]');
    await sleep(900);
  };
  const collapseMoves = async (page) => {
    await page.click('button[aria-controls="kora-moves-body"]');
    await sleep(600);
  };

  /** Load EVERY transcript page of the zone (the full-corpus worst case). */
  const loadAllPages = async (page) => {
    for (let i = 0; i < 30; i += 1) {
      const more = page.locator("#kora-moves-body button", { hasText: "Показать ещё" });
      if ((await more.count()) === 0) return;
      await more.first().click();
      await sleep(450);
    }
  };

  /** The expansion measurement: collapse the loaded zone, then time ONE
   * expand click — commit = click → next painted frame; tti = the longest
   * long-task duration inside the window (the main-thread block). */
  const measureExpansion = async (page) => {
    await collapseMoves(page);
    const runs = [];
    for (let i = 0; i < 5; i += 1) {
      const result = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const longtasks = [];
            const obs = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) longtasks.push(entry.duration);
            });
            obs.observe({ entryTypes: ["longtask"] });
            const t0 = performance.now();
            document.querySelector('button[aria-controls="kora-moves-body"]').click();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                obs.disconnect();
                const body = document.querySelector("#kora-moves-body");
                resolve({
                  commitMs: Math.round(performance.now() - t0),
                  ttiMs: Math.round(Math.max(0, ...longtasks)),
                  rows: body ? body.querySelectorAll("li").length : 0,
                  nodes: body ? body.querySelectorAll("*").length : 0,
                  chars: body ? body.textContent.length : 0,
                });
              }),
            );
          }),
      );
      runs.push(result);
      await sleep(400);
      if (i < 4) await collapseMoves(page);
    }
    const by = (key) => runs.map((r) => r[key]).sort((a, b) => a - b);
    return {
      runs,
      commitMedianMs: by("commitMs")[2],
      ttiMedianMs: by("ttiMs")[2],
      rows: runs[runs.length - 1].rows,
      nodes: runs[runs.length - 1].nodes,
      chars: runs[runs.length - 1].chars,
    };
  };

  try {
    // ── The LADDER (states.md §6) ──────────────────────────────────────────
    // 1. ≥xl 1440: three columns — nav | center split | meta.
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await newKoraPage(ctx, { url: `${BASE}kora/hermes?hermesBridge=pulled` });
      await shot(page, "kw3-ladder-wide-1440-light.png");
      await expandMoves(page);
      await shot(page, "kw3-ladder-wide-1440-moves-open.png");
      await ctx.close();
    }

    // 2. lg..xl 1100: two columns — center split + meta panel with the NAV
    // sections at its top (one scroll, navigation first); the nav seam gone.
    {
      const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
      const page = await newKoraPage(ctx, { url: `${BASE}kora/hermes?hermesBridge=pulled` });
      await shot(page, "kw3-ladder-narrowframe-1100-light.png");
      await expandMoves(page);
      await shot(page, "kw3-ladder-narrowframe-1100-moves-open.png");
      // EN parity of the narrow frame.
      await page.getByRole("button", { name: "en", exact: true }).click();
      await sleep(900);
      await shot(page, "kw3-ladder-narrowframe-1100-en.png");
      await ctx.close();
    }

    // 3. <lg 375: the document flow — nav card → center (chat + the folded
    // «Все ходы» section) → meta sections; below sm full-width surfaces.
    {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
      const page = await newKoraPage(ctx, { url: `${BASE}kora/hermes?hermesBridge=pulled` });
      await shot(page, "kw3-ladder-flow-375-light.png");
      await ctx.close();
    }

    // ── The PERF STAND (blueprint §8 backlog numbers) ─────────────────────
    // 720 synthetic rows (multi-line → far beyond 500 visible lines), every
    // page loaded, the expansion timed 5× (medians reported).
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await newKoraPage(ctx, {
        url: `${BASE}kora/hermes?hermesBridge=pulled&hermesMessages=big`,
      });
      await expandMoves(page);
      await loadAllPages(page);
      const numbers = await measureExpansion(page);
      console.log("[perf] «Все ходы» expansion, 720-row corpus, 5 runs:");
      console.log(
        `[perf] commit median ${numbers.commitMedianMs} ms · tti(long-task) median ${numbers.ttiMedianMs} ms · ` +
          `rows ${numbers.rows} · nodes ${numbers.nodes} · chars ${numbers.chars}`,
      );
      console.log(`[perf] runs: ${JSON.stringify(numbers.runs)}`);
      writeFileSync(join(OUT, "kw3-perf-moves-expansion.json"), `${JSON.stringify(numbers, null, 2)}\n`);
      console.log(`[perf] saved -> ${join(OUT, "kw3-perf-moves-expansion.json")}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    preview.kill();
  }
  console.log(`[shots] done -> ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
