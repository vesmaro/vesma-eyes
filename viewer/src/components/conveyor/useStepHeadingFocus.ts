import { useEffect, useRef } from "react";

/**
 * Step-change focus (U8; the v12 wizard canon — stand connect.html focuses
 * the panel heading on every step change). Keyboard path: after a step
 * transition the panel's h2 receives focus (tabindex="-1"), so a keyboard
 * and a screen-reader user land at the TOP of the new step instead of
 * wherever the DOM grew — the a11y contract of the conveyor, not polish.
 *
 * The MOUNT render never steals focus (first.current gate): opening a
 * dialog already moves focus via Radix; the rail is not allowed to fight
 * it. Only a genuine step CHANGE fires the focus.
 */
export function useStepHeadingFocus(step: number) {
  const ref = useRef<HTMLHeadingElement | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    ref.current?.focus({ preventScroll: true });
  }, [step]);

  return ref;
}
