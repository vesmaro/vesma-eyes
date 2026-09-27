"""UXE-2 — honest connection lifecycle (07a dictionary §4, replaces the
dead «не проверено» chip).

Coverage map:
- executor status leg: every registry state maps to its 07a verdict —
  pending → awaiting-approval; approved+enabled with NO report →
  awaiting-first-report; fresh report → online (age int, next_action '');
  2–10 min corridor → silent; > 10 min → offline; enabled=false →
  disabled (report age still visible); revoked → revoked (terminal);
  on-read discipline: nothing persisted, no outbound pings;
- API exposure: GET /api/executors items + meta carry the status object
  and thresholds; GET /api/executors/{id} — same projection; heartbeat
  response reflects the transition (awaiting-first-report → online);
- enrollment status leg: created token → created + next_action; the
  provision-job refinement (queued/connecting/installing → provisioning;
  watching → awaiting-first-report); failed job does NOT fake in-flight;
  terminal token states map with used_at as ``since``;
- transition walk (pytest time-travel on last_seen, house pattern):
  token created → provisioning → used (executor pending) → approve →
  awaiting-first-report → first report → online → silence > threshold →
  silent → further decay → offline → disabled → revoked.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from conftest import DATA_DIR
from server.security import RateLimiter
from server.store import executor_lifecycle_status

DB_PATH = DATA_DIR / "board.db"


def _db() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def _iso_past(seconds: float) -> str:
    return (datetime.now(timezone.utc)
            - timedelta(seconds=seconds)).isoformat(timespec="seconds")


def _register(client, headers, name: str, **extra) -> tuple[dict, str]:
    payload = {"name": name, "harness": "zcode"} | extra
    r = client.post("/api/executors", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    body = r.json()
    return body["executor"], body["executor_secret"]


def _beat(client, secret: str, executor_id: str) -> None:
    r = client.post(f"/api/executors/{executor_id}/heartbeat",
                    headers={"Authorization": f"Bearer {secret}"})
    assert r.status_code == 200, r.text


def _approve(client, headers, executor_id: str, **patch) -> dict:
    r = client.patch(f"/api/executors/{executor_id}",
                     json={"state": "approved", **patch}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["executor"]


@pytest.fixture(autouse=True)
def fresh_lifecycle_state(app_module, monkeypatch):
    """Wipe the registries this suite writes + fresh rate limiters
    (module globals accumulate across the session-scoped client — house
    pattern from test_api_executors / test_enrollment)."""
    for name in ("_enrollment_create_limiter", "_enrollment_revoke_limiter",
                 "_executor_register_limiter"):
        limiter = getattr(app_module, name)
        monkeypatch.setattr(
            app_module, name,
            RateLimiter(limit=limiter.limit, window=limiter.window))
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM executors")
        db.execute("DELETE FROM enrollment_tokens")
        db.execute("DELETE FROM provision_jobs")
    yield
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM executors")
        db.execute("DELETE FROM enrollment_tokens")
        db.execute("DELETE FROM provision_jobs")


# ------------------------------------------------------------- pure helper
class TestExecutorLifecycleHelper:
    """Unit level: the pure on-read mapping (no HTTP, no persistence)."""

    def test_pending_maps_to_awaiting_approval(self):
        row = {"state": "pending", "enabled": 1, "last_seen": "",
               "registered_at": "2026-09-27T10:00:00+00:00",
               "updated_at": "2026-09-27T10:00:00+00:00"}
        s = executor_lifecycle_status(row)
        assert s["state"] == "awaiting-approval"
        assert s["since"] == row["registered_at"]
        assert s["last_report_age_s"] == ""   # honest absence, not a fake 0
        assert "approve" in s["next_action"]

    def test_approved_without_report_awaits_first(self):
        row = {"state": "approved", "enabled": 1, "last_seen": "",
               "registered_at": "2026-09-27T10:00:00+00:00",
               "updated_at": "2026-09-27T10:00:00+00:00"}
        s = executor_lifecycle_status(row)
        assert s["state"] == "awaiting-first-report"
        assert s["last_report_age_s"] == ""

    def test_enabled_flag_beats_bool_false(self):
        """enabled comes from SQLite as 0/1 — both falsy spellings are the
        owner kill-switch."""
        for enabled in (0, False):
            row = {"state": "approved", "enabled": enabled, "last_seen": "",
                   "registered_at": "2026-09-27T10:00:00+00:00",
                   "updated_at": "2026-09-27T10:00:00+00:00"}
            assert executor_lifecycle_status(row)["state"] == "disabled"

    def test_revoked_is_terminal_even_when_untouched_clock(self):
        row = {"state": "revoked", "enabled": 0, "last_seen": "",
               "registered_at": "2026-09-27T10:00:00+00:00",
               "updated_at": "2026-09-27T11:00:00+00:00"}
        s = executor_lifecycle_status(row)
        assert s["state"] == "revoked"
        assert s["since"] == row["updated_at"]

    @pytest.mark.parametrize("age_s,expected", [
        (0, "online"), (119, "online"),
        (121, "silent"), (599, "silent"),
        (601, "offline"), (86_400, "offline"),
    ])
    def test_report_clock_thresholds(self, age_s, expected):
        """Boundary picks sit strictly INSIDE the corridors: _age_seconds
        re-reads the wall clock, so an exact-threshold write (120) can
        measure 120.001 — the comparison itself is inclusive per the
        presence canon (online ≤ 120, silent ≤ 600)."""
        row = {"state": "approved", "enabled": 1,
               "last_seen": _iso_past(age_s),
               "registered_at": "2026-09-27T10:00:00+00:00",
               "updated_at": "2026-09-27T10:00:00+00:00"}
        s = executor_lifecycle_status(row)
        assert s["state"] == expected
        assert isinstance(s["last_report_age_s"], int)
        assert s["last_report_age_s"] >= age_s - 2  # wall clock drift
        assert s["since"] == row["last_seen"]


# ----------------------------------------------------------------- API leg
class TestExecutorApiExposure:
    """UXE-2: the registry reads carry the computed status object."""

    def test_list_and_single_carry_status(self, client, auth, app_module):
        executor, secret = _register(client, auth, "ux-list-a1")
        listed = client.get("/api/executors").json()
        item = next(e for e in listed["items"] if e["id"] == executor["id"])
        assert item["status"]["state"] == "awaiting-approval"
        single = client.get(f"/api/executors/{executor['id']}").json()
        assert single["status"] == item["status"]   # one projection, two reads
        assert listed["meta"]["lifecycle"]["silent_max_age_s"] == 600
        assert len(listed["meta"]["lifecycle"]["states"]) == 8

    def test_heartbeat_transitions_to_online(self, client, auth):
        executor, secret = _register(client, auth, "ux-beat-b1")
        _approve(client, auth, executor["id"], enabled=True)
        _beat(client, secret, executor["id"])
        body = client.get(f"/api/executors/{executor['id']}").json()
        assert body["status"]["state"] == "online"
        assert isinstance(body["status"]["last_report_age_s"], int)
        assert body["status"]["next_action"] == ""   # nothing to do — honest

    def test_silent_and_offline_after_time_travel(
            self, client, auth, app_module):
        executor, secret = _register(client, auth, "ux-sil-c1")
        _approve(client, auth, executor["id"], enabled=True)
        _beat(client, secret, executor["id"])
        for age_s, expected in ((301, "silent"), (3600, "offline")):
            ts = (datetime.now(timezone.utc)
                  - timedelta(seconds=age_s)).isoformat(timespec="seconds")
            with app_module.store._lock, app_module.store._conn() as db:
                db.execute("UPDATE executors SET last_seen=? WHERE id=?",
                           (ts, executor["id"]))
            body = client.get(f"/api/executors/{executor['id']}").json()
            assert body["status"]["state"] == expected, body["status"]
            assert "check the host" in body["status"]["next_action"]

    def test_disabled_keeps_report_age_visible(self, client, auth, app_module):
        """07a: «Выключен владельцем» — новые задачи не получает; доклады
        продолжаются. The state is disabled, the report clock stays live."""
        executor, secret = _register(client, auth, "ux-dis-d1")
        _approve(client, auth, executor["id"], enabled=True)
        _beat(client, secret, executor["id"])
        _approve(client, auth, executor["id"], enabled=False)
        body = client.get(f"/api/executors/{executor['id']}").json()
        assert body["status"]["state"] == "disabled"
        assert isinstance(body["status"]["last_report_age_s"], int)
        assert "re-enable" in body["status"]["next_action"]

    def test_revoked_carries_next_action(self, client, auth):
        executor, _ = _register(client, auth, "ux-rev-e1")
        _approve(client, auth, executor["id"], enabled=True)
        r = client.patch(f"/api/executors/{executor['id']}",
                         json={"state": "revoked"}, headers=auth)
        assert r.status_code == 200
        body = r.json()["executor"]
        assert body["status"]["state"] == "revoked"
        assert "re-register" in body["status"]["next_action"]


# ------------------------------------------------------------ enrollment leg
class TestEnrollmentLifecycle:
    """Token-side status: created/provisioning/awaiting-first-report plus
    the terminal states."""

    def _mint(self, client, ui_auth, label="vps-ux") -> dict:
        r = client.post("/api/executors/enrollment",
                        json={"label": label}, headers=ui_auth)
        assert r.status_code == 201, r.text
        return r.json()

    def test_created_token_maps_to_created_with_action(
            self, client, ui_auth):
        body = self._mint(client, ui_auth)
        row = body["enrollment"]
        assert row["status"]["state"] == "created"
        assert "bootstrap" in row["status"]["next_action"]

    def test_provision_job_refines_to_provisioning(
            self, client, ui_auth, app_module):
        body = self._mint(client, ui_auth)
        enr_id = body["enrollment"]["enrollment_id"]
        created = body["enrollment"]["created_at"]
        with app_module.store._lock, app_module.store._conn() as db:
            db.execute(
                """INSERT INTO provision_jobs
                       (id, host, port, auth_kind, key_fingerprint,
                        host_key_fingerprint, harness_hint,
                        board_url_for_host, enrollment_id, state,
                        created_at, updated_at)
                       VALUES ('pj-uxt1','h1',22,'key','fp','','zcode',
                               'https://b',?,'connecting', ?, ?)""",
                (enr_id, created, created),
            )
        listed = client.get("/api/executors/enrollment",
                            headers=ui_auth).json()
        row = next(i for i in listed["items"]
                   if i["enrollment_id"] == enr_id)
        assert row["status"]["state"] == "provisioning"
        assert "couple of minutes" in row["status"]["next_action"]

    def test_watching_job_is_awaiting_first_report(
            self, client, ui_auth, app_module):
        body = self._mint(client, ui_auth)
        enr_id = body["enrollment"]["enrollment_id"]
        created = body["enrollment"]["created_at"]
        with app_module.store._lock, app_module.store._conn() as db:
            db.execute(
                """INSERT INTO provision_jobs
                       (id, host, port, auth_kind, key_fingerprint,
                        host_key_fingerprint, harness_hint,
                        board_url_for_host, enrollment_id, state,
                        created_at, updated_at)
                       VALUES ('pj-uxt2','h2',22,'key','fp','','zcode',
                               'https://b',?,'watching', ?, ?)""",
                (enr_id, created, created),
            )
        row = next(i for i in client.get(
            "/api/executors/enrollment", headers=ui_auth).json()["items"]
            if i["enrollment_id"] == enr_id)
        assert row["status"]["state"] == "awaiting-first-report"

    def test_failed_job_does_not_fake_in_flight(
            self, client, ui_auth, app_module):
        body = self._mint(client, ui_auth)
        created = body["enrollment"]["created_at"]
        with app_module.store._lock, app_module.store._conn() as db:
            db.execute(
                """INSERT INTO provision_jobs
                       (id, host, port, auth_kind, key_fingerprint,
                        host_key_fingerprint, harness_hint,
                        board_url_for_host, enrollment_id, state, error_code,
                        created_at, updated_at)
                       VALUES ('pj-uxt3','h3',22,'key','fp','','zcode',
                               'https://b',?,'failed','ssh.unreachable',
                               ?, ?)""",
                (body["enrollment"]["enrollment_id"], created, created),
            )
        row = client.get("/api/executors/enrollment",
                         headers=ui_auth).json()["items"][0]
        # A dead job is NOT in-flight honesty: the token stays created —
        # the owner runs the bootstrap manually before the TTL expires.
        assert row["status"]["state"] == "created"

    def test_used_token_since_is_used_at(self, client, ui_auth, auth):
        body = self._mint(client, ui_auth)
        r = client.post("/api/executors",
                        json={"name": "ux-enr-f1", "harness": "zcode"},
                        headers={"Authorization":
                                 f"Bearer {body['token']}"})
        assert r.status_code == 201, r.text
        row = next(i for i in client.get(
            "/api/executors/enrollment", headers=ui_auth).json()["items"]
            if i["enrollment_id"] == body["enrollment"]["enrollment_id"])
        assert row["status"]["state"] == "used"
        assert row["status"]["since"] == row["used_at"]
        assert row["status"]["last_report_age_s"] == ""
        # ...and the freshly registered executor reads awaiting-approval
        assert r.json()["executor"]["status"]["state"] == "awaiting-approval"

    def test_provision_job_status_endpoint_carries_status(
            self, client, ui_auth, app_module):
        body = self._mint(client, ui_auth)
        enr_id = body["enrollment"]["enrollment_id"]
        with app_module.store._lock, app_module.store._conn() as db:
            db.execute(
                """INSERT INTO provision_jobs
                       (id, host, port, auth_kind, key_fingerprint,
                        host_key_fingerprint, harness_hint,
                        board_url_for_host, enrollment_id, state,
                        created_at, updated_at)
                       VALUES ('pj-uxt4','h4',22,'key','fp','','zcode',
                               'https://b',?,'watching', ?, ?)""",
                (enr_id, body["enrollment"]["created_at"],
                 body["enrollment"]["created_at"]),
            )
        r = client.get("/api/executors/provision/pj-uxt4")
        assert r.status_code == 401  # ui-token class unchanged
        out = client.get("/api/executors/provision/pj-uxt4",
                         headers=ui_auth).json()
        assert out["enrollment"]["status"]["state"] == "awaiting-first-report"


# ------------------------------------------------------------- full walk
class TestLifecycleWalk:
    """The UXE-2 acceptance walk: enroll → provision → used → approve →
    first report → online → silent → offline → disabled → revoked, each
    step's status read from the API (time-travel on last_seen)."""

    def test_full_walk(self, client, auth, ui_auth, app_module):
        # 1. token minted
        body = client.post("/api/executors/enrollment",
                           json={"label": "walk"}, headers=auth).json()
        token = body["token"]
        created = body["enrollment"]["created_at"]
        enr_id = body["enrollment"]["enrollment_id"]
        # 2. provision job in flight → provisioning
        with app_module.store._lock, app_module.store._conn() as db:
            db.execute(
                """INSERT INTO provision_jobs
                       (id, host, port, auth_kind, key_fingerprint,
                        host_key_fingerprint, harness_hint,
                        board_url_for_host, enrollment_id, state,
                        created_at, updated_at)
                       VALUES ('pj-uxw','hw',22,'key','fp','','zcode',
                               'https://b',?,'installing', ?, ?)""",
                (enr_id, created, created),
            )
        enr = next(i for i in client.get(
            "/api/executors/enrollment", headers=ui_auth).json()["items"]
            if i["enrollment_id"] == enr_id)
        assert enr["status"]["state"] == "provisioning"
        # 3. token used → executor pending → awaiting-approval
        r = client.post("/api/executors",
                        json={"name": "walk-host", "harness": "zcode"},
                        headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 201, r.text
        executor, secret = r.json()["executor"], r.json()["executor_secret"]
        listed = client.get("/api/executors").json()
        item = next(e for e in listed["items"] if e["id"] == executor["id"])
        assert item["status"]["state"] == "awaiting-approval"
        # 4. approved, no report yet → awaiting-first-report
        _approve(client, auth, executor["id"], enabled=True)
        item = next(e for e in client.get(
            "/api/executors").json()["items"] if e["id"] == executor["id"])
        assert item["status"]["state"] == "awaiting-first-report"
        # 5. first report → online
        _beat(client, secret, executor["id"])
        item = next(e for e in client.get(
            "/api/executors").json()["items"] if e["id"] == executor["id"])
        assert item["status"]["state"] == "online"
        # 6. silence 2–10 min → silent
        ts = (datetime.now(timezone.utc)
              - timedelta(seconds=301)).isoformat(timespec="seconds")
        with app_module.store._lock, app_module.store._conn() as db:
            db.execute("UPDATE executors SET last_seen=? WHERE id=?",
                       (ts, executor["id"]))
        item = next(e for e in client.get(
            "/api/executors").json()["items"] if e["id"] == executor["id"])
        assert item["status"]["state"] == "silent"
        # 7. beyond 10 min → offline
        ts = (datetime.now(timezone.utc)
              - timedelta(seconds=3600)).isoformat(timespec="seconds")
        with app_module.store._lock, app_module.store._conn() as db:
            db.execute("UPDATE executors SET last_seen=? WHERE id=?",
                       (ts, executor["id"]))
        item = next(e for e in client.get(
            "/api/executors").json()["items"] if e["id"] == executor["id"])
        assert item["status"]["state"] == "offline"
        # 8. owner disables → disabled
        _approve(client, auth, executor["id"], enabled=False)
        item = next(e for e in client.get(
            "/api/executors").json()["items"] if e["id"] == executor["id"])
        assert item["status"]["state"] == "disabled"
        # 9. revoke → revoked (terminal)
        client.patch(f"/api/executors/{executor['id']}",
                     json={"state": "revoked"}, headers=auth)
        item = next(e for e in client.get(
            "/api/executors").json()["items"] if e["id"] == executor["id"])
        assert item["status"]["state"] == "revoked"