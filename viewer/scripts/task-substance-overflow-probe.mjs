#!/usr/bin/env node
/** Diagnostic: find the elements that overflow the 375px viewport on the
 * substance tab. Not an acceptance script — a one-shot probe. */
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4212;
const BASE = `http://localhost:${PORT}/app/`;
const CHROMIUM_FALLBACK =
  "/var/home/abyss/.distrobox/ubuntu/home/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

import { boardRow, fullSubstance } from "./task-substance-fixtures.mjs";

async function startPreview() {
  const child = spawn(
    join(VIEWER_DIR, "node_modules", ".bin", "vite"),
    ["preview", "--port", String(PORT), "--strictPort", "--outDir", "dist"],
    { cwd: VIEWER_DIR, stdio: ["ignore", "ignore", "inherit"] },
  );
  const deadline = Date.now() + 30_000;
  for (;;) {
    const up = await new Promise((res) => {
      const req = require("node:http").get(
        { hostname: "localhost", port: PORT, path: "/app/" },
        (r) => { r.resume(); res(r.statusCode !== undefined && r.statusCode < 500); },
      );
      req.on("error", () => res(false));
      req.setTimeout(1200, () => { req.destroy(); res(false); });
    });
    if (up) return child;
    if (Date.now() > deadline) { child.kill(); throw new Error("preview never came up"); }
    await sleep(400);
  }
}

async function main() {
  if (!existsSync(join(VIEWER_DIR, "dist", "index.html"))) {
    console.error("[probe] dist/ missing");
    process.exit(1);
  }
  const playwright = require("playwright");
  const preview = await startPreview();
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: existsSync(CHROMIUM_FALLBACK) ? CHROMIUM_FALLBACK : undefined,
    args: ["--disable-gpu"],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.addInitScript(`
      try { localStorage.setItem("vesmaro.theme", "dark"); } catch {}
      try { localStorage.setItem("vesmaro.lang", "ru"); } catch {}
    `);
    await page.route("**/api/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.route("**/api/auth/ui-token", (route) => route.fulfill({ status: 204 }));
    await page.route("**/api/board*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        columns: ["backlog", "validating", "open", "in-progress", "blocked", "resolved", "done"],
        tasks: [boardRow], counts: { "in-progress": 1 },
      })}));
    await page.route("**/api/tasks/TB-1/reports*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.route("**/api/tasks/TB-1/substance", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fullSubstance()) }));
    await page.goto(`${BASE}tasks/TB-1?tab=substance`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.locator('p[data-substance-review="none"]').waitFor({ state: "visible", timeout: 8000 });
    await sleep(300);
    const report = await page.evaluate(() => {
      const vw = window.innerWidth;
      const bad = [];
      for (const el of document.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 0.5 && r.width > 0) {
          bad.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className && el.className.baseVal !== undefined
              ? el.className.baseVal : el.className ?? "").toString().slice(0, 90),
            text: (el.textContent ?? "").trim().slice(0, 40),
            right: Math.round(r.right * 10) / 10,
            width: Math.round(r.width * 10) / 10,
          });
        }
      }
      return { vw, scroll: document.documentElement.scrollWidth, bad: bad.slice(0, 40) };
    });
    console.log(JSON.stringify(report, null, 1));
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((e) => { console.error("[probe] crashed:", e?.message ?? e); process.exit(1); });
