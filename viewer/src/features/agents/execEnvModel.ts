import type {
  ExecutorItem,
  HarnessInventoryEnvironment,
} from "@/gateway/boardTypes";

/**
 * AGW-23/24 pure projections: the «среда исполнения» badge value and the
 * surface-facts mirror for ONE executor row (the B2 reserved slot,
 * blueprint §3.C.3, and the card's execution-environment section). The
 * payload is AGENT-reported (advisory mirror, never authority) — every
 * field is narrowed defensively: a buggy agent degrades to the honest
 * empty slot / fewer rows, never to a crash or a fabricated surface
 * label.
 *
 * Surface vocabulary (the agent's frozen v0.9.0 wire contract): "metal" —
 * the agent's own-namespace scan; "distrobox:<name>" — a probe inside that
 * container; "pod:<name>" — a cluster pod (the k8s leg). Anything else is
 * rendered verbatim-but-bounded — the agent's own honest label.
 */

/** The badge's display bound (mirrors the server's 60-char row bound). */
const EXEC_ENV_BOUND = 60;

/** The dedupe-trail bounds (mirror the store's 8-paths × 200-chars cut). */
const FOUND_AT_MAX_PATHS = 8;
const FOUND_AT_PATH_BOUND = 200;

/** The per-list display cut for the surface mirror (the ME-064 pattern:
 * a bounded list + the honest «…и ещё N» overflow line). */
const SURFACE_LIST_SHOW = 8;

/** Narrow one unknown value into a bounded surface label, or null. */
function narrowSurface(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, EXEC_ENV_BOUND) : null;
}

/** The harness_inventory row whose surface the badge shows: the first
 * row of THIS harness that the agent actually badged (AGW-23). */
function winningInventoryRow(
  member: ExecutorItem,
): HarnessInventoryEnvironment | null {
  for (const env of member.harness_inventory ?? []) {
    if (env.name === member.harness && narrowSurface(env.exec_env)) {
      return env;
    }
  }
  return null;
}

/**
 * The execution surface of THIS executor:
 * 1. the harness_inventory row of this harness (`name` === `harness` —
 *    the executor name is `<harness>@<host>` by construction), when the
 *    agent badged it (AGW-23);
 * 2. else the k8s pod leg whose `harness` matches — the pod executor's
 *    own inventory may be empty, but the cluster scan saw the pod
 *    (node match wins when the host string agrees — the 1.73.1
 *    Downward-API binding);
 * 3. else null — the reserved slot stays empty (honest absence, never a
 *    guessed "metal").
 */
export function executorExecEnv(member: ExecutorItem): string | null {
  const row = winningInventoryRow(member);
  if (row) return narrowSurface(row.exec_env);
  const pods = member.exec_env_inventory?.k8s?.pods;
  if (Array.isArray(pods)) {
    let harnessMatch: string | null = null;
    for (const pod of pods) {
      if (pod === null || typeof pod !== "object") continue;
      if (pod["harness"] !== member.harness) continue;
      const surface = narrowSurface(pod["exec_env"]);
      if (!surface) continue;
      if (member.host && pod["node"] === member.host) return surface;
      harnessMatch ??= surface;
    }
    if (harnessMatch) return harnessMatch;
  }
  return null;
}

/** Narrow one found_at trail: strings only, trimmed, 8 × 200 chars. */
function narrowTrail(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((path): path is string => typeof path === "string")
    .map((path) => path.trim())
    .filter((path) => path.length > 0)
    .slice(0, FOUND_AT_MAX_PATHS)
    .map((path) => path.slice(0, FOUND_AT_PATH_BOUND));
}

/**
 * AGW-23: the dedupe trail of the badge's OWN installation — every
 * surface that saw THIS SAME harness install (the trail rides the same
 * winning inventory row the badge label does). [] when the badge came
 * from the k8s pod leg (a pod has no home_path to dedupe) or the agent
 * sent none — honest absence, never a one-element echo of home_path.
 */
export function executorFoundTrail(member: ExecutorItem): readonly string[] {
  const row = winningInventoryRow(member);
  return row ? narrowTrail(row["found_at"]) : [];
}

// -- harness-labels wave (2026-10-21): the «Обнаружено на хосте» row
// -- distinguisher. A host can carry REAL duplicate installations of one
// -- harness (box-home vs host-home) — the inventory rows are told apart
// -- by each row's OWN surface label + dedupe trail, never by invention.

/**
 * The inventory row's own surface label — the same narrowing as the
 * roster badge (60 chars, trimmed). null when the agent did not badge
 * THIS row (pre-v0.9 or unbadged) — honest absence, never a fabricated
 * "metal".
 */
export function inventoryRowExecEnv(
  env: HarnessInventoryEnvironment,
): string | null {
  return narrowSurface(env.exec_env);
}

/**
 * The inventory row's own dedupe trail — the same 8 × 200 narrowing as
 * the roster tooltip. [] when the agent sent none.
 */
export function inventoryRowFoundTrail(
  env: HarnessInventoryEnvironment,
): readonly string[] {
  return narrowTrail(env["found_at"]);
}

// -- AGW-23/24: the surface-facts mirror (the card's k8s/distrobox view) --

/** A bounded row shown for one cluster node. */
export interface SurfaceNodeRow {
  readonly name: string;
  /** null = the agent did not report readiness — honest absence. */
  readonly ready: boolean | null;
  readonly kubeletVersion: string | null;
}

/** A bounded row shown for one mirrored cluster pod. */
export interface SurfacePodRow {
  readonly name: string;
  readonly phase: string | null;
  readonly node: string | null;
  readonly execEnv: string | null;
}

/** A bounded row shown for one distrobox container verdict. */
export interface SurfaceContainerRow {
  readonly name: string;
  readonly status: string | null;
  readonly verdict: string | null;
}

/** The narrowed surface-facts snapshot of ONE executor (AGW-23/24). */
export interface SurfaceFacts {
  readonly runtimeKind: string | null;
  readonly runtimeNote: string | null;
  readonly containers: readonly SurfaceContainerRow[];
  readonly containersOverflow: number;
  readonly nodes: readonly SurfaceNodeRow[];
  readonly nodesOverflow: number;
  readonly pods: readonly SurfacePodRow[];
  readonly podsOverflow: number;
  /** Non-ok scan verdicts only — ok is the quiet default. */
  readonly verdicts: readonly (readonly [string, string])[];
}

function narrowBounded(value: unknown, bound: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, bound) : null;
}

function cutList<T>(rows: readonly T[]): {
  shown: readonly T[];
  overflow: number;
} {
  return {
    shown: rows.slice(0, SURFACE_LIST_SHOW),
    overflow: Math.max(0, rows.length - SURFACE_LIST_SHOW),
  };
}

/**
 * The surface-facts mirror of THIS executor: the runtime verdict, the
 * per-container distrobox verdicts and the k8s leg (nodes / pods /
 * non-ok verdicts), narrowed defensively row by row. null when the
 * executor carries no surface facts at all (pre-v0.9 agents) — the
 * section renders nothing, honest absence.
 */
export function executorSurfaceFacts(
  member: ExecutorItem,
): SurfaceFacts | null {
  const inv = member.exec_env_inventory;
  if (inv === undefined || inv === null || typeof inv !== "object") return null;

  const runtime = inv.runtime as Readonly<Record<string, unknown>> | undefined;
  const runtimeKind =
    runtime !== undefined && runtime !== null
      ? narrowBounded(runtime["kind"], 20)
      : null;
  const runtimeNote =
    runtime !== undefined && runtime !== null
      ? narrowBounded(runtime["systemd"], 200)
      : null;

  const containers: SurfaceContainerRow[] = [];
  if (Array.isArray(inv.distrobox_containers)) {
    for (const c of inv.distrobox_containers) {
      if (c === null || typeof c !== "object") continue;
      const name = narrowBounded(c["name"], 60);
      if (!name) continue;
      containers.push({
        name,
        status: narrowBounded(c["status"], 60),
        verdict: narrowBounded(c["scan_verdict"], 20),
      });
    }
  }

  const nodes: SurfaceNodeRow[] = [];
  const pods: SurfacePodRow[] = [];
  const k8s = inv.k8s;
  if (k8s !== undefined && k8s !== null && typeof k8s === "object") {
    if (Array.isArray(k8s.nodes)) {
      for (const n of k8s.nodes) {
        if (n === null || typeof n !== "object") continue;
        const name = narrowBounded(n["name"], 253);
        if (!name) continue;
        nodes.push({
          name,
          ready:
            typeof n["ready"] === "boolean" ? (n["ready"] as boolean) : null,
          kubeletVersion: narrowBounded(n["kubelet_version"], 60),
        });
      }
    }
    if (Array.isArray(k8s.pods)) {
      for (const p of k8s.pods) {
        if (p === null || typeof p !== "object") continue;
        const name = narrowBounded(p["name"], 253);
        if (!name) continue;
        pods.push({
          name,
          phase: narrowBounded(p["phase"], 20),
          node: narrowBounded(p["node"], 253),
          execEnv: narrowBounded(p["exec_env"], 60),
        });
      }
    }
  }

  const verdicts: (readonly [string, string])[] = [];
  if (
    k8s !== undefined &&
    k8s !== null &&
    typeof k8s === "object" &&
    k8s.verdicts !== undefined &&
    k8s.verdicts !== null &&
    typeof k8s.verdicts === "object"
  ) {
    for (const [key, value] of Object.entries(k8s.verdicts)) {
      const v = narrowBounded(value, 200);
      if (!v) continue;
      verdicts.push([key.slice(0, 30), v] as const);
    }
  }

  const hasFacts =
    runtimeKind !== null ||
    runtimeNote !== null ||
    containers.length > 0 ||
    nodes.length > 0 ||
    pods.length > 0 ||
    verdicts.length > 0;
  if (!hasFacts) return null;

  const cutContainers = cutList(containers);
  const cutNodes = cutList(nodes);
  const cutPods = cutList(pods);
  return {
    runtimeKind,
    runtimeNote,
    containers: cutContainers.shown,
    containersOverflow: cutContainers.overflow,
    nodes: cutNodes.shown,
    nodesOverflow: cutNodes.overflow,
    pods: cutPods.shown,
    podsOverflow: cutPods.overflow,
    verdicts,
  };
}
