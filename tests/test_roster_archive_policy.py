"""Roster-host-binding-cleanup (2026-10-18) — the archive policy.

Policy: an owner-DISABLED executor whose report clock is older than
ARCHIVE_AFTER_DISABLED_S (14 days) is ARCHIVED — COMPUTED ON READ, never
stored (the two-clock discipline: no sweeper writer; the registry state
stays the OWNER identity lifecycle pending→approved→revoked). The default
roster view hides archived rows; data is never deleted and
GET /api/executors keeps serving the row — the registry page is the
un-archive path (re-enable, or any fresh heartbeat, un-computes the flag).

NOT archived: a fresh disabled row (a recent owner decision, still news),
an ENABLED row of any age (its age speaks through the presence lifecycle:
silent/offline — attention states, not archive), and a never-reported row
(last_seen='' — «never spoke» ≠ «went silent»; the synthetic bridge legs
carry an empty clock by design).
"""

from __future__ import annotations

from conftest import BOARD_TOKEN

MACHINE_HEADERS = {"Authorization": f"Bearer {BOARD_TOKEN}"}

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from server.store import ARCHIVE_AFTER_DISABLED_S

ARCHIVED_AFTER_S = ARCHIVE_AFTER_DISABLED_S          # 14 days
BEFORE_BOUNDARY_S = ARCHIVED_AFTER_S - 60            # just inside
AFTER_BOUNDARY_S = ARCHIVED_AFTER_S + 60             # just outside


def _register(client: TestClient, name: str) -> tuple[dict, str]:
    # registration is machine-class (ADR 0009 A1): board bearer only
    r = client.post("/api/executors",
                    json={"name": name, "harness": "zcode"},
                    headers=MACHINE_HEADERS)
    assert r.status_code == 201, r.text
    body = r.json()
    return body["executor"], body["executor_secret"]


def _patch(client: TestClient, ui_auth, executor_id: str,
           patch: dict) -> None:
    r = client.patch(f"/api/executors/{executor_id}", json=patch,
                     headers=ui_auth)
    assert r.status_code == 200, r.text


def _age_last_seen(app_module, executor_id: str, seconds: float) -> None:
    """Rewrite the presence clock (test-only time travel)."""
    ts = (datetime.now(timezone.utc)
          - timedelta(seconds=seconds)).isoformat(timespec="seconds")
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("UPDATE executors SET last_seen=? WHERE id=?",
                   (ts, executor_id))


def _items(client: TestClient) -> dict:
    return {e["id"]: e
            for e in client.get("/api/executors").json()["items"]}


class TestArchivePolicy:
    def test_dead_disabled_row_is_archived(
            self, app_module, client: TestClient, ui_auth) -> None:
        """The live-board case: laptop-zcode-1@core-51 — disabled, silent
        for weeks. Archived by policy; the row's data stays intact."""
        ex, _ = _register(client, f"dead-disabled-{datetime.now().timestamp()}")
        _patch(client, ui_auth, ex["id"], {"state": "approved", "enabled": False})
        _age_last_seen(app_module, ex["id"], AFTER_BOUNDARY_S)
        item = _items(client)[ex["id"]]
        assert item["archived"] is True
        # Archived is a VIEW verdict, not a mutation: the row keeps its
        # registry lifecycle and data.
        assert item["enabled"] is False
        assert item["state"] == "approved"
        assert item["status"]["state"] == "disabled"
        assert item["host"] == ""

    def test_fresh_disabled_row_stays_visible(
            self, app_module, client: TestClient, ui_auth) -> None:
        ex, _ = _register(client, f"fresh-disabled-{datetime.now().timestamp()}")
        _patch(client, ui_auth, ex["id"], {"state": "approved", "enabled": False})
        _age_last_seen(app_module, ex["id"], 3600)
        assert _items(client)[ex["id"]]["archived"] is False

    def test_archive_boundary_is_exact(
            self, app_module, client: TestClient, ui_auth) -> None:
        ex, _ = _register(client, f"archive-boundary-{datetime.now().timestamp()}")
        _patch(client, ui_auth, ex["id"], {"state": "approved", "enabled": False})
        _age_last_seen(app_module, ex["id"], BEFORE_BOUNDARY_S)
        assert _items(client)[ex["id"]]["archived"] is False
        _age_last_seen(app_module, ex["id"], AFTER_BOUNDARY_S)
        assert _items(client)[ex["id"]]["archived"] is True

    def test_enabled_row_of_any_age_is_not_archived(
            self, app_module, client: TestClient, ui_auth) -> None:
        """An old ENABLED row went silent/offline — an attention state the
        owner must SEE, never an archive candidate."""
        ex, secret = _register(client, f"old-enabled-{datetime.now().timestamp()}")
        _patch(client, ui_auth, ex["id"], {"state": "approved", "enabled": True})
        # one presence tick so last_seen exists, then age it out
        r = client.post(f"/api/executors/{ex['id']}/heartbeat",
                        headers={"Authorization": f"Bearer {secret}"})
        assert r.status_code == 200
        _age_last_seen(app_module, ex["id"], AFTER_BOUNDARY_S)
        item = _items(client)[ex["id"]]
        assert item["archived"] is False
        assert item["status"]["state"] == "offline"

    def test_never_reported_row_is_not_archived(
            self, app_module, client: TestClient, ui_auth) -> None:
        """last_seen='' is «never spoke», not «went silent» — the
        synthetic bridge legs live here."""
        ex, _ = _register(client, f"never-reported-{datetime.now().timestamp()}")
        _patch(client, ui_auth, ex["id"], {"state": "approved", "enabled": False})
        assert _items(client)[ex["id"]]["archived"] is False

    def test_reenable_unarchives_self(
            self, app_module, client: TestClient, ui_auth) -> None:
        """Computed on read = self-healing: flip enabled back on and the
        flag un-computes — no un-archive writer exists or is needed."""
        ex, _ = _register(client, f"reenable-{datetime.now().timestamp()}")
        _patch(client, ui_auth, ex["id"], {"state": "approved", "enabled": False})
        _age_last_seen(app_module, ex["id"], AFTER_BOUNDARY_S)
        assert _items(client)[ex["id"]]["archived"] is True
        _patch(client, ui_auth, ex["id"], {"enabled": True})
        assert _items(client)[ex["id"]]["archived"] is False

    def test_threshold_rides_the_list_meta(self, client: TestClient) -> None:
        meta = client.get("/api/executors").json()["meta"]
        assert meta["archive"]["after_disabled_days"] == 14

    def test_predicate_fail_open_on_unparsable_clock(
            self, app_module, client: TestClient, ui_auth) -> None:
        """Archiving requires POSITIVE proof of age: a corrupt timestamp
        fails open (age 0), same discipline as _age_seconds."""
        from server.store import executor_archived
        assert executor_archived({"enabled": 0,
                                  "last_seen": "not-a-timestamp"}) is False
        assert executor_archived({"enabled": 0, "last_seen": ""}) is False
        assert executor_archived({"enabled": 1, "last_seen":
                                  "2020-01-01T00:00:00+00:00"}) is False
