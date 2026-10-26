/**
 * Provider base_url + provider_key validation (MF2) — the FE half of the
 * red line 5 (security-verdict §4.5 / OQ-4 amendment 2, mirrored by
 * `server/app.py::_validate_provider_base_url`). ONE message family on
 * BOTH sides: the refusal strings here are byte-identical to the server's
 * 422 ``credential_in_url`` payloads, so an inline rejection and a server
 * rejection read the same (ux-blueprint §3.1).
 *
 * Structural normalization only: scheme lowercased, query/fragment
 * stripped, trailing slash trimmed. The host is NEVER rewritten — the
 * board trims the address, it does not edit it.
 */

/** Query parameter NAMES that mean «a credential rides in the URL». */
const CREDENTIAL_QUERY_PARAMS: ReadonlySet<string> = new Set([
  "key",
  "token",
  "api_key",
  "apikey",
  "api-key",
  "access_token",
  "access-key",
  "password",
  "secret",
  "auth",
]);

/** The credential-in-URL refusal — byte-identical to the server family. */
export const CREDENTIAL_IN_URL_MESSAGE =
  "В URL не должно быть логина или пароля — ключ вводится отдельным полем.";

export type ProviderUrlVerdict =
  | { ok: true; normalized: string }
  | { ok: false; credentialInUrl: boolean; message: string };

/** Structural verdict on a typed base_url (no network, no echo of the
 * rejected value — the message speaks about the SHAPE, never the input). */
export function validateProviderBaseUrl(raw: string): ProviderUrlVerdict {
  const url = raw.trim();
  if (!url) {
    return { ok: false, credentialInUrl: false, message: "base_url is required" };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, credentialInUrl: false, message: "invalid URL" };
  }
  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    return { ok: false, credentialInUrl: false, message: "scheme must be http or https" };
  }
  // WHATWG URL: credentials live on `.username`/`.password` (userinfo).
  if (parsed.username || parsed.password) {
    return { ok: false, credentialInUrl: true, message: CREDENTIAL_IN_URL_MESSAGE };
  }
  const host = parsed.hostname.toLowerCase();
  if (!host) {
    return { ok: false, credentialInUrl: false, message: "host is required" };
  }
  const path = parsed.pathname;
  if (path !== "/" && (path.includes("..") || !path.startsWith("/"))) {
    return { ok: false, credentialInUrl: false, message: "bad path" };
  }
  for (const name of new URLSearchParams(parsed.search).keys()) {
    if (CREDENTIAL_QUERY_PARAMS.has(name.toLowerCase())) {
      return { ok: false, credentialInUrl: true, message: CREDENTIAL_IN_URL_MESSAGE };
    }
  }
  // Normalize: scheme://authority[/base-path] — query/fragment ALWAYS
  // stripped, trailing slash trimmed.
  const normalized = `${scheme}://${parsed.host}${path === "/" ? "" : path}`;
  return { ok: true, normalized: normalized.replace(/\/+$/, "") || `${scheme}://${parsed.host}` };
}

/** provider_key slug discipline: [a-z0-9-], 1..60 (the harness-dictionary
 * charset bound; byte-identical to the server's 422 message family). */
export function isProviderKeyValid(key: string): boolean {
  return /^[a-z0-9-]{1,60}$/.test(key);
}
