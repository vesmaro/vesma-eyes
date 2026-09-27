import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryFunctionContext,
  type QueryKey,
} from "@tanstack/react-query";
import type {
  ActivityBucketParams,
  ActivityParams,
} from "@/gateway/boardTypes";
import { isActivitySource } from "@/gateway/capabilities";
import { useGateway } from "@/gateway/GatewayContext";
import { keys } from "@/lib/queryKeys";
import { GC_TIMES, STALE_TIMES } from "@/lib/queryClient";
import {
  readActivityLive,
  subscribeActivityLive,
  type ActivityLiveItem,
} from "./activityStore";

/**
 * UI-28 activity data hooks (spec 2026-09-27). The feed is an infinite
 * cursor query (`before_id` — stable pages under live refill) over the
 * capability-gated `activity()` read; the histogram reads the bucket view
 * through its own key. Both follow the BE-15 freeze discipline: stable
 * queryKey reference (useMemo) + stable queryFn identity (useCallback).
 *
 * The LIVE half comes from the domain SSE bridge through the module store
 * (activityStore.ts) — one stream per domain, no second EventSource. The
 * page merges pages+live and filters client-side (activityUrl.ts).
 */

/** Feed page size (the server's default; explicit for determinism). */
export const ACTIVITY_PAGE_SIZE = 50;

/** Cursor-paged feed (`GET /api/activity` with before_id pages). */
export function useActivityFeed(filters: ActivityParams = {}) {
  const gateway = useGateway();
  const capable = isActivitySource(gateway);
  const queryKey = useMemo(() => keys.tasks.activity.list(filters), [filters]);
  const queryFn = useCallback(
    ({ signal, pageParam }: QueryFunctionContext<QueryKey, string | undefined>) => {
      if (!isActivitySource(gateway)) {
        throw new Error("useActivityFeed: gateway has no activity capability.");
      }
      return gateway.activity(
        { ...filters, limit: ACTIVITY_PAGE_SIZE, before_id: pageParam },
        signal,
      );
    },
    [gateway, filters],
  );
  return useInfiniteQuery({
    queryKey,
    queryFn,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.has_more && lastPage.items.length > 0
        ? lastPage.items[lastPage.items.length - 1].id
        : undefined,
    enabled: capable,
    // A filter change lands on a NEW key: keep the previous page on screen
    // while the new one resolves — no skeleton flash, no layout jump (§5.1).
    placeholderData: keepPreviousData,
    staleTime: STALE_TIMES.taskActivity,
    gcTime: GC_TIMES.taskActivity,
  });
}

/** Hour-bucket view (`GET /api/activity?bucket=hour&hours=24`, Ф2). */
export function useActivityBuckets(filters: ActivityBucketParams = {}) {
  const gateway = useGateway();
  const capable = isActivitySource(gateway);
  const queryKey = useMemo(() => keys.tasks.activity.buckets(filters), [filters]);
  const queryFn = useCallback(
    ({ signal }: QueryFunctionContext) => {
      if (!isActivitySource(gateway)) {
        throw new Error("useActivityBuckets: gateway has no activity capability.");
      }
      return gateway.activityBuckets({ bucket: "hour", hours: 24, ...filters }, signal);
    },
    [gateway, filters],
  );
  return useQuery({
    queryKey,
    queryFn,
    enabled: capable,
    placeholderData: keepPreviousData,
    staleTime: STALE_TIMES.taskActivity,
    gcTime: GC_TIMES.taskActivity,
  });
}

/** The live store snapshot (items + connection state + recovery counter). */
export function useActivityLive(): {
  items: readonly ActivityLiveItem[];
  streamState: ReturnType<typeof readActivityLive>["streamState"];
  lastDataAt: number;
  reconnects: number;
} {
  return useSyncExternalStore(subscribeActivityLive, readActivityLive, readActivityLive);
}

/**
 * SSE-reconnect refetch (spec §5.1 degraded → §8.7): after a drop+recovery
 * the at-most-once stream may have missed transitions, so the feed and the
 * buckets go stale and ACTIVE observers refetch. Mirrors agentsEvents.ts
 * §5.9; the bridge (taskEvents.ts) bumps the recovery counter this effect
 * watches. The mount-time counter is the baseline — the initial connect
 * must NOT refetch (the queries just mounted fresh).
 */
export function useActivityReconnectRefetch(reconnects: number): void {
  const queryClient = useQueryClient();
  const seenRef = useRef(reconnects); // mount baseline
  useEffect(() => {
    if (reconnects === seenRef.current) return;
    seenRef.current = reconnects;
    void queryClient.invalidateQueries({ queryKey: keys.tasks.activity.all });
  }, [reconnects, queryClient, seenRef]);
}

