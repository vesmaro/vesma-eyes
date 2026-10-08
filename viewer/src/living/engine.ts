/**
 * The living-layer engine (ME-071 W1a «Живой фон») — lazy chunk
 * `living-extra` (budget ≤4 KiB gzip, 15-WOW §14.3.7); tone logic lives in
 * the separate `web-tones` chunk. KEEP THIS CHUNK LEAN: every byte here is
 * measured by scripts/budget-check.mjs — short internal property names are
 * deliberate (minifiers cannot mangle object literal keys); the comments
 * are free (stripped before compression).
 *
 * WHAT: one fixed canvas under ALL content (z -10) drawing the organism's
 * veins — the REAL seams of the Shell (owner directive 2026-10-01: the
 * background is alive across the full width, not a flat fill):
 *   Ж1 topbar spine (h, full width) · Ж2 sidebar contour (v) · Ж3 crumbs
 *   seam (h). Seam elements carry `data-living-seam`; geometry is measured,
 *   never copied from the stand.
 * HOW (canon):
 *   - Breathing = a slow sheen travelling along each vein — U2 honesty of
 *     light (SPEC-2026-10-07: «первое дыхание из шины; шина молчит — экран
 *     стоит»): a REAL bus event opens ONE breath window (--duration-breath),
 *     and ONLY inside it does the sheen travel (supersedes the W1a
 *     always-on reading of SUPERSEDE 14.1; the 5-second honesty gate is the
 *     wave's acceptance). After the window the veins rest ≥
 *     --duration-breath-rest (duty ≤25%); events keep toning the static
 *     drawing. Any input freezes instantly (the ≤80ms law).
 *   - Base tone from real health; event tones per §14.6.1 (chunk web-tones);
 *     the tone colours the vein glow, the structure stays myelin.
 *   - Impulses (Полный only): a real bus event spawns a bead running along
 *     a deterministic vein at 600px/s, trail decays 1.5s (08 §2.2);
 *     ≤2 alive, extra events only feed tones (coalesce).
 *   - Anti-fake: muted → strictly neutral hairlines, zero impulses.
 * HYGIENE: one RAF — alive ONLY inside a breath window or while beads are
 *   travelling; paused on document.hidden; DPR ≤2 (degrades to 1.5 on
 *   slow frames, <45fps → static); prefers-reduced-motion / vesmaro.motion
 *   → a static drawing with no animation; every subscription/observer is
 *   torn down by the returned destructor (StrictMode-safe).
 */

import { getLiveLayer, subscribeLiveLayer } from "@/lib/liveLayerStore";
import { isLivingMuted, subscribeLiving, type LivingSignal } from "@/lib/livingFeed";
import { createBreath, createTones, isBusServiceKind } from "./tones";

const TAU = Math.PI * 2;
const SPEED = 0.6; // px/ms — vein courier speed (08 §2.2: 600px/s)
const TRAIL = 1500; // courier trail decay, ms (08 §2.2)
const WAVE_LEN = 420; // sheen wavelength, px (v12 stand canon)
const WAVE_AMP = 0.08; // Полный breathing amplitude (cap 0.05–0.08, §14.1)
const WAVE_AMP_CALM = 0.02; // Спокойный: minimal amplitude (SUPERSEDE 14.1)
const MAX_IMPULSES = 2; // W1a coalesce cap
const STEP = 28; // sheen segment length, px

export type SeamKind = "topbar" | "sidebar" | "crumbs";
/** Measured seam rect, viewport coords (short keys: minified literally). */
export interface SeamRect {
  k: SeamKind;
  l: number;
  t: number;
  r: number;
  b: number;
}
export interface Vein {
  pts: Array<[number, number]>;
  len: number;
  phase: number;
}

/** Pure geometry: seam rects (viewport coords) → vein polylines. Zero-size
 * seams (mobile drawer, display:none) are skipped; Ж2/Ж3 join at corners. */
export function buildVeins(seams: SeamRect[], vw: number, vh: number): Vein[] {
  const topbar = seams.find((s) => s.k === "topbar");
  const sidebar = seams.find((s) => s.k === "sidebar");
  const crumbs = seams.find((s) => s.k === "crumbs");
  const veins: Vein[] = [];
  const spineY = topbar ? topbar.b : 0;
  if (topbar && topbar.r - topbar.l > 1) {
    veins.push({
      pts: [
        [0, spineY],
        [vw, spineY],
      ],
      len: vw,
      phase: 0,
    });
  }
  let sideX = -1;
  if (sidebar && sidebar.r - sidebar.l > 1 && vh - sidebar.t > 1) {
    sideX = sidebar.r;
    veins.push({
      pts: [
        [sideX, Math.max(sidebar.t, spineY)],
        [sideX, vh],
      ],
      len: vh,
      phase: 1 / 3,
    });
  }
  if (crumbs && crumbs.r - crumbs.l > 1 && crumbs.b <= vh) {
    const from = Math.max(crumbs.l, sideX);
    if (vw - from > 1) {
      veins.push({
        pts: [
          [from, crumbs.b],
          [vw, crumbs.b],
        ],
        len: vw - from,
        phase: 2 / 3,
      });
    }
  }
  return veins;
}

function readSeams(): SeamRect[] {
  const out: SeamRect[] = [];
  for (const el of document.querySelectorAll<HTMLElement>("[data-living-seam]")) {
    const k = el.dataset.livingSeam as SeamKind;
    if (k !== "topbar" && k !== "sidebar" && k !== "crumbs") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) continue; // hidden (mobile drawer)
    out.push({ k, l: r.left, t: r.top, r: r.right, b: r.bottom });
  }
  return out;
}

const css = (name: string, fb: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;

/** True when animation must not run at all (canon: a STATIC drawing). */
function reducedMotion(): boolean {
  return (
    document.documentElement.dataset.motion === "reduced" ||
    (typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches)
  );
}

interface Impulse {
  v: number; // vein index
  f: number; // direction (0|1)
  t: number; // start timestamp
  d: number; // travel duration
  c: string; // colour
}

/** Mount the engine on a canvas. Returns the destructor (idempotent). */
export function mountLivingLayer(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => undefined; // no 2d surface (tests / exotic webviews)

  const tones = createTones(css, isLivingMuted);
  // The breath window: ambient motion lives ONLY inside a window opened by
  // a real bus event (U2 honesty gate); calm keeps the minimal amplitude.
  const breath = createBreath(css, () => !reducedMotion() && getLiveLayer() !== "off");
  const mn = Math.min;
  let veins: Vein[] = [];
  let hairCss = "rgb(122,138,158)";
  let rest = 0.07;
  let period = 10000;
  let dprCap = 2;
  let lite = false; // slow-frame degradation: glow pass dropped
  let statik = false; // <45fps: settle into the static drawing
  let raf = 0;
  let prev = 0;
  let frames = 0;
  let spent = 0;
  let impulses: Impulse[] = [];
  let destroyed = false;

  function resize(): void {
    if (destroyed) return;
    const dpr = mn(dprCap, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    veins = buildVeins(readSeams(), w, h);
    hairCss = `rgb(${css("--myelin-hairline", "rgb(122 138 158)").match(/\d+/g)!.slice(0, 3)})`;
    rest = parseFloat(css("--web-edge-alpha", "0.07")) || 0.07;
    period = parseFloat(css("--duration-web-idle", "10000")) || 10000;
    if (statik || reducedMotion() || getLiveLayer() === "off" || !active())
      drawStatic();
  }

  const active = (): boolean =>
    !destroyed &&
    !statik &&
    !reducedMotion() &&
    getLiveLayer() !== "off" &&
    // U2 honesty: the RAF chain lives ONLY inside a breath window or while
    // bead trails are still decaying — a silent bus means zero frames.
    (breath.isOpen || impulses.length > 0);

  function line(
    c: CanvasRenderingContext2D,
    a: [number, number],
    b: [number, number],
  ): void {
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
    c.stroke();
  }

  /** One static frame: resting hairlines + the current base tone glow. */
  function drawStatic(): void {
    const c = ctx!;
    c.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const tone = isLivingMuted() || getLiveLayer() === "off" ? null : tones.frame(0, 0);
    for (const v of veins) {
      c.strokeStyle = hairCss;
      c.globalAlpha = rest;
      c.lineWidth = 1;
      line(c, v.pts[0], v.pts[1]);
      if (tone) {
        c.strokeStyle = tone;
        c.globalAlpha = 0.06;
        c.lineWidth = 5;
        line(c, v.pts[0], v.pts[1]);
        c.lineWidth = 1;
      }
    }
    c.globalAlpha = 1;
  }

  function draw(now: number, dt: number): void {
    const c = ctx!;
    const w = window.innerWidth;
    c.clearRect(0, 0, w, window.innerHeight);
    const m = getLiveLayer();
    const tone = tones.frame(now, dt);
    const amp = m === "calm" ? WAVE_AMP_CALM : WAVE_AMP;
    const t = now / period;
    c.lineWidth = 1;
    for (const v of veins) {
      // breathing: the sheen travels along the vein in STEP-px segments
      const [a, b] = v.pts;
      const dx = (b[0] - a[0]) / v.len;
      const dy = (b[1] - a[1]) / v.len;
      for (let s = 0; s < v.len; s += STEP) {
        let al = rest + amp * Math.sin(TAU * ((s + STEP / 2) / WAVE_LEN - t + v.phase));
        if (al < 0.02) al = 0.02;
        c.strokeStyle = hairCss;
        c.globalAlpha = al;
        const x = a[0] + dx * s;
        const y = a[1] + dy * s;
        line(c, [x, y], [x + dx * STEP, y + dy * STEP]);
      }
      if (!lite && tone) {
        c.strokeStyle = tone;
        c.globalAlpha = m === "calm" ? 0.05 : 0.1;
        c.lineWidth = 5;
        line(c, a, b);
        c.lineWidth = 1;
      }
    }
    // impulses (Полный only, not while muted): bead + fading trail
    impulses = impulses.filter((im) => {
      const v = veins[im.v];
      if (!v || m !== "live" || isLivingMuted()) return false;
      const life = now - im.t;
      if (life >= im.d + TRAIL) return false; // the trail has decayed
      const [a, b] = v.pts;
      const k = mn(1, life / im.d);
      const u = im.f ? 1 - k : k; // direction of travel
      const x = a[0] + (b[0] - a[0]) * u;
      const y = a[1] + (b[1] - a[1]) * u;
      // trail: the traversed part, decaying 1.5s after the pass (08 §2.2)
      const decay = life <= im.d ? 1 : 1 - (life - im.d) / TRAIL;
      c.strokeStyle = im.c;
      c.globalAlpha = 0.1 * decay;
      c.lineWidth = 2;
      line(c, a, [x, y]);
      c.lineWidth = 1;
      if (life <= im.d) {
        c.fillStyle = im.c;
        c.globalAlpha = 0.5;
        c.beginPath();
        c.arc(x, y, 4, 0, TAU);
        c.fill();
        c.globalAlpha = 0.9;
        c.beginPath();
        c.arc(x, y, 1.6, 0, TAU);
        c.fill();
      }
      return true;
    });
    c.globalAlpha = 1;
  }

  function loop(now: number): void {
    raf = 0;
    if (document.hidden) return; // visibilitychange restarts the chain
    if (!active()) return;
    const dt = prev ? Math.min(64, now - prev) : 16;
    prev = now;
    const t0 = performance.now();
    draw(now, dt);
    spent += performance.now() - t0;
    if (++frames >= 60) {
      const fps = (frames * 1000) / spent;
      frames = spent = 0;
      if (fps < 45) {
        statik = true;
        stop();
        drawStatic();
        return;
      }
      if (fps < 55.5 && !lite) {
        lite = true; // drop the glow pass, halve the pixel count
        dprCap = 1.5;
        resize();
      }
    }
    raf = requestAnimationFrame(loop);
  }

  function stop(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    prev = 0;
  }
  function start(): void {
    if (!raf && active()) raf = requestAnimationFrame(loop);
  }

  /** A real bus event: tone always; the breath window opens in every
   * visible layer (its amplitude differs); a bead only in Полный. */
  function onEvent(kind: string): void {
    if (isBusServiceKind(kind)) return; // service frames are not events
    tones.event(kind);
    breath.event();
    if (getLiveLayer() !== "live" || reducedMotion() || isLivingMuted() || statik)
      return;
    if (impulses.length >= MAX_IMPULSES || !veins.length) return;
    const vein = hash(kind) % veins.length;
    impulses.push({
      v: vein,
      f: hash(`${kind}#`) % 2,
      t: performance.now(),
      d: Math.max(400, Math.min(1600, veins[vein].len / SPEED)),
      c: tones.frame(performance.now(), 0) ?? hairCss,
    });
    start();
  }

  /** ME-071 W3 slice 2 (15-WOW §3.4.2): the task.done courier — the GOLD
   * bead UP the Ж2 sidebar vein toward the В1 status zone. The same dosage
   * gates as a regular bead (Полный only, MAX_IMPULSES coalesce); the vein
   * is the ONE vertical polyline (Ж2 — the sidebar contour), direction
   * f=1 = toward its start (the topbar corner). */
  function onCourier(): void {
    breath.event(); // the gold leg is a real event too — it may open a window
    if (getLiveLayer() !== "live" || reducedMotion() || isLivingMuted() || statik)
      return;
    if (impulses.length >= MAX_IMPULSES || !veins.length) return;
    const vein = veins.findIndex((v) => v.pts[0][0] === v.pts[1][0]);
    if (vein < 0) return; // no sidebar seam on this viewport (mobile drawer)
    impulses.push({
      v: vein,
      f: 1,
      t: performance.now(),
      d: Math.max(400, Math.min(1600, veins[vein].len / SPEED)),
      c: css("--color-confidence", "#c9933a"),
    });
    start();
  }

  function onSignal(s: LivingSignal): void {
    if (destroyed) return;
    if (s.type === "event") onEvent(s.kind);
    else if (s.type === "courier") onCourier();
    else if (s.type === "health") tones.health(s.states);
    else if (s.type === "update") tones.setUpdate(s.on);
    else if (s.type === "mute") {
      impulses = [];
      if (statik || reducedMotion()) drawStatic();
    }
  }

  function sync(): void {
    if (destroyed) return;
    if (getLiveLayer() === "off") {
      breath.freeze();
      stop();
      ctx!.clearRect(0, 0, window.innerWidth, window.innerHeight);
    } else if (reducedMotion() || statik) {
      breath.freeze();
      stop();
      drawStatic();
    } else if (active()) {
      start();
    } else {
      stop();
      drawStatic();
    }
  }

  // --- the input freeze (замирание, ≤80ms law): ANY key/pointer press stops
  // ambient motion instantly; the next real event may breathe again. --------
  const onInput = (): void => {
    if (destroyed) return;
    impulses = []; // kill bead trails too — zero motion while interacting
    breath.freeze(); // close → the subscription settles the static frame
  };

  // --- subscriptions (ALL torn down by the destructor) ---------------------
  const offFeed = subscribeLiving(onSignal);
  const offLayer = subscribeLiveLayer(() => sync());
  const offBreath = breath.subscribe((open) => {
    // The window state rides <html> too — the SHELL ambient (Весма's breath)
    // is gated by the SAME bus-opened window (U2: nothing moves without it).
    document.documentElement.dataset.breath = open ? "true" : "false";
    if (destroyed || statik) return;
    if (open) start();
    else if (impulses.length === 0) {
      stop();
      drawStatic();
    }
  });
  window.addEventListener("keydown", onInput, true);
  window.addEventListener("pointerdown", onInput, true);
  const ro =
    typeof ResizeObserver === "function" ? new ResizeObserver(() => resize()) : null;
  if (ro)
    document.querySelectorAll("[data-living-seam]").forEach((el) => ro.observe(el));
  const themeMo = new MutationObserver(() => {
    resize(); // re-reads tokens, rebuilds geometry, redraws static
    sync();
  });
  themeMo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-motion"],
  });
  const onVis = (): void => {
    if (document.hidden) stop();
    else {
      prev = 0;
      start();
    }
  };
  document.addEventListener("visibilitychange", onVis);
  const onResize = (): void => resize();
  window.addEventListener("resize", onResize);
  const mm =
    typeof matchMedia === "function"
      ? matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  const onMm = (): void => sync();
  mm?.addEventListener("change", onMm);

  resize();
  sync();

  return function destroy(): void {
    destroyed = true;
    stop();
    offFeed();
    offLayer();
    offBreath();
    breath.destroy();
    window.removeEventListener("keydown", onInput, true);
    window.removeEventListener("pointerdown", onInput, true);
    mm?.removeEventListener("change", onMm);
    ro?.disconnect();
    themeMo.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("resize", onResize);
    impulses = [];
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };
}

/** Deterministic vein pick: the same event kind always starts the same way. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 997;
}
