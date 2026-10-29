"""Kora relay transport tests (ADR 0019 rev.2 #3, line A1).

Layers:
1. OUTBOX HANDOFF (server/kora/relay_transport.py): the seam parks a
   delivery for a relay-capable executor (honest «queued»), answers the
   honest failed/retryable for everyone else (capability default OFF);
   pickup is FIFO and carries the injection material; confirm settles
   through the queue's own state machine; ingest binding on confirm.
2. ROUTES: pickup/confirm are executor-token ONLY (the machine token is
   REFUSED — steering prompts are ui-class content and agent children
   hold the machine token), identity-bound, approved-only; audits carry
   counts and verdicts, never content.
3. INTEGRATION (the line's gate): board test contour + a fake executor
   client — prompt passes the queue → the seam parks it → pickup →
   (fake) injection → confirm → the delivery is honestly `delivered`;
   a dead session still fails non-retryable before the handoff.
4. THE UNIT DRIVER (scripts/kora/relay_unit.py): delivered/failed
   classification against FAKE harness binaries, the argv hygiene pin
   (prompt on stdin, NEVER in argv), the per-session writer mutex, and
   the bounded confirm-retry discipline.

Relay state is module-global: every test runs under a fixture that
resets the queue/grants and RE-INSTALLS the bridge exactly as app.py
does at boot.
"""

from __future__ import annotations

import json
import os
import textwrap
import threading
import uuid
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from conftest import BOARD_TOKEN, UI_TOKEN, get_app_module

from server.kora import relay as kora_relay
from server.kora import relay_transport

TEST_PIN = "43214321"      # synthetic ritual PIN — never a real secret
PROMPT_SENTINEL = "RELAY-TRANSPORT-PROMPT-7301-секрет"


def _ui_headers() -> dict:
    app_module = get_app_module()
    effective = app_module.UI_WRITE_TOKEN or app_module.BOARD_WRITE_TOKEN
    return {"Authorization": f"Bearer {effective}"}


@pytest.fixture(autouse=True)
def fresh_relay_bridge(app_module, monkeypatch):
    """Clean queue/grants/outbox per test; the bridge is re-installed
    exactly like app.py at boot (store lookups injected)."""
    from server.security import RateLimiter
    kora_relay.reset_all()
    kora_relay.configure_steering_pin(None)
    relay_transport.uninstall()
    app_module.kora_relay_transport.install(
        app_module.store.get_executor,
        lookup_session=app_module.store.kora_session)
    for lim_name, limit_name, window_name in (
            ("_kora_steer_limiter", "_KORA_STEER_RATE_LIMIT",
             "_KORA_STEER_RATE_WINDOW"),
            ("_kora_stepup_limiter", "_KORA_STEPUP_RATE_LIMIT",
             "_KORA_STEPUP_RATE_WINDOW"),
            ("_kora_relay_limiter", "_KORA_RELAY_RATE_LIMIT",
             "_KORA_RELAY_RATE_WINDOW"),
            ("_kora_scan_limiter", "_KORA_SCAN_RATE_LIMIT",
             "_KORA_SCAN_RATE_WINDOW"),
            ("_executor_register_limiter", "_EXECUTOR_REGISTER_RATE_LIMIT",
             "_EXECUTOR_REGISTER_RATE_WINDOW")):
        monkeypatch.setattr(app_module, lim_name, RateLimiter(
            limit=getattr(app_module, limit_name),
            window=getattr(app_module, window_name)))
    yield
    relay_transport.uninstall()
    kora_relay.reset_all()
    kora_relay.configure_steering_pin(None)


@pytest.fixture()
def steering_ready():
    kora_relay.configure_steering_pin(TEST_PIN)
    grant = kora_relay.step_up_enable(TEST_PIN)
    assert grant is not None


_EXECUTOR_CACHE: dict[str, tuple[str, dict]] = {}


def _register_executor(client: TestClient, ui_auth: dict, name: str,
                       *, capability: bool = True,
                       host: str | None = None) -> tuple[str, dict]:
    """Register + approve (+ optional session-relay capability); returns
    (id, secret-headers). Cached per name (UNIQUE host discipline — the
    slice-3 precedent)."""
    key = f"{name}:{capability}:{host}"
    if key in _EXECUTOR_CACHE:
        return _EXECUTOR_CACHE[key]
    resp = client.post(
        "/api/executors", headers={"Authorization": f"Bearer {BOARD_TOKEN}"},
        json={"name": name, "harness": "zcode",
              "host": host or f"{name}.test-host"})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    executor_id = body["executor"]["id"]
    patch: dict = {"state": "approved"}
    if capability:
        patch["capabilities"] = ["session-relay"]
    resp = client.patch(f"/api/executors/{executor_id}", headers=ui_auth,
                        json=patch)
    assert resp.status_code == 200, resp.text
    headers = {"Authorization": f"Bearer {body['executor_secret']}"}
    _EXECUTOR_CACHE[key] = (executor_id, headers)
    return executor_id, headers


def _ingest_session(client: TestClient, ui_auth: dict, executor_id: str,
                    exec_headers: dict, native_id: str, *,
                    state: str = "live", cwd: str = "/p") -> str:
    resp = client.post(
        f"/api/executors/{executor_id}/kora-scan", headers=exec_headers,
        json={"sessions": [{"native_id": native_id, "harness": "zcode",
                            "project": "p", "cwd": cwd, "state": state,
                            "origin": "local", "steerable": True}]})
    assert resp.status_code == 200, resp.text
    return f"{executor_id}:{native_id}"


def _send(client: TestClient, session_id: str,
          text: str = PROMPT_SENTINEL) -> httpx.Response:
    return client.post(f"/api/kora/sessions/{session_id}/messages",
                       headers=_ui_headers(), json={"text": text})


# =========================================================== outbox handoff
class TestOutboxHandoff:
    """The seam: park for the capable, honest failure for the rest."""

    def test_capable_executor_parks_queued(self, client, ui_auth,
                                            steering_ready):
        app_module = get_app_module()
        executor_id, exec_h = _register_executor(client, ui_auth,
                                                 "kora-rt-cap")
        handle = _ingest_session(client, ui_auth, executor_id, exec_h,
                                 "sess_cap")
        resp = _send(client, handle)
        assert resp.status_code == 202, resp.text
        delivery = resp.json()["delivery"]
        assert delivery["status"] == "queued"   # parked, honest
        assert delivery["delivered_at"] is None
        snap = relay_transport.outbox_snapshot()
        assert snap["pending_by_executor"] == {executor_id: 1}
        # pending bounds count parked items (the 429 protection lives)
        assert len(kora_relay.queue_snapshot()) == 1
        assert app_module.store is not None

    def test_no_capability_fails_retryable_honestly(
            self, client, ui_auth, steering_ready):
        executor_id, exec_h = _register_executor(client, ui_auth,
                                                 "kora-rt-nocap",
                                                 capability=False)
        handle = _ingest_session(client, ui_auth, executor_id, exec_h,
                                 "sess_nocap")
        resp = _send(client, handle)
        assert resp.status_code == 202
        delivery = resp.json()["delivery"]
        assert delivery["status"] == "failed"
        assert delivery["retryable"] is True
        assert "повторите" in delivery["error"]
        assert "session-relay" in delivery["error"]
        assert PROMPT_SENTINEL not in delivery["error"]
        assert relay_transport.outbox_snapshot()[
            "pending_by_executor"] == {}

    def test_pickup_is_fifo_and_carries_material(self, client, ui_auth,
                                                 steering_ready):
        executor_id, exec_h = _register_executor(client, ui_auth,
                                                 "kora-rt-fifo")
        handle = _ingest_session(client, ui_auth, executor_id, exec_h,
                                 "sess_fifo", cwd="/proj/dir")
        assert _send(client, handle, "first").status_code == 202
        assert _send(client, handle, "second").status_code == 202
        items = relay_transport.pickup(executor_id, 10)
        assert [i["text"] for i in items] == ["first", "second"]
        assert items[0]["native_id"] == "sess_fifo"
        assert items[0]["cwd"] == "/proj/dir"
        assert items[0]["mode"] == "confirm"
        assert items[0]["confirm_required"] is True
        assert items[0]["session_id"] == handle
        assert len(items[0]["text_sha256"]) == 64
        # picked items moved out of pending into the in-flight window
        assert relay_transport.outbox_snapshot() == {
            "pending_by_executor": {}, "inflight": 2}

    def test_confirm_delivered_settles_honestly(self, client, ui_auth,
                                                steering_ready):
        executor_id, exec_h = _register_executor(client, ui_auth,
                                                 "kora-rt-ok")
        handle = _ingest_session(client, ui_auth, executor_id, exec_h,
                                 "sess_ok")
        assert _send(client, handle).status_code == 202
        (item,) = relay_transport.pickup(executor_id, 10)
        assert relay_transport.confirm(executor_id, item["delivery_id"],
                                       "delivered", None, True) is True
        (view,) = kora_relay.queue_snapshot()
        assert view["status"] == "delivered"
        assert view["delivered_at"]
        assert view["error"] is None

    def test_confirm_failed_retryable_carries_error(self, client, ui_auth,
                                                    steering_ready):
        executor_id, exec_h = _register_executor(client, ui_auth,
                                                 "kora-rt-fail")
        handle = _ingest_session(client, ui_auth, executor_id, exec_h,
                                 "sess_fail")
        assert _send(client, handle).status_code == 202
        (item,) = relay_transport.pickup(executor_id, 10)
        assert relay_transport.confirm(
            executor_id, item["delivery_id"], "failed",
            "harness exited rc=1", True) is True
        (view,) = kora_relay.queue_snapshot()
        assert view["status"] == "failed"
        assert view["retryable"] is True
        assert view["error"] == "harness exited rc=1"

    def test_confirm_ingest_binding_executor_match(self, client, ui_auth,
                                                   steering_ready):
        """ADR gate 1 ingest leg: only the executor the item was parked
        under may confirm it."""
        executor_id, exec_h = _register_executor(client, ui_auth,
                                                 "kora-rt-bind")
        other_id, _other_h = _register_executor(client, ui_auth,
                                                "kora-rt-bind-b",
                                                host="kora-rt-bind-b.test-h")
        handle = _ingest_session(client, ui_auth, executor_id, exec_h,
                                 "sess_bind")
        assert _send(client, handle).status_code == 202
        (item,) = relay_transport.pickup(executor_id, 10)
        assert relay_transport.confirm(other_id, item["delivery_id"],
                                       "delivered", None, True) is False
        # the item is still in flight, unsettled
        assert kora_relay.queue_snapshot()[0]["status"] == "queued"

    def test_confirm_unknown_delivery_is_honest_false(self, client,
                                                      ui_auth,
                                                      steering_ready):
        executor_id, _exec_h = _register_executor(client, ui_auth,
                                                  "kora-rt-unk")
        assert relay_transport.confirm(executor_id, "d" * 32, "delivered",
                                       None, True) is False

    def test_stale_pending_sweeps_failed_retryable(self, client, ui_auth,
                                                   steering_ready,
                                                   monkeypatch):
        """A parked item nobody picks up must not hold the bounds
        forever — the TTL resolves it failed/retryable («не забрал —
        повторите»)."""
        monkeypatch.setattr(relay_transport, "PENDING_TTL_SECONDS", 0)
        executor_id, exec_h = _register_executor(client, ui_auth,
                                                 "kora-rt-stale")
        handle = _ingest_session(client, ui_auth, executor_id, exec_h,
                                 "sess_stale")
        assert _send(client, handle).status_code == 202
        items = relay_transport.pickup(executor_id, 10)
        assert items == []   # swept on the next pickup tick
        (view,) = kora_relay.queue_snapshot()
        assert view["status"] == "failed"
        assert view["retryable"] is True
        assert "повторите" in view["error"]
        assert relay_transport.outbox_snapshot() == {
            "pending_by_executor": {}, "inflight": 0}

    def test_stale_inflight_sweeps_unconfirmed(self, client, ui_auth,
                                               steering_ready, monkeypatch):
        """A picked-up item the unit never confirms (unit died) resolves
        honestly too — unconfirmed ≠ not delivered, the message says
        exactly that."""
        monkeypatch.setattr(relay_transport, "INFLIGHT_TTL_SECONDS", 0)
        executor_id, exec_h = _register_executor(client, ui_auth,
                                                 "kora-rt-infl")
        handle = _ingest_session(client, ui_auth, executor_id, exec_h,
                                 "sess_infl")
        assert _send(client, handle).status_code == 202
        (item,) = relay_transport.pickup(executor_id, 10)
        relay_transport.pickup(executor_id, 10)   # the sweep tick
        (view,) = kora_relay.queue_snapshot()
        assert view["status"] == "failed"
        assert view["retryable"] is True
        assert "не отчиталось" in view["error"]

    def test_invalid_status_is_rejected(self):
        from server.kora.relay_transport import RelayTransportError
        with pytest.raises(RelayTransportError):
            relay_transport.confirm("exec-x", "d" * 32, "maybe", None, True)


# ================================================================= routes
class TestRelayRoutes:
    """The class boundary: executor token ONLY, identity-bound."""

    def test_pickup_requires_executor_token_401(self, client):
        resp = client.post("/api/executors/ex-x/kora-relay/pickup",
                           headers={"Authorization": f"Bearer {BOARD_TOKEN}"})
        assert resp.status_code == 401
        assert "machine token must not read owner prompts" in \
            resp.json()["detail"]

    def test_pickup_anonymous_401(self, client):
        assert client.post(
            "/api/executors/ex-x/kora-relay/pickup").status_code == 401

    def test_confirm_machine_token_401(self, client):
        resp = client.post(
            "/api/executors/ex-x/kora-relay/confirm",
            headers={"Authorization": f"Bearer {BOARD_TOKEN}"},
            json={"delivery_id": "d" * 32, "status": "delivered"})
        assert resp.status_code == 401

    def test_pickup_identity_mismatch_403(self, client, ui_auth):
        _executor_id, exec_h = _register_executor(client, ui_auth,
                                                  "kora-rt-id-a")
        other_id, _other_h = _register_executor(client, ui_auth,
                                                "kora-rt-id-b",
                                                host="kora-rt-id-b.test-h")
        resp = client.post(f"/api/executors/{other_id}/kora-relay/pickup",
                           headers=exec_h)
        assert resp.status_code == 403
        assert "token identity" in resp.json()["detail"]

    def test_pickup_pending_executor_403(self, client, ui_auth):
        resp = client.post(
            "/api/executors",
            headers={"Authorization": f"Bearer {BOARD_TOKEN}"},
            json={"name": "kora-rt-pend", "harness": "zcode",
                  "host": "kora-rt-pend.test-host"})
        executor_id = resp.json()["executor"]["id"]
        secret = resp.json()["executor_secret"]
        resp = client.post(f"/api/executors/{executor_id}/kora-relay/pickup",
                           headers={"Authorization": f"Bearer {secret}"})
        assert resp.status_code == 403
        assert "approved" in resp.json()["detail"]

    def test_pickup_empty_and_limit_clamp(self, client, ui_auth):
        executor_id, exec_h = _register_executor(client, ui_auth,
                                                 "kora-rt-empty")
        resp = client.post(f"/api/executors/{executor_id}/kora-relay/pickup",
                           headers=exec_h, params={"limit": 999})
        assert resp.status_code == 200
        assert resp.json() == {"ok": True, "items": []}

    def test_confirm_body_frozen_shape(self, client, ui_auth):
        executor_id, exec_h = _register_executor(client, ui_auth,
                                                 "kora-rt-shape")
        for body in ({"delivery_id": "d" * 32},                     # no status
                     {"delivery_id": "d" * 32, "status": "maybe"},
                     {"delivery_id": "short", "status": "delivered"},
                     {"delivery_id": "d" * 32, "status": "delivered",
                      "extra": 1}):
            resp = client.post(
                f"/api/executors/{executor_id}/kora-relay/confirm",
                headers=exec_h, json=body)
            assert resp.status_code == 422, body.keys()

    def test_confirm_oversized_body_413_pre_parse(self, client, ui_auth):
        """The SEC-W5-1 shape: a declared oversized body is refused
        before the body is read (the guard lives inside the handler)."""
        executor_id, exec_h = _register_executor(client, ui_auth,
                                                 "kora-rt-413")
        resp = client.post(
            f"/api/executors/{executor_id}/kora-relay/confirm",
            headers={**exec_h, "Content-Length": str(64 * 1024)},
            json={"delivery_id": "d" * 32, "status": "delivered"})
        assert resp.status_code == 413

    def test_route_audits_carry_no_content(self, client, ui_auth,
                                           steering_ready, app_module):
        executor_id, exec_h = _register_executor(client, ui_auth,
                                                 "kora-rt-audit")
        handle = _ingest_session(client, ui_auth, executor_id, exec_h,
                                 "sess_audit")
        assert _send(client, handle).status_code == 202
        cursor = app_module.store.last_event_id()
        # the audit lives on the ROUTE — pick up over the real HTTP
        # surface, exactly as the unit does
        picked = client.post(
            f"/api/executors/{executor_id}/kora-relay/pickup",
            headers=exec_h).json()["items"]
        assert len(picked) == 1
        resp = client.post(
            f"/api/executors/{executor_id}/kora-relay/confirm",
            headers=exec_h,
            json={"delivery_id": picked[0]["delivery_id"],
                  "status": "delivered"})
        assert resp.status_code == 200
        rows = [e for e in app_module.store.events(cursor, limit=50)
                if e["kind"] in ("kora.relay.pickup", "kora.relay.confirm")]
        kinds = [r["kind"] for r in rows]
        assert kinds == ["kora.relay.pickup", "kora.relay.confirm"]
        assert rows[0]["payload"]["count"] == 1
        assert rows[1]["payload"]["status"] == "delivered"
        assert rows[1]["payload"]["resolved"] is True
        # content keys never ride the transport audits
        for row in rows:
            assert not ({"content", "text", "prompt", "preview"}
                        & set(row["payload"]))
            assert PROMPT_SENTINEL not in str(row["payload"])


# ============================================================ integration
class TestIntegrationEndToEnd:
    """The line's gate: queue → seam → pickup → (fake) inject → confirm
    → delivered; dead sessions never reach the transport."""

    def test_full_delivery_path(self, client, ui_auth, steering_ready):
        executor_id, exec_h = _register_executor(client, ui_auth,
                                                 "kora-rt-e2e")
        handle = _ingest_session(client, ui_auth, executor_id, exec_h,
                                 "sess_e2e", cwd="/e2e")
        resp = _send(client, handle)
        assert resp.status_code == 202
        assert resp.json()["delivery"]["status"] == "queued"
        assert resp.json()["confirm_required"] is True

        # the fake executor client rides the real HTTP surface
        picked = client.post(
            f"/api/executors/{executor_id}/kora-relay/pickup",
            headers=exec_h).json()["items"]
        assert len(picked) == 1
        assert picked[0]["text"] == PROMPT_SENTINEL
        assert picked[0]["cwd"] == "/e2e"

        # the unit's verdict closes the state machine
        confirmed = client.post(
            f"/api/executors/{executor_id}/kora-relay/confirm",
            headers=exec_h,
            json={"delivery_id": picked[0]["delivery_id"],
                  "status": "delivered"})
        assert confirmed.json() == {"ok": True, "resolved": True}
        (view,) = kora_relay.queue_snapshot()
        assert view["status"] == "delivered"
        assert view["delivered_at"]

    def test_dead_session_fails_non_retryable_before_handoff(
            self, client, ui_auth, steering_ready):
        """Even with the transport INSTALLED, a dead session resolves
        failed non-retryable at the board (the honest pre-transport
        gate) and nothing is parked."""
        executor_id, exec_h = _register_executor(client, ui_auth,
                                                 "kora-rt-dead")
        handle = _ingest_session(client, ui_auth, executor_id, exec_h,
                                 "sess_dead_rt", state="dead")
        resp = _send(client, handle)
        assert resp.status_code == 202
        delivery = resp.json()["delivery"]
        assert delivery["status"] == "failed"
        assert delivery["retryable"] is False
        assert relay_transport.outbox_snapshot() == {
            "pending_by_executor": {}, "inflight": 0}

    def test_failed_delivery_repeat_is_a_new_send(self, client, ui_auth,
                                                  steering_ready):
        """«повторите» semantics: the second send is a deliberate new
        queue entry (no client idempotency key is invented)."""
        executor_id, exec_h = _register_executor(client, ui_auth,
                                                 "kora-rt-rep")
        handle = _ingest_session(client, ui_auth, executor_id, exec_h,
                                 "sess_rep")
        assert _send(client, handle, "one").json()["delivery"][
            "status"] == "queued"
        (item,) = relay_transport.pickup(executor_id, 10)
        assert relay_transport.confirm(executor_id, item["delivery_id"],
                                       "failed", "harness exited rc=1",
                                       True) is True
        second = _send(client, handle, "one")
        assert second.status_code == 202
        assert second.json()["delivery"]["status"] == "queued"


# ====================================================== the unit driver
def _write_fake_harness(tmp_path: Path, *, rc_script: str = "exit 0",
                        name: str = "fake-harness.sh") -> Path:
    """A fake harness: dumps argv and stdin to files the test reads, then
    follows the rc script. The prompt must NEVER appear in argv."""
    script = tmp_path / name
    script.write_text(textwrap.dedent(f"""\
        #!/bin/sh
        printf '%s\\n' "$@" > "$FAKE_ARGV_FILE"
        cat > "$FAKE_STDIN_FILE"
        {rc_script}
        """))
    script.chmod(0o755)
    return script


class DriverHarness:
    """ZcodeStdinDriver over a fake command + captured argv/stdin."""

    def __init__(self, tmp_path: Path, *, grace: float = 0.5,
                 lock_wait: float = 2.0, rc_script: str = "exit 0"):
        from scripts.kora.relay_unit import AuditLog, DriverConfig, \
            ZcodeStdinDriver
        self.argv_file = tmp_path / "argv.txt"
        self.stdin_file = tmp_path / "stdin.txt"
        # the fake harness reads its dump targets from the env it
        # inherits from this process (the driver spawns with inherited
        # env — that is exactly the channel under test for argv/stdin
        # hygiene)
        os.environ["FAKE_ARGV_FILE"] = str(self.argv_file)
        os.environ["FAKE_STDIN_FILE"] = str(self.stdin_file)
        self.script = _write_fake_harness(tmp_path, rc_script=rc_script)
        self.config = DriverConfig(harness="zcode-stdin",
                                   command=("sh", str(self.script)))
        self.audit = AuditLog(tmp_path / "audit.jsonl")
        self.driver = ZcodeStdinDriver(self.config, grace, lock_wait,
                                       self.audit)

    def command(self, native_id: str = "sess_x", text: str = PROMPT_SENTINEL,
                mode: str = "confirm", cwd: str = "/proj") -> object:
        from scripts.kora.relay_unit import SteeringCommand
        return SteeringCommand(delivery_id=uuid.uuid4().hex,
                               session_id=f"ex-1:{native_id}",
                               native_id=native_id, mode=mode,
                               confirm_required=True, text=text, cwd=cwd)


class TestZcodeStdinDriver:
    def test_fast_exit_zero_is_delivered(self, tmp_path):
        h = DriverHarness(tmp_path)
        result = h.driver.inject(h.command())
        assert result.delivered is True
        assert h.stdin_file.read_text() == PROMPT_SENTINEL

    def test_argv_hygiene_prompt_never_in_argv(self, tmp_path):
        """THE pin (ADR gate 3): the prompt rides stdin only — no argv
        slot, and the sanctioned flags are present."""
        h = DriverHarness(tmp_path)
        h.driver.inject(h.command(native_id="sess_argv", mode="yolo",
                                  cwd=str(tmp_path)))
        argv = h.argv_file.read_text()
        assert "--resume" in argv and "sess_argv" in argv
        assert "--prompt=-" in argv
        assert "--json" in argv
        assert "--mode" in argv and "yolo" in argv
        assert "--cwd" in argv and str(tmp_path) in argv
        assert PROMPT_SENTINEL not in argv
        assert h.stdin_file.read_text() == PROMPT_SENTINEL

    def test_session_not_found_is_failed_non_retryable(self, tmp_path):
        h = DriverHarness(tmp_path, rc_script='echo "Error: Session not '
                                             'found: sess_x" >&2; exit 1')
        result = h.driver.inject(h.command())
        assert result.delivered is False
        assert result.retryable is False
        assert "unknown session" in result.error
        assert PROMPT_SENTINEL not in result.error

    def test_generic_exit_is_failed_retryable_content_free(self, tmp_path):
        h = DriverHarness(tmp_path, rc_script='echo PROMPT_SENTINEL >&2; '
                                             'exit 7')
        result = h.driver.inject(h.command())
        assert result.delivered is False
        assert result.retryable is True
        assert result.error == "harness exited rc=7"
        # the raw harness stderr never rides the verdict (echo defense)
        assert PROMPT_SENTINEL not in result.error

    def test_alive_past_grace_is_delivered_and_lock_released_on_exit(
            self, tmp_path):
        h = DriverHarness(tmp_path, grace=0.2,
                          rc_script="sleep 0.6; exit 0")
        result = h.driver.inject(h.command(native_id="sess_slow"))
        assert result.delivered is True
        # the writer mutex is still held while the turn runs...
        probe = h.driver._lock_for("sess_slow")
        assert probe.locked() is True
        # ...and the watcher releases it when the child exits
        deadline = __import__("time").monotonic() + 3.0
        while probe.locked() and __import__("time").monotonic() < deadline:
            __import__("time").sleep(0.05)
        assert probe.locked() is False

    def test_writer_mutex_serializes_and_busy_fails_retryable(
            self, tmp_path):
        h = DriverHarness(tmp_path, grace=0.2, lock_wait=0.3,
                          rc_script="sleep 0.8; exit 0")
        first = h.driver.inject(h.command(native_id="sess_busy"))
        assert first.delivered is True
        # a second prompt for the SAME session inside the turn window
        second = h.driver.inject(h.command(native_id="sess_busy",
                                           text="second"))
        assert second.delivered is False
        assert second.retryable is True
        assert "session busy" in second.error
        # a DIFFERENT session is not blocked
        third = h.driver.inject(h.command(native_id="sess_other"))
        assert third.delivered is True

    def test_mode_map_translates_confirm(self, tmp_path):
        h = DriverHarness(tmp_path)
        h.driver.inject(h.command(mode="confirm"))
        argv = h.argv_file.read_text()
        assert "build" in argv
        assert "yolo" not in argv.replace("--prompt=-", "")

    def test_missing_binary_is_failed_retryable(self, tmp_path):
        from scripts.kora.relay_unit import AuditLog, DriverConfig, \
            ZcodeStdinDriver
        config = DriverConfig(harness="zcode-stdin",
                              command=("/nonexistent/harness-binary",))
        driver = ZcodeStdinDriver(config, grace=0.5, lock_wait=2.0,
                                  audit=AuditLog(tmp_path / "a.jsonl"))
        result = driver.inject(DriverHarness(tmp_path).command())
        assert result.delivered is False
        assert result.retryable is True
        # the TYPE NAME only — an exception string could carry paths
        assert result.error == "spawn failed: FileNotFoundError"

    def test_audit_never_carries_content(self, tmp_path):
        h = DriverHarness(tmp_path)
        h.driver.inject(h.command(native_id="sess_audit"))
        rows = [json.loads(line)
                for line in (tmp_path / "audit.jsonl").read_text(
                    encoding="utf-8").splitlines()]
        assert rows, "audit rows exist"
        for row in rows:
            blob = str(row)
            assert PROMPT_SENTINEL not in blob
            assert row.get("prompt_len") == len(
                PROMPT_SENTINEL.encode("utf-8"))
            assert len(row.get("prompt_sha256", "")) in (0, 64)


class TestUnitConfirmDiscipline:
    """The unit's confirm: bounded retries, then the honest
    ``unconfirmed`` audit line (the board's sweep owns the item)."""

    def _unit(self, tmp_path, transport):
        from scripts.kora.relay_unit import (AuditLog, DriverConfig,
                                             RelayBoardClient, RelayConfig,
                                             RelayUnit, ZcodeStdinDriver)
        config = RelayConfig.from_dict({
            "board_url": "https://board.test", "executor_id": "ex-1"})
        board = RelayBoardClient(config.board_url, config.executor_id,
                                 "t" * 24, transport=transport)
        audit = AuditLog(tmp_path / "audit.jsonl")
        driver = ZcodeStdinDriver(
            DriverConfig(harness="zcode-stdin",
                         command=("sh", str(_write_fake_harness(
                             tmp_path, name="fake-h2.sh")))),
            grace=0.5, lock_wait=2.0, audit=audit)
        return RelayUnit(config, board, driver, audit), board

    def test_confirm_retries_then_resolves(self, tmp_path):
        calls = {"n": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["n"] += 1
            if request.url.path.endswith("/pickup"):
                return httpx.Response(200, json={"items": [{
                    "delivery_id": "d" * 32, "session_id": "ex-1:sess_x",
                    "native_id": "sess_x", "mode": "confirm",
                    "confirm_required": True, "text": PROMPT_SENTINEL,
                    "text_len": 10, "text_sha256": "0" * 64,
                    "queued_at": "2026-01-01T00:00:00+00:00",
                    "picked_at": "2026-01-01T00:00:00+00:00",
                    "cwd": ""}]})
            if calls["n"] <= 2:
                return httpx.Response(500, json={"detail": "boom"})
            return httpx.Response(200, json={"ok": True, "resolved": True})

        unit, board = self._unit(tmp_path, httpx.MockTransport(handler))
        unit.step()
        assert calls["n"] == 3   # pickup + 2 failed confirms + success
        board.close()

    def test_confirm_unknown_is_dropped_not_retried(self, tmp_path):
        """resolved=false (board restart) is an ANSWER, not an error —
        one confirm call, no retry loop, the unit moves on."""
        confirms = {"n": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/pickup"):
                return httpx.Response(200, json={"items": [{
                    "delivery_id": "d" * 32, "session_id": "ex-1:sess_x",
                    "native_id": "sess_x", "mode": "confirm",
                    "confirm_required": True, "text": "x",
                    "text_len": 1, "text_sha256": "0" * 64,
                    "queued_at": "2026-01-01T00:00:00+00:00",
                    "picked_at": "2026-01-01T00:00:00+00:00",
                    "cwd": ""}]})
            confirms["n"] += 1
            return httpx.Response(200, json={"ok": True, "resolved": False})

        unit, board = self._unit(tmp_path, httpx.MockTransport(handler))
        unit.step()
        assert confirms["n"] == 1
        board.close()

    def test_confirm_exhaustion_records_unconfirmed(self, tmp_path,
                                                    monkeypatch):
        from scripts.kora import relay_unit
        monkeypatch.setattr(relay_unit, "CONFIRM_RETRIES", 2)
        monkeypatch.setattr(relay_unit, "CONFIRM_BACKOFF", 0.01)

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/pickup"):
                return httpx.Response(200, json={"items": [{
                    "delivery_id": "d" * 32, "session_id": "ex-1:sess_x",
                    "native_id": "sess_x", "mode": "confirm",
                    "confirm_required": True, "text": "x",
                    "text_len": 1, "text_sha256": "0" * 64,
                    "queued_at": "2026-01-01T00:00:00+00:00",
                    "picked_at": "2026-01-01T00:00:00+00:00",
                    "cwd": ""}]})
            return httpx.Response(500, json={"detail": "down"})

        unit, board = self._unit(tmp_path, httpx.MockTransport(handler))
        unit.step()
        rows = [json.loads(line) for line in
                (tmp_path / "audit.jsonl").read_text(
                    encoding="utf-8").splitlines()]
        outcomes = [r["outcome"] for r in rows if r["event"] == "unconfirmed"]
        assert outcomes == ["delivered"]
        board.close()

    def test_pickup_transport_error_is_typed_and_tolerated(self, tmp_path):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, json={"detail": "board down"})

        unit, board = self._unit(tmp_path, httpx.MockTransport(handler))
        unit.step()   # logs the error, does not raise
        board.close()

    def test_malformed_pickup_payload_is_typed_board_error(self, tmp_path):
        from scripts.kora.relay_unit import BoardError, SteeringCommand

        with pytest.raises(BoardError) as exc_info:
            SteeringCommand.from_payload({"native_id": "x"})
        assert "missing fields" in str(exc_info.value)
