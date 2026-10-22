import { useCallback, useEffect, useRef, useState } from "react";
import { KORA_BAND_MAX, KORA_BAND_MIN } from "./koraFrameStorage";

/**
 * The Kora BAND height mechanics (07l §3.1–3.2, ex-Пульт hardware): auto by
 * content (the zone caps its own body with KORA_BAND_AUTO_MAX) or a fixed
 * min..max px height; the collapse line (гистерезис: a drag/keyboard step
 * below the collapse point means «свернуть») lives in the SEAM
 * (KoraResizeHandle collapseBelow → onCollapse); the persist lands ONLY on
 * commit (drag end / keyboard series end, never per frame); the reset to
 * auto REMOVES the storage key.
 *
 * KW1 DISSOLVES the Пульт (kora-rethink blueprint §6) — the strip leaves the
 * structure, but its height hardware does NOT die: KW2 mounts it verbatim on
 * the «Все ходы» secondary zone (the row-resize seam above the strip,
 * `vesmaro.koraMovesH`). The hook is the seam-agnostic engine: it owns the
 * mode state, the content measurement, the clamp/deploy/collapse decisions
 * and the commit plumbing; the zone provides the storage key keepers (read/
 * write/clear), the auto ceiling and collapse line as the SEAM's props, the
 * aria valuetext strings and the strip UI. Unit-tested here
 * (useKoraBandHeight.test.tsx) so the mechanics survive the journey.
 *
 * Contract (mirrors the ex-KoraPult wiring the seams already know):
 * - `seamValue` feeds KoraResizeHandle's `value`: in the collapsed state the
 *   seam honestly mirrors the strip (`collapsedValue`, the Пульт used 40);
 * - `onValue` defines the geometry AND deploys (a deliberate move from the
 *   strip deploys to the clamped value);
 * - `collapse` flips to the collapsed strip (instant, 07l §3.2) — wire it to
 *   the seam's `onCollapse` with `collapseBelow`;
 * - `onCommit` writes the key ONLY when a fixed height is actually deployed
 *   (the auto mode is the key's ABSENCE);
 * - `onReset` = auto mode: key removed, deployed (dblclick/Home).
 */

export interface KoraBandHeight {
  /** 0 = auto mode (height by content, ≤ autoMax); >0 = fixed px. */
  fixedH: number;
  /** The measured content height in the auto mode (0 = unmeasured). */
  autoH: number;
  /** Deployed (the zone body is on) vs the collapsed strip. */
  expanded: boolean;
  /** The honest aria value for the seam in the current state. */
  seamValue: number;
  deploy: () => void;
  toggle: () => void;
  collapse: () => void;
  /** KoraResizeHandle onValue — clamps, deploys. */
  onValue: (next: number) => void;
  /** KoraResizeHandle onCommit — persists the fixed height only. */
  onCommit: () => void;
  /** KoraResizeHandle onReset (dblclick/Home) — auto mode, key removed. */
  onReset: () => void;
}

/**
 * The ref rides OUTSIDE the state aggregate (K3-7): a ref inside the
 * returned object makes every `band.*` read in render look like a ref
 * access to react-hooks/refs — with the ref separate, the aggregate is
 * plain render data and the ref is attached verbatim.
 */
export function useKoraBandHeight({
  readH,
  writeH,
  clearH,
  min = KORA_BAND_MIN,
  max = KORA_BAND_MAX,
  collapsedValue = 40,
}: {
  readH: () => number;
  writeH: (h: number) => void;
  clearH: () => void;
  min?: number;
  max?: number;
  /** The collapsed strip's height — the seam's honest value while folded. */
  collapsedValue?: number;
}): [KoraBandHeight, React.RefObject<HTMLDivElement>] {
  const [expanded, setExpanded] = useState(false);
  /** 0 = auto mode (height by content) — the storage key's absence. */
  const [fixedH, setFixedH] = useState<number>(readH);

  // The measured auto height feeds the honest aria values in auto mode
  // (07l §3.3: «авто, 264 пикселя»). Unmeasured (older engines/tests) →
  // the valuetext degrades to plain «авто», never a fake number.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [autoH, setAutoH] = useState(0);
  useEffect(() => {
    const el = bodyRef.current;
    if (el === null || !expanded || fixedH !== 0) return;
    const measure = (): void => setAutoH(Math.round(el.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded, fixedH]);

  // The seam contract (KoraResizeHandle): a value defines the geometry AND
  // deploys; the collapse line means «свернуть» — and from the strip, a
  // deliberate move deploys (07l §3.2 гистерезис, mirrored for keyboard).
  const onValue = useCallback(
    (next: number): void => {
      setFixedH(Math.min(max, Math.max(min, next)));
      setExpanded(true);
    },
    [min, max],
  );
  const toggle = useCallback((): void => {
    setExpanded((value) => !value);
  }, []);
  const deploy = useCallback((): void => setExpanded(true), []);
  const collapse = useCallback((): void => setExpanded(false), []);
  const onCommit = useCallback((): void => {
    // Only a deployed fixed height is a persisted user decision; the auto
    // mode is the ABSENCE of the key (07l §3.2).
    if (fixedH > 0) writeH(fixedH);
  }, [fixedH, writeH]);
  const onReset = useCallback((): void => {
    // Reset = auto mode: the key is REMOVED, not zeroed (07l §3.2).
    clearH();
    setFixedH(0);
    setExpanded(true);
  }, [clearH]);

  const seamValue = expanded ? (fixedH > 0 ? fixedH : autoH) : collapsedValue;

  return [
    {
      fixedH,
      autoH,
      expanded,
      seamValue,
      deploy,
      toggle,
      collapse,
      onValue,
      onCommit,
      onReset,
    },
    bodyRef,
  ];
}
