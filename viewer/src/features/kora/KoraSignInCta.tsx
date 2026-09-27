import { useEffect, useRef } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { useT } from "@/i18n";
import { useUiToken } from "@/features/ui-token/UiTokenContext";

/**
 * The «session not active» CTA state for the kora screens (owner-feedback
 * hotfix: a 401 from the reads used to surface as the raw error block
 * while the TopBar still said «Выйти» — the client session state and the
 * server disagreed, and the screen told the wrong story).
 *
 * Reuses the app's ONE login window through the ui-token gate context
 * (`openLogin` — the same path the TopBar «Войти» and every mutation
 * prompt take); nothing about auth is re-implemented here. Variant beats:
 * a 403 `metadata_only` keeps its explaining wall, 5xx/transport keeps
 * the retry error state — this component renders ONLY the 401 case.
 *
 * The mounted CTA also owns the refetch-on-sign-in beat: when the gate
 * flips `tokenPresent` false → true (a successful login anywhere in the
 * app — the dialog this button opened, the TopBar, another tab), the
 * caller's queries refetch and the page recovers under the CTA without a
 * reload. The transition guard keeps the effect off the initial mount
 * (TanStack already fetches on mount; a signed-in visit must not double
 * fetch).
 */
export function KoraSignInCta({
  title,
  message,
  refetch,
}: {
  /** The state headline, e.g. «Сессия не активна». */
  title: string;
  /** What signing in restores, e.g. «Войдите — и сессии хостов появятся здесь». */
  message: string;
  /** Refetch the failed queries once a login lands (see above). */
  refetch: () => Promise<unknown>;
}) {
  const t = useT();
  const { tokenPresent, openLogin } = useUiToken();
  // Seeded FALSE, not with the current flag: if the flag flips BEFORE the
  // 401 lands (the CTA mounts straight into an already-signed-in gate),
  // this effect still owes the view one recovery refetch. After the first
  // run the guard is true, so a still-failing refetch cannot loop.
  const tokenPresentBefore = useRef(false);

  useEffect(() => {
    if (tokenPresent && !tokenPresentBefore.current) {
      void refetch();
    }
    tokenPresentBefore.current = tokenPresent;
  }, [tokenPresent, refetch]);

  return (
    <EmptyState
      variant="empty"
      title={title}
      message={message}
      action={
        <Button variant="default" data-testid="kora-signin-cta" onClick={openLogin}>
          <LogIn className="size-4" aria-hidden="true" />
          {t("login.signIn")}
        </Button>
      }
    />
  );
}
