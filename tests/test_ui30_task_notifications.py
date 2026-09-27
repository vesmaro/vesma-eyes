"""UI-30, server leg: task.created must reach the notifications surface
(owner directive: «уведомления — тоже должны сообщать о новых задачах»).

Pinned contract:
- ONE unified work notification per native task creation, on EVERY leg:
  - UI leg (POST /api/tasks) and device leg (mnd_ control token, same
    handler via the scope middleware) → title «Новая задача: <title>»,
    message carries the board link (task id) + creator attribution
    («создал: ui» / «создал: device:<id> <name>», ADR 0012 Amendment);
  - inbox adopt → same shape + provenance suffix «принята из task:queue
    (...)»;
- the notification rides the task.created SSE frame (§11 attach — no new
  frame kind);
- /api/activity is NOT touched: the v1 activity dictionary stays
  event-shaped, notifications never surface as activity rows;
- existing caps: store clamps title ≤ 200 / message ≤ 500; a max-length
  task title still keeps «Новая задача: » + the full title visible
  (180-char slice + 14-char prefix < 200).
"""

from __future__ import annotations

import pytest

from conftest import BOARD_TOKEN


# ------------------------------------------------------------------ helpers
def _ui_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {BOARD_TOKEN}"}


def _paired_control_device(store, name: str = "ui30-dev") -> dict:
    """Full legal pairing at STORE level (default scope=control)."""
    row, _code = store.create_pairing_request(device_name=name)
    store.scan_pairing(row["id"], device_name=name, source_ip="testclient")
    store.confirm_pairing(row["id"], allow=True)
    device, token = store.issue_device_session(row["id"])
    assert device["scope"] == "control"
    return {**device, "device_token": token}


def _creation_notes(app_module, task_id: str) -> list[dict]:
    return [n for n in app_module.store.notifications()
            if n["task_id"] == task_id
            and n["title"].startswith("Новая задача: ")]


# ------------------------------------------------------------ UI + device
class TestTaskCreatedNotification:
    def test_ui_leg_creation_notifies_with_title_and_attribution(
            self, client, app_module, monkeypatch):
        captured: list[dict] = []
        monkeypatch.setattr(app_module, "_broadcast", captured.append)

        r = client.post("/api/tasks", json={"title": "ui30 ui leg"},
                        headers=_ui_headers())
        assert r.status_code == 201
        task = r.json()

        notes = _creation_notes(app_module, task["id"])
        assert len(notes) == 1, "exactly ONE creation notification"
        note = notes[0]
        assert note["category"] == "work"
        assert note["title"] == "Новая задача: ui30 ui leg"
        assert task["id"] in note["message"], "board link rides the message"
        assert "создал: ui" in note["message"]
        assert note["read"] is False

        # §11: the notification rides the task.created SSE frame — no
        # separate frame kind is introduced
        frames = [e for e in captured if e.get("kind") == "task.created"
                  and e.get("task", {}).get("id") == task["id"]]
        assert len(frames) == 1
        assert frames[0]["actor"] == "ui"
        assert frames[0]["notification"]["title"] == \
            "Новая задача: ui30 ui leg"

        client.delete(f"/api/tasks/{task['id']}", headers=_ui_headers())

    def test_device_leg_creation_notifies_with_device_actor(
            self, client, app_module):
        device = _paired_control_device(app_module.store)
        headers = {"Authorization": f"Bearer {device['device_token']}"}
        expected_actor = f"device:{device['id']} {device['name']}".strip()

        r = client.post("/api/tasks", json={"title": "ui30 device leg"},
                        headers=headers)
        assert r.status_code == 201
        task = r.json()

        notes = _creation_notes(app_module, task["id"])
        assert len(notes) == 1
        assert notes[0]["title"] == "Новая задача: ui30 device leg"
        assert f"создал: {expected_actor}" in notes[0]["message"], \
            "device attribution must match the task-history actor format"

        client.delete(f"/api/tasks/{task['id']}", headers=_ui_headers())

    def test_inbox_adopt_notifies_with_provenance(self, client, app_module):
        assert app_module.store.upsert_inbox_records(
            [{"memory_id": "m-ui30", "server": "qa-src",
              "title": "ui30 queue item"}],
            "2026-09-27T00:00:00+00:00",
        ) == (1, 1)
        try:
            r = client.post("/api/tasks/inbox/m-ui30/adopt",
                            headers=_ui_headers())
            assert r.status_code == 201
            task = r.json()

            notes = _creation_notes(app_module, task["id"])
            assert len(notes) == 1
            assert notes[0]["title"] == "Новая задача: ui30 queue item"
            assert "создал: ui" in notes[0]["message"]
            assert "принята из task:queue (qa-src, память m-ui30)" \
                in notes[0]["message"]
        finally:
            for t in app_module.store.board()["tasks"]:
                if "task-queue-import" in (t.get("mnemos_tags") or []):
                    app_module.store.delete_task(t["id"])
            import sqlite3
            with sqlite3.connect(app_module.store._path) as db:  # noqa: SLF001
                db.execute("DELETE FROM task_inbox")

    def test_max_length_title_stays_within_surface_cap(self, client,
                                                       app_module):
        long_title = "ц" * 200  # TaskCreate max_length
        r = client.post("/api/tasks", json={"title": long_title},
                        headers=_ui_headers())
        assert r.status_code == 201
        task = r.json()

        notes = _creation_notes(app_module, task["id"])
        assert len(notes) == 1
        # «Новая задача: » (14) + full title (180 slice) = 194 ≤ 200 cap —
        # the store clamp never truncates mid-title
        assert notes[0]["title"] == f"Новая задача: {'ц' * 180}"

        client.delete(f"/api/tasks/{task['id']}", headers=_ui_headers())


# --------------------------------------------------------------- activity
class TestActivityUntouched:
    def test_notifications_never_surface_as_activity_rows(
            self, client, app_module):
        r = client.post("/api/tasks", json={"title": "ui30 activity"},
                        headers=_ui_headers())
        assert r.status_code == 201
        task = r.json()
        try:
            body = client.get("/api/activity",
                              params={"task_id": task["id"]}).json()
            rows = body["items"]
            assert rows, "task.created event must still be in the feed (v1)"
            # the v1 dictionary is event-shaped; a notification is not an
            # activity family and never appears as a row
            assert {row["kind"] for row in rows} <= {"task.created"}
            assert not any("Новая задача" in (row.get("task_title") or "")
                           or "создал" in (row.get("actor") or "")
                           for row in rows)
        finally:
            client.delete(f"/api/tasks/{task['id']}",
                          headers=_ui_headers())


if __name__ == "__main__":  # pragma: no cover
    pytest.main([__file__])
