"""ME-015 (slice 1): honest executor self-report — the registry reflects
the LAST version/transport the agent reported about itself (heartbeat /
poll piggyback), not the enrollment-time banner.

Coverage map:
- heartbeat with non-empty version/transport updates the row; absent/
  empty fields are never written (an old agent that reports nothing —
  every client deployed before ME-015 — leaves the row untouched, never
  blanked); invalid transport is an explicit 422; changed values are
  audited (executor.self_reported old→new), an unchanged re-report is a
  silent no-op;
- the assignments poll piggyback carries the same self-report on the same
  auth gate (own executor token or machine token); unauthenticated polls
  never update; params without executor_id → 422; invalid transport →
  422; the deployed poller's exact wire shape (executor_id only) is
  unaffected.
"""

from __future__ import annotations

import pytest

from server.security import RateLimiter



@pytest.fixture(autouse=True)
def fresh_me015_state(app_module, monkeypatch):
    """Per-test isolation mirroring test_api_executors.fresh_executor_state:
    fresh machine-class limiters + a wiped executor registry. The board
    events table is session-scoped shared state — audit assertions query
    it directly (see _board_events)."""
    for name in ("_executor_register_limiter",
                 "_executor_heartbeat_limiter",
                 "_assignment_limiter", "_assignment_ui_limiter"):
        limiter = getattr(app_module, name)
        monkeypatch.setattr(
            app_module, name,
            RateLimiter(limit=limiter.limit, window=limiter.window))
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM executors")
    yield
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM executors")


def _register(client, auth, name: str, **extra) -> tuple[dict, str]:
    payload = {"name": name, "harness": "zcode"} | extra
    r = client.post("/api/executors", json=payload, headers=auth)
    assert r.status_code == 201, r.text
    body = r.json()
    return body["executor"], body["executor_secret"]


def _ex_headers(secret: str) -> dict:
    return {"Authorization": f"Bearer {secret}"}


def _row(client, executor_id: str) -> dict:
    r = client.get(f"/api/executors/{executor_id}")
    assert r.status_code == 200, r.text
    return r.json()

def _board_events(app_module, kind: str, executor_id: str) -> list[dict]:
    """Audit rows for THIS executor (the events table is session-scoped
    shared state and grows past the store.events() read window in a full
    run — query it directly instead of through the windowed helper)."""
    import json as _json
    with app_module.store._lock, app_module.store._conn() as db:
        rows = db.execute(
            "SELECT id, ts, kind, task_id, payload FROM events "
            "WHERE kind=? ORDER BY id ASC", (kind,)).fetchall()
    out = []
    for r in rows:
        payload = _json.loads(r["payload"])
        if payload.get("executor_id") == executor_id:
            out.append({"id": r["id"], "ts": r["ts"], "kind": r["kind"],
                        "task_id": r["task_id"], "payload": payload})
    return out

class TestSelfReportHeartbeat:
    """Contract: the registry reflects the LAST values the agent reported
    about itself, not the enrollment-time banner (ME-015 core)."""

    def test_heartbeat_updates_version_and_transport(self, client, auth):
        executor, secret = _register(client, auth, "me015-a1",
                                     version="0.1.1")
        assert _row(client, executor["id"])["version"] == "0.1.1"
        r = client.post(
            f"/api/executors/{executor['id']}/heartbeat",
            json={"version": "0.5.1", "transport": "mesh-r4"},
            headers=_ex_headers(secret))
        assert r.status_code == 200, r.text
        out = r.json()["executor"]
        assert out["version"] == "0.5.1"
        assert out["transport"] == "mesh-r4"
        assert _row(client, executor["id"])["version"] == "0.5.1"

    def test_old_agent_without_body_leaves_row_untouched(self, client, auth):
        """Every client deployed before ME-015 posts a bare heartbeat (no
        JSON body at all) — the row must not change (additive contract)."""
        executor, secret = _register(client, auth, "me015-a2",
                                     version="0.1.1")
        r = client.post(f"/api/executors/{executor['id']}/heartbeat",
                        headers=_ex_headers(secret))
        assert r.status_code == 200, r.text
        out = _row(client, executor["id"])
        assert out["version"] == "0.1.1"
        assert out["transport"] == "local-poll"
        assert out["last_seen"] != ""          # the tick itself still lands

    def test_note_only_body_never_blanks_fields(self, client, auth):
        """v0.5.x-style body {"note": ...} — no self-report fields: the
        stored values stay (never blanked by an empty report)."""
        executor, secret = _register(client, auth, "me015-a3",
                                     version="0.1.1")
        r = client.post(
            f"/api/executors/{executor['id']}/heartbeat",
            json={"note": "idle"}, headers=_ex_headers(secret))
        assert r.status_code == 200, r.text
        out = _row(client, executor["id"])
        assert out["version"] == "0.1.1"
        assert out["transport"] == "local-poll"

    def test_empty_version_string_is_not_written(self, client, auth):
        executor, secret = _register(client, auth, "me015-a4",
                                     version="0.1.1")
        r = client.post(
            f"/api/executors/{executor['id']}/heartbeat",
            json={"version": "", "transport": ""}, headers=_ex_headers(secret))
        assert r.status_code == 200, r.text
        out = _row(client, executor["id"])
        assert out["version"] == "0.1.1"
        assert out["transport"] == "local-poll"

    def test_invalid_transport_is_explicit_422(self, client, auth):
        executor, secret = _register(client, auth, "me015-a5")
        r = client.post(
            f"/api/executors/{executor['id']}/heartbeat",
            json={"transport": "carrier-pigeon"},
            headers=_ex_headers(secret))
        assert r.status_code == 422, r.text
        assert "invalid transport" in r.json()["detail"]
        assert _row(client, executor["id"])["transport"] == "local-poll"

    def test_changed_report_is_audited_unchanged_is_silent(
            self, client, auth, app_module):
        executor, secret = _register(client, auth, "me015-a6",
                                     version="0.1.1")
        client.post(f"/api/executors/{executor['id']}/heartbeat",
                    json={"version": "0.5.1"},
                    headers=_ex_headers(secret))
        events = _board_events(app_module, "executor.self_reported",
                               executor["id"])
        assert len(events) == 1
        assert events[0]["payload"]["changes"] == {
            "version": ["0.1.1", "0.5.1"]}
        # identical re-report: no new audit event, no churn
        before = _row(client, executor["id"])["updated_at"]
        client.post(f"/api/executors/{executor['id']}/heartbeat",
                    json={"version": "0.5.1"},
                    headers=_ex_headers(secret))
        assert len(_board_events(
            app_module, "executor.self_reported", executor["id"])) == 1
        assert _row(client, executor["id"])["updated_at"] == before


class TestSelfReportPollPiggyback:
    """The poll leg (GET /api/assignments?executor_id=...) carries the same
    self-report on the same auth gate — the idle agent's only recurring
    authenticated call."""

    def test_poll_updates_version_and_transport(self, client, auth):
        executor, secret = _register(client, auth, "me015-b1",
                                     version="0.1.1")
        r = client.get(
            f"/api/assignments?state=queued&executor_id={executor['id']}"
            f"&executor_version=0.5.1&executor_transport=mesh-r4",
            headers=_ex_headers(secret))
        assert r.status_code == 200, r.text
        out = _row(client, executor["id"])
        assert out["version"] == "0.5.1"
        assert out["transport"] == "mesh-r4"
        assert out["presence"] == "online"     # presence piggyback intact

    def test_unauthenticated_poll_never_updates(self, client, auth):
        executor, _secret = _register(client, auth, "me015-b2",
                                      version="0.1.1")
        r = client.get(
            f"/api/assignments?state=queued&executor_id={executor['id']}"
            f"&executor_version=9.9.9")
        assert r.status_code == 200, r.text
        assert _row(client, executor["id"])["version"] == "0.1.1"

    def test_machine_token_may_report(self, client, auth):
        executor, _secret = _register(client, auth, "me015-b3",
                                      version="0.1.1")
        r = client.get(
            f"/api/assignments?state=queued&executor_id={executor['id']}"
            f"&executor_version=0.5.1", headers=auth)
        assert r.status_code == 200, r.text
        assert _row(client, executor["id"])["version"] == "0.5.1"

    def test_self_report_params_require_executor_id(self, client, auth):
        r = client.get("/api/assignments?state=queued&executor_version=0.5.1")
        assert r.status_code == 422, r.text

    def test_invalid_transport_on_poll_is_422(self, client, auth):
        executor, secret = _register(client, auth, "me015-b4")
        r = client.get(
            f"/api/assignments?state=queued&executor_id={executor['id']}"
            f"&executor_transport=bogus", headers=_ex_headers(secret))
        assert r.status_code == 422, r.text
        assert _row(client, executor["id"])["transport"] == "local-poll"

    def test_poll_without_params_is_unaffected(self, client, auth):
        """The deployed laptop poller's exact wire shape (executor_id only)
        must behave exactly as before."""
        executor, secret = _register(client, auth, "me015-b5",
                                     version="0.1.1")
        r = client.get(
            f"/api/assignments?state=queued&executor_id={executor['id']}",
            headers=_ex_headers(secret))
        assert r.status_code == 200, r.text
        out = _row(client, executor["id"])
        assert out["version"] == "0.1.1"
        assert out["presence"] == "online"
