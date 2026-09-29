"""ME-037 (union «Живая кора» pre-flight П3): the UI telemetry ingest
contract — docs/union/events-taxonomy-v0.md §3.1 frozen v0 taxonomy.

Covered:
- the verdict set: 200 accepted / 403 non-ui leg / 413 batch > 50 /
  422 off-taxonomy event / 429 rate limit (pinned in the OpenAPI contract,
  ME-028 SEC-1 pattern);
- the guard: ui bearer + ui cookie legs pass; anonymous, machine (split
  mode) and mnd_ device legs are 403 — telemetry numbers describe the
  owner only;
- the kind registry: all 11 §1.2 kinds ingest with their exact property
  sets; an unknown kind is a 422 refusal, never a silent drop;
- privacy (§3.4, hard boundary): free-text fields (intent text, palette
  query, URLs, exact sizes) are rejected by the schema — extra="forbid"
  models with enums/buckets only; the envelope (ts/actor_class/
  client_class/release) is server-stamped, a client value is a 422;
- rate limit: 60/60s per client (task-drafts engine), Retry-After on 429,
  per-key granularity;
- isolation: telemetry NEVER surfaces in /api/activity (whitelist lock)
  and NEVER rides the SSE bus;
- the notifications.read server audit (§1.2 #11): scope one/all + the
  server-stamped envelope.

The session-scoped board DB is shared: every test isolates itself via a
unique visit_id marker instead of asserting on global row counts.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import uuid

import pytest
from starlette.requests import Request

from conftest import DATA_DIR

DB_PATH = DATA_DIR / "board.db"


# ------------------------------------------------------------------ helpers
def _db() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def _visit_id() -> str:
    """Unique per-test visit marker — the isolation key."""
    return str(uuid.uuid4())


def _telemetry_rows(visit_id: str) -> list[dict]:
    """Audit rows carrying one visit marker, oldest first. The marker is
    the isolation key: only this test's events (and, for the ingest, only
    client-posted ones — the server-emitted notifications.read audit has
    no visit_id) can match."""
    with _db() as db:
        rows = db.execute(
            "SELECT id, ts, kind, payload FROM events WHERE payload LIKE ? "
            "ORDER BY id",
            (f'%"{visit_id}"%',),
        ).fetchall()
    return [{**dict(r), "payload": json.loads(r["payload"])} for r in rows]


def _post(client, events: list[dict], headers: dict | None = None):
    return client.post("/api/events/ui", json={"events": events},
                       headers=headers)


def _event(kind: str, visit_id: str, **props) -> dict:
    return {"kind": kind, "visit_id": visit_id} | props


# The full §1.2 dictionary with one valid payload per kind — the registry
# acceptance set AND the source for the exact-property-set lock below.
_VALID_PAYLOADS: dict[str, dict] = {
    "ui.visit": {},
    "ui.nav": {"surface": "kora", "via": "route"},
    "ui.surface_error": {"surface": "activity", "status_class": "e429",
                         "op": "read"},
    "kora.entered": {"entry": "palette", "latency_class": "b"},
    "kora.intent_started": {"entry_point": "focus"},
    "kora.intent_completed": {"chars_class": "m", "latency_class": "a"},
    "kora.intent_abandoned": {"had_text": True, "dwell_class": "l"},
    "cmdk.palette_opened": {"trigger": "hotkey"},
    "cmdk.item_selected": {"group": "memory", "via": "enter"},
    "living.layer_toggled": {"from": "calm", "to": "off", "where": "quick"},
    "notifications.read": {},
}


@pytest.fixture()
def fresh_telemetry_limiter(app_module, monkeypatch):
    """Fresh per-test rate limiter (the app-level one is a module global)."""
    from server.security import RateLimiter
    limiter = RateLimiter(limit=app_module._TELEMETRY_RATE_LIMIT,
                          window=app_module._TELEMETRY_RATE_WINDOW)
    monkeypatch.setattr(app_module, "_telemetry_limiter", limiter)
    return limiter


@pytest.fixture(autouse=True)
def _fresh_limiter(fresh_telemetry_limiter):
    """Telemetry rate limiting is a module global — reset per test."""


@pytest.fixture(scope="module")
def spec(client):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    return r.json()


# ------------------------------------------------------- the verdict contract
class TestIngestContract:
    def test_happy_path_200_with_taxonomy_response_shape(self, client,
                                                          ui_auth):
        visit = _visit_id()
        r = _post(client, [_event("ui.visit", visit),
                           _event("kora.entered", visit, entry="route",
                                  latency_class="c")], ui_auth)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True, "accepted": 2, "dropped": 0}
        rows = _telemetry_rows(visit)
        assert [r["kind"] for r in rows] == ["ui.visit", "kora.entered"]

    def test_batch_of_50_is_the_ceiling(self, client, ui_auth):
        visit = _visit_id()
        r = _post(client, [_event("ui.visit", visit) for _ in range(50)],
                  ui_auth)
        assert r.status_code == 200
        assert r.json()["accepted"] == 50

    def test_batch_of_51_is_413_and_writes_nothing(self, client, ui_auth):
        visit = _visit_id()
        r = _post(client, [_event("ui.visit", visit) for _ in range(51)],
                  ui_auth)
        assert r.status_code == 413
        assert _telemetry_rows(visit) == []

    def test_empty_batch_422(self, client, ui_auth):
        r = _post(client, [], ui_auth)
        assert r.status_code == 422

    def test_all_or_nothing_unknown_kind_refuses_the_whole_batch(
            self, client, ui_auth):
        """The ME-037 verdict policy: one off-taxonomy event is a 422 for
        the entire batch — valid siblings are NOT partially written."""
        visit = _visit_id()
        r = _post(client, [_event("ui.visit", visit),
                           _event("ui.nav", visit, surface="kora",
                                  via="link"),
                           _event("totally.unknown", visit)],
                  ui_auth)
        assert r.status_code == 422
        assert _telemetry_rows(visit) == []

    def test_verdict_set_pinned_in_openapi(self, spec):
        """ME-028 SEC-1 pattern: the machine-readable contract carries the
        full verdict set so a silent drift cannot regenerate cleanly."""
        post = spec["paths"]["/api/events/ui"]["post"]
        assert set(post["responses"]) == {"200", "403", "413", "422", "429"}
        body = (post["requestBody"]["content"]["application/json"]
                ["schema"]["$ref"])
        assert body.endswith("/UiTelemetryBatch")
        ok = (post["responses"]["200"]["content"]["application/json"]
              ["schema"]["$ref"])
        assert ok.endswith("/UiTelemetryOut")

    def test_envelope_is_server_stamped_only(self, client, ui_auth):
        """ts/actor_class/client_class/release are server facts: a client
        value is a 422 (extra=forbid), never an override."""
        visit = _visit_id()
        for override in ({"ts": "2000-01-01T00:00:00Z"},
                         {"actor_class": "machine"},
                         {"client_class": "fridge"},
                         {"release": "0.0.0-test"}):
            r = _post(client, [_event("ui.visit", visit) | override],
                      ui_auth)
            assert r.status_code == 422, override
        assert _telemetry_rows(visit) == []

    def test_stored_payload_carries_the_server_envelope(self, client,
                                                        ui_auth, app_module):
        visit = _visit_id()
        r = _post(client, [_event("ui.visit", visit),
                           {"kind": "living.layer_toggled",
                            "visit_id": visit,
                            "from": "off", "to": "calm", "where": "settings"}],
                  headers=ui_auth | {"User-Agent":
                                     "Mozilla/5.0 (iPhone; CPU iPhone OS)"
                                     " Mobile Safari"})
        assert r.status_code == 200, r.text
        rows = {r["kind"]: r for r in _telemetry_rows(visit)}
        # the taxonomy §1.1 envelope, server-side facts
        for row in rows.values():
            assert row["payload"]["actor_class"] == "ui"
            assert row["payload"]["client_class"] == "mobile"
            assert row["payload"]["release"] == app_module.app.version
            assert row["ts"], "the events table stamps ts itself"
            assert "ts" not in row["payload"]
        # the `from` alias rides the payload under its JSON name
        assert rows["living.layer_toggled"]["payload"]["from"] == "off"

    def test_client_class_desktop_default(self, client, ui_auth):
        visit = _visit_id()
        assert _post(client, [_event("ui.visit", visit)],
                     ui_auth).status_code == 200
        assert _telemetry_rows(visit)[0]["payload"]["client_class"] \
            == "desktop"


# -------------------------------------------------------------- the guard
class TestIngestGuard:
    def test_anonymous_403_writes_nothing(self, client):
        visit = _visit_id()
        r = _post(client, [_event("ui.visit", visit)])
        assert r.status_code == 403
        assert _telemetry_rows(visit) == []

    def test_machine_bearer_403_in_split_mode(self, client, split_tokens,
                                              machine_auth):
        """Telemetry numbers describe the OWNER: a machine-class bearer is
        a service credential, not a person (needs split_tokens — in the
        transition env the board token IS the effective ui class)."""
        visit = _visit_id()
        r = _post(client, [_event("ui.visit", visit)], machine_auth)
        assert r.status_code == 403
        assert _telemetry_rows(visit) == []

    def test_ui_cookie_leg_passes(self, client, app_module, monkeypatch):
        """The owner's vesmaro_ui cookie (ADR 0014 Ф2) is THE telemetry
        leg — the SPA battery rides it, not a bearer."""
        from server.security import RateLimiter
        monkeypatch.setattr(app_module, "_auth_verify_ip_limiter",
                            RateLimiter(limit=10, window=60.0))
        monkeypatch.setattr(app_module, "_auth_verify_global_limiter",
                            RateLimiter(limit=10, window=60.0))
        effective = app_module.UI_WRITE_TOKEN or app_module.BOARD_WRITE_TOKEN
        assert client.post("/api/auth/ui-token",
                           json={"token": effective}).status_code == 200
        visit = _visit_id()
        r = _post(client, [_event("ui.visit", visit)])
        assert r.status_code == 200, r.text
        assert len(_telemetry_rows(visit)) == 1

    def test_device_leg_403_unit(self, app_module):
        """Defense-in-depth unit check: an mnd_ leg that somehow reached
        the handler is still refused (the scope middleware 403s it on the
        route first — see the structural test below)."""
        request = Request({"type": "http", "method": "POST",
                           "path": "/api/events/ui", "headers": [],
                           "query_string": b"", "server": ("test", 80),
                           "client": ("127.0.0.1", 1), "scheme": "http"})
        request.state.device = {"id": "d", "name": "Tab"}
        with pytest.raises(Exception) as exc:
            app_module._guard_telemetry_ui(request)
        assert exc.value.status_code == 403

    def test_route_absent_from_every_device_scope_table(self, app_module):
        """Structural: POST /api/events/ui is in NO device grant/scope
        table — an mnd_ bearer is answered by the scope middleware's 403
        before the handler runs at all."""
        for granule, routes in app_module._DEVICE_GRANT_ROUTES.items():
            assert ("POST", "/api/events/ui") not in routes, granule
        for scope, routes in app_module._DEVICE_SCOPE_ROUTES.items():
            assert ("POST", "/api/events/ui") not in routes, scope


# ----------------------------------------------------- the frozen kind registry
class TestKindRegistry:
    @pytest.mark.parametrize("kind", sorted(_VALID_PAYLOADS))
    def test_every_taxonomy_kind_ingests(self, client, ui_auth, kind):
        visit = _visit_id()
        r = _post(client, [_event(kind, visit, **_VALID_PAYLOADS[kind])],
                  ui_auth)
        assert r.status_code == 200, f"{kind}: {r.text}"
        rows = _telemetry_rows(visit)
        assert len(rows) == 1 and rows[0]["kind"] == kind

    def test_registry_is_exactly_the_section_1_2_dictionary(self, app_module):
        """The frozen v0 dictionary: 11 kinds, additive by contract — a
        new kind is a conscious registry extension (taxonomy revision),
        never an accidental acceptance."""
        assert set(app_module._TELEMETRY_KINDS) == set(_VALID_PAYLOADS)
        assert len(app_module._TELEMETRY_KINDS) == 11

    def test_unknown_kind_422(self, client, ui_auth):
        visit = _visit_id()
        for kind in ("ui.typo", "kora.enterred", "task.created", ""):
            r = _post(client, [_event(kind, visit)], ui_auth)
            assert r.status_code == 422, kind
        assert _telemetry_rows(visit) == []

    def test_missing_kind_property_422(self, client, ui_auth):
        """Each kind carries EXACTLY its §1.2 property set — a missing
        mandatory property is a refusal, not a best-effort write."""
        visit = _visit_id()
        r = _post(client, [{"kind": "kora.intent_completed",
                            "visit_id": visit, "chars_class": "s"}], ui_auth)
        assert r.status_code == 422
        assert _telemetry_rows(visit) == []

    def test_foreign_kind_property_422(self, client, ui_auth):
        """...and a property from ANOTHER kind does not slip through on a
        kind that does not own it (no cross-kind field laundering)."""
        visit = _visit_id()
        r = _post(client, [_event("ui.visit", visit, via="route")], ui_auth)
        assert r.status_code == 422
        assert _telemetry_rows(visit) == []


# --------------------------------------------------------------- privacy
class TestPrivacy:
    """§3.4: what NEVER leaves the surface. The schema is the boundary —
    there is no free-text field to abuse and extra keys are forbidden."""

    @pytest.mark.parametrize("field,value", [
        # intent / draft text on a composer event
        ("text", "fix the garage relay"),
        ("intent", "напиши отчёт"),
        ("draft", "x" * 120),
        # the palette search query
        ("query", "коранти"),
        ("search", "task*"),
        # exact sizes where only classes exist
        ("chars", 257),
        ("chars_exact", 257),
        ("latency_ms", 312),
        ("dwell_s", 42),
        # content smuggled through any plausible key
        ("content", "secret"),
        ("title", "secret"),
        ("note", "secret"),
        ("url", "https://board.local/kora?q=secret"),
        ("ip", "10.0.0.1"),
    ])
    def test_free_text_and_exact_values_are_rejected(self, client, ui_auth,
                                                     field, value):
        visit = _visit_id()
        r = _post(client, [_event("kora.intent_started", visit,
                                  entry_point="focus", **{field: value})],
                  ui_auth)
        assert r.status_code == 422, field
        assert _telemetry_rows(visit) == []

    def test_off_enum_values_are_rejected(self, client, ui_auth):
        visit = _visit_id()
        cases = [
            _event("ui.nav", visit, surface="kora", via="telepathy"),
            _event("kora.entered", visit, entry="window",
                   latency_class="b"),
            _event("cmdk.item_selected", visit, group="settings",
                   via="enter"),
            _event("ui.surface_error", visit, surface="kora",
                   status_class="e418", op="read"),
            {"kind": "living.layer_toggled", "visit_id": visit,
             "from": "loud", "to": "calm", "where": "quick"},
        ]
        for payload in cases:
            r = _post(client, [payload], ui_auth)
            assert r.status_code == 422, payload
        assert _telemetry_rows(visit) == []

    def test_surface_is_a_slug_not_a_text_channel(self, client, ui_auth):
        """v0 has no surface enum; the slug charset is the anti-smuggling
        guard — spaces, punctuation and long prose are refused."""
        visit = _visit_id()
        for surface in ("Kora", "kora search", "kora?q=1",
                        "x" * 41, "коран"):
            r = _post(client, [_event("ui.nav", visit, surface=surface,
                                      via="route")], ui_auth)
            assert r.status_code == 422, surface
        assert _telemetry_rows(visit) == []

    def test_visit_id_is_an_id_not_a_text_channel(self, client, ui_auth):
        visit = _visit_id()
        for bad in ("my secret thought", "x" * 65, "short",
                    "id; DROP TABLE events", "визит владельца"):
            r = _post(client, [_event("ui.visit", bad)], ui_auth)
            assert r.status_code == 422, bad
        assert _telemetry_rows(visit) == []

    def test_envelope_keys_never_reach_the_payload_from_client(self, client,
                                                               ui_auth):
        """Even the envelope names cannot be smuggled as payload keys on a
        kind that does not own them."""
        visit = _visit_id()
        r = _post(client, [_event("ui.visit", visit, client_class="mobile")],
                  ui_auth)
        assert r.status_code == 422
        assert _telemetry_rows(visit) == []


# -------------------------------------------------------------- rate limit
def _limit() -> int:
    """The configured per-client budget (imported lazily so the app env
    is pinned first)."""
    from server.app import _TELEMETRY_RATE_LIMIT
    return _TELEMETRY_RATE_LIMIT


class TestRateLimit:
    def test_61st_request_429_with_retry_after(self, client, ui_auth):
        visit = _visit_id()
        statuses = [_post(client, [_event("ui.visit", visit)],
                          ui_auth).status_code
                    for _ in range(_limit() + 1)]
        assert statuses[0] == 200
        assert statuses[-1] == 429
        assert statuses[:_limit()] == [200] * _limit()

    def test_429_writes_nothing(self, client, ui_auth):
        visit = _visit_id()
        for _ in range(_limit()):
            _post(client, [_event("ui.visit", visit)], ui_auth)
        visit2 = _visit_id()
        r = _post(client, [_event("ui.visit", visit2)], ui_auth)
        assert r.status_code == 429
        assert "Retry-After" in r.headers
        assert _telemetry_rows(visit2) == []

    def test_limit_is_per_client_not_global(self, client, ui_auth,
                                            fresh_telemetry_limiter):
        """Granularity: exhausting one client's budget leaves every other
        client its full window (the task-drafts per-IP engine)."""
        for _ in range(_limit()):
            _post(client, [_event("ui.visit", _visit_id())], ui_auth)
        assert fresh_telemetry_limiter.acquire("192.0.2.10") is True
        assert fresh_telemetry_limiter.acquire("testclient") is False


# ------------------------------------------------- /api/activity isolation
class TestActivityIsolation:
    def test_telemetry_never_surfaces_in_the_feed(self, client, ui_auth):
        """The whitelist projection: ingest the whole dictionary, then
        read the feed — telemetry families are board-life audit rows, not
        the task execution stream (taxonomy §2)."""
        visit = _visit_id()
        events = [_event(kind, visit, **props)
                  for kind, props in _VALID_PAYLOADS.items()]
        assert _post(client, events, ui_auth).status_code == 200
        before_id = 0
        while True:  # walk every page via the before_id cursor
            params = {"limit": 200}
            if before_id:
                params["before_id"] = before_id
            r = client.get("/api/activity", params=params)
            assert r.status_code == 200
            body = r.json()
            for item in body["items"]:
                assert item["kind"] not in _VALID_PAYLOADS
            if not body.get("has_more"):
                break
            before_id = body["items"][-1]["id"]

    def test_whitelist_lock_no_telemetry_kind_is_activity_v1(self,
                                                             app_module):
        """Structural lock: the frozen telemetry dictionary and the
        activity v1 dictionary are DISJOINT sets — a future kind added to
        one cannot silently leak into the other."""
        activity_kinds = set(app_module._ACTIVITY_V1_KINDS)
        assert set(app_module._TELEMETRY_KINDS) & activity_kinds == set()
        for family in app_module.ACTIVITY_FAMILIES.values():
            assert set(app_module._TELEMETRY_KINDS) & set(family) == set()

    def test_telemetry_is_never_task_family_retention_exempt(self,
                                                             app_module):
        """Retention (taxonomy §3.3): every telemetry kind is non-task.* —
        the standing UI-28 sweep (90d/500k) owns them, no new policy."""
        for kind in app_module._TELEMETRY_KINDS:
            assert not kind.startswith("task."), kind


# ------------------------------------------------------ SSE bus isolation
class TestSseIsolation:
    def test_ingest_does_not_broadcast_to_the_bus(self, app_module):
        """Taxonomy §3.1: the ingest NEVER fans out into the SSE bus —
        telemetry is not live UI state, and a broadcast would leak it into
        the unauthenticated SSE leg. Real subscription + real handler: the
        accepted batch lands in the store while the subscriber's queue
        stays empty (a broadcast is a synchronous put — an empty queue
        after the handler returned means no frame can ever arrive)."""
        import server.app as am

        async def scenario() -> None:
            scope = {"type": "http", "method": "GET", "path": "/api/events",
                     "headers": [], "query_string": b"",
                     "server": ("test", 80), "client": ("127.0.0.1", 1),
                     "scheme": "http"}
            resp = await am.events(Request(scope))
            it = resp.body_iterator
            try:
                first = await asyncio.wait_for(it.__anext__(), timeout=5)
                assert first.startswith(b"retry: ")
                hello = json.loads(
                    (await asyncio.wait_for(it.__anext__(), timeout=5))
                    .decode()[len("data: "):].strip())
                assert hello["kind"] == "hello"
                subs = [s for s in am._subscribers]
                assert len(subs) == 1, "this test owns the only subscription"
                # an accepted batch lands in the store ...
                visit = _visit_id()
                body = am.UiTelemetryBatch(events=[
                    am.UiVisitEvent(kind="ui.visit", visit_id=visit)])
                out = await am.ingest_ui_telemetry(
                    body, Request({**scope, "method": "POST",
                                   "headers": [(b"authorization",
                                                f"Bearer {am.BOARD_WRITE_TOKEN}".encode())]}))
                assert out["accepted"] == 1
                assert _telemetry_rows(visit), "the batch really landed"
                # ... while the live subscriber queue stays silent
                await asyncio.sleep(0)   # let any deferred put land
                assert subs[0].queue.empty(), \
                    "telemetry must never ride the SSE bus"
            finally:
                await it.aclose()

        asyncio.run(scenario())


# ---------------------------------------------- notifications.read audit
class TestNotificationsReadAudit:
    def test_scope_one_and_all_with_server_envelope(self, client, ui_auth,
                                                     app_module):
        before = _db().execute(
            "SELECT COALESCE(MAX(id), 0) AS m FROM events").fetchone()["m"]
        assert client.post("/api/notifications/read", json={"id": 424242},
                           headers=ui_auth).status_code == 200
        assert client.post("/api/notifications/read",
                           headers=ui_auth).status_code == 200
        with _db() as db:
            rows = db.execute(
                "SELECT kind, payload FROM events WHERE id > ? "
                "AND kind = 'notifications.read' ORDER BY id",
                (before,)).fetchall()
        assert [json.loads(r["payload"])["scope"] for r in rows] \
            == ["one", "all"]
        for r in rows:
            payload = json.loads(r["payload"])
            assert payload["actor_class"] == "ui"
            assert payload["client_class"] == "desktop"
            assert payload["release"] == app_module.app.version

    def test_audit_row_is_not_in_the_activity_feed(self, client, ui_auth):
        """The audit rides the events table but never the feed — same
        whitelist projection as every other telemetry kind."""
        client.post("/api/notifications/read", headers=ui_auth)
        r = client.get("/api/activity", params={"limit": 200})
        assert r.status_code == 200
        assert all(i["kind"] != "notifications.read" for i in r.json()["items"])


# ------------------------------------------------ C1: pre-parse body cap
# Cascade fix (1.52.0 release security audit, P2 / CWE-400): the 403/413/
# 429 verdicts used to fire only AFTER Starlette had buffered the whole
# body and pydantic had parsed every element — an anonymous leg could burn
# CPU/memory with hundreds of MB of VALID events before the first refusal.
# The cap is a middleware reading Content-Length from the ASGI scope and
# answering 413 BEFORE routing: not a single body byte is read.
class TestBodyCapC1:
    def _request(self, *, method: str = "POST", path: str = "/api/events/ui",
                 content_length: str | None = None) -> Request:
        headers = ([(b"content-length", content_length.encode())]
                   if content_length is not None else [])
        scope = {"type": "http", "method": method, "path": path,
                 "headers": headers, "query_string": b"",
                 "server": ("test", 80), "client": ("127.0.0.1", 1),
                 "scheme": "http"}

        async def _no_body():   # the middleware must NEVER touch the body
            raise AssertionError("the body channel must not be read")

        return Request(scope, receive=_no_body)

    @staticmethod
    async def _sentinel(request):
        from starlette.responses import Response
        return Response(b"passed-through", status_code=200)

    def test_oversize_declared_length_413_without_reading_the_body(
            self, app_module):
        """The C1 core: a huge DECLARED Content-Length is refused by the
        header alone — no body is sent (the receive channel raises if
        touched), call_next is never reached, and the answer is the same
        contract 413 verdict shape."""
        import asyncio
        cap = app_module._TELEMETRY_BODY_MAX_BYTES

        async def _call_next(request):
            raise AssertionError("call_next must not run for an "
                                 "oversize declaration")

        resp = asyncio.run(app_module.telemetry_body_cap(
            self._request(content_length=str(cap + 1)), _call_next))
        assert resp.status_code == 413
        assert "detail" in json.loads(resp.body.decode())

    def test_cap_boundary_and_pass_through_matrix(self, app_module):
        """Exactly-at-cap passes (the refusal is strictly >), small and
        absent declarations pass (chunked rides the post-parse batch 413),
        a non-numeric declaration passes (transport-level garbage is not
        the middleware's verdict), and the gate is route-scoped: other
        paths and methods ride untouched."""
        import asyncio
        cap = app_module._TELEMETRY_BODY_MAX_BYTES
        cases = [
            ("declared == cap", self._request(content_length=str(cap))),
            ("declared small", self._request(content_length="1234")),
            ("no declaration (chunked)", self._request()),
            ("non-numeric declaration",
             self._request(content_length="not-a-number")),
            ("oversize, other path",
             self._request(path="/api/task-drafts",
                           content_length=str(cap * 100))),
            ("oversize, GET method",
             self._request(method="GET",
                           content_length=str(cap * 100))),
        ]
        for name, request in cases:
            resp = asyncio.run(app_module.telemetry_body_cap(
                request, self._sentinel))
            assert resp.status_code == 200 and \
                resp.body == b"passed-through", name

    def test_real_oversize_body_413_before_any_parsing(self, client,
                                                       app_module):
        """Integration: a real multi-MB body gets the pre-parse 413 — not
        the pydantic 422 a parsed garbage body would produce, and not the
        guard's 403 (ANONYMOUS leg: the cap refuses before the guard can
        run, which is the point — earliest refusal wins)."""
        cap = app_module._TELEMETRY_BODY_MAX_BYTES
        r = client.post("/api/events/ui",
                        content=b"x" * (cap + 1),
                        headers={"Content-Type": "application/json"})
        assert r.status_code == 413
        assert "detail" in r.json()
        assert "bytes" in r.json()["detail"]

    def test_normal_batches_are_not_affected(self, client, ui_auth):
        """The honest gate: the largest LEGAL batch (50 events, ~6 KB)
        sails through the cap unchanged — 200, all events stored."""
        visit = _visit_id()
        r = _post(client, [_event("ui.visit", visit) for _ in range(50)],
                  ui_auth)
        assert r.status_code == 200
        assert r.json()["accepted"] == 50
        assert len(_telemetry_rows(visit)) == 50
