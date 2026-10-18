/**
 * Kora data hooks (slice 1: list + coverage; slice 2: transcript + load-more).
 *
 * TanStack Query wrappers over the KoraGateway seam; the query keys are
 * stable so the slice-1 HTTP adapter swap changes nothing above this file.
 * The transcript hook mirrors chat v1 (ADR 0019 §3): after a send the
 * caller invalidates the transcript tail and the SAME cursor GET re-reads
 * the store — there is no second content channel.
 */
import { useCallback } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useKoraGateway } from "./koraGatewayContext";
import type {
  HermesChatRequest,
  HermesMessage,
  KoraSession,
  KoraSessionsList,
  KoraTranscriptItem,
} from "./koraTypes";

export const koraKeys = {
  all: ["kora"] as const,
  sessions: () => [...koraKeys.all, "sessions"] as const,
  /** P4-7 paged listing key (the page size is part of the key). */
  sessionsPaged: (pageSize: number) =>
    [...koraKeys.all, "sessions", "paged", pageSize] as const,
  session: (sessionId: string) => [...koraKeys.all, "session", sessionId] as const,
  transcript: (sessionId: string) =>
    [...koraKeys.all, "transcript", sessionId] as const,
  /** И1 paged transcript key (the page size is part of the key). */
  transcriptPaged: (sessionId: string, pageSize: number) =>
    [...koraKeys.all, "transcript", "paged", pageSize, sessionId] as const,
  stepUp: () => [...koraKeys.all, "steering", "step-up"] as const,
  /** T004 slice 2: the hermes bridge leg (status read; the pull mutation). */
  hermesStatus: () => [...koraKeys.all, "hermes", "status"] as const,
  /** T004 slice 3: the live hermes transcript cursor (page size in key). */
  hermesMessages: (sessionId: string, pageSize: number) =>
    [...koraKeys.all, "hermes", "messages", "paged", pageSize, sessionId] as const,
};

/** Slice 1 — session list + coverage. */
export function useKoraSessions() {
  const gateway = useKoraGateway();
  return useQuery({
    queryKey: koraKeys.sessions(),
    queryFn: ({ signal }) => gateway.listSessions(undefined, signal),
  });
}

/** P4-7 load-more page state (slice 2): accumulated rows + cursor. */
export interface KoraSessionPages {
  coverage: KoraSessionsList["coverage"] | null;
  meta: KoraSessionsList["meta"] | null;
  items: KoraSession[];
  hasMore: boolean;
  isPending: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * P4-7 (week-0 review, landed in slice 2): paged session listing for the
 * «Показать ещё» UI, on TanStack useInfiniteQuery so SSR/snapshot renders
 * stay synchronous off a prefilled cache. has_more is derived from the
 * frozen response — it has NO pagination fields, so a FULL page
 * (count === pageSize) means more may exist; a shorter page is the honest
 * end of the registry.
 */
export function useKoraSessionPages(pageSize = 50): KoraSessionPages {
  const gateway = useKoraGateway();
  const query = useInfiniteQuery({
    queryKey: koraKeys.sessionsPaged(pageSize),
    initialPageParam: 0,
    queryFn: ({ signal, pageParam }) =>
      gateway.listSessions({ limit: pageSize, offset: pageParam as number }, signal),
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      // a SHORT page is the end; a full page MAY have more
      if (lastPage.count !== pageSize) return undefined;
      return (lastPageParam as number) + pageSize;
    },
  });

  const loadMore = useCallback(async () => {
    await query.fetchNextPage();
  }, [query]);

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    coverage: query.data?.pages[0]?.coverage ?? null,
    meta: query.data?.pages[0]?.meta ?? null,
    items: query.data ? query.data.pages.flatMap((page) => [...page.items]) : [],
    hasMore: query.hasNextPage,
    isPending: query.isPending,
    isLoadingMore: query.isFetchingNextPage,
    error: query.error,
    loadMore,
    refetch,
  };
}

/** Slice 2 — transcript cursor page (tail). */
export function useKoraTranscript(sessionId: string | undefined) {
  const gateway = useKoraGateway();
  return useQuery({
    queryKey: koraKeys.transcript(sessionId ?? "none"),
    queryFn: ({ signal }) =>
      gateway.getTranscript(sessionId as string, { after_seq: 0 }, signal),
    enabled: sessionId !== undefined,
  });
}

/** P4-7-style paged transcript state (union И1, 07j §3 scroll canon). */
export interface KoraTranscriptPages {
  items: KoraTranscriptItem[];
  hasMore: boolean;
  isPending: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Union И1 (07j §3.1 Б): the session scroll reads the frozen cursor GET
 * forward from seq 0 — «Показать ещё» appends the next page, `has_more` is
 * the contract's own honest end marker (same discipline as the session
 * list's P4-7 hook). No second content channel, no tail polling — the tail
 * re-reads by USER action (follow-tail/load-more) until the SSE bus (И4).
 */
export function useKoraTranscriptPages(
  sessionId: string | undefined,
  pageSize = 50,
): KoraTranscriptPages {
  const gateway = useKoraGateway();
  const query = useInfiniteQuery({
    queryKey: koraKeys.transcriptPaged(sessionId ?? "none", pageSize),
    initialPageParam: 0,
    queryFn: ({ signal, pageParam }) =>
      gateway.getTranscript(
        sessionId as string,
        { after_seq: pageParam as number, limit: pageSize },
        signal,
      ),
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.next_after_seq : undefined,
    enabled: sessionId !== undefined,
  });

  const loadMore = useCallback(async () => {
    await query.fetchNextPage();
  }, [query]);

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    items: query.data ? query.data.pages.flatMap((page) => [...page.items]) : [],
    hasMore: query.hasNextPage,
    isPending: query.isPending,
    isLoadingMore: query.isFetchingNextPage,
    error: query.error,
    loadMore,
    refetch,
  };
}

/** Slice 3 — prompt send; success invalidates the store tail (chat v1). */
export function useKoraSendMessage(sessionId: string | undefined) {
  const gateway = useKoraGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => gateway.sendMessage(sessionId as string, text),
    onSuccess: () => {
      // Chat v1 = store-tail re-read: the transcript query refetches the
      // SAME authenticated cursor path — no event content, no second buffer.
      if (sessionId !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: koraKeys.transcript(sessionId),
        });
        void queryClient.invalidateQueries({ queryKey: koraKeys.sessions() });
      }
    },
  });
}

/** Slice 3 — step-up PIN status. */
export function useKoraStepUp() {
  const gateway = useKoraGateway();
  return useQuery({
    queryKey: koraKeys.stepUp(),
    queryFn: ({ signal }) => gateway.stepUpStatus(signal),
  });
}

/**
 * T004 slice 2 — the hermes bridge leg status (DATA read; the server
 * deliberately runs no live probe here, so the hook never polls and the
 * line never pulses). Refetch is a user action only (the refresh flow);
 * `off` is NOT an error — the status arrives 200 with mode "off".
 */
export function useKoraHermesStatus() {
  const gateway = useKoraGateway();
  return useQuery({
    queryKey: koraKeys.hermesStatus(),
    queryFn: ({ signal }) => gateway.hermesStatus(signal),
  });
}

/**
 * T004 slice 2 — ONE manual pull: GET /api/kora/hermes/sessions (live
 * listing → registry upsert). Triggered by the explicit refresh button
 * ONLY — no auto-pull, no interval. Success invalidates the paged session
 * registry (the SAME leg now serves hermes rows) and the status read.
 * The hermes error codes (hermes_off / hermes_unavailable) ride
 * koraErrorCode(err) — human reason from the server message.
 */
export function useKoraHermesPull() {
  const gateway = useKoraGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => gateway.pullHermesSessions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: koraKeys.sessions() });
      void queryClient.invalidateQueries({ queryKey: koraKeys.hermesStatus() });
    },
  });
}

/** T004 slice 3 — the hermes transcript cursor key (page size in key). */
export interface KoraHermesTranscriptPages {
  items: HermesMessage[];
  hasMore: boolean;
  isPending: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * T004 slice 3 — the LIVE hermes transcript (GET .../messages), the same
 * union-И1 cursor discipline as the zcode scroll: forward from seq 0,
 * «Показать ещё» appends, has_more is the contract's own end marker. The
 * seq is the 1-based position of THIS live read (the server's honesty: a
 * hermes transcript is a live proxy view, pages are consistent within one
 * read). No tail polling — the tail re-reads by user action only. The
 * route shares the live-pull limiter, so the query NEVER refetches on a
 * timer; window refocus refetch is the query default (a single cheap
 * read, no loop).
 */
export function useKoraHermesTranscriptPages(
  sessionId: string | undefined,
  pageSize = 50,
): KoraHermesTranscriptPages {
  const gateway = useKoraGateway();
  const query = useInfiniteQuery({
    queryKey: koraKeys.hermesMessages(sessionId ?? "none", pageSize),
    initialPageParam: 0,
    queryFn: ({ signal, pageParam }) =>
      gateway.hermesMessages(
        sessionId as string,
        { after_seq: pageParam as number, limit: pageSize },
        signal,
      ),
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.next_after_seq : undefined,
    enabled: sessionId !== undefined,
  });

  const loadMore = useCallback(async () => {
    await query.fetchNextPage();
  }, [query]);

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    items: query.data ? query.data.pages.flatMap((page) => [...page.items]) : [],
    hasMore: query.hasNextPage,
    isPending: query.isPending,
    isLoadingMore: query.isFetchingNextPage,
    error: query.error,
    loadMore,
    refetch,
  };
}

/**
 * T004 slice 3 — ONE non-stream chat call (POST /api/kora/hermes/chat).
 * Triggered by the composer send ONLY — no retries, no queue. The caller
 * composes the turns within the server caps (≤20 × ≤8000 chars, no tool
 * role) and renders the answer with the reply's own source marker.
 */
export function useKoraHermesChat() {
  const gateway = useKoraGateway();
  return useMutation({
    mutationFn: (body: HermesChatRequest) => gateway.hermesChat(body),
  });
}

/** Slice 3 — enable steering (PIN), then refresh the status. */
export function useKoraEnableStepUp() {
  const gateway = useKoraGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pin: string) => gateway.enableStepUp(pin),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: koraKeys.stepUp() });
    },
  });
}
