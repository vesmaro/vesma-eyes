#!/usr/bin/env node
/**
 * docs-tables-width visual acceptance shots (the visual acceptance loop,
 * step 1): renders the built viewer (dist-smoke, mock adapter) in real
 * chromium and captures the mesh.yaml reference table of the docs page
 * /docs/mnemos-mesh/user/configuration (the wave's fixated test page) at
 * the acceptance widths 1440/1280/1024/768, plus scroll/focus states and
 * PROGRAMMATIC metrics (region overflow, sticky state, prose measure in ch)
 * — the numbers side of the owner gates.
 *
 * LOCAL harness, not CI. Usage (from viewer/):
 *   VITE_ADAPTER=mock VITE_SMOKE_ALLOW_MOCK=1 npx vite build --outDir dist-smoke
 *   node scripts/dtw-shots.mjs
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
const PAGE_URL = `${BASE}docs/mnemos-mesh/user/configuration`;
/** The wave's fixated test table: the FIRST mesh.yaml reference table. */
const TABLE_PROBE = `(() => {
  const tables = [...document.querySelectorAll('[role="region"] table')];
  return tables.find((t) => t.textContent.includes("node_id")) ?? tables[0] ?? null;
})()`;

function chromiumPath() {
  const cache = join(homedir(), ".cache", "ms-playwright");
  const { readdirSync } = require("node:fs");
  for (const dir of existsSync(cache)
    ? readdirSync(cache).filter((n) => n.startsWith("chromium-")).sort().reverse()
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

/** Page metrics: region overflow/sticky + the prose measure of the article. */
const METRICS = `(() => {
  const table = ${TABLE_PROBE};
  if (table === null) return { table: null };
  const region = table.closest('[role="region"]');
  const firstTd = table.querySelector("tbody td");
  const firstTh = table.querySelector("thead th");
  const sticky = firstTd ? getComputedStyle(firstTd).position : "?";
  const article = document.querySelector("article");
  const p = article ? article.querySelector("p") : null;
  let measureCh = null;
  if (p) {
    const probe = document.createElement("div");
    const cs = getComputedStyle(p);
    probe.style.cssText = "position:absolute;visibility:hidden;width:1ch;";
    probe.style.font = cs.font;
    document.body.append(probe);
    const chPx = probe.getBoundingClientRect().width;
    probe.remove();
    measureCh = chPx > 0 ? +(p.getBoundingClientRect().width / chPx).toFixed(1) : null;
  }
  return {
    table: {
      regionClientWidth: region.clientWidth,
      regionScrollWidth: region.scrollWidth,
      overflows: region.scrollWidth > region.clientWidth,
      overflowAttr: region.hasAttribute("data-table-overflow"),
      firstCellPosition: sticky,
      firstCellLeft: firstTd ? getComputedStyle(firstTd).left : "?",
      th: {
        whiteSpace: firstTh ? getComputedStyle(firstTh).whiteSpace : "?",
        overflowWrap: firstTh ? getComputedStyle(firstTh).overflowWrap : "?",
      },
      tdOverflowWrap: firstTd ? getComputedStyle(firstTd).overflowWrap : "?",
      tdMaxWidth: firstTd ? getComputedStyle(firstTd).maxWidth : "?",
      regionTabIndex: region.getAttribute("tabindex"),
      regionLabel: region.getAttribute("aria-label"),
    },
    prose: {
      articleMaxWidth: article ? getComputedStyle(article).maxWidth : null,
      paragraphWidth: p ? Math.round(p.getBoundingClientRect().width) : null,
      paragraphMeasureCh: measureCh,
    },
  };
})()`;

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
      "--no-sandbox",
      "--disable-gpu",
      "--disable-lcd-text",
      "--font-render-hinting=none",
      "--force-color-profile=srgb",
    ],
    ...(chromiumPath() ? { executablePath: chromiumPath() } : {}),
  });

  const newPage = async (context) => {
    const page = await context.newPage();
    await page.addInitScript(`
      try { localStorage.setItem("vesmaro.theme", "dark"); } catch {}
      try { localStorage.setItem("vesmaro.lang", "ru"); } catch {}
      // The nest-keeper creature is chrome, not the acceptance object —
      // hide it so it cannot photobomb the frames (it sits fixed z-30 in
      // the bottom-right corner, exactly where wide tables end).
      const style = document.createElement("style");
      style.textContent = "[data-vesma-slot]{display:none!important}";
      document.documentElement.append(style);
    `);
    await page.goto(PAGE_URL, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    // The docs chunk (manifest + md body) lands lazily — wait for the table.
    await page.waitForFunction(
      `document.querySelectorAll('[role="region"] table').length > 0`,
      { timeout: 30_000 },
    );
    await sleep(1200);
    // Dismiss the nest-keeper welcome bubble — it photobombs the frames.
    try {
      await page.getByRole("button", { name: "Понятно" }).click({ timeout: 2000 });
      await sleep(300);
    } catch {
      /* no bubble this load */
    }
    return page;
  };

  const shootTable = async (page, name, { scrollLeft = null } = {}) => {
    if (scrollLeft !== null) {
      await page.evaluate(
        `(() => { const t = ${TABLE_PROBE}; t.closest('[role="region"]').scrollLeft = ${scrollLeft}; })()`,
      );
      await sleep(400);
    }
    // Element screenshot: scrolls into view and captures the WHOLE wrapper
    // (page.screenshot clips are viewport-relative and would truncate).
    const handle = await page.evaluateHandle(
      `(() => { const t = ${TABLE_PROBE};
        return t.closest('[role="region"]').parentElement; })()`,
    );
    const buf = await handle.asElement().screenshot();
    writeFileSync(join(OUT, name), buf);
    await handle.dispose();
    console.log(`[shots] ${name}`);
  };

  try {
    for (const width of [1440, 1280, 1024, 768]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await newPage(context);
      const metrics = await page.evaluate(METRICS);
      console.log(`[metrics ${width}] ${JSON.stringify(metrics, null, 1)}`);
      await shootTable(page, `dtw-${width}-table.png`);
      if (width === 1024 || width === 768) {
        await shootTable(page, `dtw-${width}-table-scrolled.png`, { scrollLeft: 220 });
      }
      if (width === 1440) {
        // Keyboard access, the honest path: real TAB presses from the page
        // top until the scroll region takes focus (WCAG 2.1.1/2.4.7 —
        // reachable in tab order AND focus-visible). Programmatic .focus()
        // does not trigger :focus-visible in headless (script-focus
        // heuristic), so it proves nothing about the keyboard path.
        let tabs = 0;
        let regionFocused = false;
        for (; tabs < 250; tabs += 1) {
          await page.keyboard.press("Tab");
          regionFocused = await page.evaluate(
            `(() => { const t = ${TABLE_PROBE};
               const region = t.closest('[role="region"]');
               return document.activeElement === region &&
                      region.matches(':focus-visible'); })()`,
          );
          if (regionFocused) break;
        }
        console.log(
          `[metrics 1440] region keyboard-focus-visible: ${regionFocused} (tabs=${tabs + 1})`,
        );
        await page.evaluate(
          `(() => { const t = ${TABLE_PROBE};
             t.closest('[role="region"]').scrollIntoView({ block: "center" }); })()`,
        );
        await sleep(400);
        // Viewport shot: the ring draws OUTSIDE the region box — an element
        // screenshot would crop it.
        const buf = await page.screenshot();
        writeFileSync(join(OUT, "dtw-1440-table-focus.png"), buf);
        console.log("[shots] dtw-1440-table-focus.png");
        // The prose top of the article (measure context).
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(400);
        const top = await page.screenshot();
        writeFileSync(join(OUT, "dtw-1440-top.png"), top);
        console.log("[shots] dtw-1440-top.png");
      }
      await page.close();
      await context.close();
    }
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
