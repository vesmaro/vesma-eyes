#!/usr/bin/env node
/**
 * U7 mobile touch-target audit (SPEC-2026-10-07 «Глубокая проработка» п.4:
 * <768 → тач ≥48px). Renders the built viewer (dist-smoke, mock adapter) at
 * 375×812 and measures the bounding box of EVERY interactive element on the
 * wave's key pages; anything whose smaller on-screen dimension is <48px and
 * that is actually visible/reachable is reported as a violation.
 *
 * Usage (from viewer/): node scripts/u7-touch-audit.mjs [--rebuild]
 * Exit 1 when violations remain (the audit is the mobile slice's gate).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4189;
const BASE = `http://localhost:${PORT}/app/`;
const REBUILD = process.argv.includes("--rebuild");

const PAGES = [
  ["overview", ""],
  ["tasks", "tasks"],
  ["task-list", "tasks/list"],
  ["memory", "memory"],
  ["kora", "kora"],
  ["agents", "agents/hosts"],
  ["harnesses-connect", "agents/harnesses?connect=1"],
  ["system", "system/settings"],
  ["docs", "docs/vesma-eyes"],
  ["wizard", "tasks/list?wizard=1"],
  ["auth", "auth"],
];

const AUDIT_FN = () => {
  const SELECTOR = [
    "button",
    "a[href]",
    "input",
    "select",
    "textarea",
    "summary",
    '[role="button"]',
    '[role="tab"]',
    '[role="option"]',
    '[role="menuitem"]',
    '[role="switch"]',
    '[role="checkbox"]',
    '[onclick]',
  ].join(",");
  // label[for] is deliberately NOT a selector here: a label is not an
  // independent target — its action (focusing the control) is carried by the
  // labelled input/select itself (WCAG 2.5.8 «Equivalent» exemption), and
  // that control IS in the list and IS audited.

  const out = [];
  for (const el of document.querySelectorAll(SELECTOR)) {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const r = el.getBoundingClientRect();
    // A ≤2px clipped box is an sr-only element (skip links) — keyboard-only
    // affordances, not touch targets.
    if (r.width < 2 || r.height < 2) continue;
    // Only count targets inside (or overlapping) the viewport — offscreen
    // drawer content is measured when its page state opens it.
    if (r.bottom < 0 || r.top > innerHeight) continue;
    if (r.right < 0 || r.left > innerWidth) continue;
    if (el.closest("[inert]")) continue;
    if (el.disabled) continue;
    // WCAG 2.5.8 «Inline» exemption: a plain INLINE link inside prose
    // (paragraph/list/cell/heading — the markdown article body) cannot
    // inflate to 48px without breaking the reading flow; the surrounding
    // text and line height carry the target. UI chrome links (chips, rows,
    // cards) render inline-flex/flex and stay bound by the 48px rule.
    if (
      el.tagName === "A" &&
      cs.display === "inline" &&
      el.closest("p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote")
    )
      continue;
    // The smallest screen dimension is the binding touch constraint.
    const min = Math.min(r.width, r.height);
    if (min < 47.5) {
      out.push({
        tag: el.tagName.toLowerCase(),
        min: Math.round(min * 10) / 10,
        w: Math.round(r.width),
        h: Math.round(r.height),
        label:
          (el.getAttribute("aria-label") ||
            el.textContent ||
            el.getAttribute("placeholder") ||
            "")
            .trim()
            .slice(0, 60),
        cls: String(el.className).slice(0, 90),
      });
    }
  }
  return out;
};

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
  const distSmoke = join(VIEWER_DIR, "dist-smoke", "index.html");
  if (REBUILD || !existsSync(distSmoke)) {
    console.error("[touch] dist-smoke missing — build it first:");
    console.error(
      "  VITE_ADAPTER=mock VITE_SMOKE_ALLOW_MOCK=1 npx vite build --outDir dist-smoke",
    );
    process.exit(2);
  }
  const playwright = require("playwright");
  const preview = await startPreview();
  let violations = 0;
  try {
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ["--disable-gpu"],
      ...(chromiumPath() ? { executablePath: chromiumPath() } : {}),
    });
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    for (const [name, route] of PAGES) {
      await page.goto(`${BASE}${route}`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(1800);
      const found = await page.evaluate(AUDIT_FN);
      if (found.length) {
        violations += found.length;
        console.log(`\n== ${name} (${route || "/"}) — ${found.length} violation(s)`);
        for (const v of found) {
          console.log(
            `  [${v.tag} ${v.min}px ${v.w}x${v.h}] "${v.label}" :: ${v.cls}`,
          );
        }
      } else {
        console.log(`== ${name} (${route || "/"}) — OK`);
      }
    }
    // The mobile drawer open state (the curtain covers the page).
    await page.goto(`${BASE}tasks`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(1200);
    const opener = page.locator("header button.md\\:hidden").first();
    if (await opener.count()) {
      await opener.click();
      await sleep(900);
      const found = await page.evaluate(AUDIT_FN);
      if (found.length) {
        violations += found.length;
        console.log(`\n== drawer-open — ${found.length} violation(s)`);
        for (const v of found) {
          console.log(
            `  [${v.tag} ${v.min}px ${v.w}x${v.h}] "${v.label}" :: ${v.cls}`,
          );
        }
      } else {
        console.log("== drawer-open — OK");
      }
    }
    await browser.close();
  } finally {
    preview.kill();
  }
  console.log(
    `\n[touch] ${violations === 0 ? "ALL GREEN — every visible target ≥48px" : `${violations} violation(s) below 48px`}`,
  );
  process.exit(violations === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`[touch] ${error?.message ?? error}`);
  process.exit(1);
});
