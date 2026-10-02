import { useEffect, useRef } from "react";
import { cycleLiveLayer, useLiveLayer } from "@/lib/liveLayerStore";
import { useT } from "@/i18n";

/**
 * The Весма nest slot (ME-071 W2): a fixed 96×96 box in the bottom-right
 * corner (§14.3.1 — slot = creature + horseshoe perch + clearance; mobile
 * 64×64 via --vesma-slot). Eager on purpose — it renders nothing but the
 * slot and the a11y button, and lazy-imports the character (`vesma` chunk)
 * after first paint, exactly like LivingLayer does for the engine.
 *
 * A11y contract: the creature and its flights are aria-hidden decoration;
 * THIS button is the interactive surface — click/Enter/Space cycles the
 * living layer (the same aria pair as the В1 indicator, topbar.liveLayer*),
 * the target is 96×96 (≥24px), focus is never stolen. «Выключен» removes
 * the whole slot; the character reacts to live↔calm through its own store
 * subscription, so this component re-renders only on the off border.
 *
 * The bottom padding for #main (slot + 16px, so content never hides behind
 * the nest) is applied via html[data-vesma-pad] in styles/global.css —
 * no Shell re-render, the attribute IS the state. The pad attribute lives
 * on <html> only; the slot element keeps data-vesma-slot for its own CSS
 * scope (the two must not share a name — the slot is NOT the pad).
 */

const STATE_KEY = {
  live: "topbar.liveLive",
  calm: "topbar.liveCalm",
  off: "topbar.liveOff",
} as const;

export function VesmaLayer(): React.ReactElement | null {
  const ref = useRef<HTMLDivElement>(null);
  const layer = useLiveLayer();
  const t = useT();
  const active = layer !== "off";

  useEffect(() => {
    if (!active) return;
    document.documentElement.dataset.vesmaPad = "1";
    let destroy: (() => void) | undefined;
    let cancelled = false;
    void import("@/living/vesma").then((m) => {
      if (cancelled || !ref.current) return;
      destroy = m.mountVesma(ref.current);
    });
    return () => {
      cancelled = true;
      destroy?.();
      delete document.documentElement.dataset.vesmaPad;
    };
  }, [active]);

  if (!active) return null;
  return (
    <div
      ref={ref}
      data-vesma-slot=""
      className="pointer-events-none fixed right-4 bottom-4 z-30 size-24"
    >
      <button
        type="button"
        onClick={cycleLiveLayer}
        aria-label={t("topbar.liveLayerAria", { state: t(STATE_KEY[layer]) })}
        title={t("topbar.liveLayerTitle")}
        className="pointer-events-auto absolute inset-0 cursor-pointer border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      />
    </div>
  );
}
