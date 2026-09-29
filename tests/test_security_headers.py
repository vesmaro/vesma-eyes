"""Phase 0a security headers (АРХКОМ-3 decision 13 / security verdict
§5.2): CSP + nosniff + no-referrer on EVERY response, Cache-Control:
no-store on /api/*. SSE (/api/events) must keep streaming under the
middleware (header-only — no body buffering) and survives its no-cache
being superseded by no-store.
"""

from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path

# ME-028: the two inline pre-paint bootstraps of viewer/index.html (theme +
# density) are hash-allowed in script-src — no server-side templating to
# nonce with, and external/module scripts lose the before-first-paint
# guarantee. test_inline_bootstrap_hashes_are_allowed pins the hashes to the
# ACTUAL viewer/index.html bytes, so editing a bootstrap without rotating
# the CSP fails here instead of silently re-breaking the page console.
CSP = ("default-src 'self'; "
       "script-src 'self' 'sha256-lWvSm/qC0E+3fvAgio+zTRYXuJIbLdL0gPc54G9Q2OU=' "
       "'sha256-k85nuNkWNWz2VjD38EcDAkNliknfzuSNN6HBSJQjvkc='; "
       "style-src 'self' 'unsafe-inline'; object-src 'none'; "
       "base-uri 'self'; frame-ancestors 'none'; connect-src 'self'; "
       "img-src 'self' data:; font-src 'self' data:")

_VIEWER_INDEX = Path(__file__).resolve().parents[1] / "viewer" / "index.html"


def _inline_script_hashes() -> list[str]:
    """sha256 (base64, CSP form) of every plain inline <script> in the
    viewer's index.html — the exact bytes the browser hashes."""
    html = _VIEWER_INDEX.read_text(encoding="utf-8")
    return [
        "sha256-"
        + base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode("ascii")
        for body in re.findall(r"<script>(.*?)</script>", html, re.S)
    ]


class TestSecurityHeaders:
    def test_api_response_headers(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.headers["Content-Security-Policy"] == CSP
        assert r.headers["X-Content-Type-Options"] == "nosniff"
        assert r.headers["Referrer-Policy"] == "no-referrer"
        assert r.headers["Cache-Control"] == "no-store"

    def test_board_root_keeps_no_cache_plus_headers(self, client):
        """The root entry point keeps its own no-cache (not /api/*) and
        still carries the security set."""
        r = client.get("/")
        assert r.status_code == 200
        assert r.headers["Content-Security-Policy"] == CSP
        assert r.headers["X-Content-Type-Options"] == "nosniff"
        assert r.headers["Referrer-Policy"] == "no-referrer"
        assert r.headers["Cache-Control"] == "no-cache"

    def test_static_asset_not_no_store(self, client):
        """Board static files (not under /api/) keep StaticFiles' default
        caching behavior — the middleware must not stamp no-store there."""
        r = client.get("/styles/board.css")
        assert r.status_code == 200
        assert r.headers["Content-Security-Policy"] == CSP
        assert r.headers.get("Cache-Control") != "no-store"

    def test_404_still_carries_headers(self, client):
        r = client.get("/api/no-such-endpoint")
        assert r.status_code == 404
        assert r.headers["Content-Security-Policy"] == CSP
        assert r.headers["Cache-Control"] == "no-store"

    def test_sse_streams_with_headers(self, app_module):
        """SSE under the middleware: frames flush immediately (no body
        buffering — otherwise the infinite stream would deadlock), the
        media type is text/event-stream, and the security set applies.

        Raw ASGI call, not TestClient: this starlette's TestClient buffers
        streaming responses to completion, which an endless SSE stream
        can never reach (pre-existing stack behavior, unrelated to the
        middleware — the live-server behavior is covered by the Ф0a
        curl verification)."""
        import asyncio

        async def run() -> tuple[int, dict[str, str], bytes]:
            sent: list[dict] = []
            got_hello = asyncio.Event()

            async def receive():
                await got_hello.wait()
                return {"type": "http.disconnect"}

            async def send(message):
                sent.append(message)
                if (message["type"] == "http.response.body"
                        and b"hello" in message.get("body", b"")):
                    got_hello.set()

            scope = {
                "type": "http", "asgi": {"version": "3.0"},
                "http_version": "1.1", "method": "GET", "scheme": "http",
                "path": "/api/events", "raw_path": b"/api/events",
                "query_string": b"", "root_path": "",
                "headers": [(b"host", b"testserver")],
                "client": ("127.0.0.1", 12345), "server": ("127.0.0.1", 80),
            }
            task = asyncio.create_task(app_module.app(scope, receive, send))
            await asyncio.wait_for(got_hello.wait(), timeout=5)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            start = next(m for m in sent if m["type"] == "http.response.start")
            headers = {k.decode().lower(): v.decode()
                       for k, v in start["headers"]}
            body = b"".join(m.get("body", b"") for m in sent
                            if m["type"] == "http.response.body")
            return start["status"], headers, body

        status, headers, body = asyncio.run(run())
        assert status == 200
        assert headers["content-type"].startswith("text/event-stream")
        assert headers["content-security-policy"] == CSP
        assert headers["cache-control"] == "no-store"
        assert headers["x-accel-buffering"] == "no"
        assert b"retry:" in body
        assert b"hello" in body


class TestInlineBootstrapHashes:
    def test_inline_bootstrap_hashes_are_allowed(self, client):
        """ME-028: every plain inline <script> in viewer/index.html is
        hash-allowed by the served CSP — the pre-paint theme/density
        bootstraps must never silently start getting blocked again (the
        symptom was 2 CSP console errors on EVERY page). Editing a bootstrap
        script without rotating the CSP fails here with the new hash in the
        message."""
        r = client.get("/api/health")
        served = r.headers["Content-Security-Policy"]
        hashes = _inline_script_hashes()
        assert hashes, "viewer/index.html lost its inline bootstraps?"
        for digest in hashes:
            assert digest in served, (
                f"{digest} (inline bootstrap) is not allowed by the CSP — "
                "rotate the script-src hash in server/app.py"
            )
        # And the served CSP names every hash the viewer ships.
        assert served == CSP
