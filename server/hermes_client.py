"""HTTP client to the live hermes-agent API server (T004 slice 1).

The board pod reaches the hermes cluster through its ClusterIP service
(namespaced FQDN, k3s agents.cluster) — httpx async, the mnemos_client
convention (honest 503 on transport failure, no retry loops inside a
request handler — the route owns the UX of failure).

Credentials: the API key rides the ``Authorization: Bearer`` header and
NEVER in a URL, a log line, an exception message or an audit payload.
The key arrives via the deploy channel (HERMES_API_KEY env on the board
pod) — reading it from the harness pod's env is a DEPLOYMENT shortcut,
not the product path.

Endpoint shapes verified live 2026-10-10 (TL reconnaissance, pod
agentsnode-hermes-f4d6fff97-ntwdk, kube-agents ns, hermes-agent
v0.21.5):
- GET /api/sessions → {"object": "list", "data": [session, ...]}
- GET /api/sessions/{id} → session meta (same shape as one item)
- GET /api/sessions/{id}/messages → {"...", "data"|"messages": [...]}
  (full transcript; the list key varies — both are accepted)
- POST /v1/chat/completions → OpenAI-compatible chat (non-stream here;
  the API supports SSE stream — noted for the FE slice, NOT implemented)

Session fields seen: id ("20260820_233417_816ce638"), source
(telegram|api_server), user_id, model, title, started_at/ended_at (unix
float), end_reason, message_count, tool_call_count, input/output/cache
token counters, parent_session_id, archived, pinned, hidden,
estimated_cost_usd.
Message fields seen: id, role (user|assistant|tool), content,
display_kind, reasoning, reasoning_content, tool_calls, tool_call_id,
tool_name, timestamp, token_count, finish_reason.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

log = logging.getLogger("kora.hermes-client")

_TIMEOUT = httpx.Timeout(15.0, connect=2.0)

_HERMES_UNREACHABLE = (
    "hermes api server unreachable"
)


class HermesError(RuntimeError):
    """Base — every hermes-bridge failure is typed, never a bare raise."""


class HermesNotConfiguredError(HermesError):
    """HERMES_API_KEY / endpoint missing — the bridge is honestly OFF."""


class HermesUnavailableError(HermesError):
    """Hermes answered with an auth/refused/exhausted status or did not
    answer — the route maps this to 502/503 with a human reason."""


class HermesSessionNotFoundError(HermesError):
    """The requested session id does not exist in the hermes store."""


def _endpoint_url(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}{path}"


def _auth_headers(api_key: str) -> dict[str, str]:
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


# ---------------------------------------------------------------- client


async def _request_json(base_url: str, api_key: str, path: str,
                        *, method: str = "GET",
                        payload: dict[str, Any] | None = None,
                        timeout: httpx.Timeout = _TIMEOUT,
                        ) -> tuple[int, Any]:
    """One hermes request → (status_code, body). Transport failures and
    non-JSON bodies degrade to the honest-failure contract (the
    mnemos_client.fetch_json convention) — a 503 tuple the route maps
    further. The Authorization header is never echoed anywhere: an
    exception from httpx carries only the exception class name."""
    url = _endpoint_url(base_url, path)
    try:
        async with httpx.AsyncClient(
                timeout=timeout, headers=_auth_headers(api_key)) as client:
            if method == "GET":
                resp = await client.get(url)
            else:
                resp = await client.post(url, json=payload or {})
    except httpx.HTTPError as exc:
        # exc.__class__.__name__ only — the str(exc) may carry URLs.
        return 503, {"detail": f"{_HERMES_UNREACHABLE} "
                                f"({exc.__class__.__name__})"}
    if resp.status_code >= 400:
        try:
            body: Any = resp.json()
        except ValueError:
            body = {"detail": f"hermes answered {resp.status_code} "
                              f"non-JSON"}
        # Defense in depth: a hermes error payload may echo the request;
        # only well-known keys ride through, never headers.
        if isinstance(body, dict):
            body = {k: v for k, v in body.items()
                    if k in ("detail", "message", "error", "status")}
        return resp.status_code, body
    try:
        return resp.status_code, resp.json()
    except ValueError:
        return resp.status_code, {"detail": "hermes returned non-JSON"}


# ------------------------------------------------------- session listing


def _sessions_list(body: Any) -> list[dict[str, Any]]:
    """Hermes list envelope: {"object":"list","data":[...]} — tolerant of
    the bare-list shape (defensive; live shape is the envelope)."""
    if isinstance(body, dict):
        data = body.get("data", [])
        return [s for s in data if isinstance(s, dict)]
    if isinstance(body, list):
        return [s for s in body if isinstance(s, dict)]
    return []


def _ts_to_iso(value: Any) -> str:
    """Unix float seconds (hermes shape) → RFC 3339 UTC ISO seconds.
    Unparsable/absent → '' (nullable timestamp, the Kora convention)."""
    if isinstance(value, (int, float)) and value > 0:
        from datetime import datetime, timezone
        try:
            return datetime.fromtimestamp(
                value, tz=timezone.utc).isoformat(timespec="seconds")
        except (ValueError, OverflowError, OSError):
            return ""
    if isinstance(value, str) and value.strip():
        # An ISO string arrives in some shapes — validated by parse, kept
        # verbatim on success (the pi_reader _ts_to_iso discipline).
        from datetime import datetime, timezone
        try:
            stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
            return stamp.isoformat(timespec="seconds")
        except ValueError:
            return ""
    return ""


def session_row_from_api(raw: dict[str, Any]) -> dict[str, Any]:
    """One hermes session dict → a Kora-registry ingest row.

    Identity: the NATIVE hermes id (never a generated surrogate). State:
    a live hermes session without ended_at is 'live'; ended sessions are
    'idle' (the Kora enum has no 'ended' — the closed state stays
    readable). Preview: title + the tail of the last activity signal —
    clamped and redacted downstream by the serving path's choke-point;
    here we only bound the raw text (≤2000, the ingest column cap).
    project/cwd: hermes carries no cwd — the project field takes the
    source ('hermes:<source>') so the owner sees where the session came
    from; cwd stays empty. steerable: False — adoption is slice 3.
    """
    native_id = str(raw.get("id") or "").strip()
    if not native_id:
        raise HermesError("hermes session without an id — unparsable row")
    ended = raw.get("ended_at")
    state = "idle" if ended else "live"
    # Note: archived sessions are listed (the Kora registry lists what
    # the store holds); the 'hidden' flag is honored: hidden sessions do
    # not surface on the board.
    if raw.get("hidden"):
        raise HermesError("hidden session filtered before registry ingest")
    title = str(raw.get("title") or "").strip()
    source = str(raw.get("source") or "api_server").strip()
    msg_count = raw.get("message_count")
    preview_base = title or (f"{msg_count} сообщений" if msg_count else "")
    return {
        "native_id": native_id,
        "harness": "hermes",
        "project": f"hermes:{source}" if source else "hermes",
        "cwd": "",
        "state": state,
        "origin": "relay",
        "steerable": False,
        "started_at": _ts_to_iso(raw.get("started_at")),
        "last_activity_at": (ended and _ts_to_iso(ended))
                            or _ts_to_iso(raw.get("started_at")),
        "preview": str(preview_base)[:2000],
        # pass-through meta for the status/count surfaces (not stored)
        "_meta": {
            "model": raw.get("model") or "",
            "message_count": msg_count,
            "tool_call_count": raw.get("tool_call_count"),
            "end_reason": raw.get("end_reason") or "",
            "source": source,
            "estimated_cost_usd": raw.get("estimated_cost_usd"),
            "parent_session_id": raw.get("parent_session_id") or "",
        },
    }


def messages_list(body: Any) -> list[dict[str, Any]]:
    """The transcript envelope: hermes answers {'...','data'|'messages':
    [...]} — both keys accepted, dict rows kept, ordered as returned."""
    if isinstance(body, dict):
        for key in ("data", "messages"):
            val = body.get(key)
            if isinstance(val, list):
                return [m for m in val if isinstance(m, dict)]
        return []
    if isinstance(body, list):
        return [m for m in body if isinstance(m, dict)]
    return []


def message_row(raw: dict[str, Any]) -> dict[str, Any]:
    """One hermes message → the transcript row for the serving path:
    seq (index assigned by the caller), role, kind (display_kind), ts
    (RFC 3339), content."""
    return {
        "role": str(raw.get("role") or "unknown"),
        "kind": raw.get("display_kind") or None,
        "ts": _ts_to_iso(raw.get("timestamp")),
        "content": str(raw.get("content") or ""),
    }


# ------------------------------------------------------------- public API


async def fetch_sessions(base_url: str, api_key: str,
                         ) -> list[dict[str, Any]]:
    """GET /api/sessions → the raw session dicts (the route maps errors
    onto the honest-off / unavailable vocabulary)."""
    code, body = await _request_json(base_url, api_key, "/api/sessions")
    if code in (401, 403):
        raise HermesUnavailableError(
            "hermes refused the API key (401/403) — check HERMES_API_KEY "
            "against the API_SERVER_KEY of the hermes pod")
    if code == 404:
        raise HermesUnavailableError(
            "hermes answered 404 on /api/sessions — wrong endpoint path "
            "or wrong service")
    if code == 429:
        raise HermesUnavailableError(
            "hermes rate limit exceeded (429) — retry later")
    if code == 503:
        detail = (body.get("detail") if isinstance(body, dict) else None)
        raise HermesUnavailableError(
            str(detail or (f"{_HERMES_UNREACHABLE}")))
    if code != 200:
        raise HermesUnavailableError(f"hermes answered {code}")
    rows = _sessions_list(body)
    out: list[dict[str, Any]] = []
    for raw in rows:
        row = session_row_from_api(raw)  # may raise HermesError on idless
        out.append(row)
    return out


async def fetch_session(base_url: str, api_key: str, session_id: str,
                        ) -> dict[str, Any]:
    """GET /api/sessions/{id} → one raw session dict."""
    session_id = str(session_id).strip()
    if not session_id or "/" in session_id or session_id in (".", ".."):
        raise HermesSessionNotFoundError("empty or malformed session id")
    code, body = await _request_json(
        base_url, api_key, f"/api/sessions/{session_id}")
    if code == 404:
        raise HermesSessionNotFoundError(session_id)
    if code in (401, 403):
        raise HermesUnavailableError(
            "hermes refused the API key (401/403) — check HERMES_API_KEY")
    if code == 503:
        detail = (body.get("detail") if isinstance(body, dict) else None)
        raise HermesUnavailableError(str(detail or _HERMES_UNREACHABLE))
    if code != 200 or not isinstance(body, dict):
        raise HermesUnavailableError(f"hermes answered {code}")
    return body


async def fetch_messages(base_url: str, api_key: str, session_id: str,
                         ) -> list[dict[str, Any]]:
    """GET /api/sessions/{id}/messages → full transcript rows."""
    session_id = str(session_id).strip()
    if not session_id or "/" in session_id or session_id in (".", ".."):
        raise HermesSessionNotFoundError("empty or malformed session id")
    code, body = await _request_json(
        base_url, api_key, f"/api/sessions/{session_id}/messages")
    if code == 404:
        raise HermesSessionNotFoundError(session_id)
    if code in (401, 403):
        raise HermesUnavailableError(
            "hermes refused the API key (401/403) — check HERMES_API_KEY")
    if code == 503:
        detail = (body.get("detail") if isinstance(body, dict) else None)
        raise HermesUnavailableError(str(detail or _HERMES_UNREACHABLE))
    if code != 200:
        raise HermesUnavailableError(f"hermes answered {code}")
    return messages_list(body)


async def chat(base_url: str, api_key: str, *,
               model: str, messages: list[dict[str, Any]],
               timeout_s: float = 60.0) -> dict[str, Any]:
    """POST /v1/chat/completions (OpenAI-compatible; non-stream).

    The hermes API supports SSE streaming — deliberately NOT used here:
    the FE chat slice is synchronous; streaming is an additive FE-slice
    change (noted for the docs, not implemented).
    Returns the raw completion body (the route picks what it serves)."""
    if not messages:
        raise HermesError("chat requires a non-empty messages list")
    code, body = await _request_json(
        base_url, api_key, "/v1/chat/completions", method="POST",
        payload={"model": model, "messages": messages, "stream": False},
        timeout=httpx.Timeout(timeout_s, connect=5.0))
    if code in (401, 403):
        raise HermesUnavailableError(
            "hermes refused the API key (401/403) — check HERMES_API_KEY")
    if code == 404:
        raise HermesUnavailableError(
            "hermes answered 404 on /v1/chat/completions — the chat leg "
            "of this endpoint is absent or the path changed")
    if code == 429:
        raise HermesUnavailableError(
            "hermes rate limit exceeded (429) — retry later")
    if code == 503:
        detail = (body.get("detail") if isinstance(body, dict) else None)
        raise HermesUnavailableError(str(detail or _HERMES_UNREACHABLE))
    if code != 200 or not isinstance(body, dict):
        raise HermesUnavailableError(f"hermes answered {code}")
    return body