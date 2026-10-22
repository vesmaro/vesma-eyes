#!/usr/bin/env node
/**
 * kw2 visual acceptance shots (kora-rethink KW2 «Живой чат»): renders the
 * built viewer (dist-smoke, mock adapter) in real chromium and captures the
 * split-center frame map to ~/.local/opt/design-shots/kw2-*.png. States:
 * the cluster route (the chat header + the folded «Все ходы» strip), the
 * hermes session split, the deployed zone with today's transcript grammar,
 * the search mode (cut folds open, the honest counter), the model-404
 * verdict with the user's choice kept, the limiter verdict, EN parity,
 * the zcode mode B (no split), mobile 375, both themes. Same discipline as
 * hb-s3-shots.mjs.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

  /** The ONE manual pull. */
  const clickRefresh = async (page, label = "Обновить") => {
    await page.getByRole("button", { name: new RegExp(label) }).click();
    await sleep(1500);
  };

  /** The chat send. */
  const chatSend = async (page, text, sendLabel = "Отправить") => {
    await page.fill("#kora-hermes-chat-input", text);
    await sleep(200);
    await page.getByRole("button", { name: new RegExp(sendLabel) }).click();
    await sleep(1500);
  };

  /** Switch the app language (RU/EN toggle; the DOM text is lowercase). */
  const switchEn = async (page) => {
    await page.getByRole("button", { name: "en", exact: true }).click();
    await sleep(900);
  };

  /** Open a hermes session from the list (the IN-PAGE SPA link). */
  const openSession = async (page) => {
    await page.getByRole("link", { name: /hermes:api_server/ }).click();
    await sleep(1500);
  };

  /** Deploy the «Все ходы» zone (the strip toggle). */
  const expandMoves = async (page) => {
    await page.click('button[aria-controls="kora-moves-body"]');
    await sleep(900);
  };

  try {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });

    // 1. The CLUSTER route (light + dark): the reserved /kora/hermes — the
    // chat header (switcher + model + the real-time badge), the pulled
    // anchor line, the folded moves strip with its honest count.
    for (const theme of ["light", "dark"]) {
      const page = await newKoraPage(ctx, {
        theme,
        url: `${BASE}kora/hermes`,
      });
      await selectHermes(page);
      await clickRefresh(page);
      await shot(page, `kw2-cluster-split-1440-${theme}.png`);
      await page.close();
    }

    // 2. The hermes session split (K-HERMES-LIVE): the real chat + the
    // folded zone (the session's honest count «50+»).
    {
      const page = await newKoraPage(ctx, { url: `${BASE}kora/hermes` });
      await selectHermes(page);
      await clickRefresh(page);
      await openSession(page);
      await shot(page, "kw2-session-split-1440-light.png");
      await page.close();
    }

    // 3. The deployed zone: today's transcript grammar under the chat (the
    // ex-Пульт auto height ≤280, its own follow/search tools).
    {
      const page = await newKoraPage(ctx, { url: `${BASE}kora/hermes` });
      await selectHermes(page);
      await clickRefresh(page);
      await expandMoves(page);
      await shot(page, "kw2-moves-deployed-1440-light.png");
      await page.close();
    }

    // 4. K-MOVES-SEARCH: a match inside a cut fold opens it; the honest
    // counter rides the zone's toolbar.
    {
      const page = await newKoraPage(ctx, { url: `${BASE}kora/hermes` });
      await selectHermes(page);
      await clickRefresh(page);
      await expandMoves(page);
      await page.fill("#kora-moves-search", "журнал");
      await sleep(900);
      await shot(page, "kw2-moves-search-1440-light.png");
      await page.close();
    }

    // 5. The MODEL-404 verdict: the cluster refuses the chosen model; the
    // human reason rides the error line and the select KEEPS 70b.
    {
      const page = await newKoraPage(ctx, {
        url: `${BASE}kora/hermes?hermesChat=badmodel`,
      });
      await selectHermes(page);
      await clickRefresh(page);
      await page.selectOption("#kora-hermes-chat-model", "hermes-4.5-70b");
      await chatSend(page, "проверка отклонённой модели");
      await shot(page, "kw2-chat-model404-1440-light.png");
      await page.close();
    }

    // 6. The limiter verdict on the cluster route: the bare 429 voice, the
    // draft stays.
    {
      const page = await newKoraPage(ctx, {
        url: `${BASE}kora/hermes?hermesChat=limited`,
      });
      await selectHermes(page);
      await clickRefresh(page);
      await chatSend(page, "проверка лимитера чата");
      await shot(page, "kw2-chat-limited-1440-light.png");
      await page.close();
    }

    // 7. EN parity of the split.
    {
      const page = await newKoraPage(ctx, { url: `${BASE}kora/hermes` });
      await selectHermes(page);
      await clickRefresh(page);
      await switchEn(page);
      await chatSend(page, "Check the Mnemos memory federation", "Send");
      await shot(page, "kw2-cluster-split-1440-en.png");
      await page.close();
    }

    // 8. Mode B regression: a zcode session — the FULL-PAGE transcript, NO
    // split, the deferred-send composer.
    {
      const page = await newKoraPage(ctx);
      await page.getByRole("link", { name: /mnemos-mesh/ }).click();
      await sleep(1500);
      await shot(page, "kw2-zcode-modeb-1440-light.png");
      await page.close();
    }
    await ctx.close();

    // 9. Mobile 375: the split in the document flow (the chat, then the
    // folded strip; the ladder tuning is KW3 — nothing broken).
    const mctx = await browser.newContext({
      viewport: { width: 375, height: 720 },
      deviceScaleFactor: 1,
    });
    for (const theme of ["light", "dark"]) {
      const page = await newKoraPage(mctx, {
        theme,
        url: `${BASE}kora/hermes`,
      });
      await selectHermes(page);
      await clickRefresh(page);
      await chatSend(page, "Проверить узел mesh-3");
      await shot(page, `kw2-cluster-split-375-${theme}.png`);
      await page.close();
    }
    await mctx.close();
  } finally {
    await browser.close();
    preview.kill();
  }
  console.log(`[shots] done -> ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
