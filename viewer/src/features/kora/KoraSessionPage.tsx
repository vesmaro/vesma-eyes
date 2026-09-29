import { useParams } from "react-router";
import { KoraWorkspace } from "./KoraWorkspace";

/**
 * `/kora/:sessionId` — the Kora workspace with the session selected (union
 * И1, i1-dressing-map §1.2): the SAME frame as `/kora` — selecting a
 * session never re-assembles the page — with the session's transcript
 * scroll in the center and the composer under it (07j §4.6). The 401/404/
 * 500 honest states live in the workspace; this element only resolves the
 * route parameter (opaque board-side handle, URL-decoded).
 */
export function KoraSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const decoded = sessionId ? decodeURIComponent(sessionId) : null;
  return <KoraWorkspace sessionId={decoded} />;
}
