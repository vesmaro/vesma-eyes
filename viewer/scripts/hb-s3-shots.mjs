#!/usr/bin/env node
/**
 * hb-s3 visual acceptance shots (hermes-bridge slice 3 — transcript + chat,
 * T004): renders the built viewer (dist-smoke, mock adapter) in real
 * chromium and captures the final-bridge frame map to
 * ~/.local/opt/design-shots/hb-s3-*.png. States: the long transcript with
 * its load-more, the appended page; the clean-slate chat; the chat dialog
 * with the server's «hermes · real-time» marker; the limiter verdict; the
 * off bridge; EN parity; mobile 375; both themes. Same discipline as
 * hb-s2-shots.mjs.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VIEWER_DIR = resolve(import.meta.dirname, "..");
const PORT = 4194;
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

  /** A Kora page pinned to a theme (and the mock demo knobs in the query). */
  const newKoraPage = async (context, { theme = "light", url = `${BASE}kora` } = {}) => {
    const page = await context.newPage();
    await page.addInitScript((pin) => {
      try {
        localStorage.setItem("vesmaro.theme", pin);
      } catch {
        /* storage unavailable — theme falls back as usual */
      }
    }, theme);
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(1800);
    return page;
  };

  /** The ONE filter select → the hermes source context. */
  const selectHermes = async (page) => {
    await page.selectOption("#kora-host-filter", "hermes");
    await sleep(900);
  };

  /** The ONE manual pull (the hermes context refresh button; the label
   * follows the app language — the toggle persists across pages). */
  const clickRefresh = async (page, label = "Обновить") => {
    await page.getByRole("button", { name: new RegExp(label) }).click();
    await sleep(1500);
  };

  /** The chat send: type into the hermes composer, press the button (the
   * label follows the app language — RU «Отправить» / EN "Send"). */
  const chatSend = async (page, text, sendLabel = "Отправить") => {
    await page.fill("#kora-hermes-chat-input", text);
    await sleep(200);
    await page.getByRole("button", { name: new RegExp(sendLabel) }).click();
    await sleep(1500);
  };

  /** Switch the app language via the header RU/EN toggle. The button's
   * DOM text is lowercase ("en") — the caps look is CSS-only. */
  const switchEn = async (page) => {
    await page.getByRole("button", { name: "en", exact: true }).click();
    await sleep(900);
  };

  /** Open a hermes session from the list (the IN-PAGE SPA link — a fresh
   * goto would reload the mock adapter and honestly 404 instead). */
  const openSession = async (page) => {
    await page.getByRole("link", { name: /hermes:api_server/ }).click();
    await sleep(1500);
  };

  try {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });

    // 1. The long transcript + its cursor (light + dark): a hermes session
    // opened from the pulled list — roles, tool names, the redaction mark,
    // the honest «Показать ещё» end.
    for (const theme of ["light", "dark"]) {
      const page = await newKoraPage(ctx, { theme });
      await selectHermes(page);
      await clickRefresh(page);
      await openSession(page);
      await shot(page, `hb-s3-hermes-transcript-1440-${theme}.png`);
      await page.close();
    }

    // 2. The appended page: one load-more click serves the cursor's rest.
    {
      const page = await newKoraPage(ctx);
      await selectHermes(page);
      await clickRefresh(page);
      await openSession(page);
      await page.getByRole("button", { name: /Показать ещё/ }).click();
      await sleep(1200);
      await shot(page, "hb-s3-hermes-transcript-loadmore-1440-light.png");
      await page.close();
    }

    // 3. The clean-slate chat: hermes selected, NO pull — no api_server
    // anchor in the registry, the honest start message, the REAL send.
    {
      const page = await newKoraPage(ctx);
      await selectHermes(page);
      await shot(page, "hb-s3-hermes-chat-empty-1440-light.png");
      await page.close();
    }

    // 4. The chat dialog (light + dark): history from the api_server
    // session + one exchange carrying the server's real-time marker.
    for (const theme of ["light", "dark"]) {
      const page = await newKoraPage(ctx, { theme });
      await selectHermes(page);
      await clickRefresh(page);
      await chatSend(page, "Проверить работу федерации памяти Mnemos");
      await shot(page, `hb-s3-hermes-chat-dialog-1440-${theme}.png`);
      await page.close();
    }

    // 5. The limiter verdict: the demo knob answers the bare 429 voice and
    // the draft stays.
    {
      const page = await newKoraPage(ctx, { url: `${BASE}kora?hermesChat=limited` });
      await selectHermes(page);
      await clickRefresh(page);
      await chatSend(page, "проверка лимитера чата");
      await shot(page, "hb-s3-hermes-chat-limited-1440-light.png");
      await page.close();
    }

    // 6. The off bridge: the chat send answers the typed hermes_off reason.
    {
      const page = await newKoraPage(ctx, { url: `${BASE}kora?hermesBridge=off` });
      await selectHermes(page);
      await chatSend(page, "проверка офф-режима");
      await shot(page, "hb-s3-hermes-off-chat-1440-light.png");
      await page.close();
    }

    // 7. EN parity: the dialog in English (the same journey).
    {
      const page = await newKoraPage(ctx);
      await selectHermes(page);
      await clickRefresh(page);
      await switchEn(page);
      await chatSend(page, "Check the Mnemos memory federation", "Send");
      await shot(page, "hb-s3-hermes-chat-dialog-1440-en.png");
      await page.close();
    }

    // 8. The EN transcript (the read-only beat + tools in English). The
    // previous frame left lang=en persisted — the page loads in English.
    {
      const page = await newKoraPage(ctx);
      await selectHermes(page);
      await clickRefresh(page, "Refresh");
      await switchEn(page);
      await openSession(page);
      await shot(page, "hb-s3-hermes-transcript-1440-en.png");
      await page.close();
    }
    await ctx.close();

    // 9. Mobile 375 (light + dark): the chat owns the narrow center.
    const mctx = await browser.newContext({
      viewport: { width: 375, height: 720 },
      deviceScaleFactor: 1,
    });
    for (const theme of ["light", "dark"]) {
      const page = await newKoraPage(mctx, { theme });
      await selectHermes(page);
      await clickRefresh(page);
      await chatSend(page, "Проверить узел mesh-3");
      await shot(page, `hb-s3-hermes-chat-375-${theme}.png`);
      await page.close();
    }
    await mctx.close();
  } finally {
    await browser.close();
    preview.kill();
  }
  console.log(`[shots] done -> ${OUT}`);
}

main().catch((e) => {
  console.error(`[shots] ${e?.message ?? e}`);
  process.exit(1);
});
