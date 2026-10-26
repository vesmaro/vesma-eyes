# Models Fleet — MF3 Threat Model: grants + pull-enforcement proxy + use-audit

Status: VERDICT — the gate that red line 10 of `security-verdict.md` §4
("the pull-proxy is a later wave with its own threat model") demands.
Design only; no code. Authored by gcw-senior-security-engineer
(2026-10-26). Builds on: security-verdict.md (832cd7a, H1/H2/H4 verdicts
and §4 red lines — all carried forward verbatim), discovery-contract
daf969b §1 (grant = authority record), ux-blueprint MF3 section
(grants table, slot `rejected`, wave table line MF3).

## 0. Scope and method

In scope: (1) grants as owner-write authority records
`(credential_ref, selector, enabled)`; (2) pull-enforcement — the board
accepts inference calls and proxies them to the provider with the
vault-held key per request; (3) per-request use-audit; (4) slot
liveness (`last_used_at`, `rejected` reached by provider 401).
Out of scope (stays red-lined): the agent-side shim variant (own wave,
own gate), per-model ACLs, harness-selector grants (deferred, ux Q2),
push of material (excluded from the epic, verdict §3).

Standards baseline: OWASP ASVS 4.0 L2 — V3 (Session/token authn), V4
(Access Control), V9 (Communications), V12 (Files, incl. upload caps),
V13 (API), V7 (Errors & Logging), V14 (Config). Threat register:
STRIDE-minimum per the proxy surface. CWEs cited per finding.

## 1. Surfaces and trust boundaries (who may call the proxy)

**Decision: three caller classes, all already-authenticated principals.
No new secret class in MF3. No anonymous leg exists.**

| Class | Credential | Route shape | Grant check |
|---|---|---|---|
| Board self-use (owner UI / Kora) | `VESMARO_UI_TOKEN` session (existing) | `POST /api/models/{provider_key}/infer` | NONE by design — provider registered = usable by the board («доступен только борду», MF-GRANT-EMPTY). Audited as principal `ui`. |
| Agent relay | the agent's EXISTING executor token (discovery-leg authn class, identity-match per protocol §3) | `POST /api/executors/{id}/models/{provider_key}/infer` — token must match the `{id}` executor row, same discipline as discovery | YES — against the AUTHENTICATED executor identity |
| Anything else | — | 401, no named reason | — |

Rationale. Harnesses never talk to the board directly: the harness's
inference endpoint is a credential-free localhost URL served by its
own host's agent (exact mesh-mode-shim precedent: child env carries NO
token). The agent authenticates to the board with a token it already
holds; the board gets an authenticated executor identity for free —
and use-audit attribution (H4) rides that identity, not a claim.
Inventing a fourth "inference secret" would duplicate the executor
token's whole lifecycle (distribution, at-rest, rotation) for zero new
coverage — the H3 argument again (CWE-359).

**Trust boundary statement:** the board terminates the caller's TLS
and request, then builds a NEW outbound request to the provider. Raw
inbound bytes are never piped to the provider (kills request-smuggling
into the provider leg). The caller influences exactly three fields of
the outbound call: `model_id` (into the JSON body), the message
payload (body), and nothing else.

**Blast-radius honesty:** a `host:<name>` selector grants every
authenticated executor on that host; a compromised host is inside the
grant's scope by definition. This is the semantics the owner chose in
the selector; the grants table shows it (ux §3.3). `executor:<harness@host>`
is the narrow form; it is the recommended default.

## 2. Threat register (STRIDE-minimum, proxy surface)

### S — spoofing the caller

- Only the two token classes above authenticate; executor tokens are
  identity-matched (token ↔ executor row), never "self-declared".
- Audit attribution derives from the AUTHENTICATED principal, never
  from request-body fields. A body field naming an executor is ignored
  for attribution (CWE-284 → otherwise forged audit rows).
- ASVS V3.5/V4.1: fail-closed on missing/unknown/mismatched token;
  outcome class `revoked` audit row on any authn failure at this route.

### T — tampering with the destination (the SSRF axis)

**Decision: the caller never chooses the destination. All SSRF-adjacent
controls follow from that, plus these owner-side validations.**

- `provider_key` in the route resolves to the owner-registered record;
  egress `base_url` comes from THAT record only (already normalized at
  registration: `scheme://authority[/base-path]`, query/fragment
  stripped, credentials rejected — verdict §2.amend-2 applies here as
  the egress URL source).
- Path allowlist, fixed suffixes on the base path:
  `POST /chat/completions`, `POST /completions`, `POST /embeddings`,
  `GET /models`. Caller-supplied paths are never appended (CWE-918).
- Scheme allowlist: `https` for any non-loopback authority; `http`
  allowed only for loopback (`127.0.0.1`, `::1`) — the on-cluster/
  on-lan ollama class. Registration-time rejection otherwise (same
  inline-message family as ux §3.1).
- Redirects: NOT followed. Any 3xx from the provider surfaces as
  outcome class `provider_error` with the 3xx status; following would
  let a compromised provider endpoint or an owner mistake redirect
  egress to an unvalidated target (classic CWE-918 amplifier). Zero
  redirects, v1.
- Header discipline inbound: `Authorization`, `Cookie`, and hop-by-hop
  headers are stripped and never forwarded. Outbound: the board adds
  EXACTLY ONE `Authorization` header from the vault (Bearer). A caller
  cannot smuggle a second auth header — they are dropped, not merged.
  `Host` is rebuilt from the resolved authority.
- Residual, stated honestly: the OWNER can register a `base_url`
  pointing at an internal service; that is an owner decision on
  owner-scoped infrastructure (the owner is the configuration trust
  anchor — same posture as HERMES_HOST today). What this design
  forbids is CALLER influence on the destination, and that is closed.

### R — repudiation (covered by the audit contract, §4)

Every admitted or refused call writes a use row with the authenticated
principal. The one carve-out: `GET /models` (listing) is also audited
— "who saw the roster of a paid provider" is a use.

### I — information disclosure

- **No payload persistence, ever.** Request and response bodies live in
  memory for the duration of the proxied call and are never written to
  disk, logged, cached, or echoed into errors. Streaming is passed
  through with buffering disabled (no spool file).
- **Error passthrough allowlist:** the provider's error is surfaced to
  the caller and to logs as `{status_code, message, type}` only, total
  ≤ 1 KiB (truncate `message` at 512 chars), provider headers never
  (CWE-538 / the HERMES error-payload-allowlist precedent).
- **Credential isolation:** the vault material enters exactly one
  header on the outbound leg; it never appears in any error, log, URL,
  audit field, or response (verdict §4.1/4.5 carried verbatim; ASVS
  V14.3, CWE-538).
- **No content scanning.** A prompt may legitimately contain a secret
  pasted by its author; the board does not inspect caller content
  (inspection would violate the no-content-touch rule itself). The
  `models.credential_leak_suspected` detector stays on the DISCOVERY
  ingest path only — it has a schema to scan there; the proxy has
  bodies it must not read for judgment.

### D — denial of service (numbers are proposed server-owned constants)

| Control | Proposed default | Note |
|---|---|---|
| Request body cap | 4 MiB | single JSON body; over → 413, outcome `capped` |
| `model_id` cap | ≤ 200 chars, ≤ 1 per request | body field; over → 422 |
| Connect timeout | 5 s | provider TCP/TLS |
| First-byte timeout | 30 s | provider answered nothing → 504 |
| Streaming idle-read timeout | 60 s | resets on chunk; total wall clock ≤ 300 s → 504 |
| Per-executor in-flight | 2 | over → 429, outcome `capped` |
| Board-wide in-flight | 16 | over → 429 (board self-use shares this budget with priority 1 slot) |
| Per-executor rate | 20 req/min token bucket | over → 429, `capped` |
| Board-wide rate | 120 req/min | over → 429 |
| Retry policy | ZERO automatic retries | caller owns retries; auto-retry multiplies provider spend and load |
| Response size | no cap, wall-clock bounded | streaming; the 300 s budget is the bound |

Rationale: agentic loops burst hard (parallel tool calls), so per-
executor concurrency 2 + 20/min absorbs a harness loop while capping a
runaway one; board-wide 16 protects the single-board SPOF from
becoming a fleet-wide outage amplifier. All constants server-owned
(presence-threshold pattern) — operator-visible in `meta`, never
per-request tunable. Tune after two weeks of real use-audit histograms.

### E — elevation of privilege

- Grants are owner-write-only (`ui-token`), unchanged from verdict
  §4.6; executor tokens can never create, enable, or modify a grant.
- Grant selectors reference existing spine entities only; write-time
  validation refuses unknown host/executor names (the harness-dictionary
  rule: dropped + audited `grant.rejected_unknown_target`, never
  auto-extend).
- The proxy adds no board privilege: it reads the vault file at use
  time under the same 0600 discipline as MF2; no new service account,
  no new RBAC verb anywhere.

## 3. Grant enforcement semantics (where, when, what order)

**Decision: pre-call check, board-side, inside the proxy handler
before any provider egress. Order (cheap → expensive, no oracle bleed):**

1. Authn (token class + identity-match). Fail → 401, audit `revoked`.
2. Rate/concurrency caps. Fail → 429, audit `capped`.
3. Feature gate: `VESMARO_SECRETS_DIR` present + provider credential
   `set`. Fail → 503 honest-off family («провайдеры выключены на борде»
   / «ключ не установлен»), audit `capped`-family `off`.
4. Grant check: authenticated executor matches selector
   (`executor:<harness@host>` exact; `host:<name>` matches the host
   component of the authenticated identity, host must exist in the
   registry) AND `enabled=true`. Fail → 403 with ONE generic reason
   («нет доступа к этому провайдеру») for BOTH revoked and never-
   granted — no grant-table enumeration oracle to callers; the audit
   row distinguishes (`revoked` vs `denied`).
5. Fingerprint check: SHA-256 of vault material must equal the
   registered fingerprint (12 hex). Mismatch = out-of-band rewrite →
   **fail CLOSED** 503 «ключ заменён вне борда — переустановите» +
   audit `provider.credential.mismatch`. Never silently send a foreign
   key. (Cost: out-of-band rotation needs a re-register; that is the
   honest price of "the fingerprint is the only material-derived
   artifact" — the fingerprint exists to detect exactly this.)
6. Egress. Provider 401 → outcome `provider-401`, audit
   `provider.use.rejected`, slot → `rejected` (ux §3.2), surfaced to
   callers as the named honest fact. Provider 5xx/429 → `provider_error`
   with status code.

**Revoked-mid-call:** the in-flight call COMPLETES; revocation means
"the NEXT request fails" — verdict §4.7 verbatim, and it is the UI
promise («следующий вызов — без доступа»). No retroactive kill of
in-flight streams; the completed call audits `ok` honestly (it was
admitted under a then-valid grant).

**Slot machine (liveness):** `set + ok → set` (`last_used_at` ticked
from the use event); `set + provider-401 → rejected`; `rejected + ok
→ set` (honesty: the slot reflects the LAST known outcome, not a
one-way tombstone); `rejected + rotation → set` (new fingerprint).
Grant events never move the key slot — grants are access, the slot is
key health. `unknown → loading → set|unset|rejected` unchanged.

## 4. Use-audit contract

Per proxied request, one row: `ts`, `principal` (`ui` or the
authenticated `executor:<harness@host>`), `provider_key`,
`credential_fingerprint` (12 hex), `model_id`, `outcome` (`ok` |
`provider-401` | `revoked` | `denied` | `capped` | `off` |
`provider_error`), `status_code` (provider's, or the board's own 4xx/
5xx), `latency_bucket` (`<1s` | `<5s` | `<30s` | `≥30s`),
`req_bytes` / `resp_bytes` (integers only).

**Never in any audit field, log line, or SSE event:** prompt or
completion content, request/response headers (either direction), the
credential or its Authorization header, base_url query/fragment
(stripped at registration anyway), caller IP beyond the existing
access-log family (CWE-538, ASVS V7; verdict §4.9 carried verbatim).

Retention: follows the existing audit/event family rules, with a
proposed concrete bound — 90 days OR 50k rows per provider, whichever
first; if sustained volume > 10 req/s on one provider, downgrade to
1-in-10 sampling (H4 already sanctions sampling-down, never to none).

## 5. Red lines of wave MF3 (what MF3 NEVER does)

1. The board is not an open proxy: only board-authenticated principals
   (ui-token owner sessions, identity-matched executor tokens) reach
   the inference route; an anonymous inference leg never exists, in
   any mode.
2. No MF3 leg carries credential material outbound to any agent or
   harness; the caller never receives the key or any provider response
   header that could embed it. (Push stays excluded — verdict §3.)
3. Request/response bodies are never persisted, logged, or echoed
   beyond the `{status_code, message, type}` allowlist (§2-I).
4. The caller never influences the destination: provider_key routes,
   base_url is the owner record, paths are the fixed allowlist,
   redirects are not followed (§2-T).
5. Audit never carries content or material (§4).
6. Grants stay owner-write-only; executor tokens never write grants;
   selectors never widen a dictionary.
7. Revocation acts at the next use — no retroactive in-flight kill;
   the promise to the owner stays exactly as worded in the UI.
8. Fingerprint mismatch and missing secrets dir fail CLOSED (503
   honest-off), never a silent degradation or DB fallback.
9. No automatic provider-call retries from the board (spend/load
   amplification); the caller owns its retry policy.
10. The shim variant (key on the agent host) is NOT smuggled into MF3;
    it remains the sanctioned later wave with its own gate.

## 6. Handoff to the deploy slice

- **No new k8s secret.** The proxy reads the existing MF2 vault
  (`VESMARO_SECRETS_DIR` mounted volume, existingSecret pattern,
  deploy never overwrites — apply.sh rule). Nothing new to provision.
- Helm values (new, all optional, honest-off when absent):
  `models.proxy.enabled` (default: on iff secrets dir configured),
  `models.proxy.bodyCapBytes` (default 4194304), `models.proxy.timeouts`
  (connect 5s / firstByte 30s / idleRead 60s / total 300s),
  `models.proxy.limits` (perExecutor 2 in-flight, global 16,
  rate 20/min per executor, 120/min global). These render the
  server-owned constants; runtime behavior is configmap-read-at-boot.
- Ingress: the inference route needs `proxy-read-timeout ≥ 330s` and
  **buffering disabled** (streaming pass-through, no spool).
- NetworkPolicy: no new requirement if the board already has full
  egress (it already calls hermes); if egress is ever restricted,
  the policy must cover the owner-registered provider authorities —
  note it as a values-comment, not an enforcement, v1.
- Observability: outcome-class counters per provider/executor-class
  (metadata only, §4 field set); an alarm on sustained `provider-401`
  (key rejected = owner action needed) and on `capped` dominance
  (budgets tuned wrong).
- Volume/permits unchanged: vault files 0600, dir not world-readable;
  the proxy runs in the same board process — no new sidecar, no new
  identity.

## 7. Residual risk (honest limits)

This design does NOT protect against: full board-host compromise (the
vault is readable at use time — verdict §6 verbatim); a malicious
GRANTED harness exfiltrating its responses through its own outputs
(the board proxies inference; what the model returns is the caller's
to keep); provider-side logging of the key's use (the provider sees
the key it issued); owner misconfiguration of `base_url` toward an
internal target (owner is the config trust anchor). Availability: MF3
puts the board in the inference data path — the H2 ArchCom tradeoff
becomes real; Kora self-use and agent calls both degrade to honest-off
if the board is down. Compensating: single-board scope is the
product's existing posture (hermes bridge runs the same way).

## 8. Verdict

**MF3 is APPROVED, conditional on:**

- **X — authn:** the inference route accepts ONLY ui-token (board
  self-use) and identity-matched executor tokens (agent relay); no
  anonymous leg; no new secret class; audit attribution from the
  authenticated principal only.
- **Y — egress and payload hygiene:** caller-chosen destinations
  impossible (owner-record base_url, fixed path allowlist, zero
  redirects, scheme allowlist, single vault-derived Authorization
  header, inbound auth/cookie headers dropped, new outbound request
  built by the board); bodies never at rest or in logs; error
  passthrough allowlisted ≤ 1 KiB; caps/timeouts as server-owned
  constants at the §2-D numbers (or stricter); fail-closed on
  fingerprint mismatch and on missing secrets dir.
- **Z — audit and honesty:** per-request use rows with exactly the §4
  field set; slot machine §3 (ok clears `rejected`, 401 sets it,
  grants never move the key slot); the §5 red lines adopted as the
  wave's contract, red line 10 of security-verdict §4 transfers to
  this document.

Scope statement: no blocker-level findings in the MF3 design as
specified; the conditions above are design constraints, not
suggestions. Verification at implementation review: each condition
maps to an ASVS L2 item (X → V3.5/V4.1; Y → V9.2/V12.2/V13.2/V14.3 +
CWE-918 controls; Z → V7.1 + CWE-538) — the MF3 code review walks
those sections specifically.
