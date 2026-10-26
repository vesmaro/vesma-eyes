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
 * docs-a4-field (2026-10-26): widths extended with 1920 (the owner gate
 * «без скролла на 1440 и 1920»), the SECOND acceptance page added —
 * /docs/mnemos/user/getting-started («Установка», the 3-column install
 * channels table with the long `curl -fsSL … | bash` inline code) — and
 * full-page frames at 1440/768 for the whole-article visual review. All
 * numbers land in a4f-metrics.json next to the frames.
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
// argv[2] is the OUT dir ONLY when it is not a --flag (the --page filter
// below shares the argv slot).
const OUT =
  process.argv[2] && !process.argv[2].startsWith("--")
    ? process.argv[2]
    : "/var/home/abyss/.local/opt/design-shots";
// 1920 runs LAST: its software-raster composition after the table element
// screenshot is the heaviest step (observed renderer crashes under host
// memory pressure) — every lighter width has landed by then.
const WIDTHS = [1440, 1280, 1024, 768, 1920];
/** The two acceptance pages: mesh.yaml reference + install channels. */
const PAGES = [
  {
    name: "config",
    url: `${BASE}docs/mnemos-mesh/user/configuration`,
    marker: "node_id",
  },
  {
    name: "install",
    url: `${BASE}docs/mnemos/user/getting-started`,
    marker: "install.sh",
  },
];
const probeFor = (marker) => `(() => {
  const tables = [...document.querySelectorAll('[role="region"] table')];
  return tables.find((t) => t.textContent.includes(${JSON.stringify(marker)})) ?? tables[0] ?? null;
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

/** Page metrics builder: region overflow/sticky + the prose measure. */
const metricsFor = (probe) => `(() => {
  const table = ${probe};
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
      overflowDeltaPx: region.scrollWidth - region.clientWidth,
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
      articleClientWidth: article ? article.clientWidth : null,
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
  // `--page=install` narrows the run to one acceptance page (used to
  // complete evidence after a partial run without re-shooting the rest).
  const pageFilter = process.argv.find((a) => a.startsWith("--page="));
  const pages = pageFilter
    ? PAGES.filter((d) => d.name === pageFilter.split("=")[1])
    : PAGES;
  if (pages.length === 0) throw new Error(`no page matches ${pageFilter}`);
  const preview = await startPreview();

  const newPage = async (context, url) => {
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
    await page.goto(url, { waitUntil: "load" });
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

  const metricsJson = {};
  // A `--page=` rerun MERGES into the existing metrics instead of wiping
  // the pages already collected by a previous run.
  const metricsPath = join(OUT, "a4f-metrics.json");
  if (existsSync(metricsPath)) {
    try {
      Object.assign(metricsJson, JSON.parse(readFileSync(metricsPath, "utf8")));
    } catch {
      /* unreadable previous metrics — start clean */
    }
  }

  /** A FRESH browser per page: the renderer degrades across many heavy
   *  steps inside one browser process (observed «Target crashed» after
   *  ~10 screenshot ops under host memory pressure); per-page isolation
   *  plus the per-width retry keeps each step's failure local. */
  const launchBrowser = () =>
    playwright.chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-lcd-text",
        "--font-render-hinting=none",
        "--force-color-profile=srgb",
      ],
      ...(chromiumPath() ? { executablePath: chromiumPath() } : {}),
    });

  const shootTable = async (page, probe, name, { scrollLeft = null } = {}) => {
    if (scrollLeft !== null) {
      await page.evaluate(
        `(() => { const t = ${probe}; t.closest('[role="region"]').scrollLeft = ${scrollLeft}; })()`,
      );
      await sleep(400);
    }
    // Element screenshot: scrolls into view and captures the WHOLE wrapper
    // (page.screenshot clips are viewport-relative and would truncate).
    const handle = await page.evaluateHandle(
      `(() => { const t = ${probe};
        return t.closest('[role="region"]').parentElement; })()`,
    );
    const buf = await handle.asElement().screenshot();
    writeFileSync(join(OUT, name), buf);
    await handle.dispose();
    console.log(`[shots] ${name}`);
  };

  /** Whole-article rhythm frames WITHOUT fullPage capture: a 20k-px
   *  fullPage composite reliably kills the software-raster renderer here
   *  (observed: Page.captureScreenshot failures → Target crashed), so the
   *  page is walked in viewport segments at fixed scroll fractions. */
  const shootSegments = async (page, name, stops) => {
    const height = await page.evaluate(
      "Math.max(1, document.documentElement.scrollHeight - window.innerHeight)",
    );
    for (let i = 0; i < stops.length; i += 1) {
      await page.evaluate(`window.scrollTo(0, ${Math.round(height * stops[i])})`);
      await sleep(400);
      const buf = await page.screenshot();
      const seg = `${name}-seg${i + 1}.png`;
      writeFileSync(join(OUT, seg), buf);
      console.log(`[shots] ${seg}`);
    }
  };

  /** One page×width step: metrics + table/top/focus/full frames. Throws on
   *  renderer death — the caller retries on a fresh context. */
  const shootWidth = async (context, doc, probe, width, metricsJson) => {
    const page = await newPage(context, doc.url);
    const metrics = await page.evaluate(metricsFor(probe));
    metricsJson[doc.name][width] = metrics;
    // Incremental write: a crashed renderer must not lose the numbers
    // already collected.
    writeFileSync(
      join(OUT, "a4f-metrics.json"),
      `${JSON.stringify(metricsJson, null, 1)}\n`,
    );
    console.log(`[metrics ${doc.name} ${width}] ${JSON.stringify(metrics, null, 1)}`);
    // Viewport-top frame FIRST (page is at the top right after load): the
    // field, the rail and the prose top in context — saved before the
    // heavier element screenshots, so a late renderer crash cannot lose it.
    const top = await page.screenshot();
    writeFileSync(join(OUT, `a4f-${doc.name}-${width}-top.png`), top);
    console.log(`[shots] a4f-${doc.name}-${width}-top.png`);
    await shootTable(page, probe, `a4f-${doc.name}-${width}-table.png`);
    if (width === 1024 || width === 768) {
      await shootTable(page, probe, `a4f-${doc.name}-${width}-table-scrolled.png`, {
        scrollLeft: 220,
      });
    }
    if (width === 1440) {
      // Keyboard access, the honest path: real TAB presses from the page
      // top until the scroll region takes focus (WCAG 2.1.1/2.4.7 —
      // reachable in tab order AND focus-visible). Programmatic .focus()
      // does not trigger :focus-visible in headless (script-focus
      // heuristic), so it proves nothing about the keyboard path.
      // Already proven (a prior attempt or run recorded it)? Skip the
      // 250-press walk — it is the flakiest loop under memory pressure,
      // and the verdict + frame are already on disk.
      if (metricsJson[doc.name].keyboardFocusVisible === true) {
        console.log(`[metrics ${doc.name} 1440] keyboard focus already proven — skipped`);
      } else {
        let tabs = 0;
        let regionFocused = false;
        for (; tabs < 250; tabs += 1) {
          await page.keyboard.press("Tab");
          regionFocused = await page.evaluate(
            `(() => { const t = ${probe};
               const region = t.closest('[role="region"]');
               return document.activeElement === region &&
                      region.matches(':focus-visible'); })()`,
          );
          if (regionFocused) break;
        }
        metricsJson[doc.name].keyboardFocusVisible = regionFocused;
        console.log(
          `[metrics ${doc.name} 1440] region keyboard-focus-visible: ${regionFocused} (tabs=${tabs + 1})`,
        );
      }
      await page.evaluate(
        `(() => { const t = ${probe};
           t.closest('[role="region"]').scrollIntoView({ block: "center" }); })()`,
      );
      await sleep(400);
      // Viewport shot: the ring draws OUTSIDE the region box — an element
      // screenshot would crop it.
      const buf = await page.screenshot();
      writeFileSync(join(OUT, `a4f-${doc.name}-1440-table-focus.png`), buf);
      console.log(`[shots] a4f-${doc.name}-1440-table-focus.png`);
      // Whole-article rhythm for the visual review (the wide slot +
      // clamped prose across the page) — segmented, see shootSegments.
      // BEST-EFFORT: these frames are review context, not an acceptance
      // line — a renderer crash here must not kill the width step (the
      // numbers and table/top/focus frames are already on disk).
      try {
        await shootSegments(page, `a4f-${doc.name}-1440-full`, [0, 0.33, 0.66]);
      } catch (error) {
        console.log(
          `[segments ${doc.name} 1440] skipped: ${String(error).split("\n")[0]}`,
        );
      }
    }
    if (width === 768) {
      try {
        await shootSegments(page, `a4f-${doc.name}-768-full`, [0, 0.4]);
      } catch (error) {
        console.log(
          `[segments ${doc.name} 768] skipped: ${String(error).split("\n")[0]}`,
        );
      }
    }
    await page.close();
  };

  try {
    for (const doc of pages) {
      const probe = probeFor(doc.marker);
      metricsJson[doc.name] ??= {};
      const browser = await launchBrowser();
      try {
        for (const width of WIDTHS) {
          // The renderer occasionally dies under host memory pressure
          // (observed: «Target crashed» mid-run at a healthy /dev/shm) —
          // retry the whole width step on a FRESH context.
          let done = false;
          for (let attempt = 1; attempt <= 3 && !done; attempt += 1) {
            const context = await browser.newContext({
              viewport: { width, height: 900 },
              deviceScaleFactor: 1,
            });
            try {
              await shootWidth(context, doc, probe, width, metricsJson);
              done = true;
            } catch (error) {
              console.log(
                `[retry ${doc.name} ${width}] attempt ${attempt} failed: ${String(error).split("\n")[0]}`,
              );
              if (attempt === 3) throw error;
              await sleep(1500);
            } finally {
              await context.close().catch(() => {});
            }
          }
        }
      } finally {
        await browser.close().catch(() => {});
      }
    }
    writeFileSync(metricsPath, `${JSON.stringify(metricsJson, null, 1)}\n`);
    console.log("[shots] a4f-metrics.json");
  } finally {
    preview.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
