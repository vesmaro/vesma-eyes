#!/usr/bin/env node
/**
 * agents-redesign B2 visual acceptance shots (the host harnesses): collapsed
 * accordions, the EXPANDED workbench (all ExecutorSheetForm sections), the
 * mutation confirmations (revoke/delete), both themes, and 375. Frames ->
 * /var/home/abyss/.local/opt/design-shots/ar-b2-*.png.
 *
 * The revoke/delete CONFIRMATIONS ride window.confirm — the shots accept the
 * dialog and capture the POST-mutation state (the row leaves/changes), plus
 * one pre-confirm frame with the dialog itself where playwright can pin it
 * (dialog events are headless-invisible; the honest proof of the
 * confirmation is the test suite + the fact that the row SURVIVES until
 * accepted).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4193;
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

  /** Expand the FIRST harness accordion row of the field. */
  const expandFirst = async (page) => {
    await page
      .locator('[aria-label="Харнесы хоста"] button[aria-expanded="false"]')
      .first()
      .click();
    await sleep(500);
  };

  try {
    for (const theme of ["dark", "light"]) {
      // 1. Collapsed accordions (the glance row schema).
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
      });
      const p1 = await newPage(ctx, `${BASE}agents/hosts/laptop`, { theme });
      await write(p1, `ar-b2-collapsed-${theme}.png`);

      // 2. The expanded workbench (all sections): a TALL viewport — the
      //    frame is 100dvh, so height = how much workbench is visible.
      await p1.setViewportSize({ width: 1440, height: 1700 });
      await sleep(400);
      await expandFirst(p1);
      await write(p1, `ar-b2-expanded-${theme}.png`);
      await p1.close();
      await ctx.close();

      if (theme === "dark") {
        // 3. The pending host: expand → the approve + paste-back verify.
        const pctx = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          deviceScaleFactor: 1,
        });
        const p3 = await newPage(pctx, `${BASE}agents/hosts/new-host`, { theme });
        await expandFirst(p3);
        await write(p3, "ar-b2-approve-pending-dark.png");
        await p3.close();
        await pctx.close();

        // 4. The danger zone: revoke/delete WITH their native confirm —
        //    accept the dialog, capture the post-mutation registry state.
        const dctx = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          deviceScaleFactor: 1,
        });
        const p4 = await newPage(dctx, `${BASE}agents/hosts/old-host`, { theme });
        await expandFirst(p4);
        p4.on("dialog", (dialog) => {
          console.log(`[confirm] ${dialog.type()}: ${dialog.message().slice(0, 90)}`);
          void dialog.accept();
        });
        await p4.getByRole("button", { name: "Удалить" }).click();
        await sleep(1200);
        await write(p4, "ar-b2-delete-confirmed-dark.png");
        await p4.close();
        await dctx.close();

        // 5. 375: collapsed + expanded.
        const mctx = await browser.newContext({
          viewport: { width: 375, height: 900 },
          deviceScaleFactor: 1,
        });
        const p5 = await newPage(mctx, `${BASE}agents/hosts/laptop`, { theme });
        await write(p5, "ar-b2-mobile-375-dark.png");
        await p5.setViewportSize({ width: 375, height: 1700 });
        await sleep(400);
        await expandFirst(p5);
        await write(p5, "ar-b2-mobile-375-expanded-dark.png");
        await p5.close();
        await mctx.close();
      }
    }
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
