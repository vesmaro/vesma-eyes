#!/usr/bin/env node
/**
 * P1 «карточка = вещество» acceptance shots: the substance tab of the task
 * card (`/app/tasks/TB-1?tab=substance`) against the pinned wire contract of
 * GET /api/tasks/{id}/substance. The stand serves the PRODUCTION build
 * (dist/, board adapter) and intercepts the board wire with fixtures that
 * MIRROR the server test corpus (tests/test_task_substance.py — the same
 * shapes the DOM suite pins in TaskSubstance.test.tsx): plan as written,
 * chronological reports with a live final and a muted superseded one, agent
 * display + slug badge (slug_ok=false stays raw), executors (active +
 * history), one live session fact, one linked memory id, and the review
 * contract null — the ever-present honest line. No live board involved.
 *
 * Frames -> viewer/scripts/shots/substance-*.png
 *   ru 1440 full · ru 1440 both-empty · ru 1440 pending (skeleton) ·
 *   ru 1440 substance-404 · ru 375 full · en 1440 full.
 * Exit: 0 = every assert green; 1 = at least one FAIL (collected, not
 * fail-fast — one run reports the full picture).
 *
 * Usage (from viewer/):  node scripts/task-substance-shots.mjs
 *   — requires a fresh `npm run build` (dist/); the script checks the mtime.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

import {
  TASK_ID,
  board,
  boardRow,
  reports,
  fullSubstance,
  emptySubstance,
} from "./task-substance-fixtures.mjs";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4211;
const BASE = `http://localhost:${PORT}/app/`;
const DIST = join(VIEWER_DIR, "dist");
const OUT = join(VIEWER_DIR, "scripts", "shots");
// Lesson from earlier waves: when the registry resolution misses, point the
// launch at the provisioned binary directly (chromium-1243 layout).
const CHROMIUM_FALLBACK =
  "/var/home/abyss/.distrobox/ubuntu/home/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- fixtures
 * The wire corpus lives in task-substance-fixtures.mjs (shared with the
 * overflow probe). */

/* ------------------------------------------------------------------ stand */

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

async function launchBrowser(playwright) {
  try {
    return await playwright.chromium.launch({
      headless: true,
      args: ["--disable-gpu", "--disable-lcd-text", "--font-render-hinting=none", "--force-color-profile=srgb"],
    });
  } catch {
    return await playwright.chromium.launch({
      headless: true,
      executablePath: CHROMIUM_FALLBACK,
      args: ["--disable-gpu", "--disable-lcd-text", "--font-render-hinting=none", "--force-color-profile=srgb"],
    });
  }
}

async function main() {
  if (!existsSync(DIST)) {
    console.error("[shots] dist/ missing — run `npm run build` first");
    process.exit(1);
  }
  const distAge = statSync(join(DIST, "index.html")).mtimeMs;
  const newestSrc = statSync(join(VIEWER_DIR, "src")).mtimeMs;
  if (distAge < newestSrc) {
    console.error("[shots] dist/ is STALE (src newer) — run `npm run build` first");
    process.exit(1);
  }

  const playwright = require("playwright");
  mkdirSync(OUT, { recursive: true });
  const preview = await startPreview();
  const browser = await launchBrowser(playwright);

  const results = [];
  const check = (name, pass, detail = "") => {
    results.push(pass);
    console.log(`[check] ${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
  };

  /**
   * Route table. Registration order matters — playwright matches the LAST
   * registered handler first, so the catch-all goes down FIRST and the
   * specific board reads override it. The auth probe answers 204 (the only
   * code that ever reads as a live session) so the sign-in overlay never
   * covers the frames; the read-only page renders for an authed owner.
   */
  const wire = (substanceMode) => async (page) => {
    await page.route("**/api/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/auth/ui-token", (route) =>
      route.fulfill({ status: 204 }),
    );
    await page.route("**/api/board*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(board),
      }),
    );
    await page.route(`**/api/tasks/${TASK_ID}/reports*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(reports),
      }),
    );
    await page.route(`**/api/tasks/${TASK_ID}/substance`, async (route) => {
      if (substanceMode === "404") {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ detail: "no such task" }),
        });
      }
      if (substanceMode === "empty") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(emptySubstance()),
        });
      }
      if (substanceMode === "delayed") {
        await sleep(2500);
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fullSubstance()),
      });
    });
  };

  const openCard = async ({ width, height, lang, substanceMode }) => {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.addInitScript(
      `
      try { localStorage.setItem("vesmaro.theme", "dark"); } catch {}
      try { localStorage.setItem("vesmaro.lang", ${JSON.stringify(lang)}); } catch {}
      `,
    );
    await wire(substanceMode)(page);
    await page.goto(`${BASE}tasks/${TASK_ID}?tab=substance`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    try {
      await page.getByRole("button", { name: /Got it|Понятно/ }).click({ timeout: 1500 });
      await sleep(300);
    } catch {
      /* no bubble */
    }
    return { context, page };
  };

  /**
   * Horizontal-overflow gate, scoped to the slice surface: nothing INSIDE
   * the task card (TaskDetailShell section) may cross the viewport edge.
   * The document-level number is informational only — the pre-existing
   * TopBar right cluster (shrink-0 icon buttons; layout/TopBar.tsx, NOT in
   * this branch's diff) measures ~2px over at 375 on every page; a shell
   * restructure is a separate finding, not this tab's acceptance.
   */
  const noHorizontalScroll = async (page, shot) => {
    const m = await page.evaluate(() => {
      const card = document.querySelector('section[aria-labelledby="task-title"]');
      const inner = window.innerWidth;
      let cardOverflows = 0;
      if (card) {
        for (const el of card.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > inner + 0.5) cardOverflows += 1;
        }
      }
      return {
        inner,
        docScroll: document.documentElement.scrollWidth,
        cardScroll: card ? card.scrollWidth : -1,
        cardClient: card ? card.clientWidth : -1,
        cardOverflows,
      };
    });
    check(
      `${shot}: no horizontal overflow inside the task card`,
      m.cardOverflows === 0 && m.cardScroll <= m.cardClient,
      `card scrollWidth ${m.cardScroll} vs clientWidth ${m.cardClient}, offenders ${m.cardOverflows}`,
    );
    console.log(
      `[info] ${shot}: document scrollWidth ${m.docScroll} vs innerWidth ${m.inner} ` +
        `(TopBar shell cluster, pre-existing — see report)`,
    );
  };

  try {
    /* 1 — ru 1440, full payload (pending -> loaded in ONE context so the
     * skeleton-vs-content height comparison is honest). */
    {
      const shot = "substance-ru-1440-full.png";
      const { context, page } = await openCard({
        width: 1440, height: 1000, lang: "ru", substanceMode: "delayed",
      });
      // Pending: the honest status skeleton (route holds the answer ~2.5 s).
      await page.waitForSelector('[role="status"][aria-label="Загружаем вещество карточки"]', {
        timeout: 5000,
      });
      await sleep(400);
      // The jump that matters is the header/tabs SHIFT, not the pane's
      // growth: the skeleton only holds the pane open, the content below
      // legitimately grows. Measure the tab row's position in both states.
      const metrics = async () =>
        page.evaluate(() => {
          const tabs = document.querySelector('a[aria-current="page"]')?.closest("nav");
          const panes = document.querySelectorAll("div.min-w-0");
          const pane = panes[panes.length - 1];
          return {
            tabsTop: tabs ? Math.round(tabs.getBoundingClientRect().top) : -1,
            paneHeight: pane ? Math.round(pane.getBoundingClientRect().height) : -1,
          };
        });
      const pending = await metrics();
      await page.screenshot({ fullPage: true, path: join(OUT, "substance-ru-1440-pending.png") });
      console.log(`[shots] ${join(OUT, "substance-ru-1440-pending.png")}`);

      const reviewLine = page.locator('p[data-substance-review="none"]');
      await reviewLine.waitFor({ state: "visible", timeout: 8000 });
      await sleep(400);
      const loaded = await metrics();
      check(
        "ru full: the tab row holds its position pending -> loaded (no jump)",
        pending.tabsTop === loaded.tabsTop && pending.tabsTop > 0,
        `tabs top ${pending.tabsTop}px -> ${loaded.tabsTop}px`,
      );
      console.log(
        `[shots] pane height pending ${pending.paneHeight}px -> loaded ${loaded.paneHeight}px ` +
          `(skeleton holds the pane; content grows below the fold line)`,
      );

      const body = await page.evaluate(() => document.body.textContent ?? "");
      check(
        "ru full: all six sections render",
        body.includes("План") && body.includes("Отчёты") && body.includes("Исполнители") &&
          body.includes("Сессии и память") && body.includes("Ревью"),
      );
      check(
        "ru full: reports meta counts the wire truth",
        body.includes("всего 3 · актуальных 2"),
      );
      check(
        "ru full: live-final mark and superseded flag both visible",
        body.includes("итог") && body.includes("заменён"),
      );
      check(
        "ru full: slug badge renders next to the display name",
        (await page.getByText("gcw-tech-lead", { exact: true }).count()) >= 1,
      );
      check(
        "ru full: review contract-null line visible",
        (await reviewLine.textContent())?.includes("Источника ревью в базе нет") === true,
      );
      await noHorizontalScroll(page, shot);
      await page.screenshot({ fullPage: true, path: join(OUT, shot) });
      console.log(`[shots] ${join(OUT, shot)}`);
      await context.close();
    }

    /* 2 — ru 1440, both-empty (sessions 0 + memories 0: the stated fact). */
    {
      const shot = "substance-ru-1440-empty.png";
      const { context, page } = await openCard({
        width: 1440, height: 1000, lang: "ru", substanceMode: "empty",
      });
      const reviewLine = page.locator('p[data-substance-review="none"]');
      await reviewLine.waitFor({ state: "visible", timeout: 8000 });
      await sleep(400);
      const body = await page.evaluate(() => document.body.textContent ?? "");
      check(
        "ru empty: the both-empty fact line renders",
        body.includes("Нет данных от агентов"),
      );
      check(
        "ru empty: executors honest empty",
        body.includes("Назначений не было"),
      );
      check(
        "ru empty: review line survives the empty state",
        (await reviewLine.textContent())?.includes("Источника ревью в базе нет") === true,
      );
      await noHorizontalScroll(page, shot);
      await page.screenshot({ fullPage: true, path: join(OUT, shot) });
      console.log(`[shots] ${join(OUT, shot)}`);
      await context.close();
    }

    /* 3 — ru 375, full payload (mobile full answer). */
    {
      const shot = "substance-ru-375-full.png";
      const { context, page } = await openCard({
        width: 375, height: 900, lang: "ru", substanceMode: "full",
      });
      await page.locator('p[data-substance-review="none"]').waitFor({ state: "visible", timeout: 8000 });
      await sleep(400);
      const body = await page.evaluate(() => document.body.textContent ?? "");
      check(
        "ru 375: the full answer renders",
        body.includes("Починить цикл редиректа на логине") && body.includes("Ревью"),
      );
      await noHorizontalScroll(page, shot);
      await page.screenshot({ fullPage: true, path: join(OUT, shot) });
      console.log(`[shots] ${join(OUT, shot)}`);
      await context.close();
    }

    /* 4 — en 1440, full payload (i18n contract in the frame). */
    {
      const shot = "substance-en-1440-full.png";
      const { context, page } = await openCard({
        width: 1440, height: 1000, lang: "en", substanceMode: "full",
      });
      const reviewLine = page.locator('p[data-substance-review="none"]');
      await reviewLine.waitFor({ state: "visible", timeout: 8000 });
      await sleep(400);
      const body = await page.evaluate(() => document.body.textContent ?? "");
      check(
        "en full: section labels speak English",
        body.includes("Plan") && body.includes("Reports") && body.includes("Executors") &&
          body.includes("Sessions and memory") && body.includes("Review"),
      );
      check(
        "en full: review line is the pinned English sentence",
        (await reviewLine.textContent())?.trim() === "No review source exists in the database.",
      );
      await noHorizontalScroll(page, shot);
      await page.screenshot({ fullPage: true, path: join(OUT, shot) });
      console.log(`[shots] ${join(OUT, shot)}`);
      await context.close();
    }

    /* 5 — ru 1440, substance 404 (the failure class the contract pins). */
    {
      const shot = "substance-ru-1440-404.png";
      const { context, page } = await openCard({
        width: 1440, height: 1000, lang: "ru", substanceMode: "404",
      });
      const alert = page.locator('[role="alert"]');
      await alert.waitFor({ state: "visible", timeout: 8000 });
      await sleep(300);
      check(
        "ru 404: the honest not-found state renders",
        (await alert.textContent())?.includes("Задача не найдена — вещество недоступно") === true,
      );
      await noHorizontalScroll(page, shot);
      await page.screenshot({ fullPage: true, path: join(OUT, shot) });
      console.log(`[shots] ${join(OUT, shot)}`);
      await context.close();
    }
  } finally {
    await browser.close();
    preview.kill();
  }

  const failed = results.filter((r) => !r).length;
  console.log(`[shots] ${results.length - failed}/${results.length} checks green`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("[shots] crashed:", error?.message ?? error);
  process.exit(1);
});
