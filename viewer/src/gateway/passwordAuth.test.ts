import { describe, expect, it, vi } from "vitest";

import {
  PasswordAuthClient,
  PasswordRateLimitedError,
} from "./passwordAuth";
import type { ApiError } from "@/lib/errors";

/**
 * Wire gate for `POST /api/auth/password` (ME-080 follow-up, the settings
 * «Безопасность» form): 204 no body on success; refusals keep the server's
 * human `detail`; the 429 verdict carries the server's Retry-After SECONDS
 * (the raw-fetch reason — requestJson hides headers). The session leg
 * requires current_password; the token-recovery leg omits it — both are
 * just body shapes here, the server rules.
 */

const PASSWORD_URL = "/api/auth/password";

function makeClient(responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const queue = [...responses];
  const fetchImpl = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return queue.length > 1 ? (queue.shift() as Response) : queue[0];
  }) as unknown as typeof fetch;
  return { client: new PasswordAuthClient({ fetchImpl }), calls };
}

const noContent = () => new Response(null, { status: 204 });

describe("PasswordAuthClient.setPassword (POST /auth/password)", () => {
  it("204 resolves; the body carries new_password, optional username and current_password", async () => {
    const { client, calls } = makeClient([noContent()]);
    await client.setPassword({
      username: "abyss",
      newPassword: "parol-nadezhnyy-123",
      currentPassword: "staryy-parol-123",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(PASSWORD_URL);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      username: "abyss",
      new_password: "parol-nadezhnyy-123",
      current_password: "staryy-parol-123",
    });
  });

  it("empty username is OMITTED (the session leg infers the account); absent current too", async () => {
    const { client, calls } = makeClient([noContent()]);
    await client.setPassword({ username: "   ", newPassword: "parol-nadezhnyy-123" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      new_password: "parol-nadezhnyy-123",
    });
  });

  it("401 keeps the server's human detail as the error message", async () => {
    const { client } = makeClient([
      new Response(JSON.stringify({ detail: "current password mismatch" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ]);
    await expect(
      client.setPassword({ username: "abyss", newPassword: "parol-nadezhnyy-123", currentPassword: "x".repeat(8) }),
    ).rejects.toMatchObject({ status: 401, message: "current password mismatch" });
  });

  it("the same 403 for a non-owner AND an unknown account rides the server detail (no oracle)", async () => {
    const { client } = makeClient([
      new Response(JSON.stringify({ detail: "password recovery is owner-only" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    ]);
    await expect(
      client.setPassword({ username: "who-is-this", newPassword: "parol-nadezhnyy-123" }),
    ).rejects.toMatchObject({ status: 403, message: "password recovery is owner-only" });
  });

  it("429 becomes PasswordRateLimitedError with the parsed Retry-After seconds", async () => {
    const { client } = makeClient([
      new Response(null, { status: 429, headers: { "Retry-After": "30" } }),
    ]);
    const error = await client
      .setPassword({ username: "abyss", newPassword: "parol-nadezhnyy-123" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PasswordRateLimitedError);
    expect((error as PasswordRateLimitedError).retryAfterSeconds).toBe(30);
    expect((error as ApiError).status).toBe(429);
  });

  it("a garbage/absent Retry-After degrades to null (the form falls back to its default wait)", async () => {
    const { client } = makeClient([
      new Response(null, { status: 429, headers: { "Retry-After": "soon" } }),
      new Response(null, { status: 429 }),
    ]);
    const first = await client
      .setPassword({ newPassword: "parol-nadezhnyy-123" })
      .catch((caught: unknown) => caught);
    const second = await client
      .setPassword({ newPassword: "parol-nadezhnyy-123" })
      .catch((caught: unknown) => caught);
    expect((first as PasswordRateLimitedError).retryAfterSeconds).toBeNull();
    expect((second as PasswordRateLimitedError).retryAfterSeconds).toBeNull();
  });

  it("a non-JSON refusal still throws an honest status ApiError", async () => {
    const { client } = makeClient([new Response("gateway noise", { status: 502 })]);
    await expect(
      client.setPassword({ newPassword: "parol-nadezhnyy-123" }),
    ).rejects.toMatchObject({ status: 502 });
  });
});
