/**
 * The well state organ (ME-071 W1b) — lazy chunk `web-tones` (budget ≤2 KiB
 * gzip, shared with tones.ts). Mounts on the Overview well window and turns
 * REAL bus/health signals into the well's physiology (15-WOW §14.6.1):
 *   - TONE: a STEP engine (no RAF loop) — signals recompute the node tint
 *     (`--well-tone` + `data-well-tone="active"`); timers walk each event
 *     window back (80% → base colour, 100% → none). The crossfade itself is
 *     CSS (`--duration-tone-fade`); reduced mirrors make it a static tint.
 *     While neutral there are ZERO timers and ZERO frames.
 *   - BEADS: live-layer events only, ≤2 alive, along REAL derived_from
 *     edges, picked deterministically by the event-kind hash (engine
 *     pattern). A light RAF runs only while a bead is alive; paused on
 *     document.hidden; gone in calm/muted/reduced.
 *   - HOVER: nearest node ≈18px → myelin halo + the honest readout
 *     «title · YYYY-MM-DD» (fallback id.slice(0,8)) in the HUD slot. Data
 *     layer, not the living layer — works muted too. Esc/leave resets.
 * Anti-fake: with health+SSE silent or `?quiet=1` the organ is strictly
 * neutral — no colour, no beads. The destructor is idempotent (StrictMode).
 * KEEP THIS CHUNK LEAN — scripts/budget-check.mjs measures it; the short
 * internal helper names are deliberate (minifiers keep method names).
 */

import { getLiveLayer, subscribeLiveLayer } from "@/lib/liveLayerStore";
import { isLivingMuted, subscribeLiving, type LivingSignal } from "@/lib/livingFeed";
import {
  createBreath,
  createTones,
  hashString,
  isBusServiceKind,
  isReducedMotion,
} from "./tones";

const NS = "http://www.w3.org/2000/svg";
const SPEED = 0.6; // px/ms along the edge (08 §2.2: 600px/s)
const TRAIL = 1500; // trail decay, ms (08 §2.2)
const BEAD_CAP = 2;
const HOVER_R = 18; // viewBox px — node hit radius
const COARSE = "(pointer: coarse)";
const REDUCED = "(prefers-reduced-motion: reduce)";

const css = (name: string, fb: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;

const A = (el: SVGElement, k: string, v: string | number): void =>
  el.setAttribute(k, String(v));
const mk = (tag: string): SVGElement => document.createElementNS(NS, tag);

interface Bead {
  dot: SVGCircleElement;
  trail: SVGLineElement;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  f: number; // 0: from→to, 1: to→from
  t0: number;
  d: number;
}

/** Mount the organ on the well window. Returns the idempotent destructor. */
export function mountWellOrgan(win: HTMLElement): () => void {
  let tones = createTones(css, isLivingMuted);
  // The breath window (U2): the well's drift/substrate animations run ONLY
  // inside a window opened by a real bus event («шина молчит — экран
  // стоит»); the attribute is read by global.css.
  const breathAllowed = (): boolean => getLiveLayer() !== "off" && !isReducedMotion();
  const breath = createBreath(css, breathAllowed);
  const offBreath = breath.subscribe((open) => {
    win.dataset.breath = open ? "true" : "false";
    // Mirror onto <html> for the SHELL ambient (Весма's breath) — the same
    // bus-opened window gates every living pixel on the page (U2).
    document.documentElement.dataset.breath = open ? "true" : "false";
  });
  let beads: Bead[] = [];
  let raf = 0;
  let toneTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let hoverTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let halo: SVGElement | null = null;
  let destroyed = false;
  const pnow = (): number => performance.now();
  const live =
    win.querySelector<SVGGElement>(".well-live") ?? win.querySelector("svg") ?? win;
  const readout = win.querySelector<HTMLElement>("[data-well-readout]");

  // --- tone: the step engine (zero timers while neutral) -------------------
  function clearToneTimer(): void {
    clearTimeout(toneTimer);
    toneTimer = 0;
  }
  function applyTone(): void {
    if (destroyed) return;
    clearToneTimer();
    const s = tones.step(pnow());
    if (s === null || !s.real || getLiveLayer() === "off") {
      win.dataset.wellTone = "none";
      win.style.removeProperty("--well-tone");
      return;
    }
    win.dataset.wellTone = "active";
    win.style.setProperty("--well-tone", s.color);
    if (s.nextIn > 0) toneTimer = setTimeout(applyTone, s.nextIn);
  }

  // --- beads: live events over REAL edges ----------------------------------
  function stopRaf(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function startRaf(): void {
    if (!raf && beads.length) raf = requestAnimationFrame(tick);
  }
  function tick(now: number): void {
    raf = 0;
    if (document.hidden) return; // visibilitychange restarts the chain
    beads = beads.filter((b) => {
      const life = now - b.t0;
      if (life >= b.d + TRAIL) {
        b.dot.remove();
        b.trail.remove();
        return false;
      }
      const dot = b.dot;
      const trail = b.trail;
      const k = Math.min(1, life / b.d);
      const u = b.f ? 1 - k : k;
      A(dot, "cx", b.x1 + (b.x2 - b.x1) * u);
      A(dot, "cy", b.y1 + (b.y2 - b.y1) * u);
      const decay = life <= b.d ? 1 : 1 - (life - b.d) / TRAIL;
      A(trail, "x1", String(b.f ? b.x2 : b.x1));
      A(trail, "y1", String(b.f ? b.y2 : b.y1));
      A(trail, "x2", dot.getAttribute("cx")!);
      A(trail, "y2", dot.getAttribute("cy")!);
      A(trail, "stroke-opacity", 0.1 * decay);
      A(dot, "opacity", life <= b.d ? "1" : "0");
      return true;
    });
    if (beads.length) raf = requestAnimationFrame(tick);
  }
  function spawnBead(kind: string): void {
    if (getLiveLayer() !== "live" || isReducedMotion() || isLivingMuted()) return;
    if (beads.length >= BEAD_CAP) return;
    const lines = win.querySelectorAll<SVGLineElement>("line.well-node");
    if (lines.length === 0) return;
    const line = lines[hashString(kind) % lines.length];
    const x1 = +line.getAttribute("x1")!;
    const y1 = +line.getAttribute("y1")!;
    const x2 = +line.getAttribute("x2")!;
    const y2 = +line.getAttribute("y2")!;
    const colour = tones.step(pnow())?.color || "rgb(122,138,158)";
    const trail = mk("line");
    A(trail, "class", "well-bead-trail");
    A(trail, "stroke", colour);
    const dot = mk("circle");
    A(dot, "class", "well-bead");
    A(dot, "r", "3");
    A(dot, "fill", colour);
    live.append(trail, dot);
    beads.push({
      dot: dot as SVGCircleElement,
      trail: trail as SVGLineElement,
      x1,
      y1,
      x2,
      y2,
      f: hashString(`${kind}#`) % 2,
      t0: pnow(),
      d: Math.max(400, Math.min(1600, Math.hypot(x2 - x1, y2 - y1) / SPEED)),
    });
    startRaf();
  }
  function clearBeads(): void {
    stopRaf();
    for (const b of beads) {
      b.dot.remove();
      b.trail.remove();
    }
    beads = [];
  }

  // --- hover: halo + honest readout (data layer — works muted) -------------
  function clearHover(): void {
    clearTimeout(hoverTimer);
    hoverTimer = 0;
    halo?.remove();
    halo = null;
    if (readout) readout.textContent = "";
  }
  function setHover(node: SVGCircleElement): void {
    const label = node.dataset.title || (node.dataset.id ?? "").slice(0, 8);
    if (readout) {
      readout.textContent = node.dataset.date
        ? `${label} · ${node.dataset.date}`
        : label;
    }
    if (!halo) {
      halo = mk("circle");
      A(halo, "class", "well-node-halo");
      live.append(halo);
    }
    A(halo, "cx", node.getAttribute("cx")!);
    A(halo, "cy", node.getAttribute("cy")!);
    A(halo, "r", +node.getAttribute("r")! + 3);
  }
  function pick(vx: number, vy: number): SVGCircleElement | null {
    const svg = win.querySelector("svg");
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    // The scene's own viewBox is the mapping source (keeps this chunk free
    // of a static import on the well-graph module — chunk hygiene).
    const v = (svg.getAttribute("viewBox") ?? "").split(/\s+/);
    const w = +v[2] || 1;
    const h = +v[3] || 1;
    const s = Math.min(rect.width / w, rect.height / h);
    // preserveAspectRatio="xMidYMax meet": centred horizontally, floor-locked
    const dx = (vx - rect.left - (rect.width - w * s) / 2) / s;
    const dy = (vy - rect.top - (rect.height - h * s)) / s;
    let best: SVGCircleElement | null = null;
    let bd = HOVER_R * HOVER_R;
    for (const c of win.querySelectorAll<SVGCircleElement>("circle.well-node")) {
      const ex = +c.getAttribute("cx")! - dx;
      const ey = +c.getAttribute("cy")! - dy;
      const d2 = ex * ex + ey * ey;
      if (d2 <= bd) {
        bd = d2;
        best = c;
      }
    }
    return best;
  }
  const onMove = (e: PointerEvent): void => {
    const n = pick(e.clientX, e.clientY);
    if (n) setHover(n);
    else clearHover();
  };
  const onDown = (e: PointerEvent): void => {
    if (!matchMedia(COARSE).matches) return;
    const n = pick(e.clientX, e.clientY);
    if (n) {
      setHover(n);
      hoverTimer = setTimeout(clearHover, 2500);
    } else clearHover();
  };
  const onLeave = (): void => clearHover();
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") clearHover();
  };
  // The input freeze (замирание, ≤80ms law): ANY press stops the window's
  // ambient motion and kills live beads — the next event may breathe again.
  const onFreeze = (): void => {
    if (destroyed) return;
    clearBeads();
    breath.freeze();
  };

  // --- signals: the SECOND livingFeed listener (the engine keeps its own) --
  function onSignal(sig: LivingSignal): void {
    if (destroyed) return;
    // The engine's RAF keeps the tone clock fresh; the step organ must sync
    // it explicitly BEFORE the signal mutates state (window prolongation and
    // hold caps read nowRef), keeping expiry checks engine-parity.
    tones.step(pnow());
    if (sig.type === "event") {
      if (isBusServiceKind(sig.kind)) return; // service frames open nothing
      tones.event(sig.kind);
      breath.event(); // the breath window rides the SAME real event
      spawnBead(sig.kind);
      applyTone();
    } else if (sig.type === "health") {
      tones.health(sig.states);
      applyTone();
    } else if (sig.type === "update") {
      tones.setUpdate(sig.on);
      applyTone();
    } else {
      clearBeads(); // mute: strictly neutral
      breath.freeze();
      applyTone();
    }
  }
  function onLayer(): void {
    if (destroyed) return;
    if (getLiveLayer() === "off") {
      clearBeads();
      breath.freeze();
    }
    applyTone();
  }
  /** Theme/motion flip: tone colours and reduced mirrors are read at create
   * time — rebuild the tone engine and reapply; the breath window closes
   * (reduced = static tints). */
  function rewire(): void {
    if (destroyed) return;
    tones = createTones(css, isLivingMuted);
    if (isReducedMotion()) clearBeads();
    breath.freeze();
    applyTone();
  }

  const offFeed = subscribeLiving(onSignal);
  const offLayer = subscribeLiveLayer(onLayer);
  const mm = matchMedia(REDUCED);
  mm?.addEventListener("change", rewire);
  const mo =
    typeof MutationObserver === "function" ? new MutationObserver(rewire) : null;
  mo?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-motion"],
  });
  const onVis = (): void => {
    if (!document.hidden && beads.length) startRaf();
  };
  document.addEventListener("visibilitychange", onVis);
  win.addEventListener("pointermove", onMove);
  win.addEventListener("pointerdown", onDown);
  win.addEventListener("pointerleave", onLeave);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keydown", onFreeze, true);
  window.addEventListener("pointerdown", onFreeze, true);

  applyTone();

  return function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    clearTimeout(toneTimer);
    clearHover();
    clearBeads();
    offFeed();
    offLayer();
    offBreath();
    breath.destroy();
    delete win.dataset.breath;
    mm?.removeEventListener("change", rewire);
    mo?.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    win.removeEventListener("pointermove", onMove);
    win.removeEventListener("pointerdown", onDown);
    win.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keydown", onFreeze, true);
    window.removeEventListener("pointerdown", onFreeze, true);
    delete win.dataset.wellTone;
    win.style.removeProperty("--well-tone");
  };
}
