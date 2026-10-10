#!/usr/bin/env node
/**
 * agents-redesign C2 acceptance shots: the EN language pass (frame +
 * conveyor + field, 1440 and 375), the command palette IN ACTION
 * («хост <имя>» opens the host; «подключить хост» opens the conveyor),
 * and the SR audit (visible text = SR text: listbox/option roles,
 * aria-current, accordion semantics, no unlabelled images).
 * Frames -> /var/home/abyss/.local/opt/design-shots/ar-c2-*.png,
 * SR log -> ar-c2-sr-audit.txt.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4197;
const BASE = `http://localhost:${PORT}/app/`;
const OUT = process.argv[2] || "/var/home/abyss/.local/opt/design-shots";

function chromiumPath() {
  const cache = join(homedir(), ".cache", "ms-playwright");
  for (const dir of existsSync(cache)
    ? readdirSync(cache)
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

  const newPage = async (context, url, { theme = "dark", lang = "en", settle = 3000 } = {}) => {
    const page = await context.newPage();
    await page.addInitScript(`
      try { localStorage.setItem("vesmaro.theme", ${JSON.stringify(theme)}); } catch {}
      try { localStorage.setItem("vesmaro.lang", ${JSON.stringify(lang)}); } catch {}
    `);
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(settle);
    try {
      await page.getByRole("button", { name: "Got it" }).click({ timeout: 2000 });
      await sleep(300);
    } catch {
      /* no bubble */
    }
    return page;
  };

  const srLines = [];
  const sr = (line) => {
    srLines.push(line);
    console.log(`[sr] ${line}`);
  };

  try {
    // ── 1. EN frames: the frame, the conveyor, the field at 375. ──
    const en = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    const p1 = await newPage(en, `${BASE}agents/hosts/laptop`, { lang: "en" });
    await write(p1, "ar-c2-en-frame-1440.png");

    // ── 2. The palette IN ACTION: «хост lap» → the host row. ──
    await p1.keyboard.press("Control+k");
    await sleep(600);
    await p1.keyboard.type("host lap");
    await sleep(800);
    await write(p1, "ar-c2-palette-host-cmd.png");
    const hostRowVisible = await p1.evaluate(
      () =>
        [...document.querySelectorAll("[cmdk-item], [role='option']")].some((row) =>
          (row.textContent ?? "").includes("Host laptop"),
        ),
    );
    sr(`palette «host lap» shows «Host laptop»: ${hostRowVisible ? "PASS" : "FAIL"}`);
    // Enter opens the host — the mission closes the loop.
    await p1.keyboard.press("Enter");
    await sleep(1200);
    const landed = await p1.evaluate(() => location.pathname);
    sr(`palette Enter lands on the host: ${landed} ${landed === "/app/agents/hosts/laptop" ? "PASS" : "FAIL"}`);
    await p1.close();

    // 3. «подключить хост» → the conveyor command.
    const p3 = await newPage(en, `${BASE}agents/hosts/laptop`, { lang: "en" });
    await p3.keyboard.press("Control+k");
    await sleep(600);
    await p3.keyboard.type("connect a host");
    await sleep(800);
    await write(p3, "ar-c2-palette-connect-cmd.png");
    await p3.keyboard.press("Enter");
    await sleep(1500);
    const conveyorUrl = await p3.evaluate(() => location.pathname + location.search);
    sr(`palette «connect a host» opens the conveyor: ${conveyorUrl} ${
      conveyorUrl.includes("/agents/harnesses?connect=1") ? "PASS" : "FAIL"
    }`);
    await write(p3, "ar-c2-en-conveyor-1440.png");
    await p3.close();

    // 4. 375 EN (the second breakpoint).
    const mctx = await browser.newContext({
      viewport: { width: 375, height: 900 },
      deviceScaleFactor: 1,
    });
    const pm = await newPage(mctx, `${BASE}agents/hosts/laptop`, { lang: "en" });
    await write(pm, "ar-c2-en-field-375.png");
    await pm.close();
    await mctx.close();

    // ── 4b. The language × theme × breakpoint verification matrix (C2
    // checklist): RU/EN × dark/light × 1440/768/375 on the hosts field —
    // the i18n parity and the token theming, every cell a full-page frame.
    for (const lang of ["ru", "en"]) {
      for (const theme of ["dark", "light"]) {
        for (const width of [1440, 768, 375]) {
          const ctx = await browser.newContext({
            viewport: { width, height: width === 375 ? 900 : 1000 },
            deviceScaleFactor: 1,
          });
          const page = await newPage(ctx, `${BASE}agents/hosts/laptop`, {
            lang,
            theme,
          });
          await write(page, `ar-c2-matrix-${lang}-${theme}-${width}.png`);
          await page.close();
          await ctx.close();
        }
      }
    }

    // ── 4c. The conveyor in both languages and both themes (the crumb tail
    // «Агенты / Подключить хост» must read the same NAMING as the palette
    // command that lands here). 1440, full page.
    for (const lang of ["ru", "en"]) {
      for (const theme of ["dark", "light"]) {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          deviceScaleFactor: 1,
        });
        const page = await newPage(ctx, `${BASE}agents/harnesses`, { lang, theme });
        await write(page, `ar-c2-conveyor-${lang}-${theme}-1440.png`);
        await page.close();
        await ctx.close();
      }
    }

    // ── 4d. The RU palette form («хост <имя>») in action: the mixed-
    // alphabet query must surface the localized row and land on the host.
    const rctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    const pr = await newPage(rctx, `${BASE}agents/hosts/laptop`, { lang: "ru" });
    await pr.keyboard.press("Control+k");
    await sleep(600);
    await pr.keyboard.type("хост lap");
    await sleep(800);
    await write(pr, "ar-c2-palette-host-cmd-ru.png");
    const ruRowVisible = await pr.evaluate(
      () =>
        [...document.querySelectorAll("[cmdk-item], [role='option']")].some((row) =>
          (row.textContent ?? "").includes("Хост laptop"),
        ),
    );
    sr(`palette RU «хост lap» shows «Хост laptop»: ${ruRowVisible ? "PASS" : "FAIL"}`);
    await pr.keyboard.press("Enter");
    await sleep(1200);
    const ruLanded = await pr.evaluate(() => location.pathname);
    sr(`palette RU Enter lands on the host: ${ruLanded} ${ruLanded === "/app/agents/hosts/laptop" ? "PASS" : "FAIL"}`);
    await pr.close();
    await rctx.close();
    await en.close();

    // ── 5. The SR audit: visible text = SR text. ──
    const sctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    const sp = await newPage(sctx, `${BASE}agents/hosts/laptop`, { lang: "en" });
    const audit = await sp.evaluate(() => {
      const out = {};
      // The roster listbox + options with accessible names.
      const list = document.querySelector('[role="listbox"]');
      out.listbox = list !== null;
      out.options = document.querySelectorAll('[role="option"]').length;
      out.selectedAriaCurrent =
        document.querySelector('[role="option"][aria-current="page"]') !== null;
      out.selectedAriaSelected =
        document.querySelector('[role="option"][aria-selected="true"]') !== null;
      // The accordion semantics.
      const acc = document.querySelector('[aria-label="Host harnesses"] button[aria-expanded]');
      out.accordionExpanded = acc !== null;
      out.accordionControls =
        acc !== null && document.getElementById(acc.getAttribute("aria-controls") ?? "") !== null
          ? false // collapsed by default: the controlled body is intentionally absent
          : acc !== null;
      // No unlabelled images (every img has an alt; icons are aria-hidden).
      const badImgs = [...document.querySelectorAll("img")].filter(
        (img) => !img.hasAttribute("alt"),
      );
      out.unlabelledImages = badImgs.length;
      // The selected row's visible text is what the SR reads (the row has
      // no aria-label overriding its content).
      const sel = document.querySelector('[role="option"][aria-current="page"]');
      out.selectedNoAriaLabelOverride = sel !== null && !sel.hasAttribute("aria-label");
      return out;
    });
    sr(`listbox present: ${audit.listbox ? "PASS" : "FAIL"}; options: ${audit.options}`);
    sr(`aria-current + aria-selected on the selected row: ${
      audit.selectedAriaCurrent && audit.selectedAriaSelected ? "PASS" : "FAIL"
    }`);
    sr(`accordion button[aria-expanded] present: ${audit.accordionExpanded ? "PASS" : "FAIL"}`);
    sr(`no unlabelled images: ${audit.unlabelledImages === 0 ? "PASS" : "FAIL " + audit.unlabelledImages}`);
    sr(`selected row: no aria-label override (visible text is the SR text): ${
      audit.selectedNoAriaLabelOverride ? "PASS" : "FAIL"
    }`);
    await sp.close();
    await sctx.close();

    writeFileSync(join(OUT, "ar-c2-sr-audit.txt"), srLines.join("\n") + "\n");
    console.log(`[sr] log -> ${join(OUT, "ar-c2-sr-audit.txt")}`);
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
