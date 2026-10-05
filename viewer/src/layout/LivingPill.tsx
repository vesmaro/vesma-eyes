import { useEffect, useState } from "react";
import { useBoardHealth } from "@/hooks/usePulse";
import { useT } from "@/i18n";
import { useDoneTotal } from "@/features/tasks/doneTransitStore";

/**
 * The В1 status-zone pill (15-WOW: «В1 в статус-зоне остаётся всегда-видимым
 * индикатором», the courier sink; W3 slice 2 wires it NOW because its
 * engines landed — the TopBar canon «pills stay out until their engines are
 * wired, honest absence over fake pills» has been honoured until this slice):
 *
 * - the DOT: the SAME board-health read the sidebar footer speaks
 *   (ok → iris, warn → warning, error → error, no answer yet → a muted
 *   hairline) — one cache, no new wire, never a fabricated state;
 * - ▸N: the golden session counter of terminal task transitions
 *   (doneTransitStore). Hidden at 0 (honest absence). DEVIATION
 *   (TL-approved): the increment is SYNCHRONOUS with the event — the
 *   living engine does not export a courier-arrival timeline (the v12
 *   stand incremented at the courier's arrival);
 * - FLASH: a gold pulse on the `vesma:b1` document event — Весма fires it
 *   when a dialog opens (the stand's «повод деградирует до вспышки В1»).
 *   Reduced-motion collapses the pulse duration to 0 (the token mirror) —
 *   no motion, the pill just stays.
 *
 * Deliberately NOT a button: the pause gesture lives on the Спутник/nest
 * slot (§14.3.5); wiring it here is a separate decision. No live region —
 * the toast already announces terminal transitions (4.1.3), a second live
 * source would double-announce.
 */

type B1State = "ok" | "warn" | "error" | "none";

const DOT: Record<B1State, string> = {
  ok: "bg-iris",
  warn: "bg-warning",
  error: "bg-error",
  none: "bg-border",
};

export function LivingPill() {
  const t = useT();
  const health = useBoardHealth();
  const total = useDoneTotal();
  const [flash, setFlash] = useState(0);

  // Весма dispatches `vesma:b1` when a dialog opens (the deferred-flight
  // degradation beat). Module-level counter as the key: every flash is a
  // new animation run.
  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | 0 = 0;
    const onFlash = (): void => {
      if (!mounted) return;
      setFlash((n) => n + 1);
      // Review fix: two flashes <700ms apart must not leak the first timer —
      // clear the previous handle before reassigning, or an early stale
      // reset kills the second flash mid-animation.
      clearTimeout(timer);
      timer = setTimeout(() => setFlash(0), 700);
    };
    document.addEventListener("vesma:b1", onFlash);
    return () => {
      mounted = false;
      document.removeEventListener("vesma:b1", onFlash);
      clearTimeout(timer);
    };
  }, []);

  const servers = health.data?.servers.map((s) => s.state ?? (s.ok === false ? "error" : "ok"));
  const state: B1State = !servers
    ? "none"
    : servers.includes("error")
      ? "error"
      : servers.includes("warn")
        ? "warn"
        : "ok";
  const stateKey =
    state === "ok"
      ? "topbar.b1.stateOk"
      : state === "warn"
        ? "topbar.b1.stateWarn"
        : state === "error"
          ? "topbar.b1.stateError"
          : "topbar.b1.stateNone";

  return (
    <span
      data-testid="b1-pill"
      data-b1-state={state}
      title={t("topbar.b1.title", { state: t(stateKey) })}
      className="flex items-center gap-1.5 rounded-sm px-1 py-0.5"
    >
      <span
        aria-hidden="true"
        className={
          "block size-2 rounded-full " +
          DOT[state] +
          (flash ? " b1-flash" : "")
        }
      />
      {/* The golden courier counter (▸N): honest absence at zero. */}
      {total > 0 ? (
        <span className="font-mono text-xs tabular-nums text-confidence">
          <span aria-hidden="true">▸</span>
          {total}
          <span className="sr-only">
            {t("topbar.b1.done", { count: total })}
          </span>
        </span>
      ) : null}
    </span>
  );
}
