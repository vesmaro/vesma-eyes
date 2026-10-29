#!/usr/bin/env node
/**
 * kora-w2 visual acceptance (kora-ide contract В2, the composer selector
 * row + the В2 context bar + the В2a specialist roster). Same discipline
 * as kw3-shots.mjs: the built viewer (dist-smoke, mock adapter) in real
 * chromium. Screens: the selector row CLOSED on a live zcode session,
 * each dropdown OPEN (харнес / специалист / режим), the specialist CHOSEN
 * (the local annotation visible in the trigger + the context bar), the
 * DEAD session (the row disabled with the field), the hermes cluster
 * (the context bar's model segment from the real roster). Plus DOM
 * NUMBERS (counts + aria states) written to kora-w2-dom.txt.
 *
 * Usage (from viewer/):
 *   VITE_ADAPTER=mock npx vite build --outDir dist-smoke   # once
 *   node scripts/kora-w2-shots.mjs [/path/to/shots-dir]
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4198;
const BASE = `http://localhost:${PORT}/app/`;
const OUT =
  process.argv[2] || "/var/home/abyss/.local/opt/design-shots/kora-w2";

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

  const numbers = {};
  const shots = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const shot = async (page, name) => {
      const buf = await page.screenshot();
      writeFileSync(join(OUT, name), buf);
      shots.push(name);
      console.log(`[shots] ${name}`);
    };
    const gotoSession = async (id, theme = "light") => {
      const page = await context.newPage();
      await page.addInitScript((pin) => {
        try {
          localStorage.setItem("vesmaro.theme", pin);
        } catch {
          /* storage unavailable — theme falls back as usual */
        }
      }, theme);
      await page.goto(`${BASE}kora/${encodeURIComponent(id)}`, {
        waitUntil: "load",
      });
      await page.evaluate(() => document.fonts.ready);
      await sleep(1800);
      return page;
    };

    const LIVE = "exec-zcode-main:sess_7f3a91"; // live zcode (mock fixture)
    const DEAD = "exec-pi-edge:pi-2209-04"; // dead pi (mock fixture)

    // ── 1. The selector row, closed (light) ────────────────────────────
    const live = await gotoSession(LIVE);
    const controls = live.locator('[data-testid="kora-composer-controls"]');
    numbers.controlsPresent = (await controls.count()) === 1;
    numbers.controlsAriaDisabled =
      await controls.getAttribute("aria-disabled");
    numbers.modelSlotText = (
      await live.locator('[data-testid="kora-sel-model"]').textContent()
    )?.trim();
    numbers.composerRelayOffNote = (
      await live.textContent("#kora-composer-note")
    )?.trim();
    numbers.contextBarLive = (
      await live.locator("p.truncate.font-mono.text-xs").first().textContent()
    )?.trim();
    await shot(live, "kora-w2-composer-live.png");

    // ── 2. The harness menu open ───────────────────────────────────────
    await live.click('[data-testid="kora-sel-harness-trigger"]');
    await sleep(400);
    numbers.harnessMenuExpanded =
      (await live
        .locator('[data-testid="kora-sel-harness-trigger"]')
        .getAttribute("aria-expanded")) === "true";
    numbers.harnessMenuItems = await live
      .locator('[data-testid="kora-sel-harness-menu"] [role="menuitem"]')
      .count();
    numbers.harnessMenuCurrent = (await live
      .locator('[data-testid="kora-sel-harness-menu"] [aria-current="true"]')
      .textContent())?.trim();
    await shot(live, "kora-w2-menu-harness.png");
    await live.keyboard.press("Escape");
    await sleep(250);

    // ── 3. The specialist menu open (roster from the mock В2a leg) ────
    await live.click('[data-testid="kora-sel-specialist-trigger"]');
    await sleep(400);
    numbers.specialistTriggerText = (
      await live
        .locator('[data-testid="kora-sel-specialist-trigger"]')
        .textContent()
    )?.trim();
    numbers.specialistMenuRadio = await live
      .locator('[data-testid="kora-sel-specialist-menu"] [role="menuitemradio"]')
      .count();
    numbers.specialistLocalNote = (
      await live.textContent("#kora-sel-specialist-menu")
    )?.includes("Локальная пометка");
    await shot(live, "kora-w2-menu-specialist.png");

    // ── 4. Choose a specialist → trigger + context bar carry it ────────
    await live
      .locator('[data-testid="kora-sel-specialist-menu"] button', {
        hasText: "@GCW: Tech Lead",
      })
      .click();
    await sleep(500);
    numbers.specialistChosenTrigger = (
      await live
        .locator('[data-testid="kora-sel-specialist-trigger"]')
        .textContent()
    )?.trim();
    numbers.contextBarAfterChoice = (
      await live.locator("p.truncate.font-mono.text-xs").first().textContent()
    )?.trim();
    numbers.specialistPersisted = await live.evaluate(
      () => localStorage.getItem("vesmaro.koraSpecialist:exec-zcode-main:sess_7f3a91"),
    );
    await shot(live, "kora-w2-specialist-chosen.png");
    await live.close();

    // ── 5. The mode menu open (fresh page; yolo disabled) ──────────────
    const mode = await gotoSession(LIVE);
    await mode.click('[data-testid="kora-sel-mode-trigger"]');
    await sleep(400);
    numbers.modeMenuItems = await mode
      .locator('[data-testid="kora-sel-mode-menu"] [role="menuitem"]')
      .count();
    numbers.yoloDisabled = (await mode
      .locator('[data-testid="kora-sel-mode-menu"] [aria-disabled="true"]')
      .textContent())?.trim();
    numbers.yoloReason = (
      await mode.textContent("#kora-sel-mode-menu")
    )?.trim();
    await shot(mode, "kora-w2-menu-mode.png");
    await mode.close();

    // ── 6. The dead session: the row disabled with the field ───────────
    const dead = await gotoSession(DEAD);
    numbers.deadControlsDisabled =
      (await dead
        .locator('[data-testid="kora-sel-harness-trigger"]')
        .getAttribute("disabled")) !== null;
    numbers.deadFieldDisabled = await dead.evaluate(
      () => document.querySelector("#kora-composer-input")?.disabled === true,
    );
    numbers.deadNote = (
      await dead.textContent("#kora-composer-note")
    )?.trim();
    await shot(dead, "kora-w2-dead.png");
    await dead.close();

    // ── 7. The hermes cluster: the context bar's model segment ─────────
    const hermes = await gotoSession("hermes");
    numbers.contextBarHermes = (
      await hermes.locator("p.truncate.font-mono.text-xs").first().textContent()
    )?.trim();
    await shot(hermes, "kora-w2-hermes-cluster-bar.png");
    await hermes.close();

    writeFileSync(
      join(OUT, "kora-w2-dom.txt"),
      JSON.stringify(numbers, null, 2) +
        `\nshots: ${shots.join(", ")}\n`,
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
