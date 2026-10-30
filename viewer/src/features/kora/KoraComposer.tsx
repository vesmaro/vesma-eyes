import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { KoraIntentEntryPoint, KoraIntentEventPoints } from "./koraIntentEvents";
import type { KoraSession } from "./koraTypes";
import { clearKoraDraft, readKoraDraft, writeKoraDraft } from "./koraFrameStorage";
import {
  isKoraUnauthorized,
  koraErrorCode,
} from "./koraGateway";
import { useKoraSendMessage, koraKeys } from "./useKora";
import {
  KoraComposerControls,
  type KoraHarnessOption,
} from "./KoraComposerControls";
import {
  atSuggestions,
  detectSymbolToken,
  dollarSuggestions,
  hashSuggestions,
  insertSuggestion,
  slashSuggestions,
  stripToken,
  type KoraSlashCommandId,
  type KoraSlashCommands,
  type KoraSlashSuggestion,
  type KoraSymbolSuggestion,
} from "./koraComposerSymbols";

/**
 * The composer (07j §4.6 v9-аддендум): a REAL field and a REAL React state
 * machine — typing works, Enter/Shift+Enter work. The SEND is the A1 relay
 * leg: the button LIVES only for a steerable session when the relay signal
 * is honestly derivable (`relayAlive` — the session's OWN executor is
 * approved, enabled and carries the `session-relay` capability, derived by
 * the workspace over the executors registry it already loaded; the board
 * parks the turn by that very executor, so a relay-capable row elsewhere
 * in a divergent registry must not light the button). A live button POSTs to
 * /api/kora/sessions/{id}/messages and renders the REAL KoraDelivery
 * verdict from the 202 body — queued / delivered / failed (retryable
 * renders «повторите», the retry is a NEW POST with the kept draft).
 * Nothing pretends to be sent: fake delivery chips remain forbidden
 * (07a §1) — the verdicts here are the server's own words, and every
 * refusal (step-up ritual, unauthorized, rate limit) names itself.
 *
 * The honest real-time limit (no invented polling): the board has NO
 * delivery-status read and no event channel for the queue — the 202 body
 * carries the CURRENT status and the verdict renders from it. A verdict
 * that is `queued` at response time stays «в очереди» until the next user
 * action (a retry, a resend, or leaving and returning); the current board
 * resolves the delivery synchronously inside the send request, so the
 * 202 verdict is terminal in practice (queued appears only when the
 * transport seam parks the turn).
 *
 * U5 — DRAFT PERSISTENCE (the v9 key contract): the draft lives in
 * `vesmaro.koraDraft:{sessionId}` (localStorage) and survives reloads and
 * session switches. The save beat is HONEST, no phantom timers: a 600ms
 * debounce schedules ONE real storage write; «Черновик сохранён» renders
 * only after that write RETURNS true; a failed write says so («не
 * сохранился») — private mode never lies about persistence. An emptied
 * field removes the key. Unmount flushes the pending write synchronously.
 * An ACCEPTED send (queued/delivered) clears the draft — the text left
 * for the queue; a FAILED one keeps it (the retry resends the same text).
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
 *
 * В4 — the SYMBOL grammar (kora-ide contract §3.2, the zcode four symbols,
 * research §7.3): typing @ # / $ at a token boundary opens the symbol
 * menu above the field — @ offers the session's cwd as a REFERENCE (the
 * registry reports no file list — the honest degradation says so; links,
 * never content reads), # fuzzy-searches the LOADED session registry (a
 * mention of a past session), $ lists the В2a specialist roster (a
 * mention inserted into the text), / carries the LOCAL commands —
 * /pin (the dock pin-section), /view (open the session), /filter (the
 * dock's host context) — all three real workspace actions via
 * `slashCommands`; the RELAY commands arrive with the relay-transport
 * line and the menu's footer says so. «!» is NOT a symbol (the anti-argv
 * ADR-0019 pin): the trigger set is closed, a draft beginning with «!» is
 * text and opens nothing. While a menu is active, Enter/Tab ACCEPT the
 * highlighted row (never a send), arrows move, Escape dismisses; a menu
 * with zero activatable rows is informational only — the keyboard falls
 * through honestly.
 */

/** One real storage write is scheduled this long after the last keystroke. */
const DRAFT_SAVE_DEBOUNCE_MS = 600;

export function KoraComposer({
  session,
  intentEvents,
  harnessOptions = [],
  resolvedModel = null,
  relayAlive = false,
  registryItems = [],
  slashCommands = null,
}: {
  session: KoraSession;
  intentEvents: KoraIntentEventPoints;
  /** В2 — the selector row's harness derivations (the loaded registry's
   * harnesses of execution; the workspace owns the items, zero new
   * requests). Optional so the week-0 mount points stay legal. */
  harnessOptions?: readonly KoraHarnessOption[];
  /** В2 review (P3) — the workspace's REAL model fact for the selector
   * row (the hermes roster's default via /status); optional, null keeps
   * the honest «модели не сообщаются» slot. */
  resolvedModel?: string | null;
  /** A1 — the relay signal: the session's OWN executor is approved,
   * enabled and carries the `session-relay` capability (the workspace's
   * PER-SESSION derivation over the loaded executors registry — the board
   * parks the turn by that very executor). Default false = the honest
   * relay-off: no signal, no send button. */
  relayAlive?: boolean;
  /** В4 — the LOADED session registry slice (the # symbol's search
   * space; the workspace owns the read, zero new requests). Default
   * empty = the week-0 mounts: the # menu reads the honest zero-match
   * note over nothing. */
  registryItems?: readonly KoraSession[];
  /** В4 — the LOCAL slash-command handlers (the workspace's real
   * actions: the dock pin toggle, the session route, the host-context
   * route). Default null = the week-0 mounts: the commands render
   * honestly unavailable («команды доступны в рабочем пространстве»). */
  slashCommands?: KoraSlashCommands | null;
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

  // В4 — the symbol-menu state: the caret the token reads, the token
  // Escape dismissed (per token instance — a new token reopens), the
  // highlighted row and the caret a menu selection applies after the
  // draft update lands (the textarea's own selection follows in an
  // effect — a programmatic insert must move the REAL caret, not only
  // the state's idea of it).
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState<{ symbol: string; start: number } | null>(null);
  const pendingCaretRef = useRef<number | null>(null);

  // The relay send (A1): the seam's slice-3 hook — POST messages → the
  // 202 body with the REAL KoraDelivery; success invalidates the
  // transcript tail + the session registry (chat v1 store-tail re-read).
  const send = useKoraSendMessage(session.id);

  const dead = session.state === "dead";
  // The server's own steering rule (_kora_session_steerable): relay origin
  // OR the registry's adopted steerable flag — mirrored client-side so the
  // button never promises a POST the server would refuse as absent (404).
  const steerable = session.steerable || session.origin === "relay";
  const sendable = relayAlive && steerable && !dead;
  const noteKey = dead
    ? "kora.composer.interruptedNote"
    : !steerable
      ? "kora.composer.readOnlyNote"
      : sendable
        ? "kora.composer.relayNote"
        : "kora.composer.sendLaterNote";
  const hasDraft = draft.trim().length > 0;

  // ── В4 — the symbol grammar (the derivation over ALREADY-LOADED data;
  // zero new requests, §5.4). The $ roster is read from the react-query
  // CACHE the selector row's own observer keeps warm — a second observer
  // here would double-subscribe the query and race the mutation's act
  // commits (the A1 send test caught it); the cache IS the same fact the
  // selector row shows, read at the keystroke the menu opens. ──
  const queryClient = useQueryClient();
  const rosterItems = useMemo(() => {
    const cached = queryClient.getQueryData(koraKeys.specialists()) as
      | { count: number; items: { name: string; slug: string }[] }
      | undefined;
    return cached !== undefined && cached.count > 0 ? cached.items : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getQueryData is a NON-reactive read: draft/caret are the keystroke signal that re-reads the cache when the menu opens (the deps look unnecessary to the linter; they are the point)
  }, [queryClient, draft, caret]);

  const token = useMemo(
    () => (dead ? null : detectSymbolToken(draft, caret)),
    [dead, draft, caret],
  );

  type SymbolRow =
    | { readonly kind: "suggestion"; readonly suggestion: KoraSymbolSuggestion }
    | {
        readonly kind: "command";
        readonly command: KoraSlashSuggestion;
        readonly enabled: boolean;
      };

  const symbolRows = useMemo<readonly SymbolRow[]>(() => {
    if (token === null) return [];
    switch (token.symbol) {
      case "@":
        return atSuggestions(session, token.body).map((suggestion) => ({
          kind: "suggestion" as const,
          suggestion,
        }));
      case "#":
        return hashSuggestions(registryItems, session.id, token.body).map(
          (suggestion) => ({ kind: "suggestion" as const, suggestion }),
        );
      case "$":
        return dollarSuggestions(rosterItems, token.body).map((suggestion) => ({
          kind: "suggestion" as const,
          suggestion,
        }));
      case "/":
        return slashSuggestions(token.body).map((command) => ({
          kind: "command" as const,
          command,
          enabled: slashCommands !== null,
        }));
      default:
        return [];
    }
  }, [token, session, registryItems, rosterItems, slashCommands]);

  // The menu is KEYBOARD-active only over activatable rows: a zero-match
  // or an all-disabled panel is informational — Enter falls through to
  // the field's own Enter semantics (honest, never a swallowed action).
  // The Escape-dismissal holds for exactly this token instance — and it
  // closes the PANEL visually, not only the keyboard interception (the
  // dismissed token is a done conversation; a new token reopens).
  const dismissedThisToken =
    token !== null &&
    dismissed?.symbol === token.symbol &&
    dismissed.start === token.start;
  const menuActive =
    token !== null &&
    !dismissedThisToken &&
    symbolRows.some((row) =>
      row.kind === "suggestion"
        ? true
        : row.kind === "command" && row.enabled,
    );

  // The highlighted row is TOKEN-SCOPED and resets WITHOUT an effect (the
  // react.dev «adjust state when data changes» pattern — a same-value
  // setState inside a passive effect proved to swallow a concurrently
  // scheduled external update, the A1 mutation's notify; a render-time
  // adjust commits before the tree and keeps no lingering work).
  const tokenKey = token !== null ? `${token.symbol}:${token.start}` : "";
  const [highlightState, setHighlightState] = useState({ key: "", index: 0 });
  if (highlightState.key !== tokenKey) {
    setHighlightState({ key: tokenKey, index: 0 });
  }
  const highlight =
    highlightState.key === tokenKey
      ? Math.min(highlightState.index, Math.max(symbolRows.length - 1, 0))
      : 0;
  const moveHighlight = (delta: number): void => {
    const count = symbolRows.length;
    if (count === 0) return;
    setHighlightState({ key: tokenKey, index: (highlight + delta + count) % count });
  };

  // A menu selection inserts into the draft through the SAME path as
  // typing (the debounce, the honest save beat), then moves the REAL
  // caret to just after the inserted text. The caret state moves ONLY
  // when it truly changes — a same-value setState inside an effect is
  // the poison pattern above (it must never appear here).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs after EVERY render on purpose: a pending caret from a menu selection must land even when no dep changed; the null-check + same-value setState keep the no-op render free (no update chain)
  useEffect(() => {
    const pending = pendingCaretRef.current;
    if (pending === null) return;
    pendingCaretRef.current = null;
    const el = inputRef.current;
    if (el !== null) el.setSelectionRange(pending, pending);
    setCaret((current) => (current === pending ? current : pending));
  });

  const applySuggestion = (suggestion: KoraSymbolSuggestion): void => {
    if (token === null) return;
    const next = insertSuggestion(draft, token, suggestion);
    setDismissed(null);
    handleInput(next.text, "input");
    pendingCaretRef.current = next.caret;
  };

  const runCommand = (command: KoraSlashCommandId): void => {
    if (token === null || slashCommands === null) return;
    const outcome = slashCommands[command]();
    const stripped = stripToken(draft, token);
    setDismissed(null);
    handleInput(stripped.text, "input");
    pendingCaretRef.current = stripped.caret;
    // The workspace's real outcome is announced politely (4.1.3) — a
    // refusal names its reason (the honest «подсказка» of the brief).
    setAnnounce(
      outcome.ok
        ? t(`kora.composer.cmdDone.${outcome.note}`)
        : t(`kora.composer.cmdFail.${outcome.reason}`),
    );
  };

  const activateRow = (row: SymbolRow): void => {
    if (row.kind === "suggestion") applySuggestion(row.suggestion);
    else if (row.enabled) runCommand(row.command.id);
  };

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

  // The A1 send: one POST per click/Enter while the previous is in
  // flight is guarded by the mutation's own isPending. On an ACCEPTED
  // verdict (queued/delivered) the draft is cleared — the text left for
  // the queue; FAILED keeps it (the retry resends the same text). The
  // intent fires its И4 completion point with the REAL verdict.
  const handleSend = useCallback((): void => {
    if (!hasDraft || !sendable || send.isPending) return;
    const text = draft;
    setAnnounce(null);
    send.mutate(text, {
      onSuccess: (accepted) => {
        intentEvents.intentCompleted?.({
          deliveryStatus: accepted.delivery.status,
        });
        if (accepted.delivery.status !== "failed") {
          setDraft("");
          pendingRef.current = null;
          clearKoraDraft(session.id);
          setDraftState("idle");
        }
      },
    });
  }, [draft, hasDraft, send, sendable, session.id, intentEvents]);

  // Enter SENDS when the relay send is available — the same action the
  // button performs, never a silent no-op. Without the relay send (the
  // honest deferred cut) Enter announces the deferred status politely
  // (07j §4.6: «действие не молчит и не притворяется отправленным»).
  //
  // В4 — while a symbol menu is ACTIVE the field's keys serve it first
  // (the zcode autocomplete contract): arrows move the highlight, Enter
  // and Tab ACCEPT the highlighted row (never a send — typing "@file⏎"
  // must not fire the draft at the agent), Escape dismisses this token
  // instance. A zero-activatable panel never intercepts — the keyboard
  // falls through honestly.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuActive && token !== null) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        moveHighlight(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const row = symbolRows[highlight] ?? symbolRows[0];
        if (row !== undefined) activateRow(row);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissed({ symbol: token.symbol, start: token.start });
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (hasDraft && sendable) {
        handleSend();
      } else if (hasDraft && !dead) {
        setAnnounce(t("kora.composer.sendLaterChip"));
      }
    }
    // Shift+Enter falls through to the textarea's own newline.
  };

  const trackCaret = (el: HTMLTextAreaElement): void => {
    setCaret(el.selectionStart ?? 0);
  };

  // The honest per-symbol notes: the EMPTY fact (a zero-match / an absent
  // source) and the always-on footer (what the menu reads from). No state
  // invents data — the notes name the real sources.
  const emptyNoteKey =
    token?.symbol === "@"
      ? "kora.composer.symAtEmpty"
      : token?.symbol === "#"
        ? "kora.composer.symHashEmpty"
        : token?.symbol === "$"
          ? "kora.composer.symDollarEmpty"
          : "kora.composer.symSlashUnknown";
  const footerNoteKey =
    token?.symbol === "@"
      ? "kora.composer.symAtNote"
      : token?.symbol === "#"
        ? "kora.composer.symHashNote"
        : token?.symbol === "$"
          ? "kora.composer.symDollarNote"
          : token !== null && slashCommands === null
            ? "kora.composer.symSlashUnavailable"
            : "kora.composer.symSlashNote";

  return (
    <div className="border-t border-myelin bg-well px-4 py-3">
      <div className="relative flex items-start gap-2">
        <label className="sr-only" htmlFor="kora-composer-input">
          {t("kora.composer.label")}
        </label>
        <textarea
          id="kora-composer-input"
          ref={inputRef}
          rows={2}
          className="min-h-11 w-full resize-y rounded-md border border-border-subtle bg-background px-3 py-2 font-ui text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright disabled:cursor-not-allowed disabled:text-foreground-muted"
          placeholder={t("kora.composer.placeholder")}
          aria-describedby="kora-composer-note"
          disabled={dead}
          value={draft}
          onChange={(event) => {
            handleInput(event.target.value, "input");
            trackCaret(event.target);
          }}
          onClick={(event) => trackCaret(event.currentTarget)}
          onKeyUp={(event) => trackCaret(event.currentTarget)}
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
        {/* В4 — the symbol menu (contract §3.2, the zcode four symbols):
         * a panel ABOVE the field while a @ # / $ token sits under the
         * caret. Rows are real buttons (the 07j disclosure discipline —
         * no menu roles); a zero-activatable panel is informational only.
         * «!» is not in the closed trigger set — a draft with «!» opens
         * nothing (the anti-argv pin, ADR-0019). */}
        {token !== null && !dismissedThisToken ? (
          <div
            data-testid="kora-symbol-menu"
            role="group"
            aria-label={t("kora.composer.symbolMenuLabel", { symbol: token.symbol })}
            className="absolute bottom-full left-0 z-20 mb-1 w-full min-w-56 rounded-md border border-border-subtle bg-background py-1 shadow-lg"
          >
            {symbolRows.length === 0 ? (
              <p className="px-3 py-2 text-xs text-foreground-muted" data-testid="kora-symbol-empty">
                {t(emptyNoteKey)}
              </p>
            ) : (
              symbolRows.map((row, index) =>
                row.kind === "suggestion" ? (
                  <button
                    key={row.suggestion.key}
                    type="button"
                    data-testid="kora-symbol-row"
                    data-highlight={index === highlight || undefined}
                    onClick={() => applySuggestion(row.suggestion)}
                    className={cn(
                      "flex w-full items-baseline gap-2 px-3 py-2 text-left text-xs",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-iris-bright",
                      index === highlight
                        ? "bg-elevated text-foreground"
                        : "text-foreground-secondary",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{row.suggestion.label}</span>
                    {row.suggestion.detail ? (
                      <span className="shrink-0 font-mono text-foreground-muted">
                        {row.suggestion.detail}
                      </span>
                    ) : null}
                  </button>
                ) : (
                  <button
                    key={row.command.id}
                    type="button"
                    data-testid="kora-symbol-row"
                    data-highlight={index === highlight || undefined}
                    aria-disabled={!row.enabled || undefined}
                    onClick={() => activateRow(row)}
                    className={cn(
                      "flex w-full items-baseline gap-2 px-3 py-2 text-left font-mono text-xs",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-iris-bright",
                      row.enabled ? "text-foreground-secondary" : "text-foreground-muted",
                      index === highlight && row.enabled ? "bg-elevated text-foreground" : "",
                      !row.enabled && "cursor-not-allowed",
                    )}
                  >
                    {t(`kora.composer.cmd.${row.command.id}`)}
                  </button>
                ),
              )
            )}
            <p className="border-t border-myelin-hairline px-3 py-2 text-xs text-foreground-muted">
              {t(footerNoteKey)}
            </p>
          </div>
        ) : null}
        {/* The send node renders ONLY for a non-empty draft (07j §4.6).
         * A1: with the relay signal + a steerable session the button is
         * LIVE (disabled only while a send is in flight); without it the
         * honest deferred cut — disabled with the visible chip. */}
        {hasDraft && !dead ? (
          <div className="flex shrink-0 flex-col items-stretch gap-1">
            <Button
              type="button"
              size="default"
              disabled={!sendable || send.isPending}
              onClick={handleSend}
              aria-describedby="kora-composer-note"
              className="min-w-11"
            >
              <Send aria-hidden className="size-4" />
              {t("kora.composer.send")}
            </Button>
            {!sendable ? (
              <span className="whitespace-nowrap rounded-full border border-border-subtle px-2 py-0.5 text-xs text-foreground-secondary">
                {t("kora.composer.sendLaterChip")}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {/* В2 — the selector row (contract §3.2): харнес · специалист ·
       * модель · режим, each drawn from real data only; a dead session
       * disables the row with the same visible interrupted note below.
       * A1: the mode row's yolo reason reads the same relay signal. */}
      <KoraComposerControls
        session={session}
        harnessOptions={harnessOptions}
        resolvedModel={resolvedModel}
        relayAlive={relayAlive}
      />
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
      {/* A1 — the REAL delivery verdict (07a §1 forbids the FAKE chips,
       * not the server's own words): pending → «отправляем»; the 202
       * body's KoraDelivery renders verbatim — queued / delivered /
       * failed («повторите» = a NEW POST, not a client-side pretend).
       * No polling exists on the board (no delivery GET, no queue
       * events): a queued verdict stays queued until the next user
       * action — named honestly in the line itself. */}
      {send.isPending ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="kora-delivery-sending"
          className="mt-1 min-h-4 text-xs text-foreground-muted"
        >
          {t("kora.composer.sending")}
        </p>
      ) : send.data ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="kora-delivery-verdict"
          className={cn(
            "mt-1 flex min-h-4 flex-wrap items-center gap-x-2 gap-y-1 text-xs",
            send.data.delivery.status === "failed"
              ? "text-warning"
              : "text-foreground-secondary",
          )}
        >
          <span>
            {send.data.delivery.status === "delivered"
              ? t("kora.composer.delivered")
              : send.data.delivery.status === "queued"
                ? t("kora.composer.queued")
                : send.data.delivery.retryable !== false
                  ? t("kora.composer.failedRetryable")
                  : t("kora.composer.failed")}
            {send.data.delivery.error
              ? ` — ${send.data.delivery.error}`
              : ""}
          </span>
          {/* The honest retry: a NEW POST with the kept draft (failed
           * keeps the text precisely so this can re-send it). The guard
           * mirrors handleSend's own — a retry control NEVER renders when
           * the action would silently no-op (the signal went off or the
           * draft is gone); `retryable !== false` reads the contract's
           * optional field defensively (absent = retryable for failed). */}
          {send.data.delivery.status === "failed" &&
          send.data.delivery.retryable !== false &&
          hasDraft &&
          sendable ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="kora-delivery-retry"
              onClick={handleSend}
              className="min-h-9 md:min-h-6"
            >
              {t("kora.composer.retry")}
            </Button>
          ) : null}
        </div>
      ) : send.error !== null ? (
        <SendError error={send.error} />
      ) : null}
    </div>
  );
}

/** A refused send names itself: the frozen step-up ritual gets its own
 * honest plate; everything else renders the server's reason verbatim
 * (a 401 session rot included — the page-level CTA still owns the
 * sign-in flow; here the refusal is NAMED, not swallowed). */
function SendError({ error }: { error: Error }) {
  const t = useT();
  if (koraErrorCode(error) === "step_up_required") {
    return (
      <p
        role="alert"
        data-testid="kora-send-step-up"
        className="mt-1 min-h-4 text-xs text-warning"
      >
        {t("kora.composer.stepUpRequired")}
      </p>
    );
  }
  if (isKoraUnauthorized(error)) {
    return (
      <p
        role="alert"
        data-testid="kora-send-error"
        className="mt-1 min-h-4 text-xs text-warning"
      >
        {t("kora.composer.sendUnauthorized")}
      </p>
    );
  }
  return (
    <p
      role="alert"
      data-testid="kora-send-error"
      className="mt-1 min-h-4 text-xs text-warning"
    >
      {t("kora.composer.sendError", { reason: error.message })}
    </p>
  );
}
