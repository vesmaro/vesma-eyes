/**
 * Telemetry session singleton (ME-041) — the ONE gate every emitter talks
 * to. Owns the visit identity, the anonymous-session gate and the small
 * cross-surface state the emitters need (current surface, last route,
 * palette/activation attribution).
 *
 * Gate discipline (taxonomy §1.3): anonymous loads NEVER emit. The only
 * arm signal is the boot probe of the live `vesmaro_ui` cookie (ME-028:
 * `GET /api/auth/ui-token` → 204) — `startVisit()` is wired exactly
 * there (the boot auth-session store, features/ui-token/authSession.ts,
 * which owns the probe since the И1 stitch; formerly the provider's own
 * probe call) and is idempotent, so a StrictMode double probe or a
 * re-mount still yields one visit. Everything a disarmed session does is
 * a no-op: no visit_id, no queue, no listeners, no wire calls.
 *
 * In tests (`import.meta.env.MODE === "test"`) the singleton rides a
 * silent transport and no flush timer, so existing suites never see wire
 * traffic they did not ask for; unit coverage of the wire mechanics lives
 * on the TelemetryClient class with injected fakes, and coverage of the
 * gate/attribution on this module's introspection seam.
 */
import { onRequestFailure } from "@/gateway/http";
import { TelemetryClient } from "./telemetryClient";
import {
  latencyClassFromMs,
  makeVisitId,
  monotonicNow,
  opFromMethod,
  statusClassFromStatus,
  surfaceFromPathname,
  validateTelemetryEvent,
  type TelemetryKoraEntry,
  type TelemetryNavVia,
  type TelemetryOp,
  type TelemetryPaletteGroup,
  type TelemetryPaletteTrigger,
  type TelemetrySelectionVia,
  type TelemetryStatusClass,
} from "./events";

const IS_TEST = import.meta.env.MODE === "test";

/** A palette-initiated navigation stays attributable for this long. */
const PALETTE_ATTRIBUTION_MS = 1_500;
/** A route change this close to a real click/activation reads as a link. */
const ACTIVATION_WINDOW_MS = 250;

let armed = false;
let visitId: string | null = null;
let client: TelemetryClient | null = null;
let detached = false; // pagehide fired — no further flushing promises

/** Current surface slug (the surface_error stamp); set at arm and on nav. */
let currentSurface = "overview";
/** Pathname observed before the current one — the kora domain-entry probe. */
let previousPathname: string | null = null;
let paletteNavAt = Number.NEGATIVE_INFINITY;
let lastActivationAt = Number.NEGATIVE_INFINITY;
let locallyDropped = 0;

/** Silent transport for test mode: pretend-accepted, zero wire traffic. */
function createClient(): TelemetryClient {
  if (!IS_TEST) return new TelemetryClient();
  return new TelemetryClient({
    fetchImpl: async () =>
      new Response(JSON.stringify({ ok: true, accepted: 0, dropped: 0 }), {
        status: 200,
      }),
    beaconImpl: () => true,
    makeBlob: () => new Blob([]),
  });
}

function enqueue(kind: string, props: Record<string, unknown>): void {
  if (!armed || client === null || visitId === null || detached) return;
  const event = { kind, visit_id: visitId, ...props };
  if (!validateTelemetryEvent(event)) {
    // Off-taxonomy events never board a batch (the ingest is
    // all-or-nothing — one bad event would 422 the whole batch).
    locallyDropped += 1;
    return;
  }
  client.enqueue(event);
}

// --- Session gate ------------------------------------------------------------

/**
 * Arm the battery for this SPA load: stamp the visit id, emit `ui.visit`
 * (§1.2 #1 — the denominator of numbers 1, 2, 4, 5) and start the
 * battery. Called ONLY from the live-probe path (the boot auth-session
 * store — the single owner of the boot probe since the И1 stitch); every
 * later call is a no-op.
 */
export function startVisit(): void {
  if (armed) return;
  armed = true;
  visitId = makeVisitId();
  client = createClient();
  if (typeof window !== "undefined") {
    currentSurface = surfaceFromPathname(window.location.pathname);
    // via=link attribution: any real activation right before a route
    // change reads as an in-app link (catch:true sees stopped clicks too).
    window.addEventListener(
      "click",
      () => {
        lastActivationAt = monotonicNow();
      },
      { capture: true, passive: true },
    );
    // §3.2: the last batch leaves with the page — beacon, never lost.
    for (const event of ["pagehide", "unload"] as const) {
      window.addEventListener(event, onPageHide);
    }
  }
  if (!IS_TEST) client.start();
  enqueue("ui.visit", {});
}

function onPageHide(): void {
  detached = true;
  client?.flushOnPageHide();
}

// --- Emitters (one per owning surface, taxonomy §1.2 П3 rows) -----------------

/** Route changed to `pathname` — the nav observer owns this call. */
export function trackRouteChange(pathname: string): void {
  const via = consumeNavVia();
  const surface = surfaceFromPathname(pathname);
  enqueue("ui.nav", { surface, via });
  currentSurface = surface;
  previousPathname = pathname;
}

/** Palette marked a navigation (called BEFORE `navigate()`); the observer consumes it. */
export function markPaletteNavigation(): void {
  paletteNavAt = monotonicNow();
}

/** The palette dialog opened (emitted from lib/paletteState, the open-state owner). */
export function trackPaletteOpened(trigger: TelemetryPaletteTrigger): void {
  enqueue("cmdk.palette_opened", { trigger });
}

/** A palette row was activated (emitted from CommandPalette's choose). */
export function trackItemSelected(
  group: TelemetryPaletteGroup,
  via: TelemetrySelectionVia,
): void {
  enqueue("cmdk.item_selected", { group, via });
}

/** The Kora page's content settled (list or transcript — the hook times it). */
export function trackKoraEntered(entry: TelemetryKoraEntry, latencyMs: number): void {
  enqueue("kora.entered", {
    entry,
    latency_class: latencyClassFromMs(latencyMs),
  });
}

/**
 * A gateway request failed on a ui surface (http.ts seam). The request
 * PATH never crosses this boundary (§3.4) — only the status class and the
 * coarse read/write intent ride along, stamped with the current surface.
 */
export function trackSurfaceError(status: number, method: string): void {
  const statusClass = statusClassFromStatus(status);
  if (statusClass === null) {
    // Not expressible in the frozen v0 vocabulary (e.g. a bare 400) —
    // mislabeling it would corrupt the classes numbers 5 counts on.
    locallyDropped += 1;
    return;
  }
  const op: TelemetryOp = opFromMethod(method);
  const surface = currentSurface;
  const cls: TelemetryStatusClass = statusClass;
  enqueue("ui.surface_error", { surface, status_class: cls, op });
}

// The http failure seam is subscribed once, at module init: requestJson
// reports statuses/methods, this module decides whether anyone listens.
onRequestFailure((notice) => {
  trackSurfaceError(notice.status, notice.method);
});

// --- Attribution + state probes (used by the observer / kora hook) -----------

function consumeNavVia(): TelemetryNavVia {
  const now = monotonicNow();
  if (now - paletteNavAt <= PALETTE_ATTRIBUTION_MS) {
    paletteNavAt = Number.NEGATIVE_INFINITY;
    return "palette";
  }
  if (now - lastActivationAt <= ACTIVATION_WINDOW_MS) return "link";
  return "route";
}

/**
 * The pathname observed before the current commit. Read by the Kora hook
 * at ITS mount — child effects run before the observer's parent effect,
 * so on a navigation INTO /kora this still answers the pre-kora pathname
 * (domain entry), and on kora→kora moves it answers a /kora path (no
 * re-entry). Null until the first observation (direct load).
 */
export function getPreviousPathname(): string | null {
  return previousPathname;
}

/** Fresh palette attribution without consuming it (kora entry=palette). */
export function peekPaletteAttribution(): boolean {
  return monotonicNow() - paletteNavAt <= PALETTE_ATTRIBUTION_MS;
}

/** Current surface slug (set at arm, updated per navigation). */
export function getCurrentSurface(): string {
  return currentSurface;
}

// --- Test seams ----------------------------------------------------------------

/** Test-only introspection: gate state, buffered events, local drop count. */
export function __stateForTests(): {
  armed: boolean;
  visitId: string | null;
  pending: readonly unknown[];
  locallyDropped: number;
} {
  return {
    armed,
    visitId,
    pending: client ? client.pending() : [],
    locallyDropped,
  };
}

/** Test-only reset of the singleton (gate, attribution, listeners' inputs). */
export function __resetForTests(): void {
  armed = false;
  visitId = null;
  client?.stop();
  client = null;
  detached = false;
  currentSurface = "overview";
  previousPathname = null;
  paletteNavAt = Number.NEGATIVE_INFINITY;
  lastActivationAt = Number.NEGATIVE_INFINITY;
  locallyDropped = 0;
}
