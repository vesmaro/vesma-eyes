import { Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { KoraTree } from "./KoraTree";
import { KoraSessionList, type KoraBlock2Context } from "./KoraSessionList";
import { HermesSourceLine } from "./KoraHermesSource";
import type { HermesBridgeStatus, KoraSession } from "./koraTypes";
import type {
  KoraAgentNode,
  KoraQuickFilter,
  KoraWorkspaceModel,
} from "./koraWorkspaceModel";

/**
 * The LEFT navigation panel (kora-rethink blueprint §4, KW1 «Три колонки»):
 * «Хосты и агенты» (the KoraTree, as is) → «Сессии · контекст» (the
 * KoraSessionList) → the pinned «Чат с кластером» entry (hermes context
 * only) → the hermes source line (hermes context only). ONE panel scroll.
 * KW2: the pinned entry WRITES the reserved /kora/hermes route (the click
 * handler rides from the workspace); «current» is ROUTE-driven — the
 * clusterActive flag mirrors /kora/hermes, not the filter context.
 */

export function KoraNavPanel({
  model,
  treeReady,
  context,
  contextSessions,
  quickFilter,
  onQuickFilter,
  sessionId,
  selectedSessionId,
  noExecutors,
  sessionsEmpty,
  activeHost,
  onSelectHostContext,
  onSelectAgentContext,
  hermesRefresh,
  hermesStatus,
  hermesStatusPending,
  hermesStatusError,
  hermesPullError,
  clusterActive,
  onClusterChat,
}: {
  model: KoraWorkspaceModel;
  treeReady: boolean;
  context: KoraBlock2Context;
  contextSessions: readonly KoraSession[];
  quickFilter: KoraQuickFilter | null;
  onQuickFilter: (filter: KoraQuickFilter | null) => void;
  /** The route's session id (the tree's selection mirror). */
  sessionId: string | null;
  selectedSessionId: string | null;
  noExecutors: boolean;
  sessionsEmpty: boolean;
  activeHost: string;
  onSelectHostContext: (host: string) => void;
  /** KoraTree hands the whole agent node — the caller maps it to a context. */
  onSelectAgentContext: (agent: KoraAgentNode) => void;
  hermesRefresh: { onRefresh: () => void; pending: boolean } | null;
  hermesStatus: HermesBridgeStatus | null;
  hermesStatusPending: boolean;
  hermesStatusError: boolean;
  hermesPullError: Error | null;
  /** The reserved /kora/hermes route is ON STAGE (the entry reads current). */
  clusterActive: boolean;
  /** The pinned entry's click — writes /kora/hermes (the workspace owns it). */
  onClusterChat: () => void;
}) {
  const t = useT();
  const isHermesContext = context.kind === "hermes";

  return (
    <div className="space-y-4 px-3 py-3">
      <section aria-label={t("kora.tree.title")}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
          {t("kora.tree.title")}
        </h2>
        <p className="mt-1 text-xs text-foreground-muted">
          {t("kora.tree.explain")}
        </p>
        <div className="mt-2">
          {!treeReady ? (
            <div
              role="status"
              aria-label={t("kora.list.loading")}
              className="space-y-2"
            >
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : (
            <KoraTree
              model={model}
              selectedId={sessionId}
              activeHost={activeHost}
              onHostContext={onSelectHostContext}
              onAgentContext={onSelectAgentContext}
            />
          )}
        </div>
      </section>

      <KoraSessionList
        context={context}
        sessions={contextSessions}
        quickFilter={quickFilter}
        onQuickFilter={onQuickFilter}
        selectedId={selectedSessionId}
        noExecutors={noExecutors}
        sessionsEmpty={sessionsEmpty}
        hermesRefresh={hermesRefresh}
      />

      {/* The pinned «Чат с кластером» entry (blueprint §4–5) — hermes
       * context only; the click writes the RESERVED /kora/hermes route. */}
      {isHermesContext ? (
        <button
          type="button"
          onClick={onClusterChat}
          aria-current={clusterActive ? "page" : undefined}
          title={t("kora.nav.clusterChatHint")}
          className={cn(
            "flex min-h-12 md:min-h-6 w-full items-center gap-2 rounded-md border-l-2 px-2 py-1.5 text-left text-sm transition-colors duration-instant hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
            clusterActive
              ? "border-iris bg-iris-tint text-foreground"
              : "border-transparent text-foreground-secondary",
          )}
        >
          <Star aria-hidden className="size-3.5 shrink-0 text-iris-bright" />
          <span className="min-w-0 flex-1 truncate font-medium">
            {t("kora.nav.clusterChat")}
          </span>
        </button>
      ) : null}

      {/* T004 slice 2 — the source status line: DATA from
       * /api/kora/hermes/status (mode ok/off + the human reason). Shown only
       * in the hermes context; the honest-off branch is a quiet slot, never
       * an error wall. */}
      {isHermesContext ? (
        <HermesSourceLine
          status={hermesStatus}
          isPending={hermesStatusPending}
          isError={hermesStatusError}
          pullError={hermesPullError}
        />
      ) : null}
    </div>
  );
}
