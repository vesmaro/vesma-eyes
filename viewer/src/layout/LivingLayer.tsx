import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

/**
 * The living-layer mount (ME-071 W1a): a fixed canvas UNDER all content.
 * Eager on purpose — it renders nothing but the canvas element and lazy-
 * imports the engine (`living-extra` chunk) after first paint, so the
 * budget-critical chunk never touches the LCP path (15-WOW §14.1).
 *
 * Readability discipline: the canvas is a veil behind the opaque panels —
 * in quiet zones (docs, /system) it dims to a whisper so text-heavy pages
 * keep the canvas effectively invisible (W1a directive item 2).
 */

const QUIET_PREFIXES = ["/docs", "/system"];
const QUIET_OPACITY = "0.35";

export function LivingLayer(): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  const { pathname } = useLocation();
  const quiet = QUIET_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));

  useEffect(() => {
    let destroy: (() => void) | undefined;
    let cancelled = false;
    void import("@/living/engine").then((m) => {
      if (cancelled || !ref.current) return;
      destroy = m.mountLivingLayer(ref.current);
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-living-canvas=""
      style={{ opacity: quiet ? QUIET_OPACITY : undefined }}
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
