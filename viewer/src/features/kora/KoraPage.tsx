import { Navigate, useParams, useSearchParams } from "react-router";
import { useLocation } from "react-router";
import { KoraWorkspace } from "./KoraWorkspace";

/**
 * `/kora/*` — the ONE route element of the whole Kora domain (KW4,
 * blueprint-kw4 §2/§4, the HostsRosterPage A1 precedent): `/kora`,
 * `/kora/host/:host`, `/kora/hermes` and `/kora/:sessionId` all mount THIS
 * component, so navigating between them reconciles the same element type —
 * the frame never re-assembles, only the route props change.
 *
 * - `host` — the field route (`/kora/host/:host`; «host» is a RESERVED
 *   static segment that outranks `:sessionId` in react-router ranking, and
 *   a registry id is always `executor:native`, never a bare word).
 * - `sessionId` — the frozen deep link (§9).
 * - cluster — the RESERVED `/kora/hermes` segment (path-driven, KW2).
 * - `?host=X` — the retired header-filter's legacy deep link
 *   (`/kora?host=X`) → replace-redirect `/kora/host/X` (one compat wave,
 *   blueprint-kw4 §2/§4; only on the bare /kora path).
 */
export function KoraPage() {
  const { host, sessionId } = useParams<{ host?: string; sessionId?: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // The compat wave (blueprint-kw4 §4): the retired filter's deep link
  // `/kora?host=X` becomes the field route — replace, so back returns to
  // whatever preceded the legacy link. Only on the bare /kora path (a
  // session deep link carrying ?host= is not a filter legacy — it keeps
  // its session semantics untouched).
  const legacyHost = !host && !sessionId ? searchParams.get("host") : null;
  if (legacyHost !== null && legacyHost !== "") {
    return <Navigate replace to={`/kora/host/${encodeURIComponent(legacyHost)}`} />;
  }

  const decodedSession = sessionId ? decodeURIComponent(sessionId) : null;
  const decodedHost = host ? decodeURIComponent(host) : null;
  return (
    <KoraWorkspace
      sessionId={decodedSession}
      host={decodedHost}
      cluster={location.pathname.endsWith("/kora/hermes")}
    />
  );
}
