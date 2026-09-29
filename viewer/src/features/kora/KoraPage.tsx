import { KoraWorkspace } from "./KoraWorkspace";

/**
 * `/kora` — the Kora workspace root (ADR 0019 rev.2; union И1 rework per
 * i1-dressing-map §1.2): the v7 composition (work zone + session tree +
 * Пульт) over the slice 1–2 reads, with NO session selected — the center
 * carries the honest invitation, the right panel carries the Блок 1 tree,
 * Блок 2 in the «все» context and the coverage legend. All data flows
 * through the route-mounted `KoraGatewayContext` (routes.tsx) — this file
 * stays a thin route element.
 */
export function KoraPage() {
  return <KoraWorkspace />;
}
