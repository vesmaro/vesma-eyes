import { useParams } from "react-router";
import { HostsWorkspace } from "./HostsWorkspace";

/**
 * `/agents/hosts` (+ `:host?` — agents-redesign A1): the thin route element —
 * resolves the OPTIONAL `:host` route param (URL-decoded by react-router;
 * the «Без хоста» bucket travels under the literal __unreported__ sentinel,
 * rosterModel.hostRouteId) and renders the frame. The optional param keeps
 * ONE route element for `/agents/hosts` and `/agents/hosts/:host` —
 * selecting a host never re-assembles the frame (the Kora contract).
 *
 * `/agents/hosts` without a host redirects (replace) to the first host by
 * the canon sort, or renders the canonical empty roster when the registry
 * is empty — the branching lives in HostsWorkspace.
 */
export function AgentsHostsPage() {
  const { host } = useParams<{ host?: string }>();
  return <HostsWorkspace hostId={host ?? null} />;
}
