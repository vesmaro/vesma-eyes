/**
 * Весма — the nest keeper (ME-071 W2) — lazy chunk `vesma` (budget ≤3 KiB
 * gzip, 12-UNION-ROADMAP §1 п.5 v12.2; gates via scripts/budget-check.mjs).
 *
 * WHAT: a small character (viewBox 120×120; body --myelin-strong, cloak
 * --color-iris, nucleus/lantern --color-confidence) living in the fixed
 * bottom-right nest SLOT that layout/VesmaLayer renders (the slot owns the
 * click = cycleLiveLayer; the creature itself is aria-hidden decoration).
 * The lantern is the LAST REAL TONE (step engine from ./tones — zero RAF,
 * timers only per §14.6.1 window; wellOrgan pattern).
 *
 * GESTURES — real dictionary kinds (gateway/events.ts) mapped by MEANING:
 *   ПРИНЕСТИ  flight to /tasks: assignment.done · report · assignment.expired
 *   ПОЗВАТЬ   flight to the live indicator (future [data-living-target="live"],
 *             fallback the topbar seam): health ok→warn/error; flight to
 *             /agents/hosts: provisioning.failed
 *   recovery  error/warn→ok — a bubble in the nest, NO flight
 *   relay     notification — a bubble in the nest, text = notification.title
 *   ПОКАЗАТЬ  the intro bubble on the first live appearance (session flag,
 *             once, with the «Понятно» button)
 * NEVER flies (narrowing, TL verdict): task.*, executor.*, automation.*,
 * harness.*, pairing.*, server.changed, hello, provisioning.created/progress
 * /ok/repinned, assignment.created/claimed/started/cancelled.
 *
 * DOSAGE (§14.3.2): queue priority позвать(2) > принести(1) > релей(0);
 * flights ≥ --satellite-rest apart, ≤3 per rolling 10 min, one flight ≤6s;
 * bubbles ≤1/90s, auto-hide 4s (intro 10s), identical text in a row is
 * SILENCE; an open [role=dialog] defers flights (they accumulate; the В1
 * flash surfacing lands with the В1 indicator in W3); a hidden tab sleeps
 * and keeps only the LAST reason for the return; 5 min of silence → sleep
 * (breath 0.18 → 0.08), any event wakes.
 *
 * NARROWING (W2): nest bubbles for background/ordinary event classes are
 * OFF — only the verbs + recovery + notification relay speak. The canonical
 * «every ordinary class may bubble in the nest» capability returns in W3.
 *
 * Levels: live = gestures on; calm = static in the nest, lantern = last
 * tone, ZERO flights/bubbles; off = the slot is not rendered (VesmaLayer);
 * reduced = a static dot (animated parts hidden), gestures off, static tone
 * tint on the dot; muted = instantly neutral (anti-fake gate).
 * KEEP THIS CHUNK LEAN — the budget gate measures it; short internal names
 * are deliberate; the comments are free (stripped before compression).
 */

import { translate } from "@/i18n";
import { getLiveLayer, subscribeLiveLayer } from "@/lib/liveLayerStore";
import {
  isLivingMuted,
  subscribeLiving,
  type LivingSignal,
} from "@/lib/livingFeed";
import type { BoardEvent } from "@/gateway/events";
import type { TranslationKey } from "@/i18n/ru";
import { createTones, isReducedMotion } from "./tones";

const TASKS = 'a[href="/tasks"]';
const HOSTS = 'a[href="/agents/hosts"]';
// The В1 live pill is not wired yet — a future seam first, the topbar seam
// as the honest fallback (the flight still points at the status zone).
const LIVE =
  '[data-living-target="live"],header[data-living-seam="topbar"]';
const INTRO_FLAG = "vesma.intro";
const DIALOG = '[role="dialog"]';
const WINDOW = 600_000; // rolling flight window
const CAP = 3; // flights per window
const CLOUD_GAP = 90_000; // min between nest bubbles
const HOLD = 4_000; // bubble auto-hide
const INTRO_HOLD = 10_000;
const FLY_HOLD = 1_200; // pause at the target before the return leg
const SILENCE = 300_000; // 5 min → sleep
const Q_MAX = 4;

const css = (name: string, fb: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
  fb;
const num = (name: string, fb: number): number =>
  parseFloat(css(name, String(fb))) || fb;
const lang = (): "en" | "ru" =>
  document.documentElement.lang.startsWith("en") ? "en" : "ru";
const tr = (key: TranslationKey, task?: string): string =>
  translate(lang(), key, task ? { task } : undefined);

interface Reason {
  p: number; // priority: 2 позвать · 1 принести · 0 релей
  text: string; // "" = flight-only (no words, e.g. a report without a title)
  to: string; // flight target selector; "" = nest bubble only
}

/** The verb for one real bus kind; null = this kind never gestures. */
function reason(kind: string, d?: BoardEvent): Reason | null {
  const t =
    d && "notification" in d && d.notification ? d.notification.title : "";
  switch (kind) {
    case "assignment.done":
      return {
        p: 1,
        text: t ? tr("living.vesma.done", t) : tr("living.vesma.doneGeneric"),
        to: TASKS,
      };
    case "report":
      return { p: 1, text: t ? tr("living.vesma.report", t) : "", to: TASKS };
    case "assignment.expired":
      return {
        p: 1,
        text: t ? tr("living.vesma.expired", t) : "",
        to: TASKS,
      };
    case "provisioning.failed":
      return { p: 2, text: tr("living.vesma.provision"), to: HOSTS };
    case "notification":
      return t ? { p: 0, text: t, to: "" } : null;
    default:
      return null; // narrowing: background classes never gesture (W3 canon)
  }
}

/** Mount Весма into the nest slot. Returns the idempotent destructor. */
export function mountVesma(slot: HTMLElement): () => void {
  let tones = createTones(css, isLivingMuted);
  slot.insertAdjacentHTML(
    "beforeend",
    // perch: the myelin horseshoe (180°); the creature paints over it.
    '<div class="vesma-nest" aria-hidden="true"><svg viewBox="0 0 120 120" focusable="false"><path class="vesma-perch" d="M18 76a42 42 0 0 0 84 0"/></svg></div>' +
      '<div class="vesma-fly" aria-hidden="true"><svg viewBox="0 0 120 120" focusable="false">' +
      '<path class="vesma-tail" d="M44 88q-16 16-32 14 10-18 26-24z"/>' +
      '<path class="vesma-cloak" d="M22 56a38 38 0 0 1 76 0 48 48 0 0 0-76 0z"/>' +
      '<circle class="vesma-arm" cx="18" cy="66" r="8"/>' +
      '<circle class="vesma-arm" cx="102" cy="66" r="8"/>' +
      '<circle class="vesma-body" cx="60" cy="58" r="36"/>' +
      '<circle class="vesma-core" cx="60" cy="60" r="13"/>' +
      '<circle class="vesma-lantern" cx="60" cy="28" r="9"/>' +
      "</svg></div>" +
      '<div class="vesma-cloud" role="status" hidden></div>',
  );
  const flyEl = slot.querySelector<HTMLDivElement>(".vesma-fly")!;
  const cloud = slot.querySelector<HTMLDivElement>(".vesma-cloud")!;
  const cloudTxt = document.createElement("span");
  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = "vesma-ok";
  okBtn.textContent = tr("living.vesma.gotIt");
  okBtn.addEventListener("click", hideCloud);

  let dead = false;
  let flying = false;
  let sleeping = false;
  let q: Reason[] = [];
  let flights: number[] = [];
  let flown = 0; // cumulative, honest counter (the window array is rolling)
  let lastFly = -Infinity;
  let lastCloud = -Infinity;
  let lastShown = "\u0000"; // never matches a real text
  let lastText = "\u0000";
  let prev: "ok" | "warn" | "error" | null = null;
  let toneTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let cloudTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let flyTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let sleepTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let retry: ReturnType<typeof setTimeout> | 0 = 0;
  const pnow = (): number => performance.now();
  const REST = num("--satellite-rest", 60) * 1000;
  const FLY = num("--duration-flight", 800);

  // --- the lantern: the last real tone (step engine, zero RAF) -------------
  function hideCloud(): void {
    clearTimeout(cloudTimer);
    cloudTimer = 0;
    cloud.hidden = true;
    delete slot.dataset.vesmaSpeaking;
  }
  function speak(text: string, hold: number, intro = false): void {
    const now = pnow();
    if (!intro) {
      if (now - lastCloud < CLOUD_GAP || text === lastShown) return;
      lastCloud = now;
    } else lastCloud = now;
    lastShown = text;
    if (intro) cloud.append(okBtn);
    else okBtn.remove();
    cloudTxt.textContent = text;
    if (cloudTxt.parentNode !== cloud) cloud.prepend(cloudTxt);
    cloud.hidden = false;
    slot.dataset.vesmaSpeaking = "1";
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(hideCloud, hold);
  }
  function applyTone(): void {
    if (dead) return;
    clearTimeout(toneTimer);
    toneTimer = 0;
    if (isReducedMotion()) slot.dataset.vesmaReduced = "1";
    else delete slot.dataset.vesmaReduced;
    // sync the tone clock BEFORE reading (wellOrgan pattern) — expiry and
    // window checks read the mutated state, engine-parity with the canvas.
    const s = tones.step(pnow());
    const off = getLiveLayer() === "off";
    const col = !off && !isLivingMuted() && s && s.real ? s.color : "";
    if (col) slot.style.setProperty("--vesma-lantern", col);
    else slot.style.removeProperty("--vesma-lantern");
    if (s && s.nextIn > 0 && !off && !isLivingMuted() && !isReducedMotion()) {
      toneTimer = setTimeout(applyTone, s.nextIn);
    }
  }

  // --- the dosage scheduler -------------------------------------------------
  function nap(): void {
    if (q.length) {
      // an unsaid reason is not silence — stay awake (re-arm the clock)
      sleepTimer = setTimeout(nap, SILENCE);
      return;
    }
    sleeping = true;
    slot.dataset.vesmaSleep = "1";
  }
  function wake(): void {
    sleeping = false;
    delete slot.dataset.vesmaSleep;
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(nap, SILENCE);
  }
  function enqueue(r: Reason): void {
    if (r.text && r.text === lastText) return; // same text in a row → silence
    lastText = r.text;
    if (q.length >= Q_MAX) {
      let mi = 0;
      for (let i = 1; i < q.length; i++) if (q[i].p < q[mi].p) mi = i;
      q.splice(mi, 1); // evict the lowest priority
    }
    q.push(r);
  }
  function schedule(): void {
    if (dead || flying || sleeping || document.hidden || !q.length) return;
    if (getLiveLayer() !== "live" || isReducedMotion() || isLivingMuted()) {
      q = [];
      return;
    }
    const now = pnow();
    let best: Reason | null = null;
    for (const r of q) if (!best || r.p >= best.p) best = r;
    const r = best!;
    // A nest-only reason (relay/recovery) spends the CLOUD budget (90s gate
    // inside speak), never the FLIGHT budget (rest + rolling window).
    if (!r.to) {
      q.splice(q.indexOf(r), 1);
      if (r.text) speak(r.text, HOLD);
      return;
    }
    flights = flights.filter((t) => now - t < WINDOW);
    const capped = flights.length >= CAP;
    const rested = now - lastFly >= REST;
    // a dialog defers flights (they accumulate; the В1 flash lands in W3) —
    // a 4s poll re-checks after the dialog closes, one timer at a time
    if (rested && !capped && !document.querySelector(DIALOG)) {
      q.splice(q.indexOf(r), 1);
      fly(r, now);
      return;
    }
    if (!retry) {
      const wait = capped
        ? flights[0] + WINDOW - now
        : document.querySelector(DIALOG)
          ? 4_000
          : REST - (now - lastFly);
      retry = setTimeout(() => {
        retry = 0;
        schedule();
      }, Math.max(1, wait));
    }
  }
  function fly(r: Reason, now: number): void {
    flights.push(now);
    lastFly = now;
    slot.dataset.vesmaFlights = String(++flown);
    if (r.text) speak(r.text, HOLD);
    const el = r.to ? document.querySelector(r.to) : null;
    const tr2 = el?.getBoundingClientRect();
    if (!tr2) return; // no target (mobile drawer): the words already spoke
    const sr = flyEl.getBoundingClientRect();
    const dx = tr2.left + tr2.width / 2 - (sr.left + sr.width / 2);
    const dy = tr2.top + tr2.height / 2 - (sr.top + sr.height / 2);
    flying = true;
    slot.dataset.vesmaFlying = "1";
    flyEl.style.transform = `translate3d(${dx}px,${dy}px,0) scale(.55)`;
    flyTimer = setTimeout(() => {
      flyEl.style.transform = ""; // the return leg (same duration)
      flyTimer = setTimeout(() => {
        flying = false;
        delete slot.dataset.vesmaFlying;
        schedule();
      }, FLY);
    }, FLY + FLY_HOLD);
  }

  // --- signals: the third livingFeed listener -------------------------------
  function healthVerb(states: readonly string[] | null): void {
    const g = !states
      ? null
      : states.some((s) => /error/i.test(s))
        ? "error"
        : states.some((s) => /warn|degraded/i.test(s))
          ? "warn"
          : "ok";
    if (g && prev && g !== prev) {
      const worse =
        g === "error" ? prev !== "error" : g === "warn" && prev === "ok";
      if (worse) enqueue({ p: 2, text: tr("living.vesma.health"), to: LIVE });
      else if (g === "ok")
        enqueue({ p: 2, text: tr("living.vesma.healthOk"), to: "" });
    }
    prev = g;
  }
  function maybeIntro(): void {
    if (getLiveLayer() !== "live" || isReducedMotion() || isLivingMuted())
      return;
    try {
      if (sessionStorage.getItem(INTRO_FLAG)) return;
      sessionStorage.setItem(INTRO_FLAG, "1");
    } catch {
      // private mode: the intro shows once per mount — honest enough
    }
    speak(tr("living.vesma.intro"), INTRO_HOLD, true);
  }
  function neutralize(): void {
    q = [];
    clearTimeout(retry);
    retry = 0;
    clearTimeout(sleepTimer);
    sleeping = false;
    delete slot.dataset.vesmaSleep;
    clearTimeout(flyTimer);
    flying = false;
    delete slot.dataset.vesmaFlying;
    flyEl.style.transform = "";
    hideCloud();
    slot.style.removeProperty("--vesma-lantern");
  }
  function onSignal(sig: LivingSignal): void {
    if (dead) return;
    if (sig.type === "mute") return neutralize();
    tones.step(pnow()); // clock sync before mutation (wellOrgan pattern)
    if (sig.type === "event") {
      tones.event(sig.kind);
      applyTone();
      const r = reason(sig.kind, sig.data);
      if (r) enqueue(r);
    } else if (sig.type === "health") {
      tones.health(sig.states);
      applyTone();
      healthVerb(sig.states);
    } else if (sig.type === "update") {
      tones.setUpdate(sig.on);
      applyTone();
    }
    wake();
    schedule();
  }
  function onLayer(): void {
    if (dead) return;
    if (getLiveLayer() !== "live") {
      q = []; // calm/off: zero flights, zero bubbles — the nest only
      hideCloud();
    } else maybeIntro();
    applyTone();
    schedule();
  }
  /** Theme/motion flip: tone colours are read at create time — rebuild. */
  function rewire(): void {
    if (dead) return;
    tones = createTones(css, isLivingMuted);
    applyTone();
  }

  const offFeed = subscribeLiving(onSignal);
  const offLayer = subscribeLiveLayer(onLayer);
  const mm =
    typeof matchMedia === "function"
      ? matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  mm?.addEventListener("change", rewire);
  const mo =
    typeof MutationObserver === "function" ? new MutationObserver(rewire) : null;
  mo?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-motion"],
  });
  // W3 slice 2 (15-WOW §14.3.3/§14.3.4, the W2 tail «В1-вспышка диалогов»):
  // a dialog defers flights — the degradation beat is the В1 status pill
  // flash (`vesma:b1`, the TopBar pill listens) + ONE nest pill per dialog
  // opening («дела подождут») through the canonical bubble channel —
  // speak()'s ≤1/90s gate and identical-text silence carry the dosage
  // (§14.3.2 unchanged). Rests when no dialog is open.
  let dialogOpen = false;
  const dlg =
    typeof MutationObserver === "function"
      ? new MutationObserver(() => {
          const open = !!document.querySelector(DIALOG);
          if (open === dialogOpen) return; // the episode is already handled
          dialogOpen = open;
          if (!open) return;
          document.dispatchEvent(new CustomEvent("vesma:b1"));
          if (getLiveLayer() === "live" && !isReducedMotion() && !isLivingMuted())
            speak(tr("living.vesma.dialog"), HOLD);
        })
      : null;
  dlg?.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    // Review fix: "class" made the callback run a full-document querySelector
    // on EVERY Tailwind class toggle in the app. Detection is NOT class-
    // driven — Radix dialogs portal-mount/unmount (childList) and toggle
    // data-state, a native <dialog> toggles open; hidden/style cover any
    // always-mounted reveal. The dialog test (childList append/remove) and
    // the В1 flash stay intact.
    attributeFilter: ["open", "data-state", "hidden", "style"],
  });
  const onVis = (): void => {
    if (document.hidden) {
      clearTimeout(retry);
      retry = 0;
      if (q.length > 1) q = [q[q.length - 1]]; // the return keeps the LAST reason
      nap();
    } else {
      wake();
      schedule();
    }
  };
  document.addEventListener("visibilitychange", onVis);

  applyTone();
  maybeIntro();
  wake();
  schedule();

  return function destroy(): void {
    if (dead) return;
    dead = true;
    clearTimeout(toneTimer);
    clearTimeout(cloudTimer);
    clearTimeout(flyTimer);
    clearTimeout(sleepTimer);
    clearTimeout(retry);
    offFeed();
    offLayer();
    mm?.removeEventListener("change", rewire);
    mo?.disconnect();
    dlg?.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    slot.querySelector(".vesma-nest")?.remove();
    flyEl.remove();
    cloud.remove();
  };
}
