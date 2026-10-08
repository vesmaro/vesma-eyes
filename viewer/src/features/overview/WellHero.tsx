import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router";
import { Check, Link2 } from "lucide-react";
import { getLiveLayer, useLiveLayer } from "@/lib/liveLayerStore";
import { useMemories } from "@/hooks/useMemories";
import { useBoardHealth } from "@/hooks/usePulse";
import { useTags } from "@/hooks/useTags";
import { useExecutors } from "@/features/agents/useAgents";
import { useI18n, useT } from "@/i18n";
import { isReducedMotion } from "@/living/tones";
import { useWaitingSummary } from "./useWaitingSummary";
import { useBusTicker } from "./busTicker";
import {
  buildSubstrate,
  buildWellGraph,
  WELL_NODE_CAP,
  WELL_VIEW_H,
  WELL_VIEW_W,
} from "./wellGraph";

/**
 * The Overview hero (SPEC-2026-10-07 «Обзор» + v12 §3.1): the well — ONE
 * full-bleed canvas standing on the dark floor in BOTH themes
 * (`data-well-window` — the owner-approved exception-image, 2026-10-01:
 * «кора светлая, колодец глубокий»; the veil follows the well, not the
 * page). Nodes are real memories, edges are real derived_from links —
 * data-as-decoration is the only imagery route (§5.4); with no data there
 * is no graph, only the honest empty line — and a failed wire names itself
 * (the honest error line).
 *
 * HUD discipline (§7.1): every text pixel inside the canvas sits on the
 * --hud-veil strip and carries ONLY the text-primary/secondary pairs —
 * text-muted is forbidden on HUD (3.7:1, computed in the blueprint). The
 * display headline and the counters line live ABOVE the canvas (page
 * chrome), so the hero's text budget holds: title, subtitle, waiting chip,
 * vitals, ticker.
 *
 * Motion gates (§10 + U2 honesty of light): NOTHING moves without a real
 * bus event. The awakening (once per session, sessionStorage flag) waits
 * for the FIRST /api/events frame — before it the well stands fully drawn
 * and still («первое дыхание из шины; шина молчит — экран стоит»); any
 * input cancels the wave. The drift/substrate breath mount only inside a
 * breath window the well organ opens on a real event. The ticker line
 * updates from bus frames alone (data — it moves in every regime, the
 * fade-swap only in «Полный»).
 */

const AWAKEN_SESSION_KEY = "vesmaro.awakened";

/** The awakening self-clears after the wave (≤1.2s) plus a small margin. */
const AWAKEN_CLEAR_MS = 1600;

/** The share confirmation clears after a beat (a UI state, not ambient). */
const SHARE_CLEAR_MS = 2400;

/** The tone legend — the well's own vocabulary (fix round, designer spec):
 * surface strip shows the three alarm words, the disclosure carries the
 * full six-colour dictionary. Tokens only — each swatch reads its colour
 * from the same token the organ paints nodes with. */
const LEGEND_SWATCHES = [
  { token: "--synapse-recall", key: "overview.legendToneRecall" },
  { token: "--synapse-write", key: "overview.legendToneWrite" },
  { token: "--color-success", key: "overview.legendToneSuccess" },
  { token: "--color-warning", key: "overview.legendToneWarning" },
  { token: "--color-error", key: "overview.legendToneError" },
  { token: "--web-tone-update", key: "overview.legendToneUpdate" },
] as const;

const SURFACE_MARKS = [
  { token: "--color-error", key: "overview.legendProblem" },
  { token: "--color-warning", key: "overview.legendAttention" },
  { token: "--web-tone-update", key: "overview.legendUpdate" },
] as const;

export function WellHero() {
  const t = useT();
  const { lang } = useI18n();
  const liveLayer = useLiveLayer();
  const waiting = useWaitingSummary();
  const winRef = useRef<HTMLDivElement>(null);

  // The graph: real memories + their real links (one contemplative read).
  const memories = useMemories({ limit: WELL_NODE_CAP });
  const health = useBoardHealth();
  // The vital cluster (v12 §3.1 HUD-bottom right): tags/agents — segments
  // render ONLY from wires that actually answered (pending → absent).
  const tags = useTags();
  const executors = useExecutors();

  // Locale-shaped numbers for the honesty counter (3 297 / 3,297).
  const fmt = useMemo(
    () => new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-US"),
    [lang],
  );

  // --- Awakening from the BUS (U2): the wave waits for the first real
  // /api/events frame of the session; before it the well stands fully
  // drawn and still. Any input cancels; reduced/calm/off never wave.
  const [awaken, setAwaken] = useState(false);
  const onBusEvent = useCallback(() => {
    let seen = true;
    try {
      seen = sessionStorage.getItem(AWAKEN_SESSION_KEY) === "1";
      sessionStorage.setItem(AWAKEN_SESSION_KEY, "1");
    } catch {
      seen = true; // storage unavailable — stay quiet
    }
    // Regime values read AT EVENT TIME (the canon: the wave dresses the
    // layer that is actually live when the first frame lands).
    if (seen || isReducedMotion() || getLiveLayer() !== "live") return;
    setAwaken(true);
    const cancel = (): void => {
      setAwaken(false);
      window.removeEventListener("keydown", cancel, true);
      window.removeEventListener("pointerdown", cancel, true);
    };
    // Any input cancels the wave early; otherwise it self-clears (≤1.2s
    // wave + margin) — the listeners ride exactly this one wave.
    window.addEventListener("keydown", cancel, true);
    window.addEventListener("pointerdown", cancel, true);
    setTimeout(cancel, AWAKEN_CLEAR_MS);
  }, []);
  // The bus ticker: one line, the latest REAL frame (null while silent).
  const busTicker = useBusTicker(onBusEvent);

  // The legend disclosure: Esc returns focus to the button, an outside
  // pointer closes it — both only while open (zero listeners at rest).
  const [legendOpen, setLegendOpen] = useState(false);
  const legendRef = useRef<HTMLDivElement>(null);
  const legendButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!legendOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setLegendOpen(false);
        legendButtonRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent): void => {
      if (!legendRef.current?.contains(e.target as Node)) setLegendOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [legendOpen]);

  // --- «Поделиться» (v12 HUD-top; the stand stubs it — here it acts):
  // copy this page's URL; the confirmation is a UI state, never motion. ---
  const [share, setShare] = useState<"idle" | "done" | "manual">("idle");
  const shareTimer = useRef<ReturnType<typeof setTimeout> | 0>(0);
  useEffect(
    () => () => {
      if (shareTimer.current) clearTimeout(shareTimer.current);
    },
    [],
  );
  const onShare = (): void => {
    const url = window.location.href;
    const settle = (state: "done" | "manual"): void => {
      setShare(state);
      if (shareTimer.current) clearTimeout(shareTimer.current);
      shareTimer.current = setTimeout(() => setShare("idle"), SHARE_CLEAR_MS);
    };
    if (typeof navigator?.clipboard?.writeText === "function") {
      navigator.clipboard
        .writeText(url)
        .then(() => settle("done"))
        .catch(() => settle("manual"));
    } else {
      settle("manual"); // no clipboard: show the URL for a manual copy
    }
  };

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

  // The vitals + ticker live in the HUD rows below (see the strip markup).

  // The honesty counter (fix round) REPLACES the records/tags pair: it
  // describes exactly what is drawn — the shown sample of the well — and
  // reads only from wires that actually answered (pending → no segment).
  // An answered empty well shows the invitation, not a zero counter.
  const memoriesTotal = health.data?.servers.reduce(
    (sum, server) => sum + (server.memories_total ?? 0),
    0,
  );
  const listAnswered = memories.isSuccess;
  const shown = graph.nodes.length;
  let counter: string | null = null;
  if (listAnswered && shown > 0) {
    counter =
      memoriesTotal !== undefined
        ? t("overview.heroShownOf", {
            shown: fmt.format(shown),
            total: fmt.format(memoriesTotal),
          })
        : t("overview.heroShown", { shown: fmt.format(shown) });
  } else if (memoriesTotal !== undefined && !(listAnswered && shown === 0)) {
    // Only the health wire answered (the list is pending/failed — or it
    // answered empty while the store reports records): today's fallback.
    counter = t("overview.heroMemories", { count: fmt.format(memoriesTotal) });
  }

  // The vital cluster (HUD-bottom right): segments only from ANSWERED
  // wires (pending → absent; a settled empty list is an honest 0). Numbers
  // are locale-shaped; labels are data, not decor (v12 §3.1).
  const tagCount = tags.isSuccess ? tags.data.length : null;
  const agentCount = executors.isSuccess ? executors.data.count : null;
  const vitals = [
    tagCount !== null ? t("overview.heroTags", { count: fmt.format(tagCount) }) : null,
    agentCount !== null
      ? t("overview.heroAgents", { count: fmt.format(agentCount) })
      : null,
  ]
    .filter((segment): segment is string => segment !== null)
    .join(" · ");

  return (
    <section aria-labelledby="well-hero-title" className="w-full space-y-4">
      {/* Hero text elements 1–2 + «Поделиться»: the display headline, the
       * honesty counter and the share action on the page-measure column
       * (the H1 x stays on the page grid while the canvas goes full-bleed).
       * No eyebrow (budget 0 on the Overview), no decoration on the words. */}
      <div className="mx-auto flex w-full max-w-4xl items-start justify-between gap-4">
        <div className="space-y-1">
          <h1
            id="well-hero-title"
            className="font-ui text-display font-semibold leading-tight text-foreground"
          >
            {t("overview.heroTitle")}
          </h1>
          <p className="text-sm text-foreground-secondary">
            {t("overview.heroSubtitle")}
            {counter ? (
              <span className="font-mono tabular-nums">
                {" · "}
                {counter}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={onShare}
            className="inline-flex min-h-6 shrink-0 items-center gap-1.5 rounded-sm border border-border bg-canvas px-2 text-foreground transition-colors duration-instant hover:border-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            style={{
              fontSize: "var(--text-caps)",
              letterSpacing: "var(--tracking-caps)",
            }}
          >
            {share === "done" ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <Link2 className="size-3.5" aria-hidden="true" />
            )}
            {t("overview.share")}
          </button>
          <span
            aria-live="polite"
            className="max-w-56 truncate text-right text-foreground-secondary"
            style={{
              fontSize: "var(--text-caps)",
              letterSpacing: "var(--tracking-caps)",
            }}
          >
            {share === "done"
              ? t("overview.shareDone")
              : share === "manual"
                ? t("overview.shareManual", {
                    url: typeof window === "undefined" ? "" : window.location.href,
                  })
                : ""}
          </span>
        </div>
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
                  className={
                    node.hub ? "well-node fill-iris-bright" : "well-node fill-iris"
                  }
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

        {/* HUD strip (v12 §3.1): veil ONLY under the text it carries (§5.2).
         * Row 1 — the waiting chip + the hover readout (middle slot) + the
         * vital cluster. Row 2 — the bus ticker (role="log"): one line,
         * updates ONLY on a real frame, in every live-layer regime (data,
         * not decor — §13.3); the fade-swap motion is CSS-gated. Chip and
         * vitals hide until their wires settle; absent when nothing waits. */}
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
            {vitals !== "" ? (
              <p className="hidden shrink-0 font-mono text-sm tabular-nums text-foreground-secondary sm:block">
                {vitals}
              </p>
            ) : (
              <span />
            )}
          </div>
          <div className="flex min-h-8 items-center gap-3 border-t border-myelin-hairline px-4 py-1.5">
            <p
              key={busTicker?.seq ?? 0}
              role="log"
              aria-label={t("overview.tickerLabel")}
              title={
                busTicker && busTicker.full !== busTicker.text
                  ? `${busTicker.time} · ${busTicker.full}`
                  : undefined
              }
              className={`well-ticker-line min-w-0 flex-1 truncate font-mono text-sm tabular-nums ${
                busTicker === null
                  ? "text-foreground-secondary"
                  : busTicker.isError
                    ? "text-error"
                    : "text-foreground-secondary"
              }`}
            >
              {busTicker ? `${busTicker.time} · ${busTicker.text}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* The tone legend (fix round, two tiers; AA verdict — designer): the
       * strip TEXT is page chrome (page text pair on the page background),
       * while the MARKERS and the disclosure PANEL keep [data-well-legend] —
       * the dark well column is the subject of the legend, the strip copy is
       * not. Page chrome, not a living-layer signal — present muted too. */}
      <div
        ref={legendRef}
        className="relative flex items-center justify-between gap-3"
        style={{ marginTop: "var(--space-2)" }}
      >
        <p
          className="flex min-w-0 items-center gap-2 text-foreground-secondary"
          style={{
            fontSize: "var(--text-caps)",
            letterSpacing: "var(--tracking-caps)",
          }}
        >
          {SURFACE_MARKS.map(({ token, key }, i) => (
            <span key={key} className="flex items-center gap-1.5">
              {i > 0 ? (
                <span aria-hidden="true" className="text-foreground-muted">
                  ·
                </span>
              ) : null}
              <span
                aria-hidden="true"
                data-well-legend=""
                className="well-legend-dot inline-block size-1.5 shrink-0 rounded-full"
                style={{ background: `var(${token})` }}
              />
              {t(key)}
            </span>
          ))}
        </p>
        <button
          ref={legendButtonRef}
          id="well-legend-button"
          type="button"
          aria-expanded={legendOpen}
          aria-controls="well-legend-panel"
          onClick={() => setLegendOpen((v) => !v)}
          className="inline-flex min-h-6 shrink-0 items-center rounded-sm border border-border bg-canvas px-2 text-foreground transition-colors duration-instant hover:border-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          style={{
            fontSize: "var(--text-caps)",
            letterSpacing: "var(--tracking-caps)",
          }}
        >
          {t("overview.legendAbout")}
        </button>
        {legendOpen ? (
          <div
            id="well-legend-panel"
            role="region"
            aria-labelledby="well-legend-button"
            data-well-legend=""
            className="absolute right-0 top-full z-10 mt-1 w-[min(26rem,100%)] rounded-md border border-border-subtle bg-elevated p-4 shadow-float"
          >
            <ul className="space-y-2">
              {LEGEND_SWATCHES.map(({ token, key }) => (
                <li key={key} className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="well-legend-swatch inline-block size-1.5 shrink-0 rounded-full"
                    style={{ background: `var(${token})` }}
                  />
                  <span className="text-foreground">{t(key)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-foreground-secondary">
              {t("overview.legendNote", { shown: fmt.format(shown) })}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
