#!/usr/bin/env node
/**
 * U7 FPS-ladder measurement (SPEC-2026-10-07 red line: деградация
 * 55.5 → DPR1.5+glow off → 45). Loads the built viewer (dist-smoke, mock
 * adapter) on / with the living layer in «Полный», keeps a REAL event source
 * speaking (bus=demo positive control so breath windows stay open), and:
 *   1. samples requestAnimationFrame throughput for a window (baseline fps);
 *   2. reads the canvas backing resolution vs innerWidth (the DPR leg);
 *   3. drives CPU throttling via CDP to force slow frames and records which
 *      rung the engine settles on (lite → static).
 * The ladder is READ from the page, never asserted from source.
 *
 * Usage (from viewer/): node scripts/u7-fps-ladder.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4191;
const BASE = `http://localhost:${PORT}/app/`;

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

/** Sample REAL engine repaints: hash a pixel strip of the living canvas
 * every RAF tick; a changed hash = the engine drew a new frame. Also tracks
 * the breath window state (the honest-motion premise: no window → no RAF). */
const SAMPLE_FN = (ms) => {
  const state = { rafTicks: 0, paints: 0, breathOpen: 0, last: "" };
  window.__u7fps = state;
  let stop = false;
  const t0 = performance.now();
  const tick = () => {
    state.rafTicks++;
    if (document.documentElement.dataset.breath === "true") state.breathOpen++;
    const c = document.querySelector("canvas");
    if (c) {
      state.canvasW = c.width;
      try {
        const ctx = c.getContext("2d");
        // A strip crossing the TOPBAR vein (seam at ~48css × dpr) — the
        // sheen/bead pixels live there; the top rows never change.
        const y0 = Math.round(44 * (c.width / innerWidth));
        const col = ctx.getImageData(0, y0, c.width, Math.max(8, y0)).data;
        let h = 0;
        for (let i = 0; i < col.length; i += 397) h = (h * 31 + col[i]) | 0;
        if (h !== state.last) {
          state.paints++;
          state.last = h;
        }
      } catch {
        /* cross-origin guard — never expected on a same-origin canvas */
      }
    }
    if (!stop) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return new Promise((resolve) => {
    setTimeout(() => {
      stop = true;
      const dt = performance.now() - t0;
      resolve({
        rafFps: Math.round((state.rafTicks * 1000) / dt),
        enginePaintsPerSec: Math.round((state.paints * 1000) / dt),
        breathOpenPct: Math.round((state.breathOpen * 100) / state.rafTicks),
        dpr: Math.round((state.canvasW / innerWidth) * 100) / 100,
        canvasW: state.canvasW,
      });
    }, ms);
  });
};

async function main() {
  const playwright = require("playwright");
  const preview = await startPreview();
  const rows = [];
  try {
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ["--disable-gpu"],
      ...(chromiumPath() ? { executablePath: chromiumPath() } : {}),
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2, // start at DPR 2 — the degradation headroom
    });
    const page = await context.newPage();
    // The mock bus is SILENT by premise (the honesty gate's red line). The
    // ladder measures the engine UNDER LOAD, so the script drives the SAME
    // window.VesmaMockBus handle the gate's positive controls use — real
    // wire frames on a 1.5s cadence keep breath windows open and beads
    // flying in «Полный» for the whole sample window.
    await page.goto(`${BASE}`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      let n = 0;
      window.__u7busTimer = window.setInterval(() => {
        // The same wire frame the server sends on a real notification
        // (the honesty gate's positive-control shape, unique per emit).
        n += 1;
        window.VesmaMockBus?.emit("notification", {
          notification: {
            id: 9400 + n,
            category: "work",
            title: "fps ladder probe",
            message: `sustained load frame ${n}`,
            ts: new Date().toISOString(),
            read: false,
          },
        });
      }, 1500);
    });
    await sleep(4000);

    const cdp = await context.newCDPSession(page);

    async function sample(label, throttleMs) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttleMs });
      await sleep(2500); // let the engine's 60-frame windows re-settle
      const r = await page.evaluate(SAMPLE_FN, 12_000);
      rows.push({ label, throttle: throttleMs, ...r });
      console.log(
        `[fps] ${label} (cpu ×${throttleMs}): raf ${r.rafFps}fps, engine ${r.enginePaintsPerSec} paints/s, breath ${r.breathOpenPct}%, DPR ≈ ${r.dpr}`,
      );
      // give the engine a breath between rungs
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await sleep(1500);
    }

    await sample("baseline", 1);
    await sample("mild", 2);
    await sample("moderate", 4);
    await sample("heavy", 8);
    await sample("extreme", 12);
    await sample("brutal", 25);
    await sample("sand", 50);
    await page.evaluate(() => window.clearInterval(window.__u7busTimer));
    await context.close();

    // --- PHASE 2: the degradation RUNGS -----------------------------------
    // The engine's `fps` metric is the FRAME-BUDGET check: 60 frames per
    // accumulated DRAW time (fps = 1000/avgDrawMs) — the rung <55.5 means
    // draw ≥18ms, <45 means draw ≥22ms. A 4K viewport multiplies the vein
    // segment count (~×3.5), so moderate throttling pushes the real draw
    // cost across the rungs; the DPR readout witnesses the lite rung
    // (dprCap 2 → 1.5) and paints→0 (breath open) witnesses the static one.
    const stress = await browser.newContext({
      viewport: { width: 3840, height: 2160 },
      deviceScaleFactor: 2,
    });
    const spage = await stress.newPage();
    await spage.goto(`${BASE}`, { waitUntil: "load" });
    await spage.evaluate(() => document.fonts.ready);
    await spage.evaluate(() => {
      let n = 9000;
      window.__u7busTimer = window.setInterval(() => {
        n += 1;
        window.VesmaMockBus?.emit("notification", {
          notification: {
            id: n,
            category: "work",
            title: "fps ladder probe",
            message: `stress frame ${n}`,
            ts: new Date().toISOString(),
            read: false,
          },
        });
      }, 1500);
    });
    await sleep(4000);
    const scdp2 = await stress.newCDPSession(spage);

    async function stressSample(label, throttleMs) {
      await scdp2.send("Emulation.setCPUThrottlingRate", { rate: throttleMs });
      await sleep(3000);
      const r = await spage.evaluate(SAMPLE_FN, 14_000);
      rows.push({ label: `stress-${label}`, throttle: throttleMs, ...r });
      console.log(
        `[fps] stress ${label} (cpu ×${throttleMs}, 4K@2x): raf ${r.rafFps}fps, engine ${r.enginePaintsPerSec} paints/s, breath ${r.breathOpenPct}%, DPR ≈ ${r.dpr}`,
      );
      await scdp2.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await sleep(2000);
    }

    await stressSample("baseline", 1);
    await stressSample("push1", 6);
    await stressSample("push2", 10);
    await stressSample("push3", 14);
    await spage.evaluate(() => window.clearInterval(window.__u7busTimer));
    await stress.close();
    await browser.close();
  } finally {
    preview.kill();
  }
  console.log("\n[fps] ladder rows:", JSON.stringify(rows, null, 2));
}

main().catch((error) => {
  console.error(`[fps] ${error?.message ?? error}`);
  process.exit(1);
});
