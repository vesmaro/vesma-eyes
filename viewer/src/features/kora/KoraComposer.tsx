import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { KoraIntentEntryPoint, KoraIntentEventPoints } from "./koraIntentEvents";
import type { KoraSession } from "./koraTypes";
import { clearKoraDraft, readKoraDraft, writeKoraDraft } from "./koraFrameStorage";

/**
 * The composer (07j §4.6 v9-аддендум): a REAL field and a REAL React state
 * machine — typing works, Enter/Shift+Enter work — while the SEND itself is
 * honestly deferred: the button renders only for a non-empty draft and is
 * DISABLED with a VISIBLE reason (the chip + the service line under the
 * field), and Enter on a non-empty draft announces the same status politely.
 * Nothing pretends to be sent.
 *
 * FORBIDDEN (07a §1 — no fake delivery): «в очереди релея» / «доставлено»
 * chips, any «агент ответил» line. The relay statuses arrive with the real
 * relay (срез 3 wiring, И4).
 *
 * U5 — DRAFT PERSISTENCE (the v9 key contract, this wave's hardware): the
 * draft lives in `vesmaro.koraDraft:{sessionId}` (localStorage) and survives
 * reloads and session switches. The save beat is HONEST, no phantom timers:
 * a 600ms debounce schedules ONE real storage write; «Черновик сохранён»
 * renders only after that write RETURNS true; a failed write says so («не
 * сохранился») — private mode never lies about persistence. An emptied
 * field removes the key. Unmount flushes the pending write synchronously.
 *
 * Finished/interrupted sessions (07j §4.6): a `dead` registry state means
 * the process is gone — the FIELD itself is disabled with the interrupted
 * note visible without hover. The registry has no «завершена» state; the
 * finished note stays in the dictionary for that future shape (no silent
 * mapping of live process states onto it).
 *
 * The parent keys this component by session id, so a session switch is an
 * UNMOUNT: the intent telemetry rides that; the DRAFT survives it (per-
 * session keys, read back on the next mount).
 */

/** One real storage write is scheduled this long after the last keystroke. */
const DRAFT_SAVE_DEBOUNCE_MS = 600;

export function KoraComposer({
  session,
  intentEvents,
}: {
  session: KoraSession;
  intentEvents: KoraIntentEventPoints;
}) {
  const t = useT();
  // Restore once, at mount (the parent remounts per session): the persisted
  // draft comes back verbatim after a reload or a session switch.
  const [draft, setDraft] = useState<string>(() => readKoraDraft(session.id) ?? "");
  const [announce, setAnnounce] = useState<string | null>(null);
  /** idle | saved | failed — the honest persistence beat (see above). */
  const [draftState, setDraftState] = useState<"idle" | "saved" | "failed">("idle");
  // The intent lifecycle (ME-035 taxonomy): started on the first character,
  // abandoned on blur/unmount with text. Refs keep the events from firing
  // on re-renders.
  const startedRef = useRef(false);
  const hadTextRef = useRef(false);
  // The pending unsaved text + its timer — flushed on unmount.
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dead = session.state === "dead";
  const noteKey = dead
    ? "kora.composer.interruptedNote"
    : "kora.composer.sendLaterNote";
  const hasDraft = draft.trim().length > 0;

  const flushSave = useCallback(
    (text: string): void => {
      const ok = writeKoraDraft(session.id, text);
      setDraftState(ok ? (text.trim().length > 0 ? "saved" : "idle") : "failed");
    },
    [session.id],
  );

  // Unmount = leaving the composer (session switch included — the parent
  // remounts per session): the honest abandonment point, plus a synchronous
  // flush of a still-pending draft write (a quick switch must not lose it).
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const pending = pendingRef.current;
      if (pending !== null) {
        pendingRef.current = null;
        writeKoraDraft(session.id, pending);
      }
      if (startedRef.current) {
        intentEvents.intentAbandoned({ hadText: hadTextRef.current });
      }
    },
    [intentEvents, session.id],
  );

  const handleInput = (value: string, entryPoint: KoraIntentEntryPoint): void => {
    setDraft(value);
    pendingRef.current = value;
    hadTextRef.current = value.trim().length > 0;
    if (!startedRef.current && value.length > 0) {
      startedRef.current = true;
      intentEvents.intentStarted(entryPoint);
    }
    // Schedule ONE real write; the «сохранён» beat renders after it lands.
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    if (value.trim().length === 0) {
      timerRef.current = null;
      pendingRef.current = null;
      clearKoraDraft(session.id); // an emptied field removes the key
      setDraftState("idle");
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending !== null) flushSave(pending);
    }, DRAFT_SAVE_DEBOUNCE_MS);
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
      {/* The honest persistence beat: «сохранён» only after the write
       * returned true; a failed write names itself. The live region exists
       * BEFORE the message (4.1.3). */}
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "mt-1 min-h-4 text-xs",
          draftState === "failed" ? "text-warning" : "text-foreground-muted",
        )}
      >
        {draftState === "saved"
          ? t("kora.composer.draftSaved")
          : draftState === "failed"
            ? t("kora.composer.draftFailed")
            : ""}
      </p>
      {/* 4.1.3 Status Messages: the acknowledged intent is announced
       * politely, never silently swallowed. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announce ?? ""}
      </p>
    </div>
  );
}
