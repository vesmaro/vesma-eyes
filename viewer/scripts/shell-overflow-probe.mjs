#!/usr/bin/env node
/**
 * Shell-overflow acceptance probe (topbar-375-overflow + vesma-cloud +
 * crumbs-truncate tickets): the built viewer (dist-smoke, mock adapter) is
 * served via vite preview and every SHELL page — board /tasks, docs /docs,
 * docs hub /docs/mnemos-mesh, docs article, kora /kora, agents /agents —
 * is rendered at 375 and 768. At 768 the sidebar is pinned EXPANDED
 * ("vesmaro.sidebarCollapsed"="0" — the stored-full-panel state) to exercise
 * the narrowest legit content column. Green = on every page both widths hold:
 *   1. no horizontal overflow: documentElement.scrollWidth ≤ clientWidth
 *      AND no element rect crosses the viewport edge by > 0.5px (sr-only
 *      offscreen markers and elements inside inner scroll containers are
 *      exempt — they never widen the document);
 *   2. the vesma nest bubble (`.vesma-cloud`) must not intersect the crumb
 *      row or the page h1 — and on NARROW screens (<768) it must not be
 *      visible at all (a floating panel has no safe посадка over a <768px
 *      content column; hiding is the canon honest-absence move);
 *   3. crumb spans that CLIP (scrollWidth > clientWidth) carry a working
 *      ellipsis — a clipped inline-flex container is the mid-word
 *      «Документацияvesma-m» defect (text-overflow applies to block
 *      containers only).
 * A full-page PNG per (page, width) lands in OUT for the visual verdict.
 * Exit 0 only when every check holds on every page.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4221;
const BASE = `http://localhost:${PORT}/app/`;
const OUT =
  process.argv[2] || "/var/home/abyss/.local/opt/design-shots/shell-tails";
const PAGES = [
  ["board", "tasks"],
  ["docs", "docs"],
  ["docs-mesh", "docs/mnemos-mesh"],
  ["docs-article", "docs/mnemos-mesh/user/getting-started"],
  ["kora", "kora"],
  ["agents", "agents"],
];
const WIDTHS = [375, 768];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** One page pass: measurements + screenshot. Fresh context = fresh session
 * storage, so the vesma intro bubble fires exactly as a first visit. */
async function pass(browser, name, route, width) {
  const context = await browser.newContext({
    viewport: { width, height: width === 375 ? 812 : 1024 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.addInitScript(
    `try { localStorage.setItem("vesmaro.theme", "dark"); } catch {}
     try { localStorage.setItem("vesmaro.lang", "ru"); } catch {}
     ${
       width === 768
         ? // the stored FULL-panel choice: the narrowest legit 768 column
           `try { localStorage.setItem("vesmaro.sidebarCollapsed", "0"); } catch {}`
         : ""
     }`,
  );
  await page.goto(`${BASE}${route}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await sleep(900); // the intro bubble is up (INTRO_HOLD 10s covers the pass)
  const m = await page.evaluate(() => {
    const vw = window.innerWidth;
    const doc = document.documentElement;
    // Inside an ancestor that scrolls/clips horizontally the content never
    // widens the document (the board swimlane row, docs TOC) — exempt.
    const insideScroller = (el) => {
      for (
        let a = el.parentElement, i = 0;
        a && i < 24;
        a = a.parentElement, i++
      ) {
        const o = getComputedStyle(a).overflowX;
        if (o === "auto" || o === "scroll" || o === "clip" || o === "hidden")
          return true;
      }
      return false;
    };
    const bad = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0) continue;
      if (r.right <= vw + 0.5 && r.left >= -0.5) continue;
      const cls = (el.className?.baseVal !== undefined
        ? el.className.baseVal
        : el.className ?? ""
      ).toString();
      if (cls.split(/\s+/).includes("sr-only")) continue; // offscreen marker
      if (r.width <= 2) continue; // 1px visually-hidden markers (portal gaps)
      if (insideScroller(el)) continue;
      bad.push({
        tag: el.tagName.toLowerCase(),
        cls: cls.slice(0, 80),
        text: (el.textContent ?? "").trim().slice(0, 30),
        left: Math.round(r.left * 10) / 10,
        right: Math.round(r.right * 10) / 10,
      });
    }
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top * 10) / 10,
        bottom: Math.round(r.bottom * 10) / 10,
        left: Math.round(r.left * 10) / 10,
        right: Math.round(r.right * 10) / 10,
      };
    };
    const overlaps = (a, b) =>
      a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const cloud = document.querySelector(".vesma-cloud");
    // Real VISUAL visibility: the narrow-screen hiding is CSS (media display
    // none), the `hidden` attribute alone does not see it.
    const cloudVisible =
      !!cloud &&
      !cloud.hidden &&
      getComputedStyle(cloud).display !== "none" &&
      cloud.getClientRects().length > 0;
    const cloudRect = rect(cloud);
    const crumbs = rect(document.querySelector('[data-living-seam="crumbs"]'));
    const h1 = rect(document.querySelector("h1"));
    // Crumb clipping: any element inside the trail that clips WITHOUT a
    // working ellipsis is the mid-word defect (truncate on an inline-flex
    // container never paints it). All levels: carriers + the blockified
    // inner truncate spans.
    const crumbEls = [
      ...document.querySelectorAll("nav ol li a, nav ol li span"),
    ];
    const crumbsClip = crumbEls
      .filter((el) => el.scrollWidth > el.clientWidth + 0.5)
      .map((el) => ({
        text: (el.textContent ?? "").trim().slice(0, 30),
        scrollW: el.scrollWidth,
        clientW: Math.round(el.clientWidth * 10) / 10,
        display: getComputedStyle(el).display,
        textOverflow: getComputedStyle(el).textOverflow,
        ellipsisOk:
          getComputedStyle(el).textOverflow === "ellipsis" &&
          getComputedStyle(el).display !== "inline-flex" &&
          getComputedStyle(el).display !== "flex",
      }));
    return {
      vw,
      scrollW: doc.scrollWidth,
      clientW: doc.clientWidth,
      overflow: doc.scrollWidth > doc.clientWidth,
      bad: bad.slice(0, 20),
      vesma: {
        mounted: !!document.querySelector("[data-vesma-slot]"),
        cloudVisible,
        cloudRect,
        crumbsRect: crumbs,
        h1Rect: h1,
        overCrumbs: overlaps(cloudRect, crumbs),
        overH1: overlaps(cloudRect, h1),
      },
      crumbsClip,
    };
  });
  const buf = await page.screenshot({ fullPage: true });
  const file = join(OUT, `shell-${name}-${width}.png`);
  writeFileSync(file, buf);
  await context.close();
  return { page: name, width, shot: file, ...m };
}

async function main() {
  if (!existsSync(join(VIEWER_DIR, "dist-smoke", "index.html"))) {
    console.error("[probe] dist-smoke/ missing — build it first (VITE_ADAPTER=mock)");
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const playwright = require("playwright");
  const preview = await startPreview();
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: chromiumPath(),
    args: ["--disable-gpu", "--font-render-hinting=none"],
  });
  const results = [];
  try {
    for (const width of WIDTHS) {
      for (const [name, route] of PAGES) {
        results.push(await pass(browser, name, route, width));
      }
    }
  } finally {
    await browser.close();
    preview.kill();
  }
  const problems = [];
  for (const r of results) {
    if (r.overflow || r.bad.length)
      problems.push(
        `${r.page}@${r.width}: scrollW=${r.scrollW} clientW=${r.clientW} bad=${r.bad.length}`,
      );
    if (r.vesma.overCrumbs) problems.push(`${r.page}@${r.width}: vesma-cloud OVER CRUMBS`);
    if (r.vesma.overH1) problems.push(`${r.page}@${r.width}: vesma-cloud OVER H1`);
    if (r.width < 768 && r.vesma.cloudVisible)
      problems.push(`${r.page}@${r.width}: vesma-cloud VISIBLE on narrow (must hide)`);
    for (const c of r.crumbsClip)
      if (!c.ellipsisOk)
        problems.push(
          `${r.page}@${r.width}: crumb «${c.text}» clips w/o ellipsis (display=${c.display})`,
        );
  }
  const summary = results.map(
    ({ page, width, scrollW, clientW, vesma, crumbsClip, bad }) => ({
      page,
      width,
      scrollW,
      clientW,
      cloudVisible: vesma.cloudVisible,
      overCrumbs: vesma.overCrumbs,
      overH1: vesma.overH1,
      crumbsClip,
      bad,
    }),
  );
  console.log(
    JSON.stringify({ problems, summary, shots: results.map((r) => r.shot) }, null, 1),
  );
  if (problems.length) {
    console.error(`[probe] RED: ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.error("[probe] GREEN: no overflow, vesma-cloud safe, crumbs ellipsize cleanly");
}

main().catch((e) => {
  console.error("[probe] crashed:", e?.message ?? e);
  process.exit(1);
});
