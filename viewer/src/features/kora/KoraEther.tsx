import { useState } from "react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { formatTranscriptTime } from "./koraWorkspaceModel";
import type { KoraEtherRow } from "./koraEtherStore";

/**
 * The Эфир лента (U5; 15-WOW §3.2 — «справа — постоянный Эфир, живой поток
 * всех сессий»): ONE component, TWO mount points (the empty-scene card and
 * the Пульт wing — 07j §4.2, one feed, no duplicates; the ring lives in
 * koraEtherStore, both mounts render the same rows).
 *
 * Motion dose: the ONLY living beat in Кора is the arrival flash — the
 * newest row flares once (`kora-ether-flash`: impulse 240ms + decay
 * 400ms, amplitude ceiling `--neura-breath-alpha` ≤0.18). Rows restored
 * from the ring (a remount, a route return) do NOT flash — the flash is a
 * LIVE-arrival beat, not decoration. A silent bus renders the honest empty
 * line and ZERO movement (the honesty gate's scenario 8). Reduced mirrors
 * collapse the durations to 0ms — the row just is.
 *
 * A11y: `role="log"` + polite live region (15-WOW §3.2 WCAG row); the dot
 * is aria-hidden decoration; every fact is in the row text (1.4.1).
 */

const DOT_TONE: Record<string, string> = {
  "kora.ether.online": "bg-success",
  "kora.ether.onlineNoHost": "bg-success",
  "kora.ether.offline": "bg-warning",
  "kora.ether.offlineNoHost": "bg-warning",
  "kora.ether.registered": "bg-iris-bright",
  "kora.ether.registeredNoHost": "bg-iris-bright",
  "kora.ether.report": "bg-confidence",
  "kora.ether.reportBy": "bg-confidence",
};

export function KoraEther({
  rows,
  hostFilter,
  className,
}: {
  rows: readonly KoraEtherRow[];
  /** The page's ONE host filter (the header select); ""/null = all. */
  hostFilter?: string | null;
  className?: string;
}) {
  const t = useT();
  const visible =
    hostFilter != null && hostFilter !== ""
      ? rows.filter((row) => row.host === hostFilter)
      : rows;

  // Flash only LIVE arrivals: ids that appeared while THIS mount watched.
  // React's documented «storing information from previous renders» pattern
  // (guarded setState during render — no effect, no render-time refs): the
  // first pass adopts the restored rows silently, so a remount never
  // re-flashes history; later passes diff the ids and flash only fresh ones.
  const [seen, setSeen] = useState<ReadonlySet<number> | null>(null);
  const [flashIds, setFlashIds] = useState<ReadonlySet<number>>(new Set());
  if (seen === null) {
    setSeen(new Set(visible.map((row) => row.id)));
  } else {
    const fresh = new Set<number>();
    for (const row of visible) {
      if (!seen.has(row.id)) fresh.add(row.id);
    }
    if (fresh.size > 0) {
      setSeen(new Set([...seen, ...fresh]));
      setFlashIds(fresh);
    }
  }

  if (visible.length === 0) {
    return (
      <div className={cn("min-w-0", className)}>
        <p className="text-xs uppercase tracking-wide text-foreground-muted">
          {t("kora.ether.caps")}
        </p>
        <p className="mt-2 text-sm text-foreground-secondary">
          {hostFilter != null && hostFilter !== ""
            ? t("kora.ether.emptyFiltered", { host: hostFilter })
            : t("kora.ether.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs uppercase tracking-wide text-foreground-muted">
        {t("kora.ether.caps")}
      </p>
      <div
        role="log"
        aria-live="polite"
        aria-label={t("kora.ether.title")}
        className="kora-scroll mt-2 min-h-0 flex-1 overflow-y-auto"
      >
        <ol className="space-y-1.5">
          {visible.map((row) => (
            <li
              key={row.id}
              className={cn(
                "flex items-baseline gap-2 rounded-sm px-1 py-0.5 text-sm text-foreground-secondary",
                flashIds.has(row.id) && "kora-ether-flash",
              )}
            >
              <span className="w-9 shrink-0 font-mono text-xs tabular-nums text-foreground-muted">
                {formatTranscriptTime(new Date(row.ts).toISOString())}
              </span>
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 translate-y-px rounded-full",
                  DOT_TONE[row.key] ?? "bg-elevated",
                )}
              />
              <span className="min-w-0 break-words">{t(row.key, row.params)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
