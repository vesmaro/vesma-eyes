/**
 * Pulse freshness verdict (D7 P5 — «верхняя запись 21 Sep, сегодня 21.10 —
 * читаю месячной давности как свежее»): the pulse page must say honestly
 * when its feed went quiet.
 *
 * The stall threshold is DERIVED FROM THE FEED'S OWN CADENCE — no fixed
 * magic constant: the median gap between consecutive records scaled 10×,
 * clamped to [48 hours, 14 days].
 *  - a healthy feed writes every minutes/hours → the threshold sits at the
 *    48-hour clamp;
 *  - a naturally slow feed (weekly digest) gets the 14-day clamp and does
 *    NOT trip the plate a day after its last write.
 * The verdict fires when the newest record is older than that threshold.
 */

export interface PulseFreshness {
  /** true = the newest record is older than the cadence-derived threshold. */
  stalled: boolean;
  /** Whole days since the newest record (0 = today). -1 on an empty feed. */
  newestAgeDays: number;
  /** ISO timestamp of the newest record; null on an empty feed. */
  newestAt: string | null;
  /** The threshold actually used (ms) — surfaced for tests and honesty. */
  thresholdMs: number;
}

const DAY_MS = 86_400_000;
const MIN_THRESHOLD_MS = 2 * DAY_MS; // 48 h — the healthy-feed clamp
const MAX_THRESHOLD_MS = 14 * DAY_MS; // 14 d — the slow-digest clamp
const CADENCE_SCALE = 10; // 10× the median gap before «stopped» is honest

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function pulseFreshness(
  items: readonly { created_at?: string | null }[],
  nowMs: number = Date.now(),
): PulseFreshness {
  const times = items
    .map((item) => new Date(item.created_at ?? "").getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a); // newest first
  if (times.length === 0) {
    return { stalled: false, newestAgeDays: -1, newestAt: null, thresholdMs: MIN_THRESHOLD_MS };
  }
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const gap = times[i - 1] - times[i];
    if (gap > 0) gaps.push(gap);
  }
  // A single record carries no cadence information — the conservative
  // 48-hour clamp IS the fallback (never scaled).
  const thresholdMs =
    gaps.length === 0
      ? MIN_THRESHOLD_MS
      : Math.min(MAX_THRESHOLD_MS, Math.max(MIN_THRESHOLD_MS, median(gaps) * CADENCE_SCALE));
  const newest = times[0];
  const newestAgeDays = Math.max(0, Math.floor((nowMs - newest) / DAY_MS));
  return {
    stalled: nowMs - newest > thresholdMs,
    newestAgeDays,
    newestAt: new Date(newest).toISOString(),
    thresholdMs,
  };
}
