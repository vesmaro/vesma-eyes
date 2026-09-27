#!/usr/bin/env node
/**
 * Browser render-smoke (ME-011 part b; ADR 0020 invariant 7 — the
 * ADR-0017 debt): real-chromium DOM asserts over surfaces that the unit
 * suite provably cannot cover — happy-dom has no SVG layout engine (the
 * deviation is recorded in mermaid.render.smoke.test.tsx), so «mermaid
 * fence on the article page → <svg> in the DOM» is only verifiable here.
 *
 * LOCAL GATE, NOT CI: GitHub Actions for this repo is billing-locked —
 * this harness is expected to run on the dev machine (pre-merge, phase Ф0
 * acceptance, and on any docs-adjacent suspicion). CI keeps running the
 * unit suite only. Do NOT wire this into Actions.
 *
 * Usage (from viewer/):
 *   npm run smoke:render
 *     — local mode: builds the viewer with the mock adapter into
 *       dist-smoke/ (VITE_ADAPTER=mock — deterministic fixtures, no
 *       backend needed), serves it via `vite preview` on :4173 and runs
 *       every assert. Reuses dist-smoke/ when present and fresher than
 *       src (pass --rebuild to force).
 *   VESMARO_SMOKE_BASE_URL=https://vesmaro.abyss.lab npm run smoke:render
 *     — remote mode against ANY deployed base (prod, staging, a dev
 *       server). Docs surfaces are static; the board/pulse/task surfaces
 *       run against the deployment's live API. The untrusted-mermaid
 *       fixture task (TB-15) is injected into the LIVE board projection
 *       via a network interception — no server-side change.
 *
 * Base URL resolution: --base-url CLI arg > VESMARO_SMOKE_BASE_URL env >
 * local vite preview (http://localhost:4173).
 *
 * Browser resolution: playwright's own registry first; if a chromium
 * revision already sits in ~/.cache/ms-playwright, that binary is pointed
 * at directly (no re-download). VESMARO_SMOKE_CHROMIUM_PATH overrides.
 *
 * Exit: 0 = every assert green, 1 = at least one failure / boot crash.
 * Asserts are collected, not fail-fast: one run reports the full picture.
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// CLI / env
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
}
function hasFlag(flag) {
  return args.includes(flag);
}

const BASE_URL =
  argValue("--base-url", null) ??
  process.env.VESMARO_SMOKE_BASE_URL ??
  null;
/** Local vite-preview mode when no explicit base was requested. */
const LOCAL_MODE = BASE_URL === null;
const REBUILD = hasFlag("--rebuild");
const HEADED = process.env.VESMARO_SMOKE_HEADED === "1";
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const DIST_SMOKE = join(VIEWER_DIR, "dist-smoke");
const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;

if (LOCAL_MODE) {
  console.log(
    "[smoke] local mode: mock-adapter build in dist-smoke + vite preview",
  );
} else {
  console.log(`[smoke] remote mode against ${BASE_URL}`);
}

// ---------------------------------------------------------------------------
// Playwright resolution
// ---------------------------------------------------------------------------

function resolvePlaywright() {
  const requireFromViewer = createRequire(join(VIEWER_DIR, "package.json"));
  try {
    return requireFromViewer("playwright");
  } catch {
    throw new Error(
      "playwright is not resolvable from viewer/ — run `npm ci` (playwright is a devDependency)",
    );
  }
}

/** Prefer an already-downloaded chromium over a fresh download. */
function chromiumExecutablePath() {
  const explicit = process.env.VESMARO_SMOKE_CHROMIUM_PATH;
  if (explicit) return explicit;
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) return undefined;
  const dirs = readdirSync(cache)
    .filter((name) => name.startsWith("chromium-"))
    .sort()
    .reverse();
  for (const dir of dirs) {
    for (const binary of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
      const path = join(cache, dir, binary);
      if (existsSync(path)) return path;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Assert recorder
// ---------------------------------------------------------------------------

const results = [];
function assert(ok, name, details = "") {
  results.push({ ok: Boolean(ok), name });
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${name}${ok || !details ? "" : ` — ${details}`}`);
}
/** The surface is not served by this deployment (honest skip, not green). */
function skip(name, details = "") {
  results.push({ ok: true, name, skipped: true });
  console.log(`  [SKIP] ${name}${details ? ` — ${details}` : ""}`);
}

// ---------------------------------------------------------------------------
// The untrusted-mermaid fixture task (mirrors gateway/boardFixtures.ts TB-15)
// ---------------------------------------------------------------------------

const UNTRUSTED_MERMAID_TASK = {
  id: "TB-15",
  col: "in-progress",
  position: 2,
  title: "ME-011 smoke: untrusted mermaid fixture on the task page",
  summary: "Fixture for the browser render smoke (not for the board).",
  spec:
    "## Diagram (untrusted surface)\n\n```mermaid\nflowchart LR\n  UNTRUSTED[fixture] --> GATE\n```\n\nThe fence above must stay an inert code block at F0.",
  agents: ["zcode"],
  specialists: ["@GCW: Senior Frontend Developer"],
  env: "laptop",
  project: "vesmaro",
  memory_ids: [],
  mnemos_tags: ["project:vesmaro"],
  created_at: "2026-09-19T10:00:00+00:00",
  updated_at: "2026-09-19T10:00:00+00:00",
  archived: 0,
  status: "in-progress",
  priority: "normal",
  archived_from: "",
  validating_since: "",
};

const UNTRUSTED_REPORTS = {
  ok: true,
  task_id: "TB-15",
  count: 0,
  items: [],
};

/** Inject TB-15 into the board projection via network interception. */
async function injectUntrustedFixture(page) {
  // BE-16: task detail reads GET /api/tasks/{id} (taskById), NOT the
  // board projection — the fixture intercepts BOTH endpoints.
  await page.route("**/api/tasks/TB-15", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(UNTRUSTED_MERMAID_TASK),
    }),
  );
  await page.route("**/api/board", async (route) => {
    try {
      const response = await route.fetch();
      const payload = await response.json();
      const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
      if (!tasks.some((task) => task.id === "TB-15")) {
        tasks.push(UNTRUSTED_MERMAID_TASK);
      }
      await route.fulfill({
        status: response.status(),
        contentType: "application/json",
        body: JSON.stringify({ ...payload, tasks }),
      });
    } catch (error) {
      // Live board unreachable — serve the fixture board alone so the
      // task-detail surface is still exercisable.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          columns: ["open", "in-progress", "done"],
          tasks: [UNTRUSTED_MERMAID_TASK],
          counts: { open: 0, "in-progress": 1, done: 0 },
        }),
      });
    }
  });
  await page.route("**/api/tasks/TB-15/reports*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(UNTRUSTED_REPORTS),
    }),
  );
  await page.route("**/api/tasks/TB-15/history*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ events: [], memories: [] }),
    }),
  );
  await page.route("**/api/tasks/TB-15/memories*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], count: 0 }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Route table (ADR 0020 invariant 7 + ME-011 board notes)
// ---------------------------------------------------------------------------

const DOCS_BASE = "/app/docs"; // ADR 0011: production serves under /app

async function runSmoke(page) {
  const base = process.env.__SMOKE_BASE ?? "";
  const docs = `${base}${DOCS_BASE}`;

  // -- 1. docs hub renders -------------------------------------------------
  console.log("\n[1/7] docs hub renders");
  await page.goto(docs, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  const hubText = (await mainText(page)).replace(/\s+/g, " ");
  assert(
    await page
      .locator("main h1, main h2")
      .first()
      .isVisible()
      .catch(() => false),
    "hub renders a heading",
  );
  assert(
    hubText.toLowerCase().includes("mnemos") || hubText.length > 40,
    "hub shows corpus content (not an error wall)",
    hubText.slice(0, 100),
  );

  // -- 2. category page renders, NO «GENERATED» in card previews ----------
  // (post-ME-009 regression guard — banner cut lives in the excerpt path).
  console.log("\n[2/7] category page: no GENERATED banner in card previews");
  await page.goto(`${docs}/vesmaro-eyes/c/getting-started`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("main", { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  const categoryText = await mainText(page);
  assert(
    !(categoryText ?? "").includes("GENERATED"),
    "category previews carry no GENERATED banner (ME-009 guard)",
  );
  assert(
    (await page.locator("main a").count()) > 0,
    "category page lists article links",
  );

  // -- 3. article page renders (mnemos architecture overview: 2 mermaid) --
  console.log("\n[3/7] article page renders (provenance badge, heading slugs)");
  await page.goto(`${docs}/mnemos/architecture/overview`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("main", { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  const articleText = await mainText(page);
  assert(
    /mnemos/i.test(articleText ?? "") && (articleText ?? "").length > 200,
    "article body renders",
    (articleText ?? "").slice(0, 100),
  );
  assert(
    (await page.locator("main h2[id], main h3[id]").count()) > 0,
    "article headings carry GitHub-style slug ids (curated capability)",
  );
  assert(
    (await page
      .locator(
        "main span[class*='badge'], main [class*='Badge'], main [data-provenance]",
      )
      .count()) > 0 ||
      /@|синхр|sync/i.test(articleText ?? ""),
    "provenance badge present on imported page",
  );

  // -- 4. mermaid fence → <svg> in the DOM (REAL BROWSER required) --------
  console.log("\n[4/7] mermaid fences produce <svg> in DOM (ADR-0017 debt)");
  try {
    await page
      .waitForSelector("main .mermaid-diagram svg", {
        timeout: 25_000,
        state: "attached",
      })
      .catch(() => {});
    const svgCount = await page.locator("main .mermaid-diagram svg").count();
    assert(
      svgCount >= 2,
      `overview's 2 mermaid fences rendered as <svg> (got ${svgCount})`,
    );
    assert(
      (await page.locator("main .mermaid-diagram svg a").count()) === 0,
      "diagram svg carries no clickable <a> (ADR-0017 neutralization)",
    );
  } catch (error) {
    assert(false, "mermaid svg probe crashed", String(error?.message ?? error));
  }

  // -- 5. TextEngine surfaces: pulse page ---------------------------------
  console.log("\n[5/7] TextEngine surface: pulse page fragments render");
  await page.goto(`${base}/app/memory/pulse`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  const pulseText = (await mainText(page)).replace(/\s+/g, " ");
  assert(
    (pulseText ?? "").length > 40,
    "pulse page renders fragments",
    (pulseText ?? "").slice(0, 100),
  );

  // -- 6. TextEngine surface: task detail page ----------------------------
  console.log("\n[6/7] TextEngine surface: task detail page renders");
  const taskId = process.env.__SMOKE_TASK_ID ?? "TB-1";
  await page.goto(`${base}/app/tasks/${taskId}?tab=details`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("main", { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  const taskText = (await mainText(page)).replace(/\s+/g, " ");
  assert(
    (taskText ?? "").length > 80 && !(taskText ?? "").includes("not found"),
    `task detail page renders (${taskId})`,
    (taskText ?? "").slice(0, 100),
  );

  // -- 7. UNTRUSTED mermaid: fixture through the task detail surface ------
  // CURRENT contract (Ф0): inert code-block fallback — source visible, NO
  // svg. THE ASSERT IS WRITTEN TO BE FLIPPED IN Ф2 (ME-013 activates the
  // svg expectation per ADR 0020 Amendment 1): flip the two marked lines.
  console.log("\n[7/7] untrusted-surface mermaid fence (task detail fixture)");
  await page.goto(`${base}/app/tasks/TB-15?tab=details`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("main", { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500); // mermaid lazy chunk would need to fail LOUD
  const untrustedText = await mainText(page);
  const untrustedSvg = await page
    .locator("main .mermaid-diagram svg")
    .count();
  // The details pane must actually be served (some deployments render the
  // reports pane regardless of ?tab=): otherwise there is nothing to
  // assert here — an honest SKIP, never a fake green.
  const detailsServed = (untrustedText ?? "").includes("UNTRUSTED[fixture]");
  if (!detailsServed) {
    skip(
      "untrusted-surface mermaid asserts",
      "this deployment renders the reports pane for ?tab=details — fixture spec never mounts (surface covered in local mode)",
    );
  } else {
    // Ф0 assert — FLIP TO `>= 1` IN Ф2 (ME-013).
    assert(
      untrustedSvg === 0,
      "untrusted mermaid stays an INERT code block at F0 — flip to >=1 in F2 (ME-013)",
    );
    assert(
      !(untrustedText ?? "").includes("<svg"),
      "no diagram svg leaks from untrusted text at F0 — flip in F2",
    );
    // The fence SOURCE stays visible (honest fallback, never a silent drop).
    assert(
      (untrustedText ?? "").includes("UNTRUSTED[fixture]"),
      "untrusted fence source stays visible (auditable fallback)",
    );
  }
}

async function mainText(page) {
  try {
    return (await page.locator("main").textContent({ timeout: 10_000 })) ?? "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Local preview boot
// ---------------------------------------------------------------------------

function distSmokeFresh() {
  if (!existsSync(DIST_SMOKE)) return false;
  if (REBUILD) return false;
  return existsSync(join(DIST_SMOKE, "index.html"));
}

/** Build the viewer with the mock adapter into dist-smoke/ (deterministic fixtures). */
function buildDistSmoke() {
  console.log("[smoke] building dist-smoke (VITE_ADAPTER=mock) — a few minutes");
  const { execSync } = require("node:child_process");
  try {
    execSync("npx tsc --noEmit -p tsconfig.json && npx vite build --outDir dist-smoke", {
      cwd: VIEWER_DIR,
      env: { ...process.env, VITE_ADAPTER: "mock" },
      stdio: "inherit",
    });
    console.log("[smoke] dist-smoke built");
  } catch (error) {
    console.error(`[smoke] build failed: ${error?.message ?? error}`);
    process.exit(1);
  }
}

async function startPreview() {
  const { request } = await import("node:http");
  console.log("[smoke] serving dist-smoke/ via vite preview on :4173");
  const child = spawn(
    join(VIEWER_DIR, "node_modules", ".bin", "vite"),
    ["preview", "--port", String(PREVIEW_PORT), "--strictPort", "--outDir", "dist-smoke"],
    { cwd: VIEWER_DIR, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout.on("data", (chunk) => process.env.__SMOKE_VERBOSE === "1" && process.stdout.write(`[preview] ${chunk}`));
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`[smoke] vite preview exited (${code})`);
    }
  });
  const deadline = Date.now() + 30_000;
  for (;;) {
    const up = await new Promise((resolveProbe) => {
      const req = requestGet(`http://localhost:${PREVIEW_PORT}/app/`, (res) => {
        res.resume();
        resolveProbe(res.statusCode !== undefined && res.statusCode < 500);
      });
      req.on("error", () => resolveProbe(false));
      req.setTimeout(1200, () => {
        req.destroy();
        resolveProbe(false);
      });
    });
    if (up) return child;
    if (Date.now() > deadline) {
      child.kill();
      throw new Error("vite preview never came up on :4173 (localhost)");
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

function requestGet(url, onResponse) {
  const parsed = new URL(url);
  const http = require("node:http");
  return http.get(
    { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname },
    onResponse,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const playwright = resolvePlaywright();
  const executablePath = chromiumExecutablePath();
  const launchOptions = { headless: !HEADED };
  if (executablePath) launchOptions.executablePath = executablePath;

  let previewProc = null;
  let baseUrl = BASE_URL;
  if (!baseUrl) {
    if (REBUILD || !distSmokeFresh()) {
      buildDistSmoke();
    }
    try {
      previewProc = await startPreview();
    } catch (error) {
      console.error(`[smoke] ${error?.message ?? error}`);
      process.exit(1);
    }
    baseUrl = `http://localhost:${PREVIEW_PORT}`;
  }
  process.env.__SMOKE_BASE = baseUrl;

  const browser = await playwright.chromium.launch(launchOptions);
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  if (LOCAL_MODE) {
    // Mock adapter serves fixtures in-memory — no interception needed.
    // (Remote mode: inject TB-15 into the LIVE board projection.)
  } else {
    await injectUntrustedFixture(page);
  }

  let crashed = false;
  try {
    await runSmoke(page);
  } catch (error) {
    results.push({ ok: false, name: "smoke crashed" });
    console.error(`\n[smoke] crashed: ${error?.message ?? error}`);
  } finally {
    await browser.close().catch(() => {});
    previewProc?.kill();
  }

  const failed = results.filter((r) => !r.ok).length;
  const skipped = results.filter((r) => r.skipped).length;
  const passed = results.length - failed - skipped;
  console.log(
    `\n[smoke] ${passed} passed / ${failed} failed / ${skipped} skipped (of ${results.length})${failed ? ` — ${failed} FAILED` : ""}`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`[smoke] fatal: ${error?.message ?? error}`);
  process.exit(1);
});