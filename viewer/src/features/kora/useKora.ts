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
import type { KoraSession, KoraSessionsList } from "./koraTypes";

export const koraKeys = {
  all: ["kora"] as const,
  sessions: () => [...koraKeys.all, "sessions"] as const,
  /** P4-7 paged listing key (the page size is part of the key). */
  sessionsPaged: (pageSize: number) =>
    [...koraKeys.all, "sessions", "paged", pageSize] as const,
  session: (sessionId: string) => [...koraKeys.all, "session", sessionId] as const,
  transcript: (sessionId: string) =>
    [...koraKeys.all, "transcript", sessionId] as const,
  stepUp: () => [...koraKeys.all, "steering", "step-up"] as const,
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
