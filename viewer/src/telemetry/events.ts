/**
 * UI telemetry taxonomy v0 — client mirror of the frozen kind registry
 * (docs/union/events-taxonomy-v0.md §1.2; the server's strict pydantic
 * models live in server/app.py, ME-037).
 *
 * The ingest is all-or-nothing: ONE off-taxonomy event 422s the WHOLE
 * batch (extra="forbid", unknown kind, free-text field). The client
 * therefore re-validates every event against this mirror BEFORE it may
 * join a batch — a malformed event is dropped locally with a counter,
 * never allowed to poison the queue.
 *
 * This slice (ME-041, П3-on-main) emits exactly the six kinds the current
 * surfaces own. The intent_* composer events (И1) and living.* (И3) are
 * deliberately absent — the frozen vocabulary is additive, those kinds
 * arrive with their surfaces.
 *
 * Privacy boundary (taxonomy §3.4): facts, never content — no request
 * paths, no query text, no error text, no exact sizes or delays. All
 * string fields ride slug charsets and caps even before the server
 * re-checks them.
 */

// --- Property value spaces (taxonomy §1.2) ---------------------------------

/** How a navigation happened: route = URL/programmatic, link = in-app link. */
export type TelemetryNavVia = "route" | "link" | "palette";
/** Coarse delay buckets (§1.2): a < 300 ms / b < 1 s / c ≥ 1 s. */
export type TelemetryLatencyClass = "a" | "b" | "c";
/** Status classes the frozen v0 vocabulary can express. */
export type TelemetryStatusClass =
  | "e401"
  | "e403"
  | "e404"
  | "e429"
  | "e5xx"
  | "network";
/** Coarse request intent: GET = read, everything else = write. */
export type TelemetryOp = "read" | "write";
/** Palette trigger sources. */
export type TelemetryPaletteTrigger = "hotkey" | "button";
/** How a palette row was activated. */
export type TelemetrySelectionVia = "enter" | "click";
/** How the Kora domain was entered. */
export type TelemetryKoraEntry = "route" | "palette";
/** Palette row groups (taxonomy keeps "action" for future surfaces). */
export type TelemetryPaletteGroup =
  | "memory"
  | "tasks"
  | "agents"
  | "nav"
  | "action";

// --- Event payload shapes (exactly the §1.2 property sets) -----------------

export interface UiVisitEvent {
  kind: "ui.visit";
}

export interface UiNavEvent {
  kind: "ui.nav";
  surface: string;
  via: TelemetryNavVia;
}

export interface KoraEnteredEvent {
  kind: "kora.entered";
  entry: TelemetryKoraEntry;
  latency_class: TelemetryLatencyClass;
}

export interface CmdkPaletteOpenedEvent {
  kind: "cmdk.palette_opened";
  trigger: TelemetryPaletteTrigger;
}

export interface CmdkItemSelectedEvent {
  kind: "cmdk.item_selected";
  group: TelemetryPaletteGroup;
  via: TelemetrySelectionVia;
}

export interface UiSurfaceErrorEvent {
  kind: "ui.surface_error";
  surface: string;
  status_class: TelemetryStatusClass;
  op: TelemetryOp;
}

/** The П3 slice of the taxonomy dictionary (kind-discriminated). */
export type UiTelemetrySliceEvent =
  | UiVisitEvent
  | UiNavEvent
  | KoraEnteredEvent
  | CmdkPaletteOpenedEvent
  | CmdkItemSelectedEvent
  | UiSurfaceErrorEvent;

// --- Field constraints (mirror of the server's Field patterns) -------------

/** visit_id: a slug id, 8–64 chars (server: `^[0-9A-Za-z][0-9A-Za-z-]*$`). */
export const VISIT_ID_PATTERN = /^[0-9A-Za-z][0-9A-Za-z-]{7,63}$/;
/** surface: a lowercase slug, 1–40 chars (server: `^[a-z][a-z0-9_-]*$`). */
export const SURFACE_PATTERN = /^[a-z][a-z0-9_-]{0,39}$/;

const NAV_VIAS: readonly TelemetryNavVia[] = ["route", "link", "palette"];
const KORA_ENTRIES: readonly TelemetryKoraEntry[] = ["route", "palette"];
const LATENCY_CLASSES: readonly TelemetryLatencyClass[] = ["a", "b", "c"];
const STATUS_CLASSES: readonly TelemetryStatusClass[] = [
  "e401",
  "e403",
  "e404",
  "e429",
  "e5xx",
  "network",
];
const OPS: readonly TelemetryOp[] = ["read", "write"];
const TRIGGERS: readonly TelemetryPaletteTrigger[] = ["hotkey", "button"];
const SELECTION_VIAS: readonly TelemetrySelectionVia[] = ["enter", "click"];
const GROUPS: readonly TelemetryPaletteGroup[] = [
  "memory",
  "tasks",
  "agents",
  "nav",
  "action",
];

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

/** Exact key-set check — an extra field is as fatal on the wire as a typo'd one. */
function hasExactKeys(event: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(event).sort().join(",");
  const expected = [...keys].sort().join(",");
  return actual === expected;
}

/**
 * Validate one wire event (visit_id already merged in) against the mirror.
 * Returns true iff the server's all-or-nothing batch validation would
 * accept it; anything else must be dropped before it can poison a batch.
 */
export function validateTelemetryEvent(event: unknown): boolean {
  if (typeof event !== "object" || event === null) return false;
  const record = event as Record<string, unknown>;
  if (typeof record.visit_id !== "string" || !VISIT_ID_PATTERN.test(record.visit_id)) {
    return false;
  }
  switch (record.kind) {
    case "ui.visit":
      return hasExactKeys(record, ["kind", "visit_id"]);
    case "ui.nav":
      return (
        hasExactKeys(record, ["kind", "visit_id", "surface", "via"]) &&
        typeof record.surface === "string" &&
        SURFACE_PATTERN.test(record.surface) &&
        isOneOf(record.via, NAV_VIAS)
      );
    case "kora.entered":
      return (
        hasExactKeys(record, ["kind", "visit_id", "entry", "latency_class"]) &&
        isOneOf(record.entry, KORA_ENTRIES) &&
        isOneOf(record.latency_class, LATENCY_CLASSES)
      );
    case "cmdk.palette_opened":
      return (
        hasExactKeys(record, ["kind", "visit_id", "trigger"]) &&
        isOneOf(record.trigger, TRIGGERS)
      );
    case "cmdk.item_selected":
      return (
        hasExactKeys(record, ["kind", "visit_id", "group", "via"]) &&
        isOneOf(record.group, GROUPS) &&
        isOneOf(record.via, SELECTION_VIAS)
      );
    case "ui.surface_error":
      return (
        hasExactKeys(record, ["kind", "visit_id", "surface", "status_class", "op"]) &&
        typeof record.surface === "string" &&
        SURFACE_PATTERN.test(record.surface) &&
        isOneOf(record.status_class, STATUS_CLASSES) &&
        isOneOf(record.op, OPS)
      );
    default:
      // Unknown kind (incl. the И1/И3 families) — not in this slice's
      // dictionary; the server would 422 the whole batch for it.
      return false;
  }
}

// --- Pure mappers ----------------------------------------------------------

/**
 * HTTP status → the frozen status-class vocabulary. Returns null for
 * statuses v0 cannot express (e.g. plain 400/413/422): the honest move is
 * a local drop — mislabeling them as `network` or `e5xx` would corrupt
 * the classes the six baseline numbers count on. Adding classes is a
 * taxonomy revision (v1), not a client decision.
 */
export function statusClassFromStatus(status: number): TelemetryStatusClass | null {
  if (status === 401) return "e401";
  if (status === 403) return "e403";
  if (status === 404) return "e404";
  if (status === 429) return "e429";
  if (status >= 500) return "e5xx";
  if (status === 0) return "network"; // transport failure / timeout
  return null;
}

/** Request method → coarse intent (GET reads, mutations write). */
export function opFromMethod(method: string): TelemetryOp {
  return method.toUpperCase() === "GET" ? "read" : "write";
}

/** Milliseconds → the a/b/c delay bucket (§1.2 boundaries, v0-frozen). */
export function latencyClassFromMs(ms: number): TelemetryLatencyClass {
  if (ms < 300) return "a";
  if (ms < 1_000) return "b";
  return "c";
}

/**
 * URL pathname → the surface slug vocabulary. Slugs are first-class in the
 * baseline formulas (e.g. `ui.nav(surface=activity)` is number 6's
 * denominator), so the mapping is explicit, not derived: one domain = one
 * slug, with `activity` promoted out of `tasks` (its own surface in the
 * formulas) and detail routes folded into their domain.
 */
export function surfaceFromPathname(pathname: string): string {
  if (pathname === "/" || pathname === "") return "overview";
  const segments = pathname.split("/").filter(Boolean);
  const [first, second] = segments;
  switch (first) {
    case "pair":
      return "pair";
    case "memory":
      return "memory";
    case "tasks":
      // Number 6 counts activity separately — it is its own surface.
      return second === "activity" ? "activity" : "tasks";
    case "agents":
      return "agents";
    case "kora":
      return "kora";
    case "docs":
      return "docs";
    case "system": {
      if (second !== undefined && SURFACE_PATTERN.test(second)) return second;
      return "system";
    }
    default:
      return "not_found";
  }
}

/**
 * visit_id for one SPA load (§1.1: "uuid на каждую загрузку SPA"). Server
 * charset `^[0-9A-Za-z][0-9A-Za-z-]*$`, 8–64 — a uuid v4 string fits.
 * `crypto.randomUUID` needs a secure context and the board also serves
 * plain http, so the fallback stays.
 */
export function makeVisitId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  let id = "";
  while (id.length < 36) {
    id += Math.random().toString(16).slice(2);
  }
  return id.slice(0, 36);
}

/** Monotonic-ish clock for latency bucketing (never stored, only bucketed). */
export function monotonicNow(): number {
  const performanceApi = globalThis.performance;
  if (performanceApi && typeof performanceApi.now === "function") {
    return performanceApi.now();
  }
  return Date.now();
}
