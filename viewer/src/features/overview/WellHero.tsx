import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useLiveLayer } from "@/lib/liveLayerStore";
import { useMemories } from "@/hooks/useMemories";
import { useTags } from "@/hooks/useTags";
import { usePulse, useBoardHealth } from "@/hooks/usePulse";
import { useT } from "@/i18n";
import { useWaitingSummary } from "./useWaitingSummary";
import {
  buildSubstrate,
  buildWellGraph,
  WELL_NODE_CAP,
  WELL_VIEW_H,
  WELL_VIEW_W,
} from "./wellGraph";

/**
 * The Overview hero (blueprint §12.3, direction §5): the well — ONE full-
 * height canvas standing on the dark floor in BOTH themes (`data-well-window`
 * — the owner-approved exception-image, 2026-10-01: «кора светлая, колодец
 * глубокий»; the veil follows the well, not the page). Nodes are real
 * memories, edges are real derived_from links — data-as-decoration is the
 * only imagery route (§5.4); with no data there is no graph, only the honest
 * empty line — and a failed wire names itself (the honest error line).
 *
 * HUD discipline (§7.1): every text pixel inside the canvas sits on the
 * --hud-veil strip and carries ONLY the text-primary/secondary pairs —
 * text-muted is forbidden on HUD (3.7:1, computed in the blueprint). The
 * display headline and the counters line live ABOVE the canvas (page chrome),
 * so the hero's four text elements hold: title, subtitle, waiting chip,
 * ticker.
 *
 * Motion gates (§10): the awakening runs ONCE per session (sessionStorage
 * flag) and only while the living layer is «live» and motion is allowed;
 * any input cancels it. The drift is the surface's single ambient (≤4px/s,
 * --duration-iris rhythm) and settles with the live layer or reduced motion.
 */

const AWAKEN_SESSION_KEY = "vesmaro.awakened";

/** The awakening self-clears after the wave (≤1.2s) plus a small margin. */
const AWAKEN_CLEAR_MS = 1600;

/** Instrument time for the ticker: UTC HH:MM (mono/tabular at the callsite). */
function tickerTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function WellHero() {
  const t = useT();
  const liveLayer = useLiveLayer();
  const reducedMotion = useReducedMotion();
  const waiting = useWaitingSummary();
  const winRef = useRef<HTMLDivElement>(null);

  // The graph: real memories + their real links (one contemplative read).
  const memories = useMemories({ limit: WELL_NODE_CAP });
  const tags = useTags();
  const pulse = usePulse({ scope: "all", limit: 5 });
  const health = useBoardHealth();

  // Awakening: once per session, on the first hero mount, only when the
  // living layer is on and motion is allowed. Any input cancels; reduced
  // regimes get the static graph immediately (the reduced FINAL state).
  const [awaken, setAwaken] = useState(false);
  useEffect(() => {
    let seen = true;
    try {
      seen = sessionStorage.getItem(AWAKEN_SESSION_KEY) === "1";
      sessionStorage.setItem(AWAKEN_SESSION_KEY, "1");
    } catch {
      seen = true; // storage unavailable — stay quiet
    }
    if (seen || reducedMotion || liveLayer !== "live") return;
    setAwaken(true);
    const cancel = () => setAwaken(false);
    window.addEventListener("keydown", cancel, true);
    window.addEventListener("pointerdown", cancel, true);
    const timer = setTimeout(cancel, AWAKEN_CLEAR_MS);
    return () => {
      window.removeEventListener("keydown", cancel, true);
      window.removeEventListener("pointerdown", cancel, true);
      clearTimeout(timer);
    };
    // Mount-only intent: the session flag is the gate, not reactive deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const graph = useMemo(
    () =>
      buildWellGraph({
        memories: (memories.data ?? []).map((m) => ({
          id: m.id ?? "",
          created_at: m.created_at ?? "",
          title: m.title ?? null,
          derived_from: m.derived_from ?? null,
        })),
      }),
    [memories.data],
  );

  // The substrate: a fixed deterministic fabric (zero data input) — the well
  // is textured from the FIRST frame, before the wire answers (W1b).
  const substrate = useMemo(() => buildSubstrate(), []);

  // The state organ rides the lazy `web-tones` chunk (never the LCP path),
  // mounted on the window element per the LivingLayer pattern.
  useEffect(() => {
    let destroy: (() => void) | undefined;
    let cancelled = false;
    void import("@/living/wellOrgan").then((m) => {
      if (cancelled || !winRef.current) return;
      destroy = m.mountWellOrgan(winRef.current);
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, []);

  // The ticker: the latest pulse event ONLY — a role="log" event line, never
  // a marquee (§2.2.2: zero auto-scroll); an empty feed renders nothing.
  const latest = pulse.data?.items[0];

  // Counters come only from sources that actually answered — no fabricated
  // numbers (HonestLine principle): memories total from store health when
  // capable, tags from the tag wire.
  const memoriesTotal = health.data?.servers.reduce(
    (sum, server) => sum + (server.memories_total ?? 0),
    0,
  );
  const tagsTotal = tags.data?.length;
  const counters: string[] = [];
  if (typeof memoriesTotal === "number") {
    counters.push(t("overview.heroMemories", { count: memoriesTotal }));
  }
  if (typeof tagsTotal === "number") {
    counters.push(t("overview.heroTags", { count: tagsTotal }));
  }

  return (
    <section aria-labelledby="well-hero-title" className="space-y-4">
      {/* Hero text elements 1–2: the display headline + the counters line.
       * No eyebrow (budget 0 on the Overview), no decoration on the words. */}
      <div className="space-y-1">
        <h1
          id="well-hero-title"
          className="font-ui text-display font-semibold leading-tight text-foreground"
        >
          {t("overview.heroTitle")}
        </h1>
        <p className="text-sm text-foreground-secondary">
          {t("overview.heroSubtitle")}
          {counters.length > 0 ? (
            <span className="font-mono tabular-nums">
              {" · "}
              {counters.join(" · ")}
            </span>
          ) : null}
        </p>
      </div>

      {/* The well: dark canvas in BOTH themes via the [data-well-window]
       * token scope; the only full-height gesture of the system. The state
       * organ (lazy web-tones chunk) owns data-well-tone/--well-tone on the
       * window and the readout text — deliberately NOT React state, so live
       * re-renders never clobber the physiology. */}
      <div
        ref={winRef}
        data-well-window=""
        data-live={liveLayer}
        data-awaken={awaken ? "true" : "false"}
        className="relative h-well-hero overflow-hidden rounded-lg border border-border-subtle bg-canvas shadow-well"
      >
        <svg
          viewBox={`0 0 ${WELL_VIEW_W} ${WELL_VIEW_H}`}
          preserveAspectRatio="xMidYMax meet"
          className="h-full w-full"
          aria-hidden="true"
        >
          {/* Substrate FIRST (z: ткань → рёбра → узлы → HUD): the
           * deterministic myelin fabric, monochrome, aria-hidden, never
           * toned, never beaded, never hover-responsive (W1b: цвет без
           * источника невозможен конструктивно). */}
          <g className="well-substrate" aria-hidden="true">
            {substrate.strands.map((strand, i) => (
              <line
                // Deterministic build — index keys are stable across renders.
                // eslint-disable-next-line react/no-array-index-key
                key={`s${i}`}
                x1={strand.a.x}
                y1={strand.a.y}
                x2={strand.b.x}
                y2={strand.b.y}
                className="well-substrate-strand"
              />
            ))}
            {substrate.points.map((point, i) => (
              <circle
                // eslint-disable-next-line react/no-array-index-key
                key={`p${i}`}
                cx={point.x}
                cy={point.y}
                r={2.5}
                className="well-substrate-node"
              />
            ))}
          </g>
          {graph.edges.length > 0 ? (
            <g className="well-drift">
              {graph.edges.map((edge) => (
                <line
                  key={`${edge.from.id}-${edge.to.id}`}
                  x1={edge.from.x}
                  y1={edge.from.y}
                  x2={edge.to.x}
                  y2={edge.to.y}
                  className="well-node stroke-myelin-hairline"
                  strokeWidth={1}
                  style={
                    {
                      "--awaken-band": Math.max(edge.from.band, edge.to.band),
                    } as CSSProperties
                  }
                />
              ))}
            </g>
          ) : null}
          {graph.nodes.length > 0 ? (
            <g className="well-drift">
              {graph.nodes.map((node) => (
                <circle
                  key={node.id}
                  cx={node.x}
                  cy={node.y}
                  r={node.hub ? 6 : 4}
                  className={node.hub ? "well-node fill-iris-bright" : "well-node fill-iris"}
                  data-id={node.id}
                  data-title={node.title ?? undefined}
                  data-date={node.date ?? undefined}
                  style={{ "--awaken-band": node.band } as CSSProperties}
                />
              ))}
            </g>
          ) : null}
          {/* Organ overlay (beads + hover halo): React renders it EMPTY and
           * never reconciles its children — the organ appends/removes here. */}
          <g className="well-live" aria-hidden="true" />
        </svg>

        {/* Honest states (review P1-1): a FAILED wire is not «empty» — the
         * error line names the failure; the invitation shows only when the
         * wire answered and found nothing. Pending renders nothing. Both
         * lines sit on the veil (§5.2 canvas-text discipline). */}
        {memories.isError ? (
          <p className="well-hud absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-sm text-foreground-secondary bg-hud-veil">
            {t("overview.wellError")}
          </p>
        ) : !memories.isPending && graph.nodes.length === 0 ? (
          <p className="well-hud absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-sm text-foreground-secondary bg-hud-veil">
            {t("overview.wellEmpty")}
          </p>
        ) : null}

        {/* HUD strip: veil ONLY under the text it carries (§5.2) — the
         * waiting chip + the hover readout (middle slot) + the event ticker.
         * Chip hidden until the counter settles; absent when nothing waits
         * (empty ≠ zero). The readout is filled by the organ on hover; empty
         * renders as nothing (`.well-readout:empty { display: none }`). */}
        <div className="well-hud absolute inset-x-0 bottom-0 border-t border-myelin-hairline bg-hud-veil">
          <div className="flex min-h-10 items-center justify-between gap-3 px-4 py-2">
            {waiting.capable &&
            !waiting.isPending &&
            !waiting.isError &&
            waiting.total > 0 ? (
              <Link
                to={waiting.urgentTo}
                className="inline-flex min-h-6 shrink-0 items-center gap-1.5 rounded-sm border border-border bg-canvas px-2 text-sm text-foreground transition-colors duration-instant hover:border-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <span aria-hidden="true" className="text-confidence">
                  ◆
                </span>
                {t("overview.waitingChip", { count: waiting.total })}
              </Link>
            ) : (
              <span />
            )}
            <p
              data-well-readout=""
              aria-hidden="true"
              className="well-readout pointer-events-none min-w-0 truncate font-mono text-sm tabular-nums text-foreground-secondary"
            />
            {latest ? (
              <p
                role="log"
                className="min-w-0 truncate font-mono text-sm tabular-nums text-foreground-secondary"
              >
                {t("overview.tickerItem", {
                  time: tickerTime(latest.created_at),
                  title: latest.title || latest.id,
                  server: latest.server,
                })}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
