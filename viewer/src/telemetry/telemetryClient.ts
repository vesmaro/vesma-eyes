/**
 * The telemetry battery (ME-041, taxonomy §3.2) — a queue that can never
 * get in the owner's way:
 *
 * - flush at FLUSH_THRESHOLD events, every FLUSH_INTERVAL_MS, or on
 *   pagehide/unload via `navigator.sendBeacon` (the last batch survives
 *   the tab closing);
 * - one batch never exceeds MAX_BATCH (server cap 50, ME-037 → 413);
 * - the queue is a ring of RING_CAPACITY events — overflow drops the
 *   OLDEST (present beats past);
 * - a send failure gets ONE retry (transient classes only: transport,
 *   429, 5xx) and then the batch is dropped silently — telemetry never
 *   blocks, toasts or logs (§3.2: "никогда не мешает");
 * - server verdicts (403/413/422) are not retried: the batch is rejected,
 *   not lost in transit — resending an identical rejected batch is pure
 *   noise against the rate limiter.
 *
 * Events are validated by the caller (telemetry.ts) against the taxonomy
 * mirror BEFORE enqueue: the ingest is all-or-nothing, so one malformed
 * event must never board a batch.
 */

/** Flush as soon as this many events are buffered (§3.2 "батч ≥ 10"). */
export const FLUSH_THRESHOLD = 10;
/** Periodic flush cadence (§3.2 "каждые 15 с"). */
export const FLUSH_INTERVAL_MS = 15_000;
/** Hard server cap per request (ME-037 `_TELEMETRY_BATCH_MAX`, 413 above). */
export const MAX_BATCH = 50;
/** Ring capacity — drop-oldest overflow (§3.2). */
export const RING_CAPACITY = 100;
/** Delay before the single retry of a transient send failure. */
export const RETRY_DELAY_MS = 3_000;

/** What a transport POST resolved to — statuses only, never bodies. */
export interface SendOutcome {
  ok: boolean;
  status: number;
}

export interface TelemetryClientOptions {
  /** Ingest endpoint (same-origin default, rides the owner cookie). */
  endpoint?: string;
  /** POST transport (tests inject a fake; default: global fetch). */
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  /** `navigator.sendBeacon` equivalent for the pagehide flush. */
  beaconImpl?: (url: string, blob: Blob) => boolean;
  /** Blob factory seam (happy-dom/node tests). */
  makeBlob?: (parts: string[], options: { type: string }) => Blob;
}

/** Response-shaped constant for a transport that threw — status 0. */
const TRANSPORT_THROW: SendOutcome = { ok: false, status: 0 };

function defaultFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, init);
}

function defaultBeacon(url: string, blob: Blob): boolean {
  const navigatorApi = globalThis.navigator;
  if (
    navigatorApi &&
    typeof (navigatorApi as Navigator).sendBeacon === "function" &&
    (navigatorApi as Navigator).sendBeacon(url, blob)
  ) {
    return true;
  }
  return false;
}

function defaultBlob(parts: string[], options: { type: string }): Blob {
  return new Blob(parts, options);
}

export class TelemetryClient {
  private readonly endpoint: string;
  private readonly fetchImpl: NonNullable<TelemetryClientOptions["fetchImpl"]>;
  private readonly beaconImpl: NonNullable<TelemetryClientOptions["beaconImpl"]>;
  private readonly makeBlobFn: NonNullable<TelemetryClientOptions["makeBlob"]>;
  private readonly queue: unknown[] = [];
  private inFlight = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Test/diagnostic counters — never transported, never logged in prod. */
  droppedBatches = 0;

  constructor(options: TelemetryClientOptions = {}) {
    this.endpoint = options.endpoint ?? "/api/events/ui";
    this.fetchImpl = options.fetchImpl ?? defaultFetch;
    this.beaconImpl = options.beaconImpl ?? defaultBeacon;
    this.makeBlobFn = options.makeBlob ?? defaultBlob;
  }

  /**
   * Buffer one validated event. Ring semantics: a full queue drops the
   * oldest event to admit the newest. Reaching the flush threshold sends
   * immediately (never awaited — failures are the battery's problem, not
   * the caller's).
   */
  enqueue(event: unknown): void {
    if (this.queue.length >= RING_CAPACITY) this.queue.shift();
    this.queue.push(event);
    if (this.queue.length >= FLUSH_THRESHOLD && !this.inFlight) {
      void this.deliverNext();
    }
  }

  /** Start the periodic flush (idempotent). */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      if (!this.inFlight) void this.deliverNext();
    }, FLUSH_INTERVAL_MS);
  }

  /** Stop the periodic flush and drop anything still buffered. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.queue.length = 0;
  }

  /** Events waiting for the next flush (diagnostics/tests). */
  pending(): readonly unknown[] {
    return this.queue;
  }

  /**
   * Last-chance flush for pagehide/unload (§3.2): every buffered chunk
   * leaves as its own `sendBeacon` (browser-queued, survives unload);
   * when no beacon transport exists a `keepalive` fetch is the fallback.
   * Both are fire-and-forget — nothing here may throw into the page.
   */
  flushOnPageHide(): void {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, MAX_BATCH);
      const body = JSON.stringify({ events: batch });
      const blob = this.makeBlobFn([body], { type: "application/json" });
      let queued = false;
      try {
        queued = this.beaconImpl(this.endpoint, blob);
      } catch {
        queued = false;
      }
      if (!queued) {
        // Fallback: a keepalive fetch outlives the page without blocking it.
        void this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {
          this.droppedBatches += 1;
        });
      }
    }
  }

  /**
   * Take the next batch (≤ MAX_BATCH) and deliver it. Runs at most one
   * delivery at a time; anything buffered during a flight waits for the
   * next trigger.
   */
  private async deliverNext(): Promise<void> {
    if (this.inFlight || this.queue.length === 0) return;
    const batch = this.queue.splice(0, MAX_BATCH);
    this.inFlight = true;
    try {
      await this.deliver(batch, true);
    } finally {
      this.inFlight = false;
      // More buffered while we flew (e.g. a threshold reached mid-flight)?
      // Hand it to the next trigger — the timer or the next enqueue.
    }
  }

  /** One delivery attempt; `allowRetry` gates the single retry. */
  private async deliver(batch: unknown[], allowRetry: boolean): Promise<void> {
    const outcome = await this.post(batch);
    if (outcome.ok) return;
    const transient =
      outcome.status === 0 || outcome.status === 429 || outcome.status >= 500;
    if (transient && allowRetry) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      // The batch may exceed nothing while waiting — events buffered during
      // the backoff simply wait in the queue; the retry re-posts the same
      // detached batch.
      await this.deliver(batch, false);
      return;
    }
    this.droppedBatches += 1; // verdict, or a retry that failed too: drop, silently
  }

  private async post(batch: unknown[]): Promise<SendOutcome> {
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch }),
        credentials: "same-origin",
      });
      return { ok: response.ok, status: response.status };
    } catch {
      return TRANSPORT_THROW;
    }
  }
}
