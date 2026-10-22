import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HonestLine } from "@/components/HonestLine/HonestLine";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { ROLE_TONE } from "./KoraTranscript";
import { formatTranscriptTime, koraSessionName } from "./koraWorkspaceModel";
import { useKoraHermesChat } from "./useKora";
import type {
  HermesChatReply,
  HermesChatTurn,
  HermesMessage,
  KoraSession,
} from "./koraTypes";
import type { KoraHermesTranscriptPages } from "./useKora";

/**
 * The hermes chat (T004 slice 3; KW2 «Живой чат» makes it the TOP half of
 * the split center — kora-rethink blueprint §4). The history IS the anchor
 * session's user/assistant rows (the ONE hoisted messages read — this
 * component never fetches; the workspace owns the cursor) + the locally
 * appended turns; a send composes the frozen caps (≤20 turns × ≤8000
 * chars, tool/system rows filtered — the server forbids a tool turn) + the
 * new text + the CHOSEN model into ONE non-stream POST.
 *
 * The header (blueprint §4): the session SWITCHER (the context sessions +
 * the pinned cluster option — writes the ROUTE /kora/:sessionId or
 * /kora/hermes, so deep links keep working), the MODEL select (the static
 * verified roster from /status, the default preselected) and the source
 * badge «hermes · real-time» as DATA.
 *
 * Honest light (states.md §3, every status under test):
 * - IDLE: the notes are visible — «цельно, не потоково; лимит — 12/мин» +
 *   the non-persistence note (POST /chat is STATELESS: the reply never
 *   reaches the hermes transcript; the thread lives in the view).
 * - PENDING: «Отправляем…», composer + button disabled, NO fake typing.
 * - ERR-TRANSPORT / ERR-RATE / ERR-VALID: the human reason named, the
 *   DRAFT STAYS (nothing is lost); a rate verdict carries Retry-After when
 *   the transport provides one (the board limiter names its window in the
 *   reason itself).
 * - UNKNOWN-FORMAT: the reply that did not parse is NAMED, never faked.
 * - MODEL-404: the cluster refused the model — the human reason rides the
 *   error line and the select KEEPS the user's choice; returning to the
 *   default is the USER's move, never a silent reset.
 */

/** One exchange the chat appended locally (a reply, or a failed send). */
interface HermesSentTurn {
  id: number;
  role: "user" | "assistant";
  content: string;
  /** The server's provenance marker on a REAL reply (data, not decor). */
  source?: string;
  model?: string;
}

/** The server's per-turn content cap (body caps are entry validation). */
const CHAT_TURN_CAP = 8000;
const CHAT_TURNS_CAP = 20;

/** The switcher's reserved cluster value — the /kora/hermes segment. It
 * cannot collide with a registry id (ids are executor:native). */
export const KORA_CLUSTER_OPTION = "hermes";

/** The FE fallback when the /status roster did not arrive (an older board):
 * blueprint §7 sanctions the constant — it IS the server's live-verified
 * default (hermes_client.HERMES_DEFAULT_MODEL, mirrored). */
const KORA_HERMES_FALLBACK_MODEL = "hermes-4.5-405b";

/** Extract the assistant text from the VERBATIM hermes completion. A shape
 * the FE cannot read answers null → the honest unknown-format line, never
 * an invented «ok». */
function completionText(reply: HermesChatReply): string | null {
  const completion = reply.completion as
    | { choices?: ReadonlyArray<{ message?: { content?: unknown } }> }
    | null;
  const content = completion?.choices?.[0]?.message?.content;
  return typeof content === "string" && content.length > 0 ? content : null;
}

/** History → chat turns: user/assistant only (a tool turn is REJECTED by
 * the chat contract), each content within the per-turn cap, the tail cut
 * to keep the new text within the 20-turn body cap. */
function historyTurns(items: readonly HermesMessage[]): HermesChatTurn[] {
  const turns: HermesChatTurn[] = [];
  for (const item of items) {
    if (item.role !== "user" && item.role !== "assistant") continue;
    const content =
      item.content.length > CHAT_TURN_CAP
        ? `${item.content.slice(0, CHAT_TURN_CAP - 1)}…`
        : item.content;
    turns.push({ role: item.role, content });
  }
  return turns.slice(-(CHAT_TURNS_CAP - 1));
}

export function KoraHermesChat({
  session,
  pages,
  models,
  defaultModel,
  sessions,
  activeSessionId,
  onNavigateSession,
}: {
  /** The anchor session (the history source); null = the honest clean slate. */
  session: KoraSession | null;
  /** The ONE hoisted messages read (the «Все ходы» zone consumes the same). */
  pages: KoraHermesTranscriptPages;
  /** The verified roster from /status; empty → the FE fallback constant. */
  models: readonly string[];
  defaultModel: string | null;
  /** The context sessions for the switcher (mirrors the left panel). */
  sessions: readonly KoraSession[];
  /** The session the route carries; null = the cluster option is active. */
  activeSessionId: string | null;
  /** The route seam: null → /kora/hermes, an id → /kora/:sessionId. */
  onNavigateSession: (sessionId: string | null) => void;
}) {
  const t = useT();
  const chat = useKoraHermesChat();
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<HermesSentTurn[]>([]);
  const [errorLine, setErrorLine] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  // null = the user has not chosen — the default rides (preselected in the
  // select, sent in the POST). An error NEVER resets this (K-CHAT-MODEL-404:
  // the way back to the default is the user's move).
  const [model, setModel] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const nextId = useRef(1);

  const roster = models.length > 0 ? models : [KORA_HERMES_FALLBACK_MODEL];
  const effectiveModel = model ?? defaultModel ?? KORA_HERMES_FALLBACK_MODEL;

  // The honest follow: appended turns pin the view to the bottom (scroll
  // positioning only — the same canon as the transcript follow-tail; this
  // tail is the CHAT'S OWN — the moves zone runs its own).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, chat.isPending]);

  // a11y (blueprint §10.7): a session switch moves FOCUS to the chat h2 —
  // the change is announced by the focus move itself, not just visually.
  // The first render is not a switch — no steal.
  const anchorKey = session?.id ?? null;
  const prevAnchor = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevAnchor.current === undefined) {
      prevAnchor.current = anchorKey;
      return;
    }
    if (prevAnchor.current !== anchorKey) {
      prevAnchor.current = anchorKey;
      headingRef.current?.focus();
    }
  }, [anchorKey]);

  const pending = chat.isPending;
  const hasDraft = draft.trim().length > 0;
  // A disabled query (no anchor session) never leaves «pending» on its own —
  // the clean-slate chat is the honest render there, not a skeleton.
  const historyPending = session !== null && pages.isPending;
  const historyError = session !== null && pages.error !== null;
  const historyVisible = pages.items.filter(
    (item) => item.role === "user" || item.role === "assistant",
  );
  const chatEmpty =
    !historyPending &&
    !historyError &&
    historyVisible.length === 0 &&
    turns.length === 0;

  const send = async () => {
    const text = draft.trim();
    if (text === "" || pending) return;
    setErrorLine(null);
    try {
      const reply = await chat.mutateAsync({
        messages: [...historyTurns(pages.items), { role: "user", content: text }],
        model: effectiveModel,
      });
      const answer = completionText(reply);
      const id = nextId.current;
      nextId.current += 2;
      setTurns((prev) => [
        ...prev,
        { id, role: "user", content: text },
        {
          id: id + 1,
          role: "assistant",
          content:
            answer ??
            // The unknown-format honesty: the reply arrived, its text did
            // not parse — named, never faked.
            t("kora.hermes.chatUnknownReply"),
          source: answer !== null ? reply.source : undefined,
          model: answer !== null ? reply.model : undefined,
        },
      ]);
      setDraft("");
      setAnnounce(t("kora.hermes.chatAnnounce"));
    } catch (err) {
      // The human reason rides the seam (KoraErrorOut message, FastAPI
      // detail, transport verdict). The draft STAYS — nothing is lost; the
      // model choice STAYS too (a model-404 never resets itself).
      setErrorLine(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section
      aria-label={t("kora.hermes.chatRegion")}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      {/* The chat header (blueprint §4): title + switcher + model + badge. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="min-w-0 truncate text-lg font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
        >
          {t("kora.hermes.chatTitle")}
        </h2>
        <Badge variant="outline" className="shrink-0 font-mono">
          {t("kora.hermes.chatSourceBadge")}
        </Badge>
        <span className="min-w-0 shrink-0 basis-full font-mono text-xs text-foreground-muted sm:basis-0 sm:flex-1">
          {session !== null
            ? t("kora.hermes.chatAnchor", { name: session.id })
            : t("kora.hermes.chatNoAnchor")}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-4">
        <p className="flex items-center gap-2 text-xs">
          <label
            htmlFor="kora-hermes-chat-session"
            className="text-foreground-secondary"
          >
            {t("kora.hermes.chatSessionLabel")}:
          </label>
          <select
            id="kora-hermes-chat-session"
            value={activeSessionId ?? KORA_CLUSTER_OPTION}
            onChange={(event) => {
              const value = event.target.value;
              onNavigateSession(value === KORA_CLUSTER_OPTION ? null : value);
            }}
            className="h-7 max-w-56 rounded-md border border-border-subtle bg-background px-2 text-xs text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
          >
            <option value={KORA_CLUSTER_OPTION}>
              {t("kora.nav.clusterChat")}
            </option>
            {sessions.map((item) => (
              <option key={item.id} value={item.id}>
                {koraSessionName(item)}
              </option>
            ))}
          </select>
        </p>
        <p className="flex items-center gap-2 text-xs">
          <label htmlFor="kora-hermes-chat-model" className="text-foreground-secondary">
            {t("kora.hermes.modelLabel")}:
          </label>
          <select
            id="kora-hermes-chat-model"
            value={effectiveModel}
            onChange={(event) => setModel(event.target.value)}
            className="h-7 max-w-56 rounded-md border border-border-subtle bg-background px-2 font-mono text-xs text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
          >
            {roster.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </p>
      </div>

      {/* The scroll owns the free height (the scene canon) — history first,
       * then the locally appended turns, then the honest tail. */}
      <div className="kora-scroll mt-3 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {historyPending ? (
          <div
            role="status"
            aria-label={t("kora.transcript.loading")}
            className="max-w-scroll space-y-3 font-scroll"
          >
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : (
          <>
            {historyError ? (
              <p role="alert" className="mb-4 text-sm text-error">
                {t("kora.transcript.loadFailed")} {pages.error?.message}
              </p>
            ) : null}
            {pages.hasMore ? (
              <div className="mb-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pages.isLoadingMore}
                  onClick={() => void pages.loadMore()}
                >
                  {t("kora.list.loadMore")}
                </Button>
              </div>
            ) : null}
            <ol className="max-w-scroll space-y-4 font-scroll">
              {historyVisible.map((item) => (
                <ChatLine key={`h:${item.seq}`} item={item} />
              ))}
              {turns.map((turn) => (
                <li key={`s:${turn.id}`} className="flex gap-3 text-sm leading-relaxed">
                  <span className="w-11 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums text-foreground-muted">
                    ·
                  </span>
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap break-words">
                      <span
                        aria-hidden
                        className={cn(
                          "mr-2 inline-block h-fit rounded-sm px-1.5 py-0.5 font-ui text-xs font-medium",
                          ROLE_TONE[turn.role],
                        )}
                      >
                        {turn.role}
                      </span>
                      {turn.content}
                    </p>
                    {turn.role === "assistant" && turn.source !== undefined ? (
                      <p className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          {turn.source}
                        </Badge>
                        <span className="font-mono text-xs tabular-nums text-foreground-muted">
                          {turn.model}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
              {chat.isPending ? (
                <li className="flex gap-3 text-sm text-foreground-secondary">
                  <span className="w-11 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums text-foreground-muted">
                    ·
                  </span>
                  <p role="status" className="whitespace-pre-wrap">
                    {t("kora.hermes.chatSending")}
                  </p>
                </li>
              ) : null}
            </ol>
            {chatEmpty ? (
              <div className="mt-4">
                <HonestLine>{t("kora.hermes.chatEmpty")}</HonestLine>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* The composer: a REAL send (the bridge chat leg is live). Enter
       * sends, Shift+Enter falls through to the newline; the draft caps at
       * the server's per-turn limit in the attribute. */}
      <div className="border-t border-myelin bg-well px-4 py-3">
        <div className="flex items-start gap-2">
          <label className="sr-only" htmlFor="kora-hermes-chat-input">
            {t("kora.hermes.chatInput")}
          </label>
          <textarea
            id="kora-hermes-chat-input"
            rows={2}
            maxLength={CHAT_TURN_CAP}
            disabled={pending}
            aria-describedby="kora-hermes-chat-note"
            className="min-h-11 w-full resize-y rounded-md border border-border-subtle bg-background px-3 py-2 font-ui text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright disabled:cursor-not-allowed disabled:text-foreground-muted"
            placeholder={t("kora.hermes.chatPlaceholder")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <Button
            type="button"
            size="default"
            loading={pending}
            disabled={!hasDraft || pending}
            aria-describedby="kora-hermes-chat-note"
            className="min-w-11 shrink-0"
            onClick={() => void send()}
          >
            <Send aria-hidden className="size-4" />
            {t("kora.hermes.chatSend")}
          </Button>
        </div>
        <p
          role={errorLine !== null ? "alert" : undefined}
          className={cn(
            "mt-2 text-xs",
            errorLine !== null ? "text-error" : "text-foreground-muted",
          )}
        >
          {errorLine !== null
            ? `${t("kora.hermes.chatErrorPrefix")}${errorLine}`
            : pending
              ? t("kora.hermes.chatSending")
              : t("kora.hermes.chatNote")}
        </p>
        {/* The non-persistence honesty (kora-rethink blueprint §4): POST
         * /chat is stateless — the reply NEVER joins the hermes transcript.
         * Always visible under the composer, not a hover secret. */}
        <p className="mt-1 text-xs text-foreground-muted">
          {t("kora.hermes.chatNonPersistent")}
        </p>
        {/* 4.1.3: the received reply is announced politely. */}
        <p role="status" aria-live="polite" className="sr-only">
          {announce}
        </p>
      </div>
    </section>
  );
}

/** One history row in the chat: the transcript grammar (role chip, mono
 * time), no hermes extras — the chat reads as a conversation, the full
 * transcript (tools, reasoning) lives in the «Все ходы» zone. */
function ChatLine({ item }: { item: HermesMessage }) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed">
      <span className="w-11 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums text-foreground-muted">
        {formatTranscriptTime(item.ts) || "·"}
      </span>
      <div className="min-w-0">
        <p className="whitespace-pre-wrap break-words">
          <span
            aria-hidden
            className={cn(
              "mr-2 inline-block h-fit rounded-sm px-1.5 py-0.5 font-ui text-xs font-medium",
              ROLE_TONE[item.role] ?? ROLE_TONE.system,
            )}
          >
            {item.role}
          </span>
          {item.content}
        </p>
      </div>
    </li>
  );
}
