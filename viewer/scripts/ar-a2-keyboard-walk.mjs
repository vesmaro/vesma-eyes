#!/usr/bin/env node
/**
 * agents-redesign A2 KEYBOARD WALKTHROUGH (the acceptance artifact): drives
 * the built viewer (dist-smoke, mock adapter) with the keyboard ONLY and
 * records every step — the key pressed, the URL, the focused element, the
 * listbox highlight — to /var/home/abyss/.local/opt/design-shots/ar-a2-keyboard-walk.log
 * plus two mid-walk screenshots (ar-a2-keyboard-walk-*.png).
 *
 * The walk mirrors the real geometry:
 * - md band (1024): the panel is display-none <xl, so the roster's
 *   keyboard path is Tab → the sheet trigger → Enter (the sheet mounts
 *   with the LIST focused) → ArrowDown/j/k → Enter (sheet closes, the host
 *   field opens, focus lands on the field title) → reopen → Escape closes.
 * - xl (1440): the INLINE panel listbox is a direct tab stop — the same
 *   arrow/Enter path without any overlay.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4189;
const BASE = `http://localhost:${PORT}/app/`;
const OUT = process.argv[2] || "/var/home/abyss/.local/opt/design-shots";
const LOG = join(OUT, "ar-a2-keyboard-walk.log");

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
    args: ["--disable-gpu", "--font-render-hinting=none", "--force-color-profile=srgb"],
    ...(chromiumPath() ? { executablePath: chromiumPath() } : {}),
  });

  const lines = [];
  const log = (line) => {
    lines.push(line);
    console.log(`[walk] ${line}`);
  };

  /** Boot one context at a viewport; RU, dark, corpus clock. */
  const boot = async (width, height) => {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.addInitScript(`
      try { localStorage.setItem("vesmaro.theme", "dark"); } catch {}
      try { localStorage.setItem("vesmaro.lang", "ru"); } catch {}
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
    `);
    await page.goto(`${BASE}agents/hosts`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(2500);
    await page
      .getByRole("button", { name: "Понятно" })
      .click({ timeout: 2000 })
      .catch(() => {});
    return { context, page };
  };

  const describeFocus = (page) =>
    page.evaluate(() => {
      const el = document.activeElement;
      if (el === null) return "none";
      const id = el.id ? `#${el.id}` : "";
      const role = el.getAttribute?.("role");
      const label = el.getAttribute?.("aria-label");
      const text = (el.textContent ?? "").trim().slice(0, 36);
      return `${el.tagName.toLowerCase()}${id}${role ? `[role=${role}]` : ""}${
        label ? `[${label}]` : text ? ` «${text}»` : ""
      }`;
    });
  const highlight = (page) =>
    page.evaluate(() => {
      const list = document.activeElement?.getAttribute?.("role") === "listbox"
        ? document.activeElement
        : null;
      const id = list?.getAttribute("aria-activedescendant");
      if (!id) return "-";
      const opt = document.getElementById(id);
      return opt
        ? `#${id.replace(/^[^-]+-opt-/, "")} «${(opt.textContent ?? "").trim().slice(0, 44)}»`
        : `#${id}`;
    });
  const snapshot = async (page, step, key) => {
    const url = await page.evaluate(() => location.pathname);
    const focus = await describeFocus(page);
    const hl = await highlight(page);
    log(`${step.padEnd(44)} key=${(key ?? "-").padEnd(10)} url=${url.replace("/app", "").padEnd(16)} focus=${focus.padEnd(64)} highlight=${hl}`);
  };
  /** Tab until the predicate over the active element says stop. */
  const tabHunt = async (page, predicate, max = 80) => {
    for (let i = 0; i < max; i += 1) {
      if (await page.evaluate(predicate)) return i;
      await page.keyboard.press("Tab");
      await sleep(50);
    }
    return -1;
  };
  /** The roster sheet trigger predicate: a BUTTON labelled «Ростер · N»
   * (body.textContent contains everything — never a match target). */
  const isRosterTrigger = () =>
    document.activeElement?.tagName === "BUTTON" &&
    (document.activeElement.textContent ?? "").trim().startsWith("Ростер · ");

  try {
    // ── A. The md band (1024): the sheet IS the roster's keyboard path. ──
    log("=== A. md band 1024 — the roster via the SHEET ===");
    const { context: ctxA, page: md } = await boot(1024, 800);
    log("STEP 0 load /agents/hosts (redirects to the first host)".padEnd(44));
    await snapshot(md, "  after load");

    const tabs = await tabHunt(
      md,
      isRosterTrigger,
    );
    log(`STEP 1 Tab ×${tabs + 1} → the roster sheet trigger`.padEnd(44));
    await snapshot(md, "  trigger focused", "Tab");

    await md.keyboard.press("Enter");
    await sleep(600);
    const sheetOpen = await md.evaluate(
      () => document.querySelector("[role='dialog']") !== null,
    );
    log(`STEP 2 Enter opens the sheet: ${sheetOpen ? "PASS" : "FAIL"}`.padEnd(44));
    const focusInList = await md.evaluate(
      () => document.activeElement?.getAttribute?.("role") === "listbox",
    );
    log(`  initial focus INSIDE the listbox: ${focusInList ? "PASS" : "FAIL"}`);
    await snapshot(md, "  sheet list focused (autofocus)");
    await md.screenshot({
      fullPage: true,
      path: join(OUT, "ar-a2-keyboard-walk-sheet.png"),
    });

    await md.keyboard.press("ArrowDown");
    await sleep(120);
    await snapshot(md, "  highlight ↓", "ArrowDown");
    await md.keyboard.press("j");
    await sleep(120);
    await snapshot(md, "  highlight (vim down)", "j");
    await md.keyboard.press("k");
    await sleep(120);
    await snapshot(md, "  highlight (vim up)", "k");

    await md.keyboard.press("Enter");
    await sleep(500);
    await snapshot(md, "STEP 3 Enter → sheet closed, host opened".padEnd(44), "Enter");
    const sheetClosed = await md.evaluate(
      () => document.querySelector("[role='dialog']") === null,
    );
    const focusIsTitle = await md.evaluate(
      () => document.activeElement?.id === "agents-host-title",
    );
    log(`  sheet closed: ${sheetClosed ? "PASS" : "FAIL"}; focus on the field title: ${focusIsTitle ? "PASS" : "FAIL"}`);

    // 4. Reopen → Escape closes.
    const tabs2 = await tabHunt(
      md,
      isRosterTrigger,
    );
    await md.keyboard.press("Enter");
    await sleep(600);
    await md.keyboard.press("Escape");
    await sleep(400);
    const closedByEsc = await md.evaluate(
      () => document.querySelector("[role='dialog']") === null,
    );
    log(`STEP 4 (Tab ×${tabs2 + 1} reopen) Escape closes the sheet: ${closedByEsc ? "PASS" : "FAIL"}`.padEnd(44));
    await snapshot(md, "  after Escape", "Escape");
    await ctxA.close();

    // ── B. xl (1440): the INLINE panel listbox, no overlay. ──
    log("=== B. xl 1440 — the inline PANEL listbox ===");
    const { context: ctxB, page: xl } = await boot(1440, 900);
    const tabs3 = await tabHunt(
      xl,
      () => document.activeElement?.getAttribute?.("role") === "listbox",
    );
    log(`STEP 5 Tab ×${tabs3 + 1} → the inline roster listbox`.padEnd(44));
    await snapshot(xl, "  panel listbox focused", "Tab");
    await xl.keyboard.press("ArrowDown");
    await sleep(120);
    await snapshot(xl, "  highlight ↓", "ArrowDown");
    await xl.keyboard.press("Enter");
    await sleep(500);
    await snapshot(xl, "STEP 6 Enter → host opened".padEnd(44), "Enter");
    const focusIsTitleXl = await xl.evaluate(
      () => document.activeElement?.id === "agents-host-title",
    );
    log(`  focus on the field title: ${focusIsTitleXl ? "PASS" : "FAIL"}`);
    await xl.screenshot({
      fullPage: true,
      path: join(OUT, "ar-a2-keyboard-walk-field.png"),
    });
    await ctxB.close();

    writeFileSync(LOG, lines.join("\n") + "\n");
    console.log(`[walk] log -> ${LOG}`);
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
