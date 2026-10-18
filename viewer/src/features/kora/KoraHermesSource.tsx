import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { HermesBridgeStatus } from "./koraTypes";

/**
 * The hermes source status line (T004 slice 2, hermes-bridge FE): ONE
 * honest line under the Блок 2 header while the hermes context is active.
 * DATA only — the server's /status read is cheap and deterministic (no
 * live probe), so the line never pulses; the off-state is a quiet slot
 * with the human reason, never an error wall.
 *
 * States:
 * - pending: a skeleton row (no fake status);
 * - ok: «Hermes (кластер) — ok · N сессий в реестре»;
 * - off: «Hermes не подключён» + the server's human reason + owner hint;
 * - read error/transport: the failed line + retry (honest failure).
 */
export function HermesSourceLine({
  status,
  isPending,
  isError,
  pullError,
}: {
  status: HermesBridgeStatus | null;
  isPending: boolean;
  isError: boolean;
  /** The manual pull's failure — hermes_off/hermes_unavailable surface HERE
   * as the human reason (the code names the vocabulary, message is the copy). */
  pullError: Error | null;
}) {
  const t = useT();

  if (isPending) {
    return (
      <div
        role="status"
        aria-label={t("kora.hermes.statusLoading")}
        className="flex items-center gap-2 px-1"
      >
        <Skeleton className="h-4 w-48" data-testid="hermes-status-skeleton" />
      </div>
    );
  }

  // The manual-pull failure rides FIRST (it is the freshest fact — e.g. a
  // pull answered 502 hermes_unavailable after an ok status read).
  if (pullError !== null) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-1">
        <AlertTriangle aria-hidden className="size-4 shrink-0 text-warning" />
        <p className="min-w-0 flex-1 text-xs text-foreground-secondary">
          {pullError.message}
        </p>
      </div>
    );
  }

  if (isError || status === null) {
    return (
      <p className="px-1 text-xs text-foreground-secondary">
        {t("kora.hermes.statusUnknown")}
      </p>
    );
  }

  if (!status.configured || status.mode === "off") {
    return (
      <div className="rounded-md border border-border-subtle bg-well px-3 py-2">
        <p className="flex items-baseline gap-2 text-xs">
          <span className="font-semibold text-foreground-secondary">
            {t("kora.hermes.offTitle")}
          </span>
          <span aria-hidden className="size-2 shrink-0 translate-y-0.5 rounded-full bg-foreground-muted" />
          <span className="sr-only">{t("kora.hermes.stateOff")}</span>
        </p>
        <p className="mt-1 text-xs text-foreground-secondary">{status.detail ?? t("kora.hermes.offDefaultReason")}</p>
        <p className="mt-1 text-xs text-foreground-muted">{t("kora.hermes.offHint")}</p>
      </div>
    );
  }

  // ok: the data line — source name, state word, registry slice count.
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-foreground-secondary">
      <span className="font-semibold">{t("kora.hermes.sourceName")}</span>
      <span className="flex items-center gap-1">
        <span aria-hidden className={cn("size-2 rounded-full bg-success")} />
        {t("kora.hermes.stateOk")}
      </span>
      <span className="font-mono tabular-nums text-foreground-muted">
        {t("kora.hermes.registryCount", { n: status.registry_sessions })}
      </span>
    </p>
  );
}

/**
 * The hermes transcript placeholder (slice-3 gap): a hermes session clicked
 * → the center honestly names the gap instead of an empty click (the
 * composer sendLater precedent). NOT a disabled row — the session data
 * (metadata, preview) is real and stays readable in Блок 2.
 */
export function HermesTranscriptPlaceholder() {
  const t = useT();
  return (
    <section
      aria-label={t("kora.hermes.transcriptRegion")}
      className="flex min-h-0 min-w-0 flex-1 flex-col items-start justify-center gap-3 px-6 py-5"
    >
      <p className="max-w-lg text-sm text-foreground-secondary">
        {t("kora.hermes.transcriptPlaceholder")}
      </p>
      <p className="max-w-lg text-xs text-foreground-muted">
        {t("kora.hermes.transcriptPlaceholderNote")}
      </p>
      <Button variant="ghost" size="sm" disabled className="text-foreground-muted">
        <span aria-hidden>···</span>
        {t("kora.hermes.transcriptLaterChip")}
      </Button>
    </section>
  );
}