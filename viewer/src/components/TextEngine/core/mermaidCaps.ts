/**
 * Hard size caps for mermaid on the UNTRUSTED profile (ADR 0020 Amendment 1,
 * ratified by the owner 2026-09-25, protective condition 2).
 *
 * The curated docs profile carries NO caps: its content is build-time
 * trusted and gated by the corpus integrity tests. Author content (agent
 * reports, memory records, task specs) is untrusted, so before the engine
 * spends a diagram render (and the 450 KiB lazy chunk load) on a fence, the
 * fence must pass these mechanical limits. Exceeding a cap is an HONEST
 * inert fallback — the fence renders as a plain code block, source fully
 * visible — never silent degradation and never a crash.
 *
 * Values (fixed here, not tuning knobs):
 * - FENCE CHARS  = 10_000 — generous for real agent diagrams (a large
 *   flowchart/sequence diagram is 1–3 KB; 10 KB ≈ many hundreds of edges),
 *   yet 2× under mermaid's own maxTextSize (20_000, the АРХКОМ-8 constant)
 *   so a hopeless fence is cut BEFORE the library chunk even loads.
 * - FENCES/SURFACE = 5 — far above any real report (1–2 diagrams); bounds
 *   the per-surface render passes, including the on-line theme-switch
 *   redraw of every mounted diagram (MutationObserver re-render).
 *   Worst case per surface: 5 × 10 KB = 50 KB of mermaid input.
 *
 * Both caps fail in the SAFE direction: any scanner doubt (exotic fence
 * syntax the regex can't parse) can only OVERCOUNT/overshoot, i.e. fall
 * back to source — never render more than the budget allows.
 */

/** Max chars of a single mermaid fence body on the untrusted profile. */
export const MERMAID_UNTRUSTED_MAX_FENCE_CHARS = 10_000;

/** Max mermaid fences rendered as diagrams on ONE untrusted surface. */
export const MERMAID_UNTRUSTED_MAX_FENCES_PER_SURFACE = 5;

/** Per-fence size verdict (pure; the honest fallback is the caller's). */
export function fenceExceedsSizeCap(code: string): boolean {
  return code.length > MERMAID_UNTRUSTED_MAX_FENCE_CHARS;
}

/**
 * Count the mermaid fences in a markdown SOURCE (a per-surface verdict
 * computed once per text — derived state, never per-render mutation; render
 * order is not observable, so counting at mount time would be a race).
 *
 * A CommonMark line-scan: a fence OPENS on `^ {0,3}` + 3+ backticks/tildes
 * with first info word "mermaid", and CLOSES on a same-marker line at least
 * as long with an empty info string (unclosed EOF fence still counts —
 * micromark renders it as code to EOF). Deliberately conservative: it never
 * needs parser parity, because both error directions are safe (overcount →
 * honest fallback; the one true undercount risk — a fence micromark accepts
 * that this scan misses — requires an info string micromark itself would
 * trim differently, not a realistic report shape).
 */
export function countMermaidFences(source: string): number {
  let count = 0;
  let open: { marker: string; isMermaid: boolean } | null = null;
  for (const line of source.split(/\r\n|\r|\n/)) {
    const match = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (open === null) {
      if (match === null) continue;
      const info = (match[2] ?? "").trim();
      const firstWord = info.split(/\s+/)[0]?.toLowerCase() ?? "";
      open = { marker: match[1], isMermaid: firstWord === "mermaid" };
      if (open.isMermaid) count += 1;
    } else {
      const closing =
        match !== null &&
        match[1][0] === open.marker[0] &&
        match[1].length >= open.marker.length &&
        (match[2] ?? "").trim() === "";
      if (closing) open = null;
    }
  }
  return count;
}
