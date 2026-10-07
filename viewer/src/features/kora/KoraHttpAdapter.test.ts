import { describe, expect, it, vi } from "vitest";

import { KoraHttpAdapter, KoraHttpError } from "./KoraHttpAdapter";
import { ApiError } from "@/lib/errors";

/**
 * Auth-honesty gate for the Kora HTTP adapter (owner complaint on prod
 * 1.63.0, 2026-10-07 — «сразу разлогинивает»): the server resolves identity
 * HEADER-FIRST, so ANY stale bearer beside the live `vesmaro_ui` cookie
 * used to 401 the whole page. Pinned here:
 *
 * - reads ship BARE — no device `mnd_` leg, no panel bearer on GETs;
 * - mutations attach the bearer only when the panel holds one, and a 401
 *   under a bearer replays EXACTLY ONCE headerless (the cookie leg);
 * - the transcript guard refuses undefined/empty ids BEFORE the wire
 *   (the prod log's /api/kora/sessions/undefined/transcript garbage call).
 */

const okResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

interface Call {
  url: string;
  init: RequestInit;
}

function makeAdapter(options: {
  /** Scripted responses, consumed in order; the last one repeats. */
  responses: Response[];
  uiToken?: string;
}) {
  const calls: Call[] = [];
  const queue = [...options.responses];
  const fetchImpl = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return queue.length > 1 ? (queue.shift() as Response) : queue[0];
  }) as unknown as typeof fetch;
  const adapter = new KoraHttpAdapter({
    baseUrl: "/api",
    fetchImpl,
    getUiTokenFn: () => options.uiToken ?? "",
  });
  return { adapter, calls, fetchImpl };
}

const SESSIONS_LIST = {
  items: [],
  count: 0,
  coverage: { harnesses: [], gaps: [] },
  meta: { stale: false },
};

const SEND_ACCEPTED = {
  ok: true,
  session_id: "sess-1",
  delivery: { status: "delivered" },
};

describe("KoraHttpAdapter auth honesty (reads bare, mutation replay)", () => {
  it("listSessions ships BARE — no Authorization even with a panel token", async () => {
    const { adapter, calls } = makeAdapter({
      responses: [okResponse(SESSIONS_LIST)],
      uiToken: "ui-fresh",
    });
    await adapter.listSessions();
    expect(calls).toHaveLength(1);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("listSessions ships BARE without any token too (the cookie speaks)", async () => {
    const { adapter, calls } = makeAdapter({ responses: [okResponse(SESSIONS_LIST)] });
    await adapter.listSessions();
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("sendMessage attaches the panel bearer when one is held", async () => {
    const { adapter, calls } = makeAdapter({
      responses: [okResponse(SEND_ACCEPTED)],
      uiToken: "ui-fresh",
    });
    await adapter.sendMessage("sess-1", "ping");
    expect(calls).toHaveLength(1);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer ui-fresh");
  });

  it("a 401 under a bearer replays EXACTLY ONCE headerless and succeeds (cookie leg)", async () => {
    const { adapter, calls } = makeAdapter({
      responses: [okResponse({ message: "stale token" }, 401), okResponse(SEND_ACCEPTED)],
      uiToken: "ui-stale",
    });
    const out = await adapter.sendMessage("sess-1", "ping");
    expect(out.session_id).toBe("sess-1");
    expect(calls).toHaveLength(2);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      "Bearer ui-stale",
    );
    // The replay stripped the stale header — the cookie carries the session.
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(calls[1].init.body).toBe(calls[0].init.body); // same payload re-sent
  });

  it("a bare 401 (no panel token) does NOT replay — one call, honest verdict", async () => {
    const { adapter, calls, fetchImpl } = makeAdapter({
      responses: [okResponse({ message: "no session" }, 401)],
    });
    await expect(adapter.sendMessage("sess-1", "ping")).rejects.toMatchObject({
      status: 401,
    });
    expect(calls).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("a replay that 401s again stands as the server's verdict (two calls total)", async () => {
    const { adapter, calls } = makeAdapter({
      responses: [okResponse({ message: "no" }, 401)],
      uiToken: "ui-stale",
    });
    await expect(adapter.sendMessage("sess-1", "ping")).rejects.toBeInstanceOf(
      KoraHttpError,
    );
    expect(calls).toHaveLength(2); // one replay, never a loop
  });
});

describe("KoraHttpAdapter transcript guard (owner complaint: /sessions/undefined/transcript)", () => {
  it("refuses an undefined session id BEFORE the wire", async () => {
    const { adapter, fetchImpl } = makeAdapter({
      responses: [okResponse({ items: [], has_more: false, next_after_seq: 0 })],
    });
    await expect(
      // The useKora cast (`sessionId as string`) can hand undefined through
      // a forced refetch — TanStack refetch() bypasses `enabled`.
      adapter.getTranscript(undefined as unknown as string),
    ).rejects.toMatchObject({
      status: 400,
      message: "Kora getTranscript: no session id — the request was not sent",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses an empty/whitespace session id too", async () => {
    const { adapter, fetchImpl } = makeAdapter({
      responses: [okResponse({ items: [], has_more: false, next_after_seq: 0 })],
    });
    await expect(adapter.getTranscript("   ")).rejects.toBeInstanceOf(ApiError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a real id still fetches — bare, URL-encoded", async () => {
    const { adapter, calls } = makeAdapter({
      responses: [okResponse({ items: [], has_more: false, next_after_seq: 0 })],
    });
    await adapter.getTranscript("sess/1");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/kora/sessions/sess%2F1/transcript");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
