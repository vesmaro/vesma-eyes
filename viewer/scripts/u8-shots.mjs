#!/usr/bin/env node
/**
 * U8 visual acceptance shots (the wave's visual acceptance loop, step 1):
 * renders the built viewer (dist-smoke, mock adapter) in real chromium and
 * captures the acceptance frame map to ~/.local/opt/design-shots/u8-*.png.
 *
 * Frames: the three conveyors (connect: start / mid-install / verify /
 * resume-after-reload; task wizard: What / Whom / Review / step error /
 * restored draft), the enrollment dialog steps, mobile 375 baselines and
 * a reduced-motion pass. The mid-install frames ride the SAME sessionStorage
 * active-job record the real card uses (the honest cancel premise: the job
 * lives server-side, the card re-attaches on return).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4187;
const BASE = `http://localhost:${PORT}/app/`;
const OUT = process.argv[2] || "/var/home/abyss/.local/opt/design-shots";

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

/** A typed task-wizard draft (SAFE fields — the real keeper's shape). */
const TASK_DRAFT = JSON.stringify({
  version: 1,
  step: 0,
  savedAt: new Date().toISOString(),
  value: {
    text: "Собрать отчёт волны 2\nитоги и метрики — черновик пережил перезагрузку",
    project: "vesma-eyes",
    tags: "u8,отчёт",
    assignee: "queue",
    executorId: "",
    specialist: "",
    harness: "",
  },
});

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
  const playwright = require("playwright");
  mkdirSync(OUT, { recursive: true });
  const preview = await startPreview();
  const browser = await playwright.chromium.launch({
    headless: true,
    args: [
      "--disable-gpu",
      "--disable-lcd-text",
      "--font-render-hinting=none",
      "--force-color-profile=srgb",
    ],
    ...(chromiumPath() ? { executablePath: chromiumPath() } : {}),
  });

  const shot = async (page, name) => {
    const buf = await page.screenshot({ fullPage: true });
    writeFileSync(join(OUT, name), buf);
    console.log(`[shots] ${name}`);
  };

  const newPage = async (context) => {
    const page = await context.newPage();
    await page.goto("about:blank");
    return page;
  };

  try {
    // --- CONNECT CONVEYOR (1440) ------------------------------------------
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    {
      const page = await newPage(desktop);
      await page.goto(`${BASE}agents/harnesses?connect=1`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(2500);
      await shot(page, "u8-connect-start-1440.png");

      // Mid-install: drive the REAL form — the mock's read-driven state
      // machine mints the job on the POST and advances one phase per poll
      // (3s), so the funnel frames are the server's own stages.
      await page.getByPlaceholder("vps-1.example").fill("vps-1");
      await page.getByLabel(/Адрес борда для машины|Board address/).fill("https://board.example");
      await page.locator("form textarea").first()
        .fill("-----BEGIN OPENSSH PRIVATE KEY----- shot-frame -----END OPENSSH PRIVATE KEY-----");
      await page.getByRole("button", { name: /^Подключить$|^Connect$/ }).click();
      await sleep(1500);
      await shot(page, "u8-connect-install-1440.png");

      // The read-driven mock walks to DONE while the card polls — the rail
      // earns «Проверка», the paste-back unlocks on the fingerprint tail.
      await sleep(22000);
      await shot(page, "u8-connect-verify-1440.png");

      // Resume after reload: the card's own sessionStorage record re-attaches
      // the terminal job (the honest «карточка снова подхватит задачу»).
      await page.reload({ waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(3000);
      await shot(page, "u8-connect-resume-1440.png");
      await page.close();
    }
    await desktop.close();

    // --- CONNECT DRAFT RESTORE (the named banner, secrets re-asked) -------
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      await context.addInitScript((draft) => {
        window.localStorage.setItem("vesmaro.flow.provision", draft);
      }, JSON.stringify({
        version: 1,
        step: 0,
        savedAt: new Date().toISOString(),
        value: {
          host: "vps-draft.example",
          port: "22",
          name: "gpu-box",
          authKind: "key",
          harnessChoice: "",
          boardUrl: "http://localhost:4187",
        },
      }));
      const page = await newPage(context);
      await page.goto(`${BASE}agents/harnesses?connect=1`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(2500);
      await shot(page, "u8-connect-draft-restored-1440.png");
      await page.close();
      await context.close();
    }

    // --- ENROLLMENT CONVEYOR (1440) ---------------------------------------
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await newPage(context);
      await page.goto(`${BASE}agents/harnesses`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(2500);
      const enroll = page.getByRole("button", { name: /Добавить исполнителя|Add executor/i }).first();
      if (await enroll.count()) {
        await enroll.click();
        await sleep(1200);
      }
      await shot(page, "u8-enrollment-data-1440.png");
      await page.close();
      await context.close();
    }

    // --- TASK WIZARD (1440): What → Whom → Review, step error, draft ------
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await newPage(context);
      await page.goto(`${BASE}tasks/list?wizard=1`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(2500);
      await page.fill("#create-text", "Собрать отчёт волны 2\nитоги и метрики — черновик мастера");
      await page.fill("#create-project", "vesma-eyes");
      await shot(page, "u8-wizard-what-1440.png");

      const next = page.getByRole("button", { name: /Дальше|Next/ });
      await next.click();
      await sleep(600);
      // Step error: the direct hand-off refuses an empty specialist — the
      // wire's own rule mirrored before anything travels.
      const executorRadio = page.locator('input[name="create-assignee"]:not([disabled])').nth(1);
      await executorRadio.check();
      await sleep(400);
      await next.click();
      await sleep(600);
      await shot(page, "u8-wizard-step-error-1440.png");

      // Fill the specialist, pass to Review.
      await page.fill("#create-specialist", "SFE");
      await next.click();
      await sleep(600);
      await shot(page, "u8-wizard-review-1440.png");

      // Whom step mid-walk (queue default lit) — back on the rail.
      await page.locator("ol button").first().click();
      await sleep(600);
      await shot(page, "u8-wizard-whom-1440.png");
      await page.close();
      await context.close();
    }

    // --- RESUME AFTER RELOAD (draft restore banner) ------------------------
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      await context.addInitScript((draft) => {
        window.localStorage.setItem("vesmaro.flow.taskcreate", draft);
      }, TASK_DRAFT);
      const page = await newPage(context);
      await page.goto(`${BASE}tasks/list?wizard=1`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(2500);
      await shot(page, "u8-wizard-draft-restored-1440.png");
      await page.close();
      await context.close();
    }

    // --- MOBILE 375 baselines ---------------------------------------------
    {
      const mobile = await browser.newContext({
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 1,
      });
      const page = await newPage(mobile);
      await page.goto(`${BASE}agents/harnesses?connect=1`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(2500);
      await shot(page, "u8-connect-mobile-375.png");

      await page.goto(`${BASE}tasks/list?wizard=1`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(2500);
      await shot(page, "u8-wizard-mobile-375.png");
      await page.close();
      await mobile.close();
    }

    // --- REDUCED MOTION pass ----------------------------------------------
    {
      const reduced = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
      });
      const page = await newPage(reduced);
      await page.goto(`${BASE}agents/harnesses?connect=1`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(2500);
      await shot(page, "u8-connect-reduced-1440.png");
      await page.close();
      await reduced.close();
    }
  } finally {
    await browser.close();
    preview.kill();
  }
  console.log("[shots] done");
}

main().catch((error) => {
  console.error(`[shots] ${error?.message ?? error}`);
  process.exit(1);
});
