import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import type { KoraIntentEntryPoint, KoraIntentEventPoints } from "./koraIntentEvents";
import type { KoraSession } from "./koraTypes";

/**
 * The composer (07j §4.6 v9-аддендум, И1 honest cut): a REAL field and a
 * REAL React state machine — typing works, Enter/Shift+Enter work, the
 * draft lives in page memory — while the SEND itself is honestly deferred:
 * the button renders only for a non-empty draft and is DISABLED with a
 * VISIBLE reason (the chip + the service line under the field), and Enter
 * on a non-empty draft announces the same status politely. Nothing
 * pretends to be sent.
 *
 * FORBIDDEN in И1 (07a §1 — no fake delivery): «в очереди релея» /
 * «доставлено» chips, any «агент ответил» line. The relay statuses arrive
 * with the real relay (срез 3 wiring, И4).
 *
 * Finished/interrupted sessions (07j §4.6): a `dead` registry state means
 * the process is gone — the FIELD itself is disabled with the interrupted
 * note visible without hover. The registry has no «завершена» state; the
 * finished note stays in the dictionary for that future shape (no silent
 * mapping of live process states onto it).
 *
 * Persistence: none in И1 — `vesmaro.koraDraft:*` is И4; the service line
 * says so in owner language («черновик живёт, пока вы на странице сессии»).
 * The parent keys this component by session id, so a session switch is an
 * UNMOUNT: the draft (and the abandoned-intent call point) ride that.
 */
export function KoraComposer({
  session,
  intentEvents,
}: {
  session: KoraSession;
  intentEvents: KoraIntentEventPoints;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [announce, setAnnounce] = useState<string | null>(null);
  // The intent lifecycle (ME-035 taxonomy): started on the first character,
  // abandoned on blur/unmount with text. Refs keep the events from firing
  // on re-renders.
  const startedRef = useRef(false);
  const hadTextRef = useRef(false);

  const dead = session.state === "dead";
  const noteKey = dead
    ? "kora.composer.interruptedNote"
    : "kora.composer.sendLaterNote";
  const hasDraft = draft.trim().length > 0;

  // Unmount = leaving the composer (session switch included — the parent
  // remounts per session): the honest abandonment point.
  useEffect(
    () => () => {
      if (startedRef.current) {
        intentEvents.intentAbandoned({ hadText: hadTextRef.current });
      }
    },
    [intentEvents],
  );

  const handleInput = (value: string, entryPoint: KoraIntentEntryPoint) => {
    setDraft(value);
    hadTextRef.current = value.trim().length > 0;
    if (!startedRef.current && value.length > 0) {
      startedRef.current = true;
      intentEvents.intentStarted(entryPoint);
    }
  };

  // Enter sends the INTENT — in И1 the intent can only be acknowledged,
  // never executed: the same status the button shows, announced politely
  // (07j §4.6: «действие не молчит и не притворяется отправленным»).
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (hasDraft && !dead) {
        setAnnounce(t("kora.composer.sendLaterChip"));
      }
    }
    // Shift+Enter falls through to the textarea's own newline.
  };

  return (
    <div className="border-t border-myelin bg-well px-4 py-3">
      <div className="flex items-start gap-2">
        <label className="sr-only" htmlFor="kora-composer-input">
          {t("kora.composer.label")}
        </label>
        <textarea
          id="kora-composer-input"
          rows={2}
          className="min-h-11 w-full resize-y rounded-md border border-border-subtle bg-background px-3 py-2 font-ui text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright disabled:cursor-not-allowed disabled:text-foreground-muted"
          placeholder={t("kora.composer.placeholder")}
          aria-describedby="kora-composer-note"
          disabled={dead}
          value={draft}
          onChange={(event) => handleInput(event.target.value, "input")}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (startedRef.current && hadTextRef.current) {
              // Blur with text — one abandonment signal per blur; a later
              // refocus does not resurrect the started intent.
              intentEvents.intentAbandoned({ hadText: true });
              startedRef.current = false;
            }
          }}
        />
        {/* The send node renders ONLY for a non-empty draft (07j §4.6):
         * disabled with a visible reason — never a promise of delivery. */}
        {hasDraft && !dead ? (
          <div className="flex shrink-0 flex-col items-stretch gap-1">
            <Button
              type="button"
              size="default"
              disabled
              aria-describedby="kora-composer-note"
              className="min-w-11"
            >
              <Send aria-hidden className="size-4" />
              {t("kora.composer.send")}
            </Button>
            <span className="whitespace-nowrap rounded-full border border-border-subtle px-2 py-0.5 text-xs text-foreground-secondary">
              {t("kora.composer.sendLaterChip")}
            </span>
          </div>
        ) : null}
      </div>
      <p id="kora-composer-note" className="mt-2 text-xs text-foreground-muted">
        {t(noteKey)}
      </p>
      {/* 4.1.3 Status Messages: the acknowledged intent is announced
       * politely, never silently swallowed. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announce ?? ""}
      </p>
    </div>
  );
}
