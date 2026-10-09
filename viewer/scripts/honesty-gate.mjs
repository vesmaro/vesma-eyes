#!/usr/bin/env node
/**
 * The 5-second HONESTY GATE (wave U2; SPEC-2026-10-07 «Глубокая проработка
 * v12 до прода» п.6 + the U2 card's red line): any motion on the Overview
 * page must be caused by a REAL bus event — «первое дыхание из шины; шина
 * молчит — экран стоит». The gate loads the built viewer (mock adapter —
 * the mock bus is SILENT by default, which IS the premise), lets the page
 * settle, takes two full-page screenshots ≥5s apart and demands
 * PIXEL-IDENTICAL frames. Phantom motion (timers/cycles without an event)
 * fails here, not in review.
 *
 * U3 extends the gate to the TASKS console (/tasks; the U3 card's red line:
 * «тихая шина → кадры через 5+сек попиксельно идентичны; позитивный
 * контроль = реальное task.done событие двигает страницу»):
 *
 * Scenarios:
 *   1. silent       — default mock bus on /: two shots ≥5s apart MUST be
 *                     identical.
 *   2. muted        — ?quiet=1 (the anti-fake gate pinned) over the same
 *                     silent bus: two shots ≥5s apart MUST be identical —
 *                     the mute gate never ADDS motion. (The gate deliberately
 *                     does NOT demand identity over a SPEAKING bus: the HUD
 *                     ticker is data, not decor — it updates in every
 *                     regime, §13.3.)
 *   3. bus=demo     — positive control: the bounded demo bus SPEAKS, the
 *                     page moves: two shots ~1.4s apart must DIFFER (guards
 *                     against «passed because nothing can ever move»).
 *   4. tasks-silent — /tasks on the silent bus: two shots ≥5s apart MUST be
 *                     identical — the living console stands when the bus is
 *                     quiet (the dosage law: only task.done + couriers).
 *                     DATA aging (the WF-1 validating clock's minute field)
 *                     is not motion; a minute-boundary rollover between the
 *                     frames triggers exactly ONE honest recheck (a fresh
 *                     pair), a persistent differ still fails.
 *   5. tasks-done   — positive control: a REAL terminal transition emitted
 *                     through the window.VesmaMockBus handle (the same
 *                     wire frame the server sends) must move the page:
 *                     the card flies, the gold flash plays, the toast and
 *                     the tempo chip land (the U3 спектакль answers to it).
 *   6. memory-silent (U4) — /memory on the silent bus: two shots ≥5s apart
 *                     MUST be identical — the scroll domain stands when the
 *                     bus is quiet (the memory dose = recall + tones, and
 *                     silence carries neither).
 *   7. memory-recall (U4) — positive control: a REAL recall-class event
 *                     (notification — the bus's recall-family carrier)
 *                     through the VesmaMockBus handle must move the page:
 *                     the vein bead + the tone shift on the Shell canvas.
 *   8. kora-silent (U5) — /kora on the silent bus: two shots ≥5s apart MUST
 *                     be identical — the frame stands when the bus is quiet
 *                     (the dose = Эфир flashes only, and silence carries
 *                     none: the ether card honestly reads «Событий пока
 *                     нет» and NOTHING moves).
 *   9. kora-ether (U5) — positive control: a REAL presence transition
 *                     (executor.online — the bus's session-class carrier)
 *                     through the VesmaMockBus handle must move the page:
 *                     the ether row lands on the scene card with its iris
 *                     arrival flash.
 *  10. agents-silent (U6) — /agents/hosts on the silent bus: two shots ≥5s
 *                     apart MUST be identical — the domain stands when the
 *                     bus is quiet (the dose = присутствие-свет only, and
 *                     silence carries no transitions; the ticking last_seen
 *                     age is DATA — a minute-field rollover triggers exactly
 *                     ONE honest recheck, a persistent differ still fails).
 *  11. agents-presence (U6) — positive control: a REAL presence transition
 *                     (executor.online through the VesmaMockBus handle, a
 *                     fixture executor id) must move the page: the host
 *                     card flares once (success tint) — never background.
 *  12. docs-silent (U6) — /docs/vesma-eyes on the silent bus: two shots
 *                     ≥5s apart MUST be identical — Доки carry NO living
 *                     layer (the spec verdict): hub cards, statistics and
 *                     search are data, pinned still forever.
 *  14. connect-silent (U8) — /agents/harnesses?connect=1 (the v12
 *                     «Подключить машину» conveyor OPEN on a silent bus):
 *                     two shots ≥5s apart MUST be identical — the rail and
 *                     the connect card carry NO timer-driven progress; the
 *                     rail's steps move on REAL provision-job states only.
 *  15. wizard-silent (U8) — /tasks/list?wizard=1 (the v12 task-formation
 *                     wizard open on a silent bus): two shots ≥5s apart
 *                     MUST be identical — the wizard has no decorative
 *                     progress (the same ONE-honest-recheck rule as
 *                     tasks-silent: a minute-field rollover behind the
 *                     dialog is data aging, not motion).
 *  13. system-silent (U6) — /system/settings on the silent bus: two shots
 *                     ≥5s apart MUST be identical — Система carries NO
 *                     living layer: the «Зеркало» is a live DATA preview,
 *                     not an animation; its frames do not move.
 *
 * Local gate, same discipline as smoke-render.mjs (build dist-smoke with
 * the mock adapter, serve via vite preview, drive real chromium). Browser
 * resolution: VESMARO_SMOKE_CHROMIUM_PATH > playwright cache. Do NOT use
 * --virtual-time-budget against this page (live-SSE pages hang it); the
 * script waits on real time.
 *
 * Usage (from viewer/):
 *   npm run honesty            # builds dist-smoke if missing, runs the gate
 *   node scripts/honesty-gate.mjs --rebuild --out /tmp/shots
 * Exit: 0 = every scenario green, 1 = at least one failure.
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const argValue = (flag, fallback) =>
  args.indexOf(flag) !== -1 && args[args.indexOf(flag) + 1]
    ? args[args.indexOf(flag) + 1]
    : fallback;

const VIEWER_DIR = resolve(import.meta.dirname, "..");
const DIST_SMOKE = join(VIEWER_DIR, "dist-smoke");
const PORT = 4174;
const BASE = `http://localhost:${PORT}/app/`;
const OUT_DIR = resolve(argValue("--out", join(VIEWER_DIR, "honesty-shots")));
const QUIET_GAP_MS = 5600; // ≥5s demanded by the gate
const SETTLE_MS = 2500; // lazy chunks + fonts + first paint calm-down

function resolvePlaywright() {
  const requireFromViewer = createRequire(join(VIEWER_DIR, "package.json"));
  try {
    return requireFromViewer("playwright");
  } catch {
    throw new Error(
      "playwright is not resolvable from viewer/ — run `npm ci` first",
    );
  }
}

function chromiumExecutablePath() {
  const explicit = process.env.VESMARO_SMOKE_CHROMIUM_PATH;
  if (explicit) return explicit;
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) return undefined;
  for (const dir of readdir(cache)
    .filter((name) => name.startsWith("chromium-"))
    .sort()
    .reverse()) {
    for (const binary of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
      const path = join(cache, dir, binary);
      if (existsSync(path)) return path;
    }
  }
  return undefined;

  function readdir(dir) {
    return require("node:fs").readdirSync(dir);
  }
}

function buildDistSmoke() {
  console.log("[honesty] building dist-smoke (VITE_ADAPTER=mock)…");
  execSync("npx tsc --noEmit -p tsconfig.json && npx vite build --outDir dist-smoke", {
    cwd: VIEWER_DIR,
    // The adapter pin (ME-043) forbids prod+mock unless the harness opts in.
    env: { ...process.env, VITE_ADAPTER: "mock", VITE_SMOKE_ALLOW_MOCK: "1" },
    stdio: "inherit",
  });
}

async function startPreview() {
  console.log(`[honesty] serving dist-smoke/ via vite preview on :${PORT}`);
  const child = spawn(
    join(VIEWER_DIR, "node_modules", ".bin", "vite"),
    ["preview", "--port", String(PORT), "--strictPort", "--outDir", "dist-smoke"],
    { cwd: VIEWER_DIR, stdio: ["ignore", "ignore", "inherit"] },
  );
  const deadline = Date.now() + 30_000;
  for (;;) {
    const up = await new Promise((resolveProbe) => {
      const req = require("node:http").get(
        { hostname: "localhost", port: PORT, path: "/app/" },
        (res) => {
          res.resume();
          resolveProbe(res.statusCode !== undefined && res.statusCode < 500);
        },
      );
      req.on("error", () => resolveProbe(false));
      req.setTimeout(1200, () => {
        req.destroy();
        resolveProbe(false);
      });
    });
    if (up) return child;
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`vite preview never came up on :${PORT}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function settledShot(context, url, name) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await sleep(SETTLE_MS);
  const shot = await page.screenshot({ fullPage: true });
  writeFileSync(join(OUT_DIR, name), shot);
  await page.close();
  return shot;
}

// --- the raster-noise tolerance (agents-redesign A1, 2026-10-09) --------------
// Headless Skia can flip a HANDFUL of sub-visible antialiasing pixels between
// LOADS of an identical, still page — the same jitter class the launch flags
// above already fight (the header records a 2-pixel case observed at rest).
// Measured on the A1 hosts frame: 11 px at ΔRGB ≤ 12 across loads, ZERO
// within-load motion (8 frames over 5 s byte-identical), the flipped pixels
// invisible at 8× zoom (shell-chrome glyph/border AA; the glyph-atlas
// nondeterminism class). Real motion paints REGIONS — the smallest honest
// living dose (the presence impulse) tints a whole row — so the silent-bus
// contract stays: byte-equal, or ≤ NOISE_PIXELS differing pixels each within
// NOISE_DELTA per channel = the page stands; anything more = motion, FAIL.
// The POSITIVE controls keep the strict byte comparison (a real event must
// move the page — and does, by thousands of pixels).
const NOISE_PIXELS = 12;
const NOISE_DELTA = 16;

/** The decoded-pixel verdict for a silent-bus frame pair (see above). PNG
 * ENCODING is itself nondeterministic (a 1-byte size difference over ZERO
 * differing pixels was measured on the muted pass) — the decoded pixels are
 * the verdict; byte equality is only the fast path. */
async function framesStand(browser, a, b) {
  if (a.equals(b)) return true;
  const page = await browser.newPage();
  try {
    return await page.evaluate(
      async ([aB64, bB64, maxPixels, maxDelta]) => {
        const load = (b64) =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = `data:image/png;base64,${b64}`;
          });
        const [ia, ib] = await Promise.all([load(aB64), load(b64)]);
        if (ia.width !== ib.width || ia.height !== ib.height) return false;
        const canvas = document.createElement("canvas");
        canvas.width = ia.width;
        canvas.height = ia.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(ia, 0, 0);
        const da = ctx.getImageData(0, 0, ia.width, ia.height).data;
        ctx.clearRect(0, 0, ia.width, ia.height);
        ctx.drawImage(ib, 0, 0);
        const db = ctx.getImageData(0, 0, ib.width, ib.height).data;
        let pixels = 0;
        for (let i = 0; i < da.length; i += 4) {
          const delta = Math.max(
            Math.abs(da[i] - db[i]),
            Math.abs(da[i + 1] - db[i + 1]),
            Math.abs(da[i + 2] - db[i + 2]),
            Math.abs(da[i + 3] - db[i + 3]),
          );
          if (delta > 0) {
            pixels += 1;
            if (delta > maxDelta || pixels > maxPixels) return false;
          }
        }
        return true;
      },
      [a.toString("base64"), b.toString("base64"), NOISE_PIXELS, NOISE_DELTA],
    );
  } finally {
    await page.close();
  }
}

async function main() {
  const playwright = resolvePlaywright();
  mkdirSync(OUT_DIR, { recursive: true });
  if (hasFlag("--rebuild") || !existsSync(join(DIST_SMOKE, "index.html"))) {
    buildDistSmoke();
  }
  const preview = await startPreview();
  const executablePath = chromiumExecutablePath();
  const browser = await playwright.chromium.launch({
    headless: true,
    // Deterministic rasterization: headless-shell's GPU/LCD text paths can
    // jitter antialiasing on isolated glyph edges (a 2-pixel difference was
    // observed on an otherwise still page — not motion). Pin the raster.
    args: [
      "--disable-gpu",
      "--disable-lcd-text",
      "--font-render-hinting=none",
      "--force-color-profile=srgb",
    ],
    ...(executablePath ? { executablePath } : {}),
  });

  const results = [];
  const check = (ok, name, details = "") => {
    results.push({ ok: Boolean(ok), name });
    console.log(
      `  [${ok ? "OK  " : "FAIL"}] ${name}${ok || !details ? "" : ` — ${details}`}`,
    );
  };

  try {
    // 1. SILENT — the gate itself: a silent bus means a standing screen.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const a = await settledShot(context, BASE, "u2-honesty-silent-t0.png");
      console.log("[honesty] silent: waiting 5.6s of real time…");
      await sleep(QUIET_GAP_MS);
      const b = await settledShot(context, `${BASE}`, "u2-honesty-silent-t5.png");
      // Same context → the SECOND page loads caches but the sessionStorage
      // awakening flag is per-TAB: no events fired, so the flag was never
      // written; the well must stand identically anyway.
      const identical = await framesStand(browser, a, b);
      check(
        identical,
        "silent bus: two frames ≥5s apart are pixel-identical",
        identical ? "" : `bytes ${a.length} vs ${b.length}`,
      );
      await context.close();
    }

    // 2. MUTED — the anti-fake gate (?quiet=1) beats even a speaking bus.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const a = await settledShot(context, `${BASE}?quiet=1`, "u2-honesty-muted-t0.png");
      console.log("[honesty] muted: waiting 5.6s of real time…");
      await sleep(QUIET_GAP_MS);
      const b = await settledShot(
        context,
        `${BASE}?quiet=1`,
        "u2-honesty-muted-t5.png",
      );
      const identical = await framesStand(browser, a, b);
      check(
        identical,
        "muted (?quiet=1, silent bus): frames identical — mute adds no motion",
        identical ? "" : `bytes ${a.length} vs ${b.length}`,
      );
      await context.close();
    }

    // 3. POSITIVE CONTROL — a speaking bus moves the page.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(`${BASE}?bus=demo`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(2600); // three demo frames have landed by now
      const a = await page.screenshot({ fullPage: true });
      writeFileSync(join(OUT_DIR, "u2-honesty-bus-t2.png"), a);
      await sleep(1400); // the fourth frame lands; beads/drift move
      const b = await page.screenshot({ fullPage: true });
      writeFileSync(join(OUT_DIR, "u2-honesty-bus-t3.png"), b);
      await page.close();
      const differs = !a.equals(b);
      check(
        differs,
        "bus=demo positive control: a speaking bus moves the page",
        differs ? "" : "frames identical — the bus events reached nothing",
      );
      await context.close();
    }

    // 4. TASKS SILENT (U3) — the living console stands on a quiet bus.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      let identical = false;
      let bytes = "";
      // ONE honest recheck: the WF-1 validating clock prints a minutes field
      // (data aging, not motion) — a minute boundary landing between the two
      // frames is a rollover, not a phantom. A persistent differ fails.
      for (let attempt = 1; attempt <= 2 && !identical; attempt += 1) {
        const a = await settledShot(context, `${BASE}tasks`, "u3-honesty-tasks-silent-t0.png");
        console.log("[honesty] tasks-silent: waiting 5.6s of real time…");
        await sleep(QUIET_GAP_MS);
        const b = await settledShot(
          context,
          `${BASE}tasks`,
          `u3-honesty-tasks-silent-t5.png`,
        );
        identical = await framesStand(browser, a, b);
        bytes = `bytes ${a.length} vs ${b.length}`;
        if (!identical && attempt === 1) {
          console.log("[honesty] tasks-silent: frames differ — rechecking once (a minute-field rollover is data aging, not motion)");
        }
      }
      check(
        identical,
        "tasks: silent bus — two frames ≥5s apart are pixel-identical",
        identical ? "" : bytes,
      );
      await context.close();
    }

    // 5. TASKS POSITIVE CONTROL (U3) — a REAL terminal transition moves the
    // console: the card flies to «Решено», the gold flash plays, the toast
    // and the tempo chip land, the courier is fed.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(`${BASE}tasks`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(SETTLE_MS);
      const a = await page.screenshot({ fullPage: true });
      writeFileSync(join(OUT_DIR, "u3-honesty-tasks-done-t0.png"), a);
      // The same wire frame the server sends on a real resolution — a FULL
      // TaskOut row (mirror of the fixture corpus's TB-11, in-progress →
      // resolved; the cache must hold a pre-transition row for the transit
      // to record). Emitted through the mock bus's test handle.
      await page.evaluate(() => {
        window.VesmaMockBus?.emit("task.moved", {
          actor: "machine:board",
          task: {
            id: "TB-11",
            col: "resolved",
            position: 2,
            title: "Собрать densité-токены и проверить контраст AA",
            summary: "--row-h режимы + проверка 4.5:1 в обеих темах.",
            spec: "Acceptance criteria:\n— [x] токены заморожены",
            agents: [],
            specialists: ["@GCW: Senior Frontend Developer"],
            env: "local",
            project: "vesma",
            memory_ids: [],
            mnemos_tags: ["project:mnemos", "topic:design"],
            created_at: "2026-09-18T06:25:00+00:00",
            updated_at: new Date().toISOString(),
            archived: 0,
            status: "resolved",
            priority: "low",
            archived_from: "",
            validating_since: "",
            resolved_at: new Date().toISOString(),
            done_at: "",
            human_view: "",
          },
        });
      });
      await sleep(400); // the patch + flash land well inside the window
      const b = await page.screenshot({ fullPage: true });
      writeFileSync(join(OUT_DIR, "u3-honesty-tasks-done-t1.png"), b);
      await page.close();
      const differs = !a.equals(b);
      check(
        differs,
        "tasks: a real task.done transition moves the console (positive control)",
        differs ? "" : "frames identical — the terminal transition reached nothing",
      );
      await context.close();
    }

    // 6. MEMORY SILENT (U4) — the scroll domain stands on a quiet bus.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const a = await settledShot(context, `${BASE}memory`, "u4-honesty-memory-silent-t0.png");
      console.log("[honesty] memory-silent: waiting 5.6s of real time…");
      await sleep(QUIET_GAP_MS);
      const b = await settledShot(
        context,
        `${BASE}memory`,
        "u4-honesty-memory-silent-t5.png",
      );
      const identical = await framesStand(browser, a, b);
      check(
        identical,
        "memory: silent bus — two frames ≥5s apart are pixel-identical",
        identical ? "" : `bytes ${a.length} vs ${b.length}`,
      );
      await context.close();
    }

    // 7. MEMORY RECALL POSITIVE CONTROL (U4) — a REAL recall-class event
    // moves the domain: the notification frame (the bus's recall-family
    // carrier) runs a bead along a Shell vein and shifts the living tone.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(`${BASE}memory`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(SETTLE_MS);
      const a = await page.screenshot({ fullPage: true });
      writeFileSync(join(OUT_DIR, "u4-honesty-memory-recall-t0.png"), a);
      // The same wire frame the server sends on a real notification.
      await page.evaluate(() => {
        window.VesmaMockBus?.emit("notification", {
          notification: {
            id: 9401,
            category: "work",
            title: "Проверка честности памяти",
            message: "Позитивный контроль: реальный recall-класс события.",
            ts: new Date().toISOString(),
            read: false,
          },
        });
      });
      await sleep(400); // the bead is mid-travel well inside its trail window
      const b = await page.screenshot({ fullPage: true });
      writeFileSync(join(OUT_DIR, "u4-honesty-memory-recall-t1.png"), b);
      await page.close();
      const differs = !a.equals(b);
      check(
        differs,
        "memory: a real recall-class event moves the domain (positive control)",
        differs ? "" : "frames identical — the recall event reached nothing",
      );
      await context.close();
    }
    // 8. KORA SILENT (U5) — the frame stands on a quiet bus.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const a = await settledShot(context, `${BASE}kora`, "u5-honesty-kora-silent-t0.png");
      console.log("[honesty] kora-silent: waiting 5.6s of real time…");
      await sleep(QUIET_GAP_MS);
      const b = await settledShot(
        context,
        `${BASE}kora`,
        "u5-honesty-kora-silent-t5.png",
      );
      const identical = await framesStand(browser, a, b);
      check(
        identical,
        "kora: silent bus — two frames ≥5s apart are pixel-identical",
        identical ? "" : `bytes ${a.length} vs ${b.length}`,
      );
      await context.close();
    }

    // 9. KORA ETHER POSITIVE CONTROL (U5) — a REAL presence transition moves
    // the domain: the executor.online frame (the bus's session-class
    // carrier) lands an ether row with its iris arrival flash.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(`${BASE}kora`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(SETTLE_MS);
      const a = await page.screenshot({ fullPage: true });
      writeFileSync(join(OUT_DIR, "u5-honesty-kora-ether-t0.png"), a);
      // The same wire frame the server sends on a real presence transition —
      // the public executor row (`_executor_public` shape).
      await page.evaluate(() => {
        window.VesmaMockBus?.emit("executor.online", {
          executor: {
            id: "exec-honesty",
            name: "zcode@honesty-box",
            harness: "zcode",
            host: "honesty-box",
            transport: "local-poll",
            capabilities: [],
            presence: "online",
          },
          prev_state: null,
          state: "online",
          last_seen_at: new Date().toISOString(),
        });
      });
      await sleep(400); // the row + the flash land well inside the window
      const b = await page.screenshot({ fullPage: true });
      writeFileSync(join(OUT_DIR, "u5-honesty-kora-ether-t1.png"), b);
      await page.close();
      const differs = !a.equals(b);
      check(
        differs,
        "kora: a real presence transition lands an ether row (positive control)",
        differs ? "" : "frames identical — the ether event reached nothing",
      );
      await context.close();
    }

    // 10. AGENTS SILENT (U6) — the domain stands on a quiet bus. The same
    // ONE-honest-recheck contract as tasks: the roster's last_seen age is
    // DATA (a minute-field rollover between the frames is aging, not
    // motion); a persistent differ fails.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      let identical = false;
      let bytes = "";
      for (let attempt = 1; attempt <= 2 && !identical; attempt += 1) {
        const a = await settledShot(
          context,
          `${BASE}agents/hosts`,
          "u6-honesty-agents-silent-t0.png",
        );
        console.log("[honesty] agents-silent: waiting 5.6s of real time…");
        await sleep(QUIET_GAP_MS);
        const b = await settledShot(
          context,
          `${BASE}agents/hosts`,
          "u6-honesty-agents-silent-t5.png",
        );
        identical = await framesStand(browser, a, b);
        bytes = `bytes ${a.length} vs ${b.length}`;
        if (!identical && attempt === 1) {
          console.log(
            "[honesty] agents-silent: frames differ — rechecking once (a last_seen minute-field rollover is data aging, not motion)",
          );
        }
      }
      check(
        identical,
        "agents: silent bus — two frames ≥5s apart are pixel-identical",
        identical ? "" : bytes,
      );
      await context.close();
    }

    // 11. AGENTS PRESENCE POSITIVE CONTROL (U6) — a REAL presence transition
    // moves the domain: the executor.online frame (a fixture executor id)
    // flares the host card once — the one-shot присутствие-свет impulse.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(`${BASE}agents/hosts`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(SETTLE_MS);
      const a = await page.screenshot({ fullPage: true });
      writeFileSync(join(OUT_DIR, "u6-honesty-agents-presence-t0.png"), a);
      // The same wire frame the server's presence sweeper emits on a real
      // transition (`_presence_sweep_once` shape) — the roster fixture id.
      await page.evaluate(() => {
        window.VesmaMockBus?.emit("executor.online", {
          executor: {
            id: "exec-laptop-zcode",
            name: "zcode@laptop",
            harness: "zcode",
            host: "laptop",
            transport: "local-poll",
            capabilities: [],
            presence: "online",
          },
          prev_state: "offline",
          state: "online",
          last_seen_at: new Date().toISOString(),
        });
      });
      await sleep(400); // the flash is mid-decay well inside its window
      const b = await page.screenshot({ fullPage: true });
      writeFileSync(join(OUT_DIR, "u6-honesty-agents-presence-t1.png"), b);
      await page.close();
      const differs = !a.equals(b);
      check(
        differs,
        "agents: a real presence transition flares the host card (positive control)",
        differs ? "" : "frames identical — the presence event reached nothing",
      );
      await context.close();
    }

    // 12. DOCS SILENT (U6) — Доки carry NO living layer: the hub (cards,
    // statistics, search) stands on a quiet bus — pinned forever.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const a = await settledShot(context, `${BASE}docs/vesma-eyes`, "u6-honesty-docs-silent-t0.png");
      console.log("[honesty] docs-silent: waiting 5.6s of real time…");
      await sleep(QUIET_GAP_MS);
      const b = await settledShot(
        context,
        `${BASE}docs/vesma-eyes`,
        "u6-honesty-docs-silent-t5.png",
      );
      const identical = await framesStand(browser, a, b);
      check(
        identical,
        "docs: silent bus — two frames ≥5s apart are pixel-identical (no living layer, pinned)",
        identical ? "" : `bytes ${a.length} vs ${b.length}`,
      );
      await context.close();
    }

    // 13. SYSTEM SILENT (U6) — Система carries NO living layer: the settings
    // hub with its «Зеркало» (a live DATA preview, not an animation) stands
    // on a quiet bus — pinned forever.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const a = await settledShot(
        context,
        `${BASE}system/settings`,
        "u6-honesty-system-silent-t0.png",
      );
      console.log("[honesty] system-silent: waiting 5.6s of real time…");
      await sleep(QUIET_GAP_MS);
      const b = await settledShot(
        context,
        `${BASE}system/settings`,
        "u6-honesty-system-silent-t5.png",
      );
      const identical = await framesStand(browser, a, b);
      check(
        identical,
        "system: silent bus — two frames ≥5s apart are pixel-identical (no living layer, pinned)",
        identical ? "" : `bytes ${a.length} vs ${b.length}`,
      );
      await context.close();
    }

    // 14. CONNECT CONVEYOR SILENT (U8) — the «Подключить машину» flow
    // stands on a quiet bus: no step exists that the operation has not
    // earned, and no progress bar exists that a timer could drive.
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const a = await settledShot(
        context,
        `${BASE}agents/harnesses?connect=1`,
        "u8-honesty-connect-silent-t0.png",
      );
      console.log("[honesty] connect-silent: waiting 5.6s of real time…");
      await sleep(QUIET_GAP_MS);
      const b = await settledShot(
        context,
        `${BASE}agents/harnesses?connect=1`,
        "u8-honesty-connect-silent-t5.png",
      );
      const identical = await framesStand(browser, a, b);
      check(
        identical,
        "connect conveyor: silent bus — two frames ≥5s apart are pixel-identical (no decorative progress)",
        identical ? "" : `bytes ${a.length} vs ${b.length}`,
      );
      await context.close();
    }

    // 15. TASK WIZARD SILENT (U8) — the task-formation wizard open on a
    // quiet bus: no decorative progress (the ONE-honest-recheck rule from
    // tasks-silent — a minute-field rollover behind the dialog is data
    // aging, not motion; a persistent differ fails).
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      let identical = false;
      let bytes = "";
      for (let attempt = 1; attempt <= 2 && !identical; attempt += 1) {
        const a = await settledShot(
          context,
          `${BASE}tasks/list?wizard=1`,
          "u8-honesty-wizard-silent-t0.png",
        );
        console.log("[honesty] wizard-silent: waiting 5.6s of real time…");
        await sleep(QUIET_GAP_MS);
        const b = await settledShot(
          context,
          `${BASE}tasks/list?wizard=1`,
          "u8-honesty-wizard-silent-t5.png",
        );
        identical = await framesStand(browser, a, b);
        bytes = `bytes ${a.length} vs ${b.length}`;
        if (!identical && attempt === 1) {
          console.log("[honesty] wizard-silent: frames differ — rechecking once (a minute-field rollover is data aging, not motion)");
        }
      }
      check(
        identical,
        "task wizard: silent bus — two frames ≥5s apart are pixel-identical (no decorative progress)",
        identical ? "" : bytes,
      );
      await context.close();
    }
  } finally {
    await browser.close();
    preview.kill();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n[honesty] ${results.length - failed.length}/${results.length} checks green` +
      (failed.length ? " — FAIL" : " — the light is honest"),
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(`[honesty] ${error?.message ?? error}`);
  process.exit(1);
});
