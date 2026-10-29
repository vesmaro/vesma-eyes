"""Kora slice-3 API tests (ADR 0019 — relay steering + step-up PIN).

Layers:
1. STEP-UP RITUAL — enable/status/revoke (frozen /kora/steering shapes):
   off by default, ≤900s grant, fail-closed 503 when unprovisioned,
   10/60s attempt limiter, the PIN never logged in any form.
2. THREAT-MODEL BOUNDARIES (each one a pinned test, the brief's hard
   edges): steering is ui-ONLY — anonymous 401, valid mnd_ device gets
   the EXPLANATORY 403 wall (code metadata_only, never a bare 403), the
   machine token is not an owner (ADR 0009 A1 split).
3. PROVENANCE / TRIPLE-BINDING (gates 1+2): unknown / foreign /
   not-steerable triples resolve as 404 session_not_found server-side;
   hermes rows (steerable=False) are not special-cased; loud host
   conflict answers 409 (gate 6).
4. HONEST DELIVERY — accepted ≠ delivered: 202 carries the CURRENT
   KoraDelivery; with no executor-side transport everything resolves
   failed (retryable, «не доставлено — повторите»); dead sessions fail
   non-retryable; a fake transport exercises delivered/errors.
5. LOG HYGIENE (gate 3): prompt text, PIN and tokens never appear in
   logs/responses/audits — audits carry sha256 + byte length only.
6. CREATE = honest 501 after ALL gates, no phantom registry row.

Relay state is module-global (server/kora/relay.py): every test runs
under `fresh_relay_state` (grants + queue + transport reset, PIN
provisioning torn down) and fresh limiters.
"""

from __future__ import annotations

import sqlite3
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from conftest import BOARD_TOKEN, UI_TOKEN, DATA_DIR, get_app_module

from server.kora import relay as kora_relay

MACHINE_HEADERS = {"Authorization": f"Bearer {BOARD_TOKEN}"}
TEST_PIN = "43214321"      # synthetic ritual PIN — never a real secret
# (8 digits: a 4-digit literal checked as a bare substring collides
# stochastically with the random hex of a scrypt salt/digest — the
# flake the slice-3 review caught on a full run)
WRONG_PIN = "9999"
PROMPT_SENTINEL = "PROMPT-SENTINEL-4821-секрет"
PIN_SENTINEL = "PIN-SENTINEL-9753"


def _ui_headers() -> dict:
    effective = get_app_module().UI_WRITE_TOKEN or get_app_module().BOARD_WRITE_TOKEN
    return {"Authorization": f"Bearer {effective}"}


@pytest.fixture(autouse=True)
def fresh_relay_state():
    """Clean grants/queue/transport per test; PIN provisioning is torn
    down too (nothing outside this suite may inherit a verifier)."""
    kora_relay.reset_all()
    kora_relay.configure_steering_pin(None)
    yield
    kora_relay.reset_all()
    kora_relay.configure_steering_pin(None)


@pytest.fixture(autouse=True)
def fresh_kora3_limiters(app_module, monkeypatch):
    """Per-test limiter resets (module-global budgets must not leak
    between tests; same discipline as the slice-1/2 suites — the shared
    board DB and the per-IP registration budget in particular)."""
    from server.security import RateLimiter
    steer = RateLimiter(limit=app_module._KORA_STEER_RATE_LIMIT,
                        window=app_module._KORA_STEER_RATE_WINDOW)
    stepup = RateLimiter(limit=app_module._KORA_STEPUP_RATE_LIMIT,
                         window=app_module._KORA_STEPUP_RATE_WINDOW)
    register = RateLimiter(limit=app_module._EXECUTOR_REGISTER_RATE_LIMIT,
                           window=app_module._EXECUTOR_REGISTER_RATE_WINDOW)
    scan = RateLimiter(limit=app_module._KORA_SCAN_RATE_LIMIT,
                       window=app_module._KORA_SCAN_RATE_WINDOW)
    monkeypatch.setattr(app_module, "_kora_steer_limiter", steer)
    monkeypatch.setattr(app_module, "_kora_stepup_limiter", stepup)
    monkeypatch.setattr(app_module, "_executor_register_limiter", register)
    monkeypatch.setattr(app_module, "_kora_scan_limiter", scan)
    return steer, stepup


@pytest.fixture()
def steering_ready():
    """PIN provisioned AND the grant minted (the unlocked window)."""
    kora_relay.configure_steering_pin(TEST_PIN)
    grant = kora_relay.step_up_enable(TEST_PIN)
    assert grant is not None
    return grant


_EXECUTOR_CACHE: dict[str, tuple[str, dict]] = {}


def _register_executor(client: TestClient, ui_auth: dict, name: str,
                       *, host: str | None = None) -> tuple[str, dict]:
    """Register + approve an executor; returns (id, secret-headers).
    UNIQUE HOST BY DEFAULT: the send path answers 409 on duplicate
    hosts, so tests must opt INTO a conflict explicitly."""
    if name in _EXECUTOR_CACHE:
        return _EXECUTOR_CACHE[name]
    resp = client.post(
        "/api/executors", headers=MACHINE_HEADERS,
        json={"name": name, "harness": "zcode",
              "host": host or f"{name}.test-host"})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    executor_id = body["executor"]["id"]
    resp = client.patch(
        f"/api/executors/{executor_id}", headers=ui_auth,
        json={"state": "approved"})
    assert resp.status_code == 200, resp.text
    headers = {"Authorization": f"Bearer {body['executor_secret']}"}
    _EXECUTOR_CACHE[name] = (executor_id, headers)
    return executor_id, headers


def _scan(client: TestClient, h: dict, executor_id: str,
          rows: list[dict]) -> dict:
    resp = client.post(
        f"/api/executors/{executor_id}/kora-scan", headers=h,
        json={"sessions": rows})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _ingest_session(client: TestClient, ui_auth: dict, name: str,
                    native_id: str, *, harness: str = "zcode",
                    origin: str = "local", steerable: bool = False,
                    state: str = "live", host: str | None = None) -> str:
    executor_id, h = _register_executor(
        client, ui_auth, name,
        host=f"{name}.test-host" if host is None else host)
    _scan(client, h, executor_id,
          [{"native_id": native_id, "harness": harness, "project": "p",
            "cwd": "/p", "state": state, "origin": origin,
            "steerable": steerable}])
    return f"{executor_id}:{native_id}"


def _send(client: TestClient, session_id: str, text: str = "погони",
          headers: dict | None = None, **extra):
    if headers is None:
        headers = _ui_headers()
    return client.post(f"/api/kora/sessions/{session_id}/messages",
                       headers=headers, json={"text": text, **extra})


def _create(client: TestClient, payload: dict, headers: dict | None = None):
    if headers is None:
        headers = _ui_headers()
    return client.post("/api/kora/sessions", headers=headers, json=payload)


def _stepup(client: TestClient, pin: str = TEST_PIN,
            headers: dict | None = None):
    if headers is None:
        headers = _ui_headers()
    return client.post("/api/kora/steering/step-up",
                       headers=headers, json={"pin": pin})


def _status(client: TestClient, headers: dict | None = None):
    if headers is None:
        headers = _ui_headers()
    return client.get("/api/kora/steering/step-up", headers=headers)


def _revoke(client: TestClient, headers: dict | None = None):
    if headers is None:
        headers = _ui_headers()
    return client.delete("/api/kora/steering/step-up", headers=headers)


def _kora_audit(app_module, kinds: set[str], after_id: int) -> list[dict]:
    return [e for e in app_module.store.events(after_id, limit=200)
            if e["kind"] in kinds]


# ============================================================== step-up PIN
class TestStepUpRitual:
    """The steering unlock: off by default, ≤900s, fail-closed when
    unprovisioned, rate limited, never logged in any form."""

    def test_off_by_default(self, client: TestClient):
        assert _status(client).json()["active"] is False
        assert _status(client).json()["granted_until"] is None

    def test_enable_grants_ttl_capped_at_900(self, client: TestClient):
        kora_relay.configure_steering_pin(TEST_PIN)
        resp = _stepup(client)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["ok"] is True
        assert 0 < body["ttl_seconds"] <= 900  # the frozen contract cap
        status = _status(client).json()
        assert status["active"] is True
        assert 0 < status["ttl_remaining_seconds"] <= 900

    def test_enable_without_pin_is_fail_closed_503(self, client: TestClient):
        resp = _stepup(client)
        assert resp.status_code == 503
        assert "not configured" in resp.json()["detail"]

    def test_wrong_pin_denied_with_frozen_code(self, client: TestClient):
        kora_relay.configure_steering_pin(TEST_PIN)
        resp = _stepup(client, pin=WRONG_PIN)
        assert resp.status_code == 403
        body = resp.json()
        assert body == {"ok": False, "code": "step_up_denied",
                        "message": body["message"]}
        assert _status(client).json()["active"] is False

    def test_reenable_replaces_grant(self, client: TestClient):
        kora_relay.configure_steering_pin(TEST_PIN)
        first = _stepup(client).json()
        second = _stepup(client).json()
        assert second["granted_until"] >= first["granted_until"]

    def test_revoke_is_204_no_body_and_kills_the_window(
            self, client: TestClient, steering_ready):
        resp = _revoke(client)
        assert resp.status_code == 204
        assert resp.content == b""
        assert _status(client).json()["active"] is False

    def test_expired_grant_is_inactive(self, client: TestClient,
                                       steering_ready):
        from datetime import datetime, timedelta, timezone
        kora_relay._grant["granted_until"] = (
            datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        assert _status(client).json()["active"] is False
        resp = _send(client, "exec-x:sess-y")
        assert resp.status_code == 403
        assert resp.json()["code"] == "step_up_required"

    def test_steering_requires_step_up(self, client: TestClient):
        """PIN configured but the ritual not performed: the send and the
        create answer the frozen 403 step_up_required — руление осознанное."""
        kora_relay.configure_steering_pin(TEST_PIN)
        for resp in (_send(client, "exec-x:sess-y"),
                     _create(client, {"executor_id": "exec-x",
                                      "project": "p", "prompt": "x"})):
            assert resp.status_code == 403, resp.text
            assert resp.json()["code"] == "step_up_required"

    def test_attempt_limiter_10_per_60s(self, client: TestClient):
        kora_relay.configure_steering_pin(TEST_PIN)
        for _ in range(10):
            assert _stepup(client, pin=WRONG_PIN).status_code == 403
        resp = _stepup(client, pin=WRONG_PIN)
        assert resp.status_code == 429

    def test_unprovisioned_pin_denies_sends_honestly(
            self, client: TestClient):
        """No PIN provisioned → no grant can exist → steering answers
        the same honest 403 step_up_required (never a 500)."""
        resp = _send(client, "exec-x:sess-y")
        assert resp.status_code == 403
        assert resp.json()["code"] == "step_up_required"


class TestStepUpAccess:
    """Who may perform the ritual: ui only (ADR 0019 §4 + ADR 0009 A1)."""

    _created_devices: list[str] = []

    @classmethod
    def _paired_device(cls, app_module, name="kora-s3-phone"):
        store = app_module.store
        row, _code = store.create_pairing_request(device_name=name)
        store.scan_pairing(row["id"], device_name=name,
                           source_ip="testclient")
        store.confirm_pairing(row["id"], allow=True)
        device, token = store.issue_device_session(row["id"])
        cls._created_devices.append(device["id"])
        return device, token

    @pytest.fixture(autouse=True)
    def _delete_guard_devices(self, app_module):
        yield
        import sqlite3 as _sq
        with _sq.connect(DATA_DIR / "board.db") as db:
            for device_id in self._created_devices:
                db.execute("DELETE FROM device_sessions WHERE id=?",
                           (device_id,))
        self._created_devices.clear()

    def test_anonymous_401_frozen_body(self, client: TestClient):
        resp = _stepup(client, headers={})
        assert resp.status_code == 401
        body = resp.json()
        assert body["ok"] is False and body["code"] == "unauthorized"

    def test_device_cannot_step_up_explanatory_wall(
            self, client: TestClient, app_module):
        device, token = self._paired_device(app_module)
        resp = _stepup(client, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403
        body = resp.json()
        assert body["code"] == "metadata_only"
        assert "руление" in body["message"].lower()
        assert set(body) == {"ok", "code", "message"}

    def test_device_cannot_create_session_wall(self, client: TestClient,
                                               app_module):
        device, token = self._paired_device(app_module)
        resp = _create(client, {"executor_id": "e", "project": "p",
                                "prompt": "x"},
                       headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403
        assert resp.json()["code"] == "metadata_only"

    def test_device_cannot_send_wall(self, client: TestClient, app_module):
        device, token = self._paired_device(app_module)
        resp = _send(client, "exec-x:sess-y", headers={
            "Authorization": f"Bearer {token}"})
        assert resp.status_code == 403
        assert resp.json()["code"] == "metadata_only"

    def test_machine_token_is_not_a_steering_class(
            self, client: TestClient, steering_ready):
        """ADR 0009 A1: the machine token does not steer and does not
        step up — 401 with the class-mismatch explanation, never silent
        success and never a bare refusal."""
        for resp in (_stepup(client, headers=MACHINE_HEADERS),
                     _send(client, "exec-x:sess-y", headers=MACHINE_HEADERS),
                     _create(client, {"executor_id": "e", "project": "p",
                                      "prompt": "x"},
                             headers=MACHINE_HEADERS)):
            assert resp.status_code == 401, resp.text
            body = resp.json()
            assert body["code"] == "unauthorized"
            assert "machine-class" in body["message"]

    def test_cookie_leg_performs_the_ritual(self, client: TestClient,
                                            app_module):
        kora_relay.configure_steering_pin(TEST_PIN)
        client.cookies.set(app_module._UI_COOKIE_NAME, UI_TOKEN)
        resp = _stepup(client, headers={})
        assert resp.status_code == 200, resp.text
        resp = _send(client, "exec-x:sess-y", headers={})
        assert resp.status_code == 404  # past the PIN gate: unknown session
        client.cookies.clear()

    def test_invalid_device_token_401(self, client: TestClient):
        resp = _send(client, "exec-x:sess-y",
                     headers={"Authorization": "Bearer mnd_bogus"})
        assert resp.status_code == 401


# ================================================== steering: POST messages
class TestSteeringBoundaries:
    """Provenance + triple-binding (ADR gates 1+2) and queue honesty."""

    def test_unknown_session_resolves_as_absent(
            self, client: TestClient, steering_ready):
        resp = _send(client, "exec-none:sess_ghost")
        assert resp.status_code == 404
        body = resp.json()
        assert body["code"] == "session_not_found"
        assert body["ok"] is False

    def test_malformed_handle_is_404_not_500(self, client: TestClient,
                                             steering_ready):
        for handle in ("no-colon", ":", "exec-only:"):
            resp = _send(client, handle)
            assert resp.status_code == 404, handle
            assert resp.json()["code"] == "session_not_found"

    def test_foreign_local_session_is_not_steerable(
            self, client: TestClient, ui_auth: dict, steering_ready):
        """Provenance gate 2: a plain local (never adopted) session is
        resolved as ABSENT by the send path — 404, same answer as an
        unknown triple, server-side (not UI-hidden)."""
        handle = _ingest_session(client, ui_auth, "kora-s3-local",
                                 "sess_local")
        resp = _send(client, handle)
        assert resp.status_code == 404
        assert resp.json()["code"] == "session_not_found"

    def test_hermes_session_is_not_steerable(
            self, client: TestClient, ui_auth: dict, steering_ready):
        """The coverage gap is honest: hermes rows carry steerable=False
        and the send path does not special-case the harness."""
        handle = _ingest_session(client, ui_auth, "kora-s3-herm",
                                 "herm-1", harness="hermes")
        resp = _send(client, handle)
        assert resp.status_code == 404
        assert resp.json()["code"] == "session_not_found"

    def test_adopted_session_is_steerable_202_failed_honest(
            self, client: TestClient, ui_auth: dict, steering_ready):
        """typed-confirm adoption (the registry steerable flag) opens the
        send path; with no executor transport the delivery is HONESTLY
        failed (retryable, «не доставлено — повторите»), confirm default."""
        handle = _ingest_session(client, ui_auth, "kora-s3-adopt",
                                 "sess_adopt", steerable=True)
        resp = _send(client, handle)
        assert resp.status_code == 202, resp.text
        body = resp.json()
        assert body["ok"] is True
        assert body["session_id"] == handle
        assert body["confirm_required"] is True  # confirm is the default
        delivery = body["delivery"]
        assert delivery["status"] == "failed"
        assert delivery["retryable"] is True
        assert "повторите" in delivery["error"]
        assert delivery["queued_at"]
        assert delivery["delivered_at"] is None

    def test_relay_origin_session_is_steerable_by_construction(
            self, client: TestClient, ui_auth: dict, steering_ready):
        handle = _ingest_session(client, ui_auth, "kora-s3-relay",
                                 "sess_relay", origin="relay",
                                 steerable=False)
        resp = _send(client, handle)
        assert resp.status_code == 202, resp.text

    def test_dead_session_fails_non_retryable(
            self, client: TestClient, ui_auth: dict, steering_ready):
        handle = _ingest_session(client, ui_auth, "kora-s3-dead",
                                 "sess_dead", steerable=True, state="dead")
        resp = _send(client, handle)
        assert resp.status_code == 202
        delivery = resp.json()["delivery"]
        assert delivery["status"] == "failed"
        assert delivery["retryable"] is False
        assert "dead" in delivery["error"]

    def test_host_conflict_is_loud_409(self, client: TestClient,
                                       ui_auth: dict, steering_ready):
        """Security gate 6: two approved executors sharing one host make
        the triple's store ownership ambiguous — the SEND path answers
        409 host_conflict loudly, naming the conflict (visibility is
        never blocked)."""
        handle = _ingest_session(client, ui_auth, "kora-s3-hc-a",
                                 "sess_hc", steerable=True,
                                 host="shared.test-host")
        other_id, _h = _register_executor(client, ui_auth, "kora-s3-hc-b",
                                          host="shared.test-host")
        resp = _send(client, handle)
        assert resp.status_code == 409
        body = resp.json()
        assert body["code"] == "host_conflict"
        assert other_id in body["message"], "conflict named loudly"

    def test_empty_host_never_conflicts(self, client: TestClient,
                                        ui_auth: dict, steering_ready):
        """A hostless executor binds no store — the send proceeds."""
        handle = _ingest_session(client, ui_auth, "kora-s3-nohost",
                                 "sess_nh", steerable=True, host="")
        assert _send(client, handle).status_code == 202

    def test_validation_bounds_and_extra_forbid(
            self, client: TestClient, ui_auth: dict, steering_ready):
        """The frozen body grammar: 1..32000 text, extra=forbid — no
        client field (a mode flag, an idempotency key) can smuggle past
        the resolver."""
        handle = _ingest_session(client, ui_auth, "kora-s3-valid",
                                 "sess_valid", steerable=True)
        for payload in ({"text": ""}, {"text": "x" * 32001},
                        {"text": "x", "mode": "yolo"}):
            resp = client.post(f"/api/kora/sessions/{handle}/messages",
                               headers=_ui_headers(), json=payload)
            assert resp.status_code == 422, payload.keys()

    def test_no_idempotency_key_is_invented(self, client: TestClient,
                                            ui_auth: dict, steering_ready):
        """The ADR defines NO client idempotency key and the frozen body
        forbids extra fields — each accepted POST is exactly one queue
        entry; «повторите» is a deliberate new send (pinned so nobody
        silently adds a heuristic dedup)."""
        handle = _ingest_session(client, ui_auth, "kora-s3-idem",
                                 "sess_idem", steerable=True)
        assert _send(client, handle, "one").status_code == 202
        assert _send(client, handle, "one").status_code == 202
        assert len(kora_relay.queue_snapshot()) == 2

    def test_pending_bound_429(self, client: TestClient, ui_auth: dict,
                               steering_ready, monkeypatch):
        """The pending bound protects the async-transport future: a
        handoff that stays queued accumulates pending prompts and the
        per-session bound answers an honest 429 (never a silent drop)."""
        monkeypatch.setattr(kora_relay, "QUEUE_MAX_PER_SESSION", 2)
        monkeypatch.setattr(kora_relay, "transport",
                            lambda item: ("queued", None))
        handle = _ingest_session(client, ui_auth, "kora-s3-cap",
                                 "sess_cap", steerable=True)
        assert _send(client, handle, "1").status_code == 202
        assert _send(client, handle, "2").status_code == 202
        assert _send(client, handle, "3").status_code == 429

    def test_total_queue_bound_429(self, client: TestClient, ui_auth: dict,
                                   steering_ready, monkeypatch):
        """The SECOND bound, the shared queue budget: with the
        per-session cap far away, QUEUE_MAX_TOTAL still answers an
        honest 429 naming the total (nothing is dropped silently)."""
        monkeypatch.setattr(kora_relay, "QUEUE_MAX_TOTAL", 2)
        monkeypatch.setattr(kora_relay, "transport",
                            lambda item: ("queued", None))
        handle = _ingest_session(client, ui_auth, "kora-s3-total",
                                 "sess_total", steerable=True)
        assert _send(client, handle, "1").status_code == 202
        assert _send(client, handle, "2").status_code == 202
        resp = _send(client, handle, "3")
        assert resp.status_code == 429, resp.text
        assert "pending total 2/2" in resp.json()["detail"]

    def test_unknown_and_foreign_404_bodies_are_identical_bytes(
            self, client: TestClient, ui_auth: dict, steering_ready):
        """Probes learn nothing: the unknown-triple 404 and the
        foreign/not-steerable 404 answer the SAME body (the handler
        keeps one literal — pinned so a refactor cannot split the two
        branches silently). The bodies interpolate the probed handle,
        so equality is asserted with the handle normalized out — every
        other byte (envelope, code, static text) must match exactly."""
        unknown = _send(client, "exec-none:sess_ghost")
        handle = _ingest_session(client, ui_auth, "kora-s3-f404",
                                 "sess_f404")  # local, never adopted
        foreign = _send(client, handle)
        assert unknown.status_code == foreign.status_code == 404
        assert (unknown.content.replace(b"exec-none:sess_ghost", b"<h>")
                == foreign.content.replace(handle.encode("utf-8"), b"<h>"))

    def test_steering_rate_limit_30_per_60s(self, client: TestClient,
                                            steering_ready):
        """The limiter counts BEFORE triple resolution: 30 gated probes
        then an honest 429 (probing sessions does not bypass the door)."""
        for _ in range(30):
            assert _send(client, "exec-x:sess-y").status_code == 404
        assert _send(client, "exec-x:sess-y").status_code == 429


class TestDeliveryHonesty:
    """accepted ≠ delivered: the state machine and its seams."""

    def test_transport_delivered(self, client: TestClient, ui_auth: dict,
                                 steering_ready, monkeypatch):
        monkeypatch.setattr(kora_relay, "transport",
                            lambda item: ("delivered", None))
        handle = _ingest_session(client, ui_auth, "kora-s3-dl", "sess_dl",
                                 steerable=True)
        body = _send(client, handle).json()
        assert body["delivery"]["status"] == "delivered"
        assert body["delivery"]["delivered_at"]
        assert body["delivery"]["retryable"] is True

    def test_transport_failure_is_honest_and_content_free(
            self, client: TestClient, ui_auth: dict, steering_ready,
            monkeypatch):
        def boom(item):
            raise RuntimeError(PROMPT_SENTINEL)  # hostile: text in exc str

        monkeypatch.setattr(kora_relay, "transport", boom)
        handle = _ingest_session(client, ui_auth, "kora-s3-dlf",
                                 "sess_dlf", steerable=True)
        body = _send(client, handle).json()
        assert body["delivery"]["status"] == "failed"
        # the exception STRING never rides the error line — type name only
        assert body["delivery"]["error"] == \
            "relay transport error: RuntimeError"
        assert PROMPT_SENTINEL not in body["delivery"]["error"]

    def test_queue_items_never_expose_text(self, client: TestClient,
                                           ui_auth: dict, steering_ready):
        handle = _ingest_session(client, ui_auth, "kora-s3-expose",
                                 "sess_expose", steerable=True)
        _send(client, handle, PROMPT_SENTINEL)
        for view in kora_relay.queue_snapshot():
            assert set(view) == {"status", "queued_at", "delivered_at",
                                 "retryable", "error"}
            assert PROMPT_SENTINEL not in str(view)


# ============================================== create: honest 501 boundary
class TestCreateSessionHonestLimit:
    """POST /api/kora/sessions: every gate runs; the spawn tail answers
    the honest 501 and NO phantom registry row is created (the brief's
    «честная 501 … НЕ притворство»)."""

    def test_full_gates_then_501_no_phantom_row(
            self, client: TestClient, app_module, steering_ready):
        executor_id, _h = _register_executor(client, _ui_headers(),
                                             "kora-s3-cr")
        before = len(client.get("/api/kora/sessions",
                                headers=_ui_headers()).json()["items"])
        payload = {"executor_id": executor_id, "project": "vesma",
                   "prompt": PROMPT_SENTINEL}
        resp = _create(client, payload)
        assert resp.status_code == 501, resp.text
        detail = resp.json()["detail"]
        assert "relay" in detail and "spawn" in detail
        after = len(client.get("/api/kora/sessions",
                               headers=_ui_headers()).json()["items"])
        assert after == before, "no phantom registry row"
        assert len(kora_relay.queue_snapshot()) == 0

    def test_create_validates_executor(self, client: TestClient,
                                       steering_ready):
        """The frozen contract declares create's 400 as the KoraErrorOut
        envelope (code `validation`) — never the bare {detail} FastAPI
        wrapper (byte-pinned like test_wrong_pin)."""
        resp = _create(client, {"executor_id": "ghost", "project": "p",
                                "prompt": "x"})
        assert resp.status_code == 400
        body = resp.json()
        assert body == {"ok": False, "code": "validation",
                        "message": body["message"]}
        assert "unknown executor" in body["message"]

    def test_create_rejects_unapproved_executor(self, client: TestClient,
                                                steering_ready):
        """The second 400 leg (only `unknown` was pinned before): an
        enrolled but not-approved executor cannot host a relay session —
        the same frozen validation envelope."""
        resp = client.post(
            "/api/executors", headers=MACHINE_HEADERS,
            json={"name": "kora-s3-pend", "harness": "zcode",
                  "host": "kora-s3-pend.test-host"})
        assert resp.status_code == 201, resp.text
        executor_id = resp.json()["executor"]["id"]
        resp = _create(client, {"executor_id": executor_id, "project": "p",
                                "prompt": "x"})
        assert resp.status_code == 400, resp.text
        body = resp.json()
        assert body == {"ok": False, "code": "validation",
                        "message": body["message"]}
        assert executor_id in body["message"]
        assert "approved" in body["message"]

    def test_create_host_conflict_is_loud_409(self, client: TestClient,
                                              ui_auth: dict, app_module,
                                              steering_ready):
        """Security gate 6, create leg (was uncovered): a duplicated
        host answers the loud 409 BEFORE the spawn boundary, the audit
        row says host_conflict, and the frozen message survives intact
        («отвечает» — the UTF-8 corruption regression is pinned here)."""
        executor_id, _h = _register_executor(client, ui_auth,
                                             "kora-s3-chc-a")
        other_id, _h2 = _register_executor(client, ui_auth, "kora-s3-chc-b",
                                           host="kora-s3-chc-a.test-host")
        cursor = app_module.store.last_event_id()
        resp = _create(client, {"executor_id": executor_id,
                                "project": "vesma", "prompt": "x"})
        assert resp.status_code == 409, resp.text
        body = resp.json()
        assert body["code"] == "host_conflict"
        assert other_id in body["message"], "conflict named loudly"
        assert "отвечает" in body["message"]
        rows = _kora_audit(app_module, {"kora.session.create"}, cursor)
        assert len(rows) == 1
        payload = rows[0]["payload"]
        assert payload["outcome"] == "host_conflict"
        # gate-3 hygiene: the client-named project rides hash+length only
        assert "project" not in payload
        assert payload["project_len"] == len("vesma".encode("utf-8"))
        assert len(payload["project_sha256"]) == 64
        assert "vesma" not in str(payload)

    def test_create_requires_step_up_first(self, client: TestClient):
        resp = _create(client, {"executor_id": "ghost", "project": "p",
                                "prompt": "x"})
        assert resp.status_code == 403
        assert resp.json()["code"] == "step_up_required"

    def test_create_body_frozen_shape(self, client: TestClient,
                                      steering_ready):
        for body in ({"executor_id": "e", "project": "p"},           # no prompt
                     {"executor_id": "e", "prompt": "x"},            # no project
                     {"executor_id": "e", "project": "p", "prompt": "x",
                      "mode": "yolo"}):                              # extra
            resp = _create(client, body)
            assert resp.status_code == 422, body.keys()


# ============================================ confirm/yolo mode (ADR rev.2 4)
class TestConfirmYolo:
    """confirm is the default; yolo is a relay-origin opt-in whose WIRE
    does not exist in this slice (frozen contract carries no route) —
    the resolver + invariant are pinned, nothing pretends."""

    def test_resolver_defaults_confirm(self):
        assert kora_relay.session_mode("s1", "local") == "confirm"
        assert kora_relay.session_mode("s1", "relay") == "confirm"

    def test_yolo_requires_relay_origin(self):
        assert kora_relay.set_yolo_opt_in("s1", "local") is False
        assert kora_relay.session_mode("s1", "local") == "confirm"
        assert kora_relay.set_yolo_opt_in("s2", "relay") is True
        assert kora_relay.session_mode("s2", "relay") == "yolo"
        # the origin is re-checked at resolve time, never trusted from
        # the opt-in itself
        assert kora_relay.session_mode("s2", "local") == "confirm"

    def test_clear_yolo(self):
        kora_relay.set_yolo_opt_in("s3", "relay")
        kora_relay.clear_yolo_opt_in("s3")
        assert kora_relay.session_mode("s3", "relay") == "confirm"

    def test_no_wire_flips_confirm_required(self, client: TestClient,
                                            ui_auth: dict, steering_ready):
        handle = _ingest_session(client, ui_auth, "kora-s3-yolo",
                                 "sess_yolo", origin="relay")
        resp = _send(client, handle)
        assert resp.status_code == 202
        assert resp.json()["confirm_required"] is True


# ============================================== log / audit hygiene (gate 3)
class TestLogHygiene:
    """Audits carry statuses/ids + sha256/length — never prompt text,
    never PIN material, never tokens (ADR gate 3 + the brief's hard
    edge)."""

    def test_prompt_never_leaks_to_logs_responses_or_audits(
            self, client: TestClient, app_module, steering_ready, caplog):
        handle = _ingest_session(client, ui_auth := _ui_headers(),
                                 "kora-s3-log", "sess_log", steerable=True)
        cursor = app_module.store.last_event_id()
        import logging
        with caplog.at_level(logging.DEBUG):
            resp = _send(client, handle, PROMPT_SENTINEL)
            assert resp.status_code == 202
            resp2 = _stepup(client, pin=PIN_SENTINEL)  # wrong-PIN attempt
            assert resp2.status_code in (403, 429)
        assert resp.status_code == 202
        serialized = resp.text
        assert PROMPT_SENTINEL not in serialized
        for record in caplog.records:
            blob = str(record.getMessage()) + str(record.args)
            assert PROMPT_SENTINEL not in blob
            assert PIN_SENTINEL not in blob
            assert UI_TOKEN not in blob
            assert BOARD_TOKEN not in blob
        rows = _kora_audit(app_module, {"kora.session.steer"}, cursor)
        assert len(rows) == 1
        payload = rows[0]["payload"]
        assert payload["prompt_len"] == len(PROMPT_SENTINEL.encode("utf-8"))
        assert len(payload["prompt_sha256"]) == 64
        assert PROMPT_SENTINEL not in str(payload)
        assert {"session_id", "executor_id", "native_id",
                "session_host", "network_path", "delivery_status"} \
            <= set(payload)
        # content keys never ride the audit
        assert not ({"content", "text", "prompt", "preview"} & set(payload))

    def test_pin_audits_carry_no_pin_material(self, client: TestClient,
                                              app_module, caplog):
        import logging
        kora_relay.configure_steering_pin(TEST_PIN)
        cursor = app_module.store.last_event_id()
        with caplog.at_level(logging.DEBUG):
            assert _stepup(client, pin=WRONG_PIN).status_code == 403
            assert _stepup(client).status_code == 200
            assert _revoke(client).status_code == 204
        rows = _kora_audit(app_module, {"kora.steering.step_up"}, cursor)
        assert [r["payload"]["outcome"] for r in rows] == \
            ["denied", "granted", "revoked"]
        for row in rows:
            blob = str(row["payload"])
            assert WRONG_PIN not in blob and TEST_PIN not in blob
            assert "pin" not in row["payload"]
        for record in caplog.records:
            blob = str(record.getMessage()) + str(record.args)
            assert TEST_PIN not in blob and WRONG_PIN not in blob

    def test_pin_verifier_is_never_plaintext(self):
        """Pinned security edge — checked by the ENVELOPE STRUCTURE, not
        by substring containment (a short PIN as a bare ``in`` check
        collides stochastically with the random hex of salt/digest).
        Grammar: ``scrypt$N$r$p$<salthex>$<hashhex>`` — all fields
        present and well-formed, the plaintext survives as no token of
        the envelope, and the envelope still VERIFIES the plaintext."""
        kora_relay.configure_steering_pin(TEST_PIN)
        verifier = kora_relay._pin_verifier
        assert verifier is not None
        assert verifier.startswith("scrypt$")
        algo, n_s, r_s, p_s, salt_hex, key_hex = verifier.split("$")
        assert algo == "scrypt"
        assert all(part.isdigit() for part in (n_s, r_s, p_s))
        assert int(n_s) >= 1024 and int(r_s) >= 1 and int(p_s) >= 1
        assert len(bytes.fromhex(salt_hex)) == 16      # 128-bit salt
        assert len(bytes.fromhex(key_hex)) == 32       # 256-bit digest
        assert TEST_PIN not in (algo, n_s, r_s, p_s, salt_hex, key_hex)
        assert not any(part.startswith(TEST_PIN)
                       for part in (n_s, r_s, p_s, salt_hex, key_hex))
        assert kora_relay.verify_password(TEST_PIN, verifier)
        kora_relay.configure_steering_pin(None)
        assert kora_relay._pin_verifier is None

    def test_pin_rotation_kills_the_grant(self, client: TestClient):
        kora_relay.configure_steering_pin(TEST_PIN)
        assert _stepup(client).status_code == 200
        kora_relay.configure_steering_pin("5555")
        assert _status(client).json()["active"] is False

    def test_stepup_attempt_audited_without_material(
            self, client: TestClient, app_module):
        kora_relay.configure_steering_pin(TEST_PIN)
        cursor = app_module.store.last_event_id()
        assert _stepup(client, pin=WRONG_PIN).status_code == 403
        rows = _kora_audit(app_module, {"kora.steering.step_up"}, cursor)
        assert rows[0]["payload"]["outcome"] == "denied"

    def test_create_attempt_leaves_falsifiable_trace(
            self, client: TestClient, ui_auth: dict, app_module,
            steering_ready):
        """North-Star falsifiability: even the unavailable-spawn attempt
        leaves a checkable audit row (hash + length, no text)."""
        executor_id, _h = _register_executor(client, ui_auth,
                                             "kora-s3-trace")
        cursor = app_module.store.last_event_id()
        assert _create(client, {"executor_id": executor_id,
                                "project": "vesma",
                                "prompt": PROMPT_SENTINEL}).status_code == 501
        rows = _kora_audit(app_module, {"kora.session.create"}, cursor)
        assert len(rows) == 1
        payload = rows[0]["payload"]
        assert payload["outcome"] == "unavailable_relay_transport"
        assert payload["prompt_len"] == len(PROMPT_SENTINEL.encode("utf-8"))
        assert len(payload["prompt_sha256"]) == 64
        assert PROMPT_SENTINEL not in str(payload)
        # gate-3 hygiene: the client-named project rides hash+length
        # only — falsifiability preserved, the raw string never logs
        assert payload["project_len"] == len("vesma".encode("utf-8"))
        assert len(payload["project_sha256"]) == 64
        assert "project" not in payload
        assert "vesma" not in str(payload)


# ============================================ the live spec carries the delta
@pytest.fixture(scope="module")
def live_spec(client) -> dict:
    r = client.get("/openapi.json")
    assert r.status_code == 200
    return r.json()


class TestLiveOpenApiDelta:
    """The FastAPI /openapi.json gains exactly the slice-3 routes and
    request schemas (gate 2: snapshot diff = additive only)."""

    def test_routes_present(self, live_spec):
        assert "post" in live_spec["paths"]["/api/kora/sessions"]
        post = live_spec["paths"]["/api/kora/sessions/{session_id}/messages"]
        assert "post" in post
        step = live_spec["paths"]["/api/kora/steering/step-up"]
        assert {"post", "get", "delete"} <= set(step)

    def test_request_schemas_present(self, live_spec):
        schemas = live_spec["components"]["schemas"]
        for name in ("KoraSessionCreate", "KoraMessageCreate",
                     "KoraStepUpIn"):
            assert name in schemas

    def test_message_body_declares_32k_freeze(self, live_spec):
        schema = live_spec["components"]["schemas"]["KoraMessageCreate"]
        assert schema["properties"]["text"]["maxLength"] == 32000
        assert schema.get("additionalProperties") is False
