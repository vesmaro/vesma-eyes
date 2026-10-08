/**
 * The scroll tone organ (U4 «Память», SPEC-2026-10-07: «посадка тона-
 * кроссфейда» на памятных поверхностях) — lazy chunk `web-tones` (budget
 * ≤2.5 KiB gzip, shared mask; KEEP LEAN — scripts/budget-check.mjs measures
 * this file). The WELL-ORGAN PATTERN, tone section only: a STEP engine (no
 * RAF, zero timers while neutral) classifies REAL health/bus signals with
 * the shared `createTones` (one implementation per concept) and writes the
 * result onto the scroll surface — `--scroll-tone` + `data-tone="active"`;
 * the crossfade itself is CSS (`--duration-tone-fade` 1200ms). Lilac =
 * «пришло обновление» (--web-tone-update, the sixth semantic colour).
 *
 * Anti-fake: muted (?quiet=1) or «Выключен» → strictly neutral, no colour;
 * service frames (hello) open nothing. Reduced keeps the STATE (a static
 * tint — the CSS reduced mirror owns the fade). The destructor is
 * idempotent (StrictMode).
 */

import { getLiveLayer, subscribeLiveLayer } from "@/lib/liveLayerStore";
import { isLivingMuted, subscribeLiving, type LivingSignal } from "@/lib/livingFeed";
import { createTones, isBusServiceKind } from "./tones";

const css = (name: string, fb: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;

/** Mount the organ on the scroll surface. Returns the idempotent destructor. */
export function mountScrollTone(el: HTMLElement): () => void {
  let tones = createTones(css, isLivingMuted);
  let timer: ReturnType<typeof setTimeout> | 0 = 0;
  let destroyed = false;

  function apply(): void {
    if (destroyed) return;
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
    const s = tones.step(performance.now());
    if (s === null || !s.real || getLiveLayer() === "off") {
      delete el.dataset.tone;
      el.style.removeProperty("--scroll-tone");
      return;
    }
    el.dataset.tone = "active";
    el.style.setProperty("--scroll-tone", s.color);
    if (s.nextIn > 0) timer = setTimeout(apply, s.nextIn);
  }

  function onSignal(sig: LivingSignal): void {
    if (destroyed) return;
    // Sync the tone clock BEFORE the signal mutates state (engine parity —
    // the well organ keeps the same discipline).
    tones.step(performance.now());
    if (sig.type === "event") {
      if (isBusServiceKind(sig.kind)) return;
      tones.event(sig.kind);
      apply();
    } else if (sig.type === "health") {
      tones.health(sig.states);
      apply();
    } else if (sig.type === "update") {
      tones.setUpdate(sig.on);
      apply();
    } else {
      apply(); // mute: strictly neutral
    }
  }

  /** Theme/motion flip: tone colours are read at create time — rebuild and
   * reapply. Reduced keeps the state (the CSS owns the static mirror). */
  function rewire(): void {
    if (destroyed) return;
    tones = createTones(css, isLivingMuted);
    apply();
  }

  const offFeed = subscribeLiving(onSignal);
  const offLayer = subscribeLiveLayer(() => apply());
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

  apply();

  return function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    if (timer) clearTimeout(timer);
    offFeed();
    offLayer();
    mm?.removeEventListener("change", rewire);
    mo?.disconnect();
    delete el.dataset.tone;
    el.style.removeProperty("--scroll-tone");
  };
}
