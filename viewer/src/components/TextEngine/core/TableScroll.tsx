import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./constants";
import { tableOverflowState } from "./tableOverflow";

/**
 * The table-aware scroll wrapper of EVERY TextEngine table (design blueprint
 * docs-tables-width §3, rules 3–5). The table inside carries
 * `min-width: max-content`, so it grows to its content and the wrapper's
 * `overflow-x-auto` becomes LIVE — honest horizontal scroll instead of
 * per-character column crushing. The wrapper owns the three overflow
 * affordances of the blueprint:
 *
 * - it is a named, keyboard-focusable scroll region (`role="region"`,
 *   `tabindex=0`, i18n aria-label — rule 4);
 * - a right-edge remainder affordance (background-colour gradient) that is
 *   visible exactly while unread content remains to the right (rule 4);
 * - the `data-table-overflow` attribute while the table really overflows —
 *   the theme's `group-data-*` variants turn the sticky first column on
 *   ONLY then (rule 5: «sticky только когда таблица реально переполняется»).
 *
 * Reduced motion: no animations are added (an opacity crossfade rides the
 * existing `duration-instant` token), so the blueprint's reduced-motion
 * gate is met by construction.
 *
 * SSR/tests: measurement is a post-mount effect — the first (server) HTML
 * carries no overflow state, and the pure decision lives in
 * `tableOverflowState` (unit-tested without a layout engine).
 */

/** The remainder affordance: a page-background fade over the right edge. */
const REMAINDER_FADE =
  "pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-md bg-gradient-to-l from-background to-transparent";

/**
 * Keyboard scroll step as a share of the visible width (APG scrollable-
 * region pattern: a focused region scrolls on ArrowLeft/ArrowRight). A
 * near-page step — fixed 48px minimum for tiny wrappers.
 */
const KEY_SCROLL_RATIO = 0.85;
const KEY_SCROLL_MIN_PX = 48;

export function TableScroll({
  children,
  className,
}: {
  children: ReactNode;
  /** The theme's outer spacing (mb-4 article / my-2 compact). */
  className?: string;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState(tableOverflowState(0, 0, 0));

  const measure = useCallback(() => {
    const el = ref.current;
    if (el === null) return;
    setState((prev) => {
      const next = tableOverflowState(
        el.scrollLeft,
        el.clientWidth,
        el.scrollWidth,
      );
      return prev.overflow === next.overflow && prev.remainder === next.remainder
        ? prev
        : next;
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    measure();
    // Wrapper resizes (viewport, rail) AND the table itself resizes (font
    // swap of the mono face, content changes) — observe both boxes.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    let observedChild: Element | null = el.firstElementChild;
    if (observedChild !== null) observer.observe(observedChild);
    // Streaming markdown REPLACES the block node inside the wrapper: a
    // half-streamed paragraph completes into a GFM table and the <p>
    // element is swapped for a <table>. The child observation above then
    // watches a detached node — and the wrapper's own content box does
    // not move when its overflow grows, so nothing else would re-measure
    // and the overflow state (scroll affordances, data-table-overflow,
    // sticky first column) goes stale exactly mid-stream. The childList
    // watch re-arms the child observation on every swap and re-measures
    // at once (hygiene batch review tail).
    const childWatcher = new MutationObserver(() => {
      const child = el.firstElementChild;
      if (child !== observedChild) {
        if (observedChild !== null) observer.unobserve(observedChild);
        observedChild = child;
        if (child !== null) observer.observe(child);
      }
      measure();
    });
    childWatcher.observe(el, { childList: true });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      childWatcher.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  return (
    <div className={cn("relative", className)}>
      <div
        ref={ref}
        role="region"
        aria-label={t("common.tableScrollRegion")}
        tabIndex={0}
        onScroll={measure}
        onKeyDown={(event) => {
          // Host apps carry global arrow-key handlers (palettes, hotkeys)
          // that swallow the browser's native focused-region scrolling —
          // own the keys explicitly while THIS region overflows.
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          const el = ref.current;
          if (el === null || el.scrollWidth <= el.clientWidth) return;
          event.preventDefault();
          event.stopPropagation();
          const step = Math.max(
            KEY_SCROLL_MIN_PX,
            el.clientWidth * KEY_SCROLL_RATIO,
          );
          // "instant" on purpose: the app's global html{scroll-behavior:
          // smooth} would otherwise animate every key-step (sluggish hold-
          // to-repeat); a table column step is a position jump, no motion.
          el.scrollBy({
            left: event.key === "ArrowRight" ? step : -step,
            behavior: "instant",
          });
        }}
        data-table-overflow={state.overflow || undefined}
        className={cn(
          "group overflow-x-auto rounded-md border border-border-subtle",
          FOCUS_RING,
        )}
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        className={cn(
          REMAINDER_FADE,
          "transition-opacity duration-instant",
          state.remainder ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
