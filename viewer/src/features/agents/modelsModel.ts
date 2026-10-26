import type {
  ModelsBoardRosterItem,
  ModelsDiscoveredItem,
  ModelsRosterPage,
} from "@/gateway/boardTypes";

/**
 * MF1 pure projections for the models fleet hub (the execEnvModel
 * discipline: the payload is a board projection — every field is narrowed
 * defensively, a buggy wire degrades to the honest empty slot / fewer
 * rows, never to a crash or a fabricated fact).
 *
 * Grammar (ux-blueprint §5.1): a provider card names the provider, its
 * base_url, WHERE the fact came from (provenance: the board hermes roster
 * / an agent report) and a models counter — honest empties everywhere;
 * NO credential field exists in the family by construction (security
 * verdict §5), so none is read here even if a buggy wire smuggles one.
 */

/** The per-card display cut for model ids (MF-HUB-CAPS: 8 rows + the
 * honest «…и ещё N» overflow line — the SURFACE_LIST_SHOW pattern). */
const MODELS_LIST_SHOW = 8;

/** The seen-on attribution cut on mirror rows (the grant-summary «3
 * адресата + …и ещё N» shape, ux-blueprint §4.1). */
const SEEN_ON_SHOW = 3;

/** Bounds mirroring the server's row discipline (the harness-dictionary
 * charset bound; the 200-char URL bound). */
const NAME_BOUND = 60;
const URL_BOUND = 200;
const MODEL_ID_BOUND = 160;
const EXEC_ENV_BOUND = 60;

/** The auth enum fact on a mirror row (contract §2.1) — a boolean-class
 * verdict that the config carries a credential. The material itself never
 * travels; an unknown value degrades to "unknown", never invented. */
export type MirrorAuth = "configured" | "anonymous" | "unknown";

/** One board-reported roster card (MF1: the hermes cluster). */
export interface BoardRosterRow {
  readonly provider: string;
  readonly baseUrl: string;
  readonly models: readonly string[];
  readonly shownModels: readonly string[];
  readonly modelsOverflow: number;
  readonly defaultModel: string | null;
}

/** One seen-on attribution line of a mirror row. */
export interface SeenOnRow {
  readonly executorId: string;
  readonly harness: string | null;
  readonly execEnv: string | null;
  readonly lastReportedAt: string | null;
}

/** One agent-discovered provider card (the mirror zone; honestly empty in
 * MF1 — the schema is the mirror-wave ingest target). */
export interface DiscoveredRosterRow {
  readonly provider: string;
  readonly baseUrl: string;
  readonly models: readonly string[];
  readonly shownModels: readonly string[];
  readonly modelsOverflow: number;
  readonly auth: MirrorAuth;
  readonly source: string | null;
  readonly seenOn: readonly SeenOnRow[];
  readonly seenOnOverflow: number;
}

/** The hub's three zones, narrowed. `connectedCount` stays a COUNT in MF1:
 * the owner-registry rows are MF2's contract — rendering name-only ghosts
 * of them now would fabricate a card the wire does not define yet. */
export interface HubZones {
  readonly connectedCount: number;
  readonly discovered: readonly DiscoveredRosterRow[];
  readonly board: readonly BoardRosterRow[];
}

function boundedString(value: unknown, bound: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, bound) : null;
}

function boundedList(value: unknown, bound: number, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, limit)
    .map((item) => item.slice(0, bound));
}

function cutModels(models: readonly string[]): {
  shown: readonly string[];
  overflow: number;
} {
  return {
    shown: models.slice(0, MODELS_LIST_SHOW),
    overflow: Math.max(0, models.length - MODELS_LIST_SHOW),
  };
}

function narrowAuth(value: unknown): MirrorAuth {
  return value === "configured" || value === "anonymous" ? value : "unknown";
}

/** Defensive narrowing of one board row (provenance is the zone's own —
 * a board-zone row can only be `board`, the type carries nothing else). */
function narrowBoardRow(row: ModelsBoardRosterItem): BoardRosterRow | null {
  const provider = boundedString(row.provider, NAME_BOUND);
  if (!provider) return null;
  const models = boundedList(row.models, MODEL_ID_BOUND, 256);
  const cut = cutModels(models);
  return {
    provider,
    baseUrl: boundedString(row.base_url, URL_BOUND) ?? "",
    models,
    shownModels: cut.shown,
    modelsOverflow: cut.overflow,
    defaultModel: boundedString(row.default_model, MODEL_ID_BOUND),
  };
}

function narrowSeenOn(value: ModelsDiscoveredItem["seen_on"]): {
  rows: readonly SeenOnRow[];
  overflow: number;
} {
  const rows: SeenOnRow[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (entry === null || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const executorId = boundedString(record["executor_id"], 120);
      if (!executorId) continue;
      rows.push({
        executorId,
        harness: boundedString(record["harness"], NAME_BOUND),
        execEnv: boundedString(record["exec_env"], EXEC_ENV_BOUND),
        lastReportedAt: boundedString(record["last_reported_at"], 40),
      });
    }
  }
  return { rows: rows.slice(0, SEEN_ON_SHOW), overflow: Math.max(0, rows.length - SEEN_ON_SHOW) };
}

/** Defensive narrowing of one discovered row. */
function narrowDiscoveredRow(row: ModelsDiscoveredItem): DiscoveredRosterRow | null {
  const provider = boundedString(row.provider, NAME_BOUND);
  if (!provider) return null;
  const models = boundedList(row.models, MODEL_ID_BOUND, 256);
  const cut = cutModels(models);
  const seen = narrowSeenOn(row.seen_on);
  return {
    provider,
    baseUrl: boundedString(row.base_url, URL_BOUND) ?? "",
    models,
    shownModels: cut.shown,
    modelsOverflow: cut.overflow,
    auth: narrowAuth(row.auth),
    source: boundedString(row.source, 20),
    seenOn: seen.rows,
    seenOnOverflow: seen.overflow,
  };
}

/**
 * FE-side defensive dedup of mirror rows by the contract identity
 * (provider + base_url): the board dedups server-side (contract §3), this
 * merge is the hub's own belt-and-braces — two rows sharing the identity
 * collapse into one whose seen_on lists EVERY surface, models concat
 * deduped. «…и ещё N» counts run AFTER the merge.
 */
export function dedupeDiscovered(
  rows: readonly DiscoveredRosterRow[],
): readonly DiscoveredRosterRow[] {
  const byKey = new Map<string, DiscoveredRosterRow>();
  for (const row of rows) {
    const key = `${row.provider}\n${row.baseUrl}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }
    const seenOn = [...prev.seenOn];
    for (const seen of row.seenOn) {
      if (!seenOn.some((s) => s.executorId === seen.executorId)) seenOn.push(seen);
    }
    const models = [...prev.models];
    for (const model of row.models) {
      if (!models.includes(model)) models.push(model);
    }
    const cut = cutModels(models);
    const seenCutRows = seenOn.slice(0, SEEN_ON_SHOW);
    byKey.set(key, {
      ...prev,
      models,
      shownModels: cut.shown,
      modelsOverflow: cut.overflow,
      auth:
        prev.auth === "configured" || row.auth === "configured"
          ? "configured"
          : prev.auth === "anonymous" || row.auth === "anonymous"
            ? "anonymous"
            : "unknown",
      seenOn: seenCutRows,
      seenOnOverflow: Math.max(0, seenOn.length - SEEN_ON_SHOW),
    });
  }
  return [...byKey.values()];
}

/**
 * The hub zones from the roster page (MF1): connected stays a count, the
 * mirror zone dedupes defensively, board rows narrow one by one.
 * `undefined` page (query pending) → all zones empty — the caller renders
 * its loading state from the query status, not from this projection.
 */
export function hubZones(page: ModelsRosterPage | undefined): HubZones {
  const discovered = dedupeDiscovered(
    (Array.isArray(page?.discovered) ? page.discovered : [])
      .map((row) =>
        row === null || typeof row !== "object"
          ? null
          : narrowDiscoveredRow(row as ModelsDiscoveredItem),
      )
      .filter((row): row is DiscoveredRosterRow => row !== null),
  );
  const board = (Array.isArray(page?.board) ? page.board : [])
    .map((row) =>
      row === null || typeof row !== "object"
        ? null
        : narrowBoardRow(row as ModelsBoardRosterItem),
    )
    .filter((row): row is BoardRosterRow => row !== null);
  const connectedCount = Array.isArray(page?.providers) ? page.providers.length : 0;
  return { connectedCount, discovered, board };
}

/** MF-HUB-EMPTY: no owner provider, no agent fact, no board row. */
export function isRosterEmpty(zones: HubZones): boolean {
  return zones.connectedCount === 0 && zones.discovered.length === 0 && zones.board.length === 0;
}
