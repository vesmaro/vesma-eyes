#!/usr/bin/env node
/**
 * kora-w3 visual acceptance (kora-ide contract В3, the tree v3 + the dock
 * context filter + В3a models). Same discipline as kora-w2-shots.mjs: the
 * built viewer (dist-smoke, mock adapter) in real chromium. At EACH gate
 * width (1920 / 1280 / 1024 — the brief's ladder): the frame with the
 * RIGHT panel's tree v3 — the zcode harness branch OPENED (model rows with
 * the provider badge, the honest health dots) — plus the dock CONTEXT
 * state (the harness click's route: the narrowed rows + the filter line).
 * DOM NUMBERS (counts + texts) go to kora-w3-dom.txt.
 *
 * Usage (from viewer/):
 *   VITE_ADAPTER=mock npx vite build --outDir dist-smoke   # once
 *   node scripts/kora-w3-shots.mjs [/path/to/shots-dir]
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4199;
const BASE = `http://localhost:${PORT}/app/`;
const OUT =
  process.argv[2] || "/var/home/abyss/.local/opt/design-shots/kora-w3";

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

  const numbers = { widths: {} };
  const shots = [];
  try {
    for (const width of [1920, 1280, 1024]) {
      const context = await browser.newContext({
        viewport: { width, height: Math.round(width * 0.5625) },
        deviceScaleFactor: 1,
      });
      const w = {};

      // ── The frame with the tree v3: the laptop zcode branch OPENED ─────
      //    The built mock's registry is the BOARD one (MOCK_EXECUTORS):
      //    exec-laptop-zcode (online) + exec-laptop-hermes (stale → the
      //    honest «не сообщает») on host laptop. Expand the HOST branch
      //    first — harness chevrons exist only inside it.
      const page = await context.newPage();
      await page.goto(`${BASE}kora`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await sleep(1800);
      const hostChevron = page
        .locator('button[aria-controls^="kora-tree-host-laptop-"]');
      await hostChevron.first().click();
      await sleep(500);
      const agentChevron = page
        .locator('button[aria-controls^="kora-tree-agent-exec-laptop-zcode"]');
      w.agentChevrons = await page
        .locator('button[aria-controls^="kora-tree-agent-"]')
        .count();
      await agentChevron.first().click();
      await sleep(600);
      w.modelRows = await page
        .locator('ul[id^="kora-tree-agent-exec-laptop-zcode"] > li')
        .count();
      w.modelRowTexts = await page
        .locator('ul[id^="kora-tree-agent-exec-laptop-zcode"] > li')
        .allTextContents();
      w.healthWords = await page
        .locator("span.sr-only")
        .allTextContents();
      w.unknownModelLines = await page
        .getByText(/модели (не сообщаются|: загрузка…)/)
        .count();
      // The built app mounts under the /app basename — match by the path
      // SIGNATURE, not a ^="/kora" prefix.
      w.treeAgentLinks = await page
        .locator('a[href*="/kora/host/"][href*="agent="]')
        .count();
      w.dockRows = await page
        .locator(
          "aside[aria-label='Сессии'] a[href*='/kora/']:not([href*='/kora/host/'])",
        )
        .count();
      await page.screenshot({ path: join(OUT, `kora-w3-tree-${width}.png`) });
      shots.push(`kora-w3-tree-${width}.png`);

      // ── The dock CONTEXT state: the tree's harness click rides the
      //    route — the context line names the harness; the kora-session
      //    mock universe carries no exec-laptop-* rows, so the narrowed
      //    dock reads the HONEST K-DOCK-FILTERED-EMPTY with the one-click
      //    way out (the narrowing-with-rows behavior is pinned by the
      //    KoraDock.context / KoraWorkspace.w3 suites).
      const contextPage = await context.newPage();
      await contextPage.goto(
        `${BASE}kora/host/laptop?agent=exec-laptop-zcode`,
        { waitUntil: "load" },
      );
      await contextPage.evaluate(() => document.fonts.ready);
      await sleep(1800);
      w.contextDockRows = await contextPage
        .locator(
          "aside[aria-label='Сессии'] a[href*='/kora/']:not([href*='/kora/host/'])",
        )
        .count();
      w.contextLine = (
        await contextPage
          .locator("aside[aria-label='Сессии'] p[role='status']")
          .textContent()
      )?.trim();
      w.contextEmptyText = (
        await contextPage
          .locator("aside[aria-label='Сессии']")
          .textContent()
      )?.includes("Под этот фильтр сессий нет");
      w.contextClearLink = await contextPage
        .locator("aside[aria-label='Сессии'] a[href$='/kora']")
        .count();
      w.contextBar = (
        await contextPage.locator("p.truncate.font-mono.text-xs").first().textContent()
      )?.trim();
      await contextPage.screenshot({
        path: join(OUT, `kora-w3-dock-context-${width}.png`),
      });
      shots.push(`kora-w3-dock-context-${width}.png`);

      await page.close();
      await contextPage.close();
      await context.close();
      numbers.widths[String(width)] = w;
    }
    writeFileSync(
      join(OUT, "kora-w3-dom.txt"),
      JSON.stringify(numbers, null, 2) + `\nshots: ${shots.join(", ")}\n`,
    );
    console.log("[shots] DOM numbers:", JSON.stringify(numbers, null, 2));
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
