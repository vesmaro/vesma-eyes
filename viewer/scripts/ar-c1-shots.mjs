#!/usr/bin/env node
/**
 * agents-redesign C1 visual acceptance shots (nav 1+1 + seams):
 * - the agents domain nav carries TWO sections (no «Подключить машину» row);
 * - the contextual connect entries (roster panel CTA, harnesses-section CTA,
 *   empty state);
 * - the route MISSIONS (each old path's landing: alias→hosts→first host,
 *   harnesses live, execution live, unknown host not-found);
 * - the mint deep-link CTA on the provision conveyor's done state;
 * - the kora seam BEFORE/AFTER frames are captured separately
 *   (ar-c1-kora-seam-before/after.png).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4195;
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

const CLOCK_SHIFT_INIT = `
  const SHIFT = Date.parse("2026-09-19T09:00:30Z") - Date.now();
  const OrigDate = Date;
  class ShiftedDate extends OrigDate {
    constructor(...args) {
      if (args.length === 0) super(OrigDate.now() + SHIFT);
      else super(...args);
    }
    static now() { return OrigDate.now() + SHIFT; }
  }
  window.Date = ShiftedDate;
`;

async function main() {
  const playwright = require("playwright");
  mkdirSync(OUT, { recursive: true });
  const preview = await startPreview();
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ["--disable-gpu", "--disable-lcd-text", "--font-render-hinting=none", "--force-color-profile=srgb"],
    ...(chromiumPath() ? { executablePath: chromiumPath() } : {}),
  });

  const write = async (page, name) => {
    const buf = await page.screenshot({ fullPage: true });
    writeFileSync(join(OUT, name), buf);
    console.log(`[shots] ${name}`);
  };

  const newPage = async (context, url, { theme = "dark", settle = 3000 } = {}) => {
    const page = await context.newPage();
    await page.addInitScript(`
      try { localStorage.setItem("vesmaro.theme", ${JSON.stringify(theme)}); } catch {}
      try { localStorage.setItem("vesmaro.lang", "ru"); } catch {}
    `);
    await page.addInitScript(CLOCK_SHIFT_INIT);
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(settle);
    try {
      await page.getByRole("button", { name: "Понятно" }).click({ timeout: 2000 });
      await sleep(300);
    } catch {
      /* no bubble this load */
    }
    return page;
  };

  try {
    // 1. The new nav: the agents domain expanded — TWO sections.
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const p1 = await newPage(ctx, `${BASE}agents/hosts/laptop`);
    await write(p1, "ar-c1-nav-two-sections.png");
    // 2. The contextual CTA: the harnesses-section header carries it now.
    await write(p1, "ar-c1-cta-contextual.png");
    await p1.close();
    await ctx.close();

    // 3. Mission landings.
    const mctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    // 3a. /agents/harnesses direct entry: the conveyor lives.
    const p3a = await newPage(mctx, `${BASE}agents/harnesses?connect=1`);
    await write(p3a, "ar-c1-mission-harnesses-live.png");
    // 3b. The conveyor's DONE state carries the mint deep-link «Открыть
    //     хост»: drive the happy form to done.
    // The real form selectors (u8-shots precedent): the read-driven mock
    // advances one phase per poll (~3s) — done lands in ~15-20s.
    await p3a.getByPlaceholder("vps-1.example").fill("vps-mint-1");
    await p3a.getByLabel("Имя исполнителя").fill("mint-box");
    // The client gate requires a STRICT https board address.
    await p3a
      .getByLabel(/Адрес борда для машины|Board address/)
      .fill("https://board.example");
    await p3a
      .locator("form textarea")
      .first()
      .fill("-----BEGIN OPENSSH PRIVATE KEY----- mint frame -----END OPENSSH PRIVATE KEY-----");
    await p3a.getByRole("button", { name: "Подключить", exact: true }).click();
    // The read-driven mock: the card polls every ~3s, one phase per poll —
    // done lands in ~15-25s; scroll the card into view for the frame.
    await sleep(25000);
    await p3a.getByText("Подключение по SSH").scrollIntoViewIfNeeded().catch(() => {});
    await write(p3a, "ar-c1-mint-deeplink-done.png");
    // The smoke adapter keeps state in PAGE MEMORY: a reload would wipe the
    // minted row. SPA-navigate to Хосты and back — the registry query
    // refetches on mount (the row lands in the cache), the conveyor
    // re-attaches the live job from sessionStorage.
    await p3a.click('a[href="/app/agents/hosts"]');
    await sleep(1500);
    await p3a.goBack();
    await sleep(2000);
    const openHost = p3a.getByRole("link", { name: "Открыть хост" });
    if (await openHost.count()) {
      await openHost.scrollIntoViewIfNeeded().catch(() => {});
      await openHost.click();
      await sleep(1500);
      await write(p3a, "ar-c1-mint-landed-host.png");
    } else {
      console.log("[shots] mint deep-link CTA not reached — check the job clock");
    }
    await p3a.close();
    await mctx.close();

    // 4. The execution mission (the second nav section still lands).
    const ectx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const p4 = await newPage(ectx, `${BASE}agents/execution`);
    await write(p4, "ar-c1-mission-execution.png");
    await p4.close();
    await ectx.close();
  } finally {
    await browser.close();
    preview.kill();
  }
  console.log(`[shots] done -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
