import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_IN_URL_MESSAGE,
  isProviderKeyValid,
  validateProviderBaseUrl,
} from "./providerUrl";

/**
 * The FE half of red line 5 (security-verdict §4.5 / OQ-4 amendment 2):
 * structural validation + the ONE credential-in-URL message family shared
 * byte-for-byte with the server's 422 (server/app.py
 * ::_validate_provider_base_url is the mirror).
 */
describe("validateProviderBaseUrl — red line 5", () => {
  it("accepts and normalizes honest provider URLs", () => {
    expect(validateProviderBaseUrl("https://openrouter.ai/api/v1")).toEqual({
      ok: true,
      normalized: "https://openrouter.ai/api/v1",
    });
    expect(
      validateProviderBaseUrl("https://openrouter.ai/api/v1/?utm=1#frag"),
    ).toEqual({ ok: true, normalized: "https://openrouter.ai/api/v1" });
    // The blueprint's first-class local provider: loopback stays legal.
    expect(validateProviderBaseUrl("http://127.0.0.1:11434")).toEqual({
      ok: true,
      normalized: "http://127.0.0.1:11434",
    });
  });

  it("refuses userinfo and credential-shaped queries with the FAMILY message", () => {
    for (const bad of [
      "https://user:pass@openrouter.ai/api/v1",
      "https://openrouter.ai/api/v1?key=x",
      "https://openrouter.ai/api/v1?token=x",
      "https://openrouter.ai/api/v1?api_key=x",
      "https://openrouter.ai/api/v1?APIKEY=x",
    ]) {
      const verdict = validateProviderBaseUrl(bad);
      expect(verdict).toEqual({
        ok: false,
        credentialInUrl: true,
        message: CREDENTIAL_IN_URL_MESSAGE,
      });
    }
  });

  it("structural refusals are not the credential family", () => {
    for (const bad of ["ftp://x", "not-a-url", "https://", ""]) {
      const verdict = validateProviderBaseUrl(bad);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.credentialInUrl).toBe(false);
    }
  });

  it("never echoes the rejected value in the message", () => {
    const verdict = validateProviderBaseUrl("https://u:sup3r-s3cr3t@host/path");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.message).not.toContain("sup3r-s3cr3t");
  });
});

describe("isProviderKeyValid — the slug discipline", () => {
  it("accepts [a-z0-9-] up to 60; rejects the rest", () => {
    expect(isProviderKeyValid("openrouter")).toBe(true);
    expect(isProviderKeyValid("a".repeat(60))).toBe(true);
    expect(isProviderKeyValid("a".repeat(61))).toBe(false);
    expect(isProviderKeyValid("OpenRouter")).toBe(false);
    expect(isProviderKeyValid("has space")).toBe(false);
    expect(isProviderKeyValid("слаг")).toBe(false);
    expect(isProviderKeyValid("")).toBe(false);
  });
});
