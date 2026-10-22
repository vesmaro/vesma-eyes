import { useParams } from "react-router";
import { HostsWorkspace } from "./HostsWorkspace";

/**
 * `/agents/hosts` (+ `:host?`, + `sessions/:sessionId` — agents-redesign A1
 * and its W3 extension, states.md §3): the thin route element — resolves
 * the OPTIONAL `:host` and `:sessionId` route params (URL-decoded by
 * react-router; the «Без хоста» bucket travels under the literal
 * __unreported__ sentinel, rosterModel.hostRouteId) and renders the frame.
 * BOTH routes mount the SAME element — selecting a host or a session never
 * re-assembles the frame (the A1/Kora contract).
 *
 * `/agents/hosts` without a host redirects (replace) to the first host by
 * the canon sort, or renders the canonical empty roster when the registry
 * is empty — the branching lives in HostsWorkspace.
 */
export function AgentsHostsPage() {
  const { host, sessionId } = useParams<{ host?: string; sessionId?: string }>();
  return <HostsWorkspace hostId={host ?? null} sessionId={sessionId ?? null} />;
}
