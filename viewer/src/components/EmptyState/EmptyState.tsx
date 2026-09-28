import { useState } from "react";
import { useId } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { IrisLogo } from "@/components/IrisLogo/IrisLogo";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Unified no-data / error / not-found / offline visual (component-inventory
 * §11, architecture.md §7). Used by route-level error boundaries and empty
 * results. The iris is dimmed per variant: muted on `empty`, error-tinted on
 * `error`/`not-found`.
 *
 * UX-overhaul spec §7.2 (П4): raw adapter/HTTP text NEVER renders open in
 * the UI. `techDetail` — a raw `error.message` — sits under a collapsed
 * «Технические подробности» disclosure (button + `aria-expanded`/`aria-controls`);
 * `message` stays the always-human dictionary phrase. The legacy open-text
 * `detail` prop keeps its meaning (a short HUMAN tertiary line, e.g. the
 * search hint) and never carries raw errors — call sites were revised to
 * move raw text to `techDetail`.
 */
export interface EmptyStateProps {
  variant?: "empty" | "error" | "not-found" | "offline";
  /** Primary message. */
  title: string;
  /** Secondary line — human dictionary copy. */
  message?: string;
  /** Tertiary HUMAN detail line (component-inventory §11: `detail`). */
  detail?: string;
  /** Raw technical text (adapter `error.message`) — collapsed by default. */
  techDetail?: string;
  /** CTA slot, e.g. a Retry button. */
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  variant = "empty",
  title,
  message,
  detail,
  techDetail,
  action,
  className,
}: EmptyStateProps) {
  const t = useT();
  const isErrorLike = variant === "error" || variant === "not-found";
  const [techOpen, setTechOpen] = useState(false);
  const techId = useId();

  return (
    <div
      role={isErrorLike ? "alert" : "status"}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-md p-12 text-center",
        className,
      )}
    >
      <IrisLogo
        size={64}
        decorative
        className={cn(
          "shrink-0",
          isErrorLike ? "opacity-70 saturate-50" : "opacity-40 grayscale",
        )}
      />
      <p
        className={cn(
          "text-lg font-semibold",
          isErrorLike ? "text-error" : "text-foreground-secondary",
        )}
      >
        {title}
      </p>
      {message ? (
        <p className="max-w-prose text-sm text-foreground-secondary">{message}</p>
      ) : null}
      {detail ? (
        <p className="max-w-prose text-xs text-foreground-muted">{detail}</p>
      ) : null}
      {techDetail ? (
        <div className="max-w-prose">
          <button
            type="button"
            aria-expanded={techOpen}
            aria-controls={techId}
            onClick={() => setTechOpen((value) => !value)}
            className="inline-flex items-center gap-1 rounded-sm text-xs text-foreground-muted underline-offset-2 transition-colors duration-instant hover:text-foreground-secondary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
          >
            {techOpen ? (
              <ChevronDown className="size-3" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-3" aria-hidden="true" />
            )}
            {t("common.techDetails")}
          </button>
          {techOpen ? (
            <p
              id={techId}
              className="mt-1 break-all font-mono text-xs text-foreground-muted"
            >
              {techDetail}
            </p>
          ) : null}
        </div>
      ) : null}
      {variant === "offline" ? (
        <p className="max-w-prose text-xs text-foreground-muted">
          {t("empty.offlineNote")}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
