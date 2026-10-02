import { EmptyState } from "@/components/EmptyState/EmptyState";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { SessionListItem } from "@/components/SessionListItem/SessionListItem";
import { TableRowSkeleton } from "@/components/skeletons/Skeletons";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/errors";
import { useSessions } from "@/hooks/useSessions";
import { useAuth } from "@/features/auth/AuthContext";
import { useT } from "@/i18n";
import { pageGridClass } from "@/layout/pageGrid";

/**
 * `/sessions` — A2A session list (component-inventory §9). The route stays
 * alive for bookmarks/legacy redirects, but UX-overhaul §6 (Ф1, П1) removes
 * the fullscreen 501 dead-end: the unsupported state is ONE HonestLine
 * («Сессии появятся позже»), matching the nav disabled-slot. Raw adapter
 * error text rides `techDetail`, never open copy.
 */
export function SessionsPage() {
  const t = useT();
  const { adapterMode } = useAuth();
  const sessions = useSessions();

  return (
    <section aria-labelledby="sessions-title" className={pageGridClass("operational", "space-y-4")}>
      <h1 id="sessions-title" className="text-xl font-semibold">
        {t("sessions.title")}
      </h1>

      {sessions.isPending ? (
        <div role="status" aria-label={t("sessions.loading")}>
          <TableRowSkeleton rows={4} columns={3} />
        </div>
      ) : sessions.isError ? (
        isApiError(sessions.error) && sessions.error.status === 501 ? (
          <HonestLine>
            {t(
              adapterMode === "board"
                ? "nav.soonSessions"
                : "sessions.unavailableMnemos",
            )}
          </HonestLine>
        ) : (
          <EmptyState
            variant="error"
            title={t("sessions.loadFailed")}
            techDetail={sessions.error.message}
            action={
              <Button variant="outline" onClick={() => void sessions.refetch()}>
                {t("common.retry")}
              </Button>
            }
          />
        )
      ) : sessions.data.length === 0 ? (
        <EmptyState
          variant="empty"
          title={t("sessions.empty")}
          message={t("sessions.emptyMessage")}
        />
      ) : (
        <ul className="space-y-3">
          {sessions.data.map((session) => (
            <SessionListItem key={session.session_id} session={session} />
          ))}
        </ul>
      )}
    </section>
  );
}
