"""Loop S-step 3 (verdict card loop-verification-board-agents, 2026-10-22):
transport retries — a nomination caught in a transport failure must not
burn on the first reaper pass.

Verdict context: mesh-tunnel flaps + the 18–21.10 board 503 window
regularly killed claimed/running assignments via the reaper's expiry;
trust in the queue died with them. Now a stale claimed/running row is
REQUEUED (attempts + exponential backoff + honest transport note) while
the attempt budget lasts; a spent budget expires exactly as before.

Coverage:
- stale claimed → requeued: state/queued, token cleared (kill signal),
  attempts=1, not_before in the future, honest note, task walks back
  in-progress → open, journal event;
- the claim CAS refuses during the backoff window and allows after it;
- the 409 heartbeat kill signal survives the requeue (a poller holding
  the old claim_token is killed, not orphaned);
- budget spent (attempts=cap) → the next stale pass expires honestly
  (task → blocked, as before);
- live assignments are never touched.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from fastapi.testclient import TestClient

from server.security import RateLimiter
from server.store import Store


@pytest.fixture(autouse=True)
def fresh_reaper_limiters(app_module, monkeypatch):
    for name in ("_assignment_heartbeat_limiter",
                 "_assignment_limiter", "_assignment_ui_limiter"):
        limiter = getattr(app_module, name)
        monkeypatch.setattr(
            app_module, name,
            RateLimiter(limit=limiter.limit, window=limiter.window))
    yield


def _iso_minutes_ago(minutes: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)
            ).isoformat(timespec="seconds")


def _iso_minutes_from_now(minutes: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)
            ).isoformat(timespec="seconds")


def _backdate(data_dir, assignment_id: int, **columns: float) -> None:
    db = sqlite3.connect(data_dir / "board.db")
    try:
        for col, minutes in columns.items():
            db.execute(f"UPDATE task_assignments SET {col}=? WHERE id=?",
                       (_iso_minutes_ago(minutes), assignment_id))
        db.commit()
    finally:
        db.close()


def _set_column(data_dir, assignment_id: int, **values) -> None:
    db = sqlite3.connect(data_dir / "board.db")
    try:
        for col, val in values.items():
            db.execute(f"UPDATE task_assignments SET {col}=? WHERE id=?",
                       (val, assignment_id))
        db.commit()
    finally:
        db.close()


def _assignment_row(app_module, assignment_id: int) -> dict:
    with app_module.store._lock, app_module.store._conn() as db:
        row = db.execute(
            "SELECT * FROM task_assignments WHERE id=?",
            (assignment_id,)).fetchone()
    return dict(row) if row else {}


def _nominate_claim(client, auth, make_task, title: str) -> tuple[dict, int, str]:
    task = make_task(title=title)
    r = client.post("/api/assignments",
                    json={"task_id": task["id"],
                          "specialist": "smoke-probe"},
                    headers=auth)
    assert r.status_code == 201, r.text
    aid = r.json()["assignment"]["id"]
    r = client.post(f"/api/assignments/{aid}/claim",
                    json={"claimed_by": "poller-t1"}, headers=auth)
    assert r.status_code == 200, r.text
    return task, aid, r.json()["claim_token"]


def test_stale_claimed_is_requeued(client: TestClient, auth, make_task,
                                   app_module, data_dir):
    task, aid, _token = _nominate_claim(client, auth, make_task, "s3 requeue")
    _backdate(data_dir, aid, claimed_at=20)
    counts = app_module._assignment_reaper_tick()
    assert counts["requeued"] == 1
    assert counts["expired"] == 0
    row = _assignment_row(app_module, aid)
    assert row["state"] == "queued"
    assert row["attempts"] == 1
    assert row["claim_token"]                  # kept — the 409 kill signal
    assert not row["claimed_by"]
    assert not row["claimed_by_executor"]
    assert row["note"].startswith("транспорт: повтор 1/3")
    # backoff window is in the future
    assert datetime.fromisoformat(row["not_before"]) > datetime.now(
        timezone.utc)
    # the task walked back to open (inverse of the claim mapping)
    with app_module.store._lock, app_module.store._conn() as db:
        col = db.execute("SELECT col FROM tasks WHERE id=?",
                         (task["id"],)).fetchone()["col"]
    assert col == "open"
    events = [e for e in app_module.store.events(limit=100000)
              if e["task_id"] == task["id"]]
    assert any(e["kind"] == "assignment.transport_requeue"
               for e in events)


def test_claim_refused_during_backoff_then_allowed(
        client: TestClient, auth, make_task, app_module, data_dir):
    _task, aid, _token = _nominate_claim(client, auth, make_task,
                                         "s3 backoff")
    _backdate(data_dir, aid, claimed_at=20)
    app_module._assignment_reaper_tick()
    r = client.post(f"/api/assignments/{aid}/claim",
                    json={"claimed_by": "poller-t2"}, headers=auth)
    assert r.status_code == 409, r.text   # backoff window
    _set_column(data_dir, aid, not_before=_iso_minutes_from_now(-1))
    r = client.post(f"/api/assignments/{aid}/claim",
                    json={"claimed_by": "poller-t2"}, headers=auth)
    assert r.status_code == 200, r.text


def test_heartbeat_kill_signal_survives_requeue(
        client: TestClient, auth, make_task, app_module, data_dir):
    _task, aid, token = _nominate_claim(client, auth, make_task,
                                        "s3 kill signal")
    _backdate(data_dir, aid, claimed_at=20)
    app_module._assignment_reaper_tick()
    # the old claim_token no longer runs the assignment: heartbeat 409s
    r = client.post(f"/api/assignments/{aid}/heartbeat",
                    json={"claim_token": token}, headers=auth)
    assert r.status_code == 409, r.text
    # and completion is impossible too (no zombie done)
    r = client.post(f"/api/assignments/{aid}/complete",
                    json={"claim_token": token,
                          "final_report": "too late"}, headers=auth)
    assert r.status_code == 409, r.text


def test_budget_spent_expires_honestly(client: TestClient, auth, make_task,
                                       app_module, data_dir):
    task, aid, _token = _nominate_claim(client, auth, make_task,
                                        "s3 budget")
    _set_column(data_dir, aid, attempts=Store.REAP_TRANSPORT_MAX_ATTEMPTS)
    _backdate(data_dir, aid, claimed_at=20)
    counts = app_module._assignment_reaper_tick()
    assert counts["requeued"] == 0
    assert counts["expired"] == 1
    row = _assignment_row(app_module, aid)
    assert row["state"] == "expired"
    with app_module.store._lock, app_module.store._conn() as db:
        col = db.execute("SELECT col FROM tasks WHERE id=?",
                         (task["id"],)).fetchone()["col"]
    assert col == "blocked"


def test_live_assignment_untouched(client: TestClient, auth, make_task,
                                   app_module):
    _task, aid, _token = _nominate_claim(client, auth, make_task, "s3 live")
    counts = app_module._assignment_reaper_tick()
    assert counts["requeued"] == 0
    assert counts["expired"] == 0
    row = _assignment_row(app_module, aid)
    assert row["state"] == "claimed"
    assert row["attempts"] == 0
