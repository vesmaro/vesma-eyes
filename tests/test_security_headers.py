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

import pytest

# ME-028: the two inline pre-paint bootstraps of viewer/index.html (theme +
# density) are hash-allowed in script-src — no server-side templating to
# nonce with, and external/module scripts lose the before-first-paint
# guarantee. test_inline_bootstrap_hashes_are_allowed pins the hashes to the
# ACTUAL viewer/index.html bytes, so editing a bootstrap without rotating
# the CSP fails here instead of silently re-breaking the page console.
# SEC-3 (ME-030 cascade): style-src keeps 'unsafe-inline' as an ACCEPTED
# RESIDUAL (ADR 0014 amendment): the React viewer renders runtime
# style={{...}} attributes across the SPA (measured: 15+ components —
# TraceRow, WellHero, TaskActivityPage, ...) with dynamic values (positions,
# widths); per-style hashes would need 'unsafe-hashes' plus an enumeration
# of every dynamic value — unmaintainable for zero real hardening (CSS does
# not execute script in modern browsers; script-src stays hash-locked).
# Scope of the residual: CSS injection within the page origin, boxed by
# connect-src 'self' / img-src 'self' data: / font-src 'self' data:.
CSP = ("default-src 'self'; "
       "script-src 'self' 'sha256-gLnW2OEJF23VKQL4ot9PcYmiFHXeZWiMg0A52v/5MDM=' "
       "'sha256-k85nuNkWNWz2VjD38EcDAkNliknfzuSNN6HBSJQjvkc='; "
       "style-src 'self' 'unsafe-inline'; object-src 'none'; "
       "base-uri 'self'; frame-ancestors 'none'; connect-src 'self'; "
       "img-src 'self' data:; font-src 'self' data:")

_VIEWER_INDEX = Path(__file__).resolve().parents[1] / "viewer" / "index.html"

_SCRIPT_TAG_RE = re.compile(r"<script\b([^>]*)>(.*?)</script>", re.S)
_EVENT_HANDLER_ATTR_RE = re.compile(r"\bon\w+\s*=", re.I)


def _script_tags(html: str) -> list[tuple[str, str]]:
    """(attrs, body) of EVERY <script> tag — attribute-bearing tags
    included: the browser hashes their content the same way (arch-audit
    A2/A3, ME-030). Tags carrying ``src=`` ride along; callers separate
    them (external files are governed by script-src 'self', not a hash)."""
    return re.findall(_SCRIPT_TAG_RE, html)


def _script_hash(body: str) -> str:
    return ("sha256-"
            + base64.b64encode(
                hashlib.sha256(body.encode("utf-8")).digest()).decode("ascii"))


def _assert_inline_scripts_hash_allowed(html: str, served_csp: str) -> None:
    """Every inline <script> in ``html`` — INCLUDING attribute-bearing
    tags — must be hash-allowed by the served CSP, and NO script tag may
    carry an inline event-handler attribute (script-src has no
    'unsafe-inline', so the browser blocks those at runtime — their
    presence in served HTML is dead console noise at best, injection at
    worst; the `<script src=x onerror=…>` shape the plain-`<script>` scans
    miss). External src scripts are skipped ('self'-governed)."""
    for attrs, body in _script_tags(html):
        handler = _EVENT_HANDLER_ATTR_RE.search(attrs)
        assert handler is None, (
            f"served HTML carries an inline event-handler attribute "
            f"({(handler.group(0) if handler else '?')!r} in "
            f"<script{attrs}>) — the CSP blocks it at runtime; "
            "inline handlers must not ship")
        if "src=" in attrs or not body.strip():
            continue
        digest = _script_hash(body)
        assert digest in served_csp, (
            f"{digest} (inline script{attrs}) is not allowed by the "
            "served CSP — rotate the script-src hash in server/app.py "
            "or make the script external")


def _inline_script_hashes() -> list[str]:
    """sha256 (base64, CSP form) of every plain inline <script> in the
    viewer's index.html — the exact bytes the browser hashes.

    A2 (ME-028 cascade): the pattern also matches ATTRIBUTE-bearing inline
    script tags (`<script data-x>`) — the browser hashes their content the
    same way and a blocked attributed inline script breaks prod just as
    visibly. Script tags carrying a `src=` are skipped (external files are
    governed by `script-src 'self'`, not a hash), as are empty bodies."""
    html = _VIEWER_INDEX.read_text(encoding="utf-8")
    return [_script_hash(body) for attrs, body in _script_tags(html)
            if "src=" not in attrs and body.strip()]


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


class TestServedHtmlInlineScripts:
    """arch-audit A2/A3 (ME-030 cascade): the hash pin above reads the
    SOURCE viewer/index.html only — it never sees the HTML the server
    actually SERVES. These tests audit the served entries: the board root
    (GET / → web/index.html bytes) and the viewer entry (GET /app →
    VESMARO_APP_DIR/index.html), catching inline script tags WITH
    attributes (`<script data-x>`) and the `<script src=x onerror=…>`
    handler-bearing shape that a plain `<script>` scan misses.

    Известная граница: хэши считаются от source index.html, не от dist —
    в pytest собранного dist нет, поэтому для /app аудит гоняется по
    заглушке APP_DIR (паттерн test_app_spa), а для реального вьюера — по
    исходнику viewer/index.html. Инвариант, который сторожат тесты:
    сборка (vite без плагинов инлайна) не должна добавлять новые
    инлайн-скрипты в index.html; любой инлайн-скрипт в отданном HTML
    обязан быть разрешён хэшем в script-src, иначе prod получает
    блокировку скрипта и сломанный первый рендер."""

    @pytest.fixture()
    def app_dist(self, app_module, tmp_path, monkeypatch):
        """A fake viewer dist monkeypatched into APP_DIR (the handlers
        read the module global at request time — test_app_spa pattern)."""
        dist = tmp_path / "dist"
        dist.mkdir()
        (dist / "index.html").write_text(
            "<!doctype html><title>viewer</title>", encoding="utf-8")
        monkeypatch.setattr(app_module, "APP_DIR", dist)
        return dist

    def test_board_entry_serves_no_inline_scripts(self, client):
        """The board entry ships ZERO inline scripts (its only script is
        the external /js/app.js module). An inline script appearing in the
        SERVED bytes would be CSP-blocked at runtime — the script-src
        hashes belong to the viewer bootstraps — so the audit must fail
        here first, with the tag in the message."""
        r = client.get("/")
        assert r.status_code == 200
        inline = [attrs for attrs, body in _script_tags(r.text)
                  if "src=" not in attrs and body.strip()]
        assert inline == [], (
            f"the served board HTML gained inline script(s) {inline} — "
            "rotate the script-src hash in server/app.py or make the "
            "script external")
        _assert_inline_scripts_hash_allowed(
            r.text, r.headers["Content-Security-Policy"])

    def test_viewer_entry_served_html_passes_the_audit(self, client,
                                                       app_dist):
        """GET /app serves APP_DIR/index.html — the fake dist in tests,
        the vite build in prod; the audit rides the SERVED bytes either
        way (see the dist boundary on the class)."""
        r = client.get("/app")
        assert r.status_code == 200
        _assert_inline_scripts_hash_allowed(
            r.text, r.headers["Content-Security-Policy"])

    def test_viewer_source_inline_scripts_pass_the_audit(self):
        """The source-side twin: viewer/index.html — the exact bytes the
        vite build copies into dist. Attributed inline tags included."""
        html = _VIEWER_INDEX.read_text(encoding="utf-8")
        _assert_inline_scripts_hash_allowed(html, CSP)

    def test_audit_catches_attributed_inline_and_handler_shapes(self):
        """Negative controls: the audit must FAIL on the two shapes the
        plain-`<script>` scans miss — an inline script written WITH
        attributes, and the `<script src=x onerror=…>` handler-bearing
        tag (an external src is 'self'-governed, but the inline handler
        attribute is CSP-blocked dead weight that must not ship)."""
        with pytest.raises(AssertionError, match="event-handler attribute"):
            _assert_inline_scripts_hash_allowed(
                "<script src='/x.js' onerror='pwn()'></script>", CSP)
        with pytest.raises(AssertionError, match="not allowed by the"):
            _assert_inline_scripts_hash_allowed(
                '<script data-x="1">console.log(1)</script>', CSP)
