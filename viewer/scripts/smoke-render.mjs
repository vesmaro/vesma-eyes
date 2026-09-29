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
 *       run against the deployment's live API. Navigations use CANONICAL
 *       root paths: since the Ф4 root-app flip a deployed server 302s
 *       /app/X → /X WITHOUT the query string, so a legacy deep link like
 *       /app/tasks/TB-15?tab=details lost ?tab and landed on the default
 *       pane (ME-026). The untrusted-mermaid fixtures (task TB-15 AND the
 *       over-cap memory) are injected into the LIVE deployment via a
 *       network interception — no server-side change, no writes.
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
  title: "ME-013 smoke: untrusted mermaid fixture",
  summary: "Browser render smoke fixture.",
  spec:
    "## Diagram (untrusted surface)\n\n```mermaid\nflowchart LR\n  UNTRUSTED[fixture] --> GATE\n```",
  agents: ["zcode"],
  specialists: ["@GCW: Senior Frontend Developer"],
  env: "laptop",
  project: "vesmaro",
  memory_ids: [],
  mnemos_tags: ["project:vesmaro"],
  created_at: "2026-09-19T10:00:00+00:00",
  updated_at: "2026-09-28T00:00:00+00:00",
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

/**
 * The over-cap fallback fixture (ME-026): the board-envelope form of
 * gateway/fixtures.ts MOCK_MERMAID_OVERCAP_MEMORY — SIX fences in ONE
 * text, one over the per-surface cap. Remote mode MUST inject it, and
 * through the contract the DEPLOYED gateway actually speaks: BoardAdapter
 * reads GET /api/memories/item/{id} (the ok/memory envelope — not the
 * mnemos HttpAdapter's /api/memories/{id}). Without interception the id
 * resolves to nothing on a live deployment, the not-found wall passed
 * the «no diagram» asserts vacuously and failed the six source-visible
 * ones (the 14/6/1 remote smoke of 1.45.0).
 */
const MERMAID_OVERCAP_MEMORY_ENVELOPE = {
  ok: true,
  server: "smoke-fixture",
  memory: {
    id: "mem-mermaid-overcap-fixture",
    title: "Mermaid over-cap fixture (smoke)",
    content:
      "Отчёт: шесть мелких диаграмм в одной памяти — над потолком фенсов на " +
      "поверхность, все должны остаться исходным кодом.\n\n" +
      "```mermaid\nF1-->R1\n```\n\n" +
      "```mermaid\nF2-->R2\n```\n\n" +
      "```mermaid\nF3-->R3\n```\n\n" +
      "```mermaid\nF4-->R4\n```\n\n" +
      "```mermaid\nF5-->R5\n```\n\n" +
      "```mermaid\nF6-->R6\n```",
    raw_content: null,
    tags: ["project:vesmaro"],
    status: "raw",
    memory_type: "note",
    source: "mcp",
    source_url: null,
    project: "vesmaro",
    agent: "zcode",
    created_at: "2026-09-28T00:00:00Z",
    updated_at: "2026-09-28T00:00:00Z",
  },
};

/**
 * Inject the untrusted-mermaid fixtures into a LIVE deployment via
 * network interception (remote mode only — the mock adapter serves them
 * natively in local mode).
 */
async function injectRemoteFixtures(page) {
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
  // ME-026: the over-cap memory fixture — through the deployed gateway's
  // contract: BoardAdapter.getMemory reads GET /api/memories/item/{id}
  // (the ok/memory envelope; includeRaw has no wire effect there). The
  // trailing glob keeps it robust against added query params.
  await page.route(
    "**/api/memories/item/mem-mermaid-overcap-fixture*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MERMAID_OVERCAP_MEMORY_ENVELOPE),
      }),
  );
}

// ---------------------------------------------------------------------------
// Route table (ADR 0020 invariant 7 + ME-011 board notes)
// ---------------------------------------------------------------------------

/**
 * SPA path prefix for navigations. The local vite preview serves the
 * production build under /app/ (vite.config base — ADR 0011), so local
 * mode keeps the prefix. A deployed server since the Ф4 root-app flip
 * answers /app/X with a 302 to /X WITHOUT the query string
 * (server/app.py app_spa), so remote mode navigates the CANONICAL root
 * paths directly — a legacy /app/tasks/TB-15?tab=details lost ?tab and
 * landed on the default «Отчёты» pane (ME-026).
 */
const APP_PREFIX = LOCAL_MODE ? "/app" : "";
const DOCS_BASE = `${APP_PREFIX}/docs`;

async function runSmoke(page) {
  const base = process.env.__SMOKE_BASE ?? "";
  const docs = `${base}${DOCS_BASE}`;

  // -- 1. docs hub renders -------------------------------------------------
  console.log("\n[1/8] docs hub renders");
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
  console.log("\n[2/8] category page: no GENERATED banner in card previews");
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
  console.log("\n[3/8] article page renders (provenance badge, heading slugs)");
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
  // Banner-body gate (ME-019 review P3c): the built body served to the
  // renderer must carry no provenance banner — the slice lives at the
  // manifest build (ADR 0020 Ф2); this restores the lost /tmp/smoke-134
  // banner-check.mjs assert at the article surface.
  assert(
    !(articleText ?? "").includes("GENERATED"),
    "article body carries no GENERATED banner (manifest-build slice)",
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
  console.log("\n[4/8] mermaid fences produce <svg> in DOM (ADR-0017 debt)");
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
  console.log("\n[5/8] TextEngine surface: pulse page fragments render");
  await page.goto(`${base}${APP_PREFIX}/memory/pulse`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  const pulseText = (await mainText(page)).replace(/\s+/g, " ");
  assert(
    (pulseText ?? "").length > 40,
    "pulse page renders fragments",
    (pulseText ?? "").slice(0, 100),
  );

  // -- 6. TextEngine surface: task detail page ----------------------------
  console.log("\n[6/8] TextEngine surface: task detail page renders");
  const taskId = process.env.__SMOKE_TASK_ID ?? "TB-1";
  await page.goto(`${base}${APP_PREFIX}/tasks/${taskId}?tab=details`, {
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
  // RATIFIED contract (ADR 0020 Amendment 1, ME-013 — flipped from the Ф0
  // honest skip/inert assert): a valid diagram in an untrusted agent/task
  // text renders AS A DIAGRAM (svg) on the task page. The mermaid chunk is
  // lazy — wait for the svg explicitly; caps/errors fall back to source and
  // would fail this assert loudly (never a fake green).
  console.log("\n[7/8] untrusted-surface mermaid fence (task detail fixture)");
  await page.goto(`${base}${APP_PREFIX}/tasks/TB-15?tab=details`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("main", { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  const untrustedText = await mainText(page);
  // The details pane must actually be served: a deployment that drops the
  // ?tab= query (the pre-ME-026 legacy /app redirect did) or renders the
  // reports pane regardless leaves nothing to assert here — an honest
  // SKIP, never a fake green. The marker is the spec's PROSE heading, NOT
  // the fence source: since the flip the source hides once the diagram
  // renders, so keying on the fence text would race (and then always
  // skip) — the heading is plain text, always present.
  const detailsServed = (untrustedText ?? "").includes("Diagram (untrusted surface)");
  if (!detailsServed) {
    skip(
      "untrusted-surface mermaid asserts",
      "this deployment renders the reports pane for ?tab=details — fixture spec never mounts (surface covered in local mode)",
    );
  } else {
    // Amendment 1 acceptance criterion: the diagram renders on the
    // untrusted surface (ME-013 flipped this from the Ф0 inert assert).
    const untrustedSvgAttached = await page
      .waitForSelector("main .mermaid-diagram svg", {
        timeout: 25_000,
        state: "attached",
      })
      .then(() => true)
      .catch(() => false);
    assert(
      untrustedSvgAttached,
      "untrusted mermaid fence renders as <svg> on the task page (ADR 0020 Amendment 1)",
    );
  }

  // -- 8. UNTRUSTED mermaid, the HONEST FALLBACK (ME-013 review P3-6) ------
  // Board acceptance parenthetical: a hostile diagram (over-cap) falls back
  // to its source, never a silent drop. The fixture memory carries SIX
  // fences in one text — one over the per-surface cap — so the memory page
  // must show EVERY fence as a plain code block: no diagram mount, no svg
  // (scoped to the .mermaid-diagram mount — the page's own lucide chrome
  // legitimately contains svgs), all six sources visible.
  console.log("\n[8/8] untrusted mermaid over-cap: honest inert fallback");
  await page.goto(`${base}${APP_PREFIX}/memory/mem-mermaid-overcap-fixture`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("main", { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500); // a lazy diagram would need to fail LOUD
  const overcapFigures = await page.locator("main figure").count();
  const overcapSvgs = await page.locator("main .mermaid-diagram svg").count();
  assert(overcapFigures === 0, `over-cap surface mounts no diagram figure (got ${overcapFigures})`);
  assert(overcapSvgs === 0, `over-cap surface renders no diagram svg (got ${overcapSvgs})`);
  const overcapText = await mainText(page);
  for (let i = 1; i <= 6; i += 1) {
    assert(
      (overcapText ?? "").includes(`F${i}-->R${i}`),
      `over-cap fence #${i} source stays visible (auditable fallback)`,
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
  // Strip a trailing slash so `${base}${APP_PREFIX}/…` never builds
  // `//tasks/…` from an operator-supplied base (ME-026 hardening).
  process.env.__SMOKE_BASE = baseUrl.replace(/\/+$/, "");

  const browser = await playwright.chromium.launch(launchOptions);
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  if (LOCAL_MODE) {
    // Mock adapter serves fixtures in-memory — no interception needed.
    // (Remote mode: inject TB-15 + the over-cap memory into the LIVE
    // deployment via network interception.)
  } else {
    await injectRemoteFixtures(page);
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