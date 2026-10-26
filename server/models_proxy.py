"""Models fleet MF3 — the inference pull-proxy EGRESS leg.

This module owns everything about the OUTBOUND provider call, per the
MF3 threat model (docs/design/models-fleet/mf3-threat-model.md §2-T,
§2-D, §2-I — the wave contract; code review walks ASVS V9.2/V12.2/V13.2/
V14.3 + CWE-918):

- The CALLER never chooses the destination. ``outbound_url`` accepts the
  OWNER-registered base_url plus ONE fixed allowlisted path suffix;
  caller-supplied paths are never appended (CWE-918).
- Scheme allowlist: https for any non-loopback authority; http only for
  loopback (127.0.0.1, ::1, localhost — the on-cluster ollama class).
  Re-checked at USE time (fail-closed — honest-off, never a silent
  send), because rows registered before this rule existed may carry an
  http:// external address.
- ZERO redirects: ``follow_redirects=False`` (the httpx default is
  pinned explicitly so a future refactor cannot silently enable it).
  Any provider 3xx surfaces as outcome ``provider_error`` with the 3xx
  status — following would let a provider endpoint redirect egress to
  an unvalidated target.
- Header discipline: the outbound request is built FRESH in this
  module. Nothing inbound is ever passed in, so nothing inbound can
  leak: no Authorization, Cookie or hop-by-hop header rides out. The
  caller's influence is exactly: model_id (into the JSON body) and the
  message payload (body). Outbound carries EXACTLY ONE ``Authorization:
  Bearer <vault material>`` header; ``Host`` is rebuilt by the HTTP
  client from the resolved authority (never copied).
- Payload hygiene: bodies live in memory for the duration of the call,
  never persisted, logged or echoed. Provider errors are surfaced
  through the ``error_allowlist`` extractor ONLY:
  {status_code, message ≤512, type}, total ≤1KiB — provider headers
  never (CWE-538, the HERMES error-payload-allowlist precedent).
- Caps/timeouts are SERVER-OWNED constants at the §2-D numbers; env
  overrides are read once at import and may only TIGHTEN them (clamped
  to the §2-D ceiling — condition Y: "at the §2-D numbers (or
  stricter)"). They are never per-request tunable.
- Retry policy: ZERO automatic retries. The client is constructed
  without a retrying transport and no call site re-attempts; the caller
  owns its retry policy (§2-D — spend/load amplification).

The vault material exists here only as the ``api_key`` argument of one
call and inside the single outbound header — it never lands in any
returned structure, exception message or log line (an httpx exception
is reduced to its class name, the hermes_client discipline).
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator

import httpx

# -------------------------------------------------------- §2-D constants
# Server-owned defaults (the threat model's numbers). Env knobs (read
# once at boot) may only LOWER a value; anything invalid falls back to
# the default. Presence-threshold pattern: operator-visible in the
# roster meta, never per-request tunable.

_BODY_CAP_BYTES_DEFAULT = 4 * 1024 * 1024      # request body cap → 413
_MODEL_ID_MAX_LEN_DEFAULT = 200                # body field cap → 422
_CONNECT_TIMEOUT_S_DEFAULT = 5.0               # provider TCP/TLS
_FIRST_BYTE_TIMEOUT_S_DEFAULT = 30.0           # no answer → 504
_IDLE_READ_TIMEOUT_S_DEFAULT = 60.0            # resets on chunk
_TOTAL_TIMEOUT_S_DEFAULT = 300.0               # wall clock → 504
_PER_EXECUTOR_INFLIGHT_DEFAULT = 2             # over → 429 capped
_GLOBAL_INFLIGHT_DEFAULT = 16                  # board-wide, over → 429
_PER_EXECUTOR_RATE_DEFAULT = 20                # req/min, over → 429 capped
_GLOBAL_RATE_DEFAULT = 120                     # req/min board-wide

_ERROR_MESSAGE_MAX = 512       # truncate the provider error message
_ERROR_BODY_MAX = 1024         # the surfaced error total, bytes
_ERROR_READ_CAP = 65536        # wire bytes consumed to parse an error


def _env_capped(name: str, default: int, *, floor: int = 1) -> int:
    """One boot-time env knob, clamped to (floor .. default] — stricter
    only. Absent/non-integer/≤floor-1 ⇒ the §2-D default."""
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    if value < floor:
        return default
    return min(value, default)


def _env_float_capped(name: str, default: float, *, floor: float = 0.1) -> float:
    """Float variant of _env_capped (the timeout family)."""
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    if value < floor:
        return default
    return min(value, default)


def proxy_enabled() -> bool:
    """MODELS_PROXY_ENABLED, default on; the honest-off flip is the
    deploy channel's kill-switch (§6 — «enabled: on iff secrets dir
    configured» is the natural default, the env forces it OFF)."""
    return os.environ.get("MODELS_PROXY_ENABLED", "1").strip().lower() not in (
        "0", "false", "no")


BODY_CAP_BYTES = _env_capped(
    "MODELS_PROXY_BODY_CAP_BYTES", _BODY_CAP_BYTES_DEFAULT, floor=1024)
MODEL_ID_MAX_LEN = _env_capped(
    "MODELS_PROXY_MODEL_ID_MAX", _MODEL_ID_MAX_LEN_DEFAULT, floor=1)
CONNECT_TIMEOUT_S = _env_float_capped(
    "MODELS_PROXY_CONNECT_SECONDS", _CONNECT_TIMEOUT_S_DEFAULT)
FIRST_BYTE_TIMEOUT_S = _env_float_capped(
    "MODELS_PROXY_FIRST_BYTE_SECONDS", _FIRST_BYTE_TIMEOUT_S_DEFAULT)
IDLE_READ_TIMEOUT_S = _env_float_capped(
    "MODELS_PROXY_IDLE_READ_SECONDS", _IDLE_READ_TIMEOUT_S_DEFAULT)
TOTAL_TIMEOUT_S = _env_float_capped(
    "MODELS_PROXY_TOTAL_SECONDS", _TOTAL_TIMEOUT_S_DEFAULT, floor=1.0)
PER_EXECUTOR_INFLIGHT = _env_capped(
    "MODELS_PROXY_PER_EXECUTOR_INFLIGHT", _PER_EXECUTOR_INFLIGHT_DEFAULT)
GLOBAL_INFLIGHT = _env_capped(
    "MODELS_PROXY_GLOBAL_INFLIGHT", _GLOBAL_INFLIGHT_DEFAULT)
PER_EXECUTOR_RATE_PER_MIN = _env_capped(
    "MODELS_PROXY_PER_EXECUTOR_PER_MINUTE", _PER_EXECUTOR_RATE_DEFAULT)
GLOBAL_RATE_PER_MIN = _env_capped(
    "MODELS_PROXY_GLOBAL_PER_MINUTE", _GLOBAL_RATE_DEFAULT)

# The fixed path allowlist on the owner base path (§2-T). No caller
# suffix is ever appended: the route names the operation, this table
# names the wire path.
PATH_CHAT_COMPLETIONS = "/chat/completions"
PATH_COMPLETIONS = "/completions"
PATH_EMBEDDINGS = "/embeddings"
PATH_MODELS = "/models"
POST_PATHS = frozenset({PATH_CHAT_COMPLETIONS, PATH_COMPLETIONS,
                        PATH_EMBEDDINGS})
GET_PATHS = frozenset({PATH_MODELS})

# Hop-by-hop headers (RFC 9110 §7.6.1) — named for documentation and for
# the tests that pin the discipline. The module never accepts inbound
# headers, so stripping is structural: there is nothing to strip.
HOP_BY_HOP_HEADERS = frozenset({
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "trailers", "transfer-encoding", "upgrade",
})
# Inbound headers that must never ride out even if a future refactor
# starts copying inbound state (defense in depth — the tests pin it).
NEVER_FORWARD_HEADERS = HOP_BY_HOP_HEADERS | {
    "authorization", "cookie", "x-api-key", "api-key", "host",
}

_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost", "[::1]"})


class EgressConfigError(ValueError):
    """The owner-record base_url fails the USE-time scheme allowlist
    (§2-T): http to a non-loopback authority. Fail-closed — the caller
    sees the honest-off 503 family, the audit row carries outcome
    ``off``."""


class ModelIdTooLong(ValueError):
    """model_id over the §2-D 200-char cap → the route's 422."""


def latency_bucket(seconds: float) -> str:
    """The §4 latency bucket: <1s | <5s | <30s | ≥30s."""
    if seconds < 1.0:
        return "<1s"
    if seconds < 5.0:
        return "<5s"
    if seconds < 30.0:
        return "<30s"
    return "≥30s"


def is_loopback_authority(host: str) -> bool:
    """True when the authority host is the machine itself (the on-host
    ollama class). Port-stripped, case-folded, IPv6 brackets unwrapped."""
    candidate = host.strip().lower()
    if candidate.startswith("[") and candidate.endswith("]"):
        candidate = candidate[1:-1]
    return candidate in _LOOPBACK_HOSTS


def validate_egress_scheme(base_url: str) -> str:
    """USE-time scheme gate (§2-T): https anywhere, http only for
    loopback. Returns the resolved authority host; raises
    EgressConfigError otherwise. The registration path runs the SAME
    rule early (422 inline family) — this re-check is the fail-closed
    backstop for rows registered before the rule and for owner edits
    that predate rotation."""
    from urllib.parse import urlparse
    parsed = urlparse(base_url)
    scheme = (parsed.scheme or "").lower()
    host = (parsed.hostname or "").lower()
    if scheme == "https":
        return host
    if scheme == "http" and is_loopback_authority(host):
        return host
    raise EgressConfigError(
        "base_url scheme not allowed for egress: https for external "
        "authorities, http only for loopback (127.0.0.1, ::1, localhost)")


@dataclass
class ProviderError:
    """The error-passthrough allowlist (§2-I): exactly these three
    fields, total ≤1KiB, message truncated at 512 chars. Provider
    headers and any extra body keys never ride out (CWE-538)."""
    status_code: int
    message: str
    type: str

    def to_payload(self) -> dict[str, Any]:
        return {"status_code": self.status_code,
                "message": self.message[:_ERROR_MESSAGE_MAX],
                "type": self.type[:200]}


def error_allowlist(status_code: int, raw_body: bytes) -> ProviderError:
    """Extract the allowlisted error facts from a provider error body.
    A non-JSON / oversized / hostile body degrades to the honest generic
    message — nothing provider-side is echoed verbatim beyond the
    bounded message field (the HERMES allowlist precedent)."""
    message = ""
    error_type = "provider_error"
    blob = raw_body[:_ERROR_READ_CAP]
    try:
        parsed = json.loads(blob.decode("utf-8", errors="replace"))
    except ValueError:
        parsed = None
    if isinstance(parsed, dict):
        candidate = parsed.get("message")
        if isinstance(candidate, str):
            message = candidate.strip()
        err = parsed.get("error")
        if isinstance(err, dict):
            inner = err.get("message")
            if isinstance(inner, str) and not message:
                message = inner.strip()
            inner_type = err.get("type")
            if isinstance(inner_type, str) and inner_type.strip():
                error_type = inner_type.strip()
        elif isinstance(err, str) and not message:
            message = err.strip()
        detail = parsed.get("detail")
        if isinstance(detail, str) and not message:
            message = detail.strip()
        candidate_type = parsed.get("type")
        if isinstance(candidate_type, str) and candidate_type.strip():
            error_type = candidate_type.strip()
    if not message:
        message = f"provider answered {status_code}"
    error = ProviderError(status_code=status_code, message=message,
                          type=error_type)
    # Enforce the ≤1KiB TOTAL: trim the message until the serialized
    # allowlist fits (the type field is bounded at 200 by to_payload).
    while len(json.dumps(error.to_payload(),
                         ensure_ascii=False).encode("utf-8")) > _ERROR_BODY_MAX:
        trimmed = error.message[: max(0, len(error.message) - 64)]
        error.message = trimmed.rstrip()
        if not error.message:
            error.message = f"provider answered {status_code}"
            break
    return error


@dataclass
class EgressOutcome:
    """What the wire answered — the route maps it onto the §3 outcome
    classes and the §4 use row. ``stream`` is None for buffered
    answers; ``bytes`` is the buffered body (None for streams)."""
    status_code: int
    content_type: str
    bytes_: bytes | None = None
    stream: ProviderStream | None = None
    elapsed_s: float = 0.0
    error: ProviderError | None = None
    # Response bytes actually consumed (buffered len or relayed bytes —
    # the use row's resp_bytes; integers only).
    resp_bytes: int = 0
    request_error: str | None = field(default=None, repr=False)


class InFlightLimiter:
    """§2-D concurrency caps: per-key (executor identity) and global
    (board-wide; the ui class shares the global budget with priority-1
    slots). Acquire is all-or-nothing; release decrements exactly what
    the acquire added. In-memory only — a board restart resets the
    budget (honest at this scale)."""

    def __init__(self, global_cap: int, per_key_cap: int) -> None:
        self.global_cap = global_cap
        self.per_key_cap = per_key_cap
        self._global = 0
        self._per_key: dict[str, int] = {}

    def acquire(self, key: str | None) -> bool:
        """Take one slot; False when the global or the per-key cap is
        full (outcome ``capped``). ``key=None`` (the ui class) checks
        the global budget only."""
        if self._global >= self.global_cap:
            return False
        if key is not None:
            if self._per_key.get(key, 0) >= self.per_key_cap:
                return False
        self._global += 1
        if key is not None:
            self._per_key[key] = self._per_key.get(key, 0) + 1
        return True

    def release(self, key: str | None) -> None:
        self._global = max(0, self._global - 1)
        if key is None:
            return
        left = self._per_key.get(key, 0) - 1
        if left <= 0:
            self._per_key.pop(key, None)
        else:
            self._per_key[key] = left


@dataclass
class ProviderStream:
    """A live provider SSE stream (buffering disabled — no spool file).
    The route relays ``aiter()`` chunks as they come; ``relayed_bytes``
    accumulates what actually went out (the use row's resp_bytes). The
    idle-read budget (60s, resets per chunk) and the total wall clock
    (300s) guard every iteration — a stalled or endless stream ends
    honestly instead of hanging the caller."""

    _response: httpx.Response
    _client: httpx.AsyncClient
    _idle_read_timeout: float
    _total_timeout: float
    _started: float
    status_code: int
    content_type: str
    relayed_bytes: int = 0
    _closed: bool = False
    _raw_iter: AsyncIterator[bytes] | None = None

    async def aiter(self) -> AsyncIterator[bytes]:
        try:
            # ONE raw iterator for the whole relay — re-calling
            # aiter_raw() per chunk would mint a fresh generator that
            # sees the response-level is_stream_consumed flag and dies
            # on the second chunk.
            raw_iter = self._raw_iter
            if raw_iter is None:
                raw_iter = self._response.aiter_raw()
                self._raw_iter = raw_iter
            while True:
                remaining = self._total_timeout - (
                    time.monotonic() - self._started)
                if remaining <= 0:
                    break  # total wall clock spent — the honest end
                try:
                    chunk = await asyncio.wait_for(
                        raw_iter.__anext__(),
                        timeout=min(remaining, self._idle_read_timeout))
                except (StopAsyncIteration, TimeoutError):
                    break
                if not chunk:
                    break
                self.relayed_bytes += len(chunk)
                yield chunk
        finally:
            await self.aclose()

    async def aclose(self) -> None:
        if self._closed:
            return
        self._closed = True
        await self._response.aclose()
        await self._client.aclose()


class ProviderEgress:
    """Builds and executes ONE outbound provider call under the §2-T
    hygiene. One instance per board process (the caps ride the call
    sites' limiter instances, not here)."""

    def __init__(self, *, connect_timeout: float = CONNECT_TIMEOUT_S,
                 first_byte_timeout: float = FIRST_BYTE_TIMEOUT_S,
                 idle_read_timeout: float = IDLE_READ_TIMEOUT_S,
                 total_timeout: float = TOTAL_TIMEOUT_S) -> None:
        self.connect_timeout = connect_timeout
        self.first_byte_timeout = first_byte_timeout
        self.idle_read_timeout = idle_read_timeout
        self.total_timeout = total_timeout

    # --------------------------------------------------------- building
    def outbound_url(self, base_url: str, path: str) -> str:
        """Owner base_url + ONE fixed allowlisted suffix (§2-T). The
        suffix must be a member of the fixed tables — caller strings
        are never accepted (CWE-918). Raises EgressConfigError on the
        scheme violation."""
        validate_egress_scheme(base_url)
        if path not in POST_PATHS and path not in GET_PATHS:
            raise ValueError(f"path not allowlisted: {path!r}")
        clean_base = base_url.rstrip("/")
        return f"{clean_base}{path}"

    def outbound_headers(self, api_key: str, *,
                         method: str = "POST") -> dict[str, str]:
        """EXACTLY ONE Authorization header from the vault (Bearer) plus
        Accept — and, on body-carrying legs, Content-Type. httpx does NOT
        set Content-Type for raw ``content=bytes`` bodies, and strict
        provider gateways answer a JSON POST without the header with 415
        (review P2-1). No inbound header is ever an input here — nothing
        to merge, drop or forward; Host is rebuilt by the HTTP client
        from the resolved authority."""
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json, text/event-stream",
        }
        if method.upper() != "GET":
            headers["Content-Type"] = "application/json"
        return headers

    # ---------------------------------------------------------- calling
    async def call_buffered(self, base_url: str, path: str, api_key: str,
                            payload: dict[str, Any] | None = None,
                            *, method: str = "POST") -> EgressOutcome:
        """Non-streaming provider call (or the GET models listing). The
        body is built here from the caller's payload + the pinned
        model_id the route injected; the response is read fully into
        memory (never persisted), bounded by the total wall clock.
        Provider errors (status ≥ 400 AND any 3xx — zero redirects)
        come back with the allowlist extracted from a bounded read."""
        url = self.outbound_url(base_url, path)
        timeout = httpx.Timeout(connect=self.connect_timeout,
                                read=self.first_byte_timeout, write=30.0,
                                pool=self.connect_timeout)
        started = time.monotonic()
        try:
            async with httpx.AsyncClient(
                    timeout=timeout, follow_redirects=False) as client:
                # stream=True: the send returns at response HEADERS — the
                # body read below is what the §2-D total budget bounds
                # (a plain client.post would have already buffered the
                # whole body under the 30s read timeout, P3-4).
                request = client.build_request(
                    method, url, headers=self.outbound_headers(
                        api_key, method=method),
                    content=payload_bytes_or_none(payload) if method
                    != "GET" else None)
                response = await client.send(request, stream=True)
                elapsed = time.monotonic() - started
                if response.status_code >= 300:
                    raw = await _read_bounded(response)
                    return EgressOutcome(
                        status_code=response.status_code,
                        content_type=response.headers.get(
                            "content-type", "").split(";")[0].strip(),
                        elapsed_s=elapsed,
                        error=error_allowlist(response.status_code, raw),
                        resp_bytes=len(raw))
                # P3-4: the buffered read runs under the §2-D TOTAL wall
                # clock too (first-byte alone no longer bounds a slow
                # body) — the remaining budget, floor at 0.1s.
                body = await asyncio.wait_for(
                    response.aread(),
                    timeout=max(0.1, self.total_timeout - elapsed))
                return EgressOutcome(
                    status_code=response.status_code,
                    content_type=response.headers.get(
                        "content-type", "").split(";")[0].strip(),
                    bytes_=body, elapsed_s=elapsed,
                    resp_bytes=len(body))
        except asyncio.TimeoutError:
            # The total budget ran out mid-read (a slow body on a
            # buffered leg) — the same honest 504 family as a stalled
            # stream; the exception class name only, never str(exc).
            return EgressOutcome(
                status_code=0, content_type="",
                elapsed_s=time.monotonic() - started,
                request_error="ReadTimeout")
        except httpx.HTTPError as exc:
            # The class name only — str(exc) may carry URLs (the
            # hermes_client discipline); the material never appears in
            # exceptions (it lives only in the outbound header value).
            return EgressOutcome(
                status_code=0, content_type="",
                elapsed_s=time.monotonic() - started,
                request_error=exc.__class__.__name__)

    async def call_streaming(self, base_url: str, path: str, api_key: str,
                             payload: dict[str, Any],
                             *, method: str = "POST",
                             ) -> ProviderStream | EgressOutcome:
        """Open a streaming provider call (SSE pass-through, buffering
        disabled — no spool file). Returns a ProviderStream to relay,
        or an EgressOutcome when the provider refused (an error/3xx
        status — zero redirects). The caller MUST fully consume or
        close the stream."""
        url = self.outbound_url(base_url, path)
        timeout = httpx.Timeout(connect=self.connect_timeout,
                                read=self.first_byte_timeout, write=30.0,
                                pool=self.connect_timeout)
        started = time.monotonic()
        try:
            client = httpx.AsyncClient(timeout=timeout,
                                       follow_redirects=False)
            request = client.build_request(
                method.upper(), url,
                headers=self.outbound_headers(api_key, method=method),
                content=payload_bytes_or_none(payload) if method.upper()
                != "GET" else None)
            response = await client.send(request, stream=True)
        except httpx.HTTPError as exc:
            return EgressOutcome(
                status_code=0, content_type="",
                elapsed_s=time.monotonic() - started,
                request_error=exc.__class__.__name__)
        if response.status_code >= 300:
            raw = await _read_bounded(response)
            await response.aclose()
            await client.aclose()
            return EgressOutcome(
                status_code=response.status_code,
                content_type=response.headers.get(
                    "content-type", "").split(";")[0].strip(),
                elapsed_s=time.monotonic() - started,
                error=error_allowlist(response.status_code, raw),
                resp_bytes=len(raw))
        return ProviderStream(
            _response=response, _client=client,
            _idle_read_timeout=self.idle_read_timeout,
            _total_timeout=self.total_timeout, _started=started,
            status_code=response.status_code,
            content_type=response.headers.get(
                "content-type", "").split(";")[0].strip())


def payload_bytes_or_none(payload: dict[str, Any] | None) -> bytes | None:
    """Serialize the outbound JSON body. The body is built fresh from
    the caller's payload with model_id already pinned by the route —
    no inbound byte is ever piped through (the trust-boundary
    statement: the board builds a NEW outbound request)."""
    if payload is None:
        return None
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


async def _read_bounded(response: httpx.Response, cap: int = _ERROR_READ_CAP,
                        ) -> bytes:
    """Read at most ``cap`` bytes of an error body (a hostile provider
    cannot balloon board memory; the allowlist needs ≤1KiB anyway)."""
    chunks: list[bytes] = []
    taken = 0
    async for chunk in response.aiter_bytes():
        chunks.append(chunk[: cap - taken])
        taken += len(chunks[-1])
        if taken >= cap:
            break
    return b"".join(chunks)
