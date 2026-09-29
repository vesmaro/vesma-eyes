import { useEffect, useState } from "react";

/**
 * Debounced mirror of a fast-changing value (the palette's query field —
 * UX-overhaul §7.3 Ф2: the memory search rides the wire only when typing
 * pauses). Trivial timer swap; 0/undefined delay passes the value through
 * on the next tick like any timeout would.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
