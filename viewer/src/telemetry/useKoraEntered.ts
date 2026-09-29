/**
 * `kora.entered` emitter hook (ME-041, taxonomy §1.2 #3) — mounted by the
 * two Kora pages (the session list and the transcript), both of which are
 * "вход в Кору" when the visit actually ENTERS the /kora domain.
 *
 * Domain-entry rule: only a mount whose PREVIOUS pathname was not a
 * /kora path counts (null = direct load). This keeps the taxonomy's one
 * event per entry — list → transcript inside Kora is movement within the
 * domain, not a new entry — while a deep link straight into /kora/:id
 * still registers.
 *
 * Ordering contract: child effects run before the route observer's parent
 * effect, so at THIS mount `getPreviousPathname()` still answers the
 * pre-navigation pathname (exactly the domain-entry question), and a
 * fresh palette attribution is visible for `entry=palette`.
 *
 * latency_class (§1.2): the delay until the page's content SETTLES — the
 * first honest verdict the owner sees (data rendered, or the error state
 * that replaces it). Settling never happening (bounce before the wire
 * answers) drops the event — the failure itself is covered by
 * ui.surface_error, and a fabricated class would be a lie.
 */
import { useEffect, useRef } from "react";
import { getPreviousPathname, peekPaletteAttribution, trackKoraEntered } from "./telemetry";
import { monotonicNow } from "./events";

export function useKoraEntered(settled: boolean): void {
  // Decided once per mount: null = not a domain entry (no event ever).
  const entryRef = useRef<{ entry: "route" | "palette"; startedAt: number } | null>(null);
  const decidedRef = useRef(false);
  const emittedRef = useRef(false);

  useEffect(() => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    const previous = getPreviousPathname();
    const domainEntry = previous === null || !previous.startsWith("/kora");
    if (!domainEntry) return;
    entryRef.current = {
      entry: peekPaletteAttribution() ? "palette" : "route",
      startedAt: monotonicNow(),
    };
  }, []);

  useEffect(() => {
    if (!settled || emittedRef.current) return;
    emittedRef.current = true;
    const decision = entryRef.current;
    if (decision === null) return; // kora→kora movement: not an entry
    trackKoraEntered(decision.entry, monotonicNow() - decision.startedAt);
  }, [settled]);
}
