import { KoraWorkspace } from "./KoraWorkspace";

/**
 * `/kora/hermes` — the RESERVED cluster-chat segment (kora-rethink
 * blueprint §5, KW2 «Живой чат»): the SAME frame as `/kora` — the split
 * center (the cluster chat + the «Все ходы» zone) with NO session selected;
 * the chat mode is ROUTE-driven, deep-linkable, and cannot collide with a
 * registry id (ids are `executor:native`, the bare `hermes` segment is
 * never one). The chat's anchor is the last active api_server session of
 * the source, or the honest clean slate.
 */
export function KoraHermesChatPage() {
  return <KoraWorkspace cluster />;
}
