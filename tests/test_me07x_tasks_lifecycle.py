"""ME-073..076 task lifecycle: lifecycle stamps (resolved_at/done_at),
board date filters, batch inbox adopt and the archive-TTL pass.

Store-level tests boot a fresh tmp-path Store (the test_wf1 precedent);
sweep/API tests run against the session client + app_module with the
established backdating pattern (a direct SQLite stamp UPDATE — the
selectors compare stored ISO stamps lexicographically, so no fake clock
is needed).
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from server.store import Store

# ----------------------------------------------------------------- helpers


def _iso_ago(**kwargs: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(**kwargs)) \
        .isoformat(timespec="seconds")


def _task_cols(path) -> set[str]:
    with sqlite3.connect(path) as db:
        return {r[1] for r in db.execute("PRAGMA table_info(tasks)").fetchall()}


def _backdate(app_module, task_id: str, **stamps: str) -> None:
    """Write lifecycle stamps directly (ME-074 added the columns empty)."""
    db = sqlite3.connect(app_module.DB_PATH)
    assigns = ", ".join(f"{k}=?" for k in stamps)
    db.execute(f"UPDATE tasks SET {assigns} WHERE id=?",  # noqa: S608 — fixed dict
               (*stamps.values(), task_id))
    db.commit()
    db.close()


# ------------------------------------------------------- ME-074: the columns


class TestLifecycleStampColumns:
    def test_migration_adds_both_columns_empty(self, tmp_path):
        store = Store(tmp_path / "board.db")
        assert {"resolved_at", "done_at"} <= _task_cols(tmp_path / "board.db")
        task = store.create_task({"title": "x"})
        assert task["resolved_at"] == ""
        assert task["done_at"] == ""

    def test_entering_resolved_stamps_resolved_at(self, tmp_path):
        store = Store(tmp_path / "board.db")
        task = store.create_task({"title": "x"})
        moved = store.move_task(task["id"], "resolved")
        assert moved["resolved_at"]
        assert moved["done_at"] == ""

    def test_resolved_to_done_keeps_completion_moment(self, tmp_path):
        store = Store(tmp_path / "board.db")
        task = store.create_task({"title": "x"})
        resolved_at = store.move_task(task["id"], "resolved")["resolved_at"]
        done = store.move_task(task["id"], "done")
        assert done["done_at"]
        assert done["resolved_at"] == resolved_at, \
            "acceptance must not overwrite the completion moment"

    def test_leaving_resolved_clears_stamp(self, tmp_path):
        store = Store(tmp_path / "board.db")
        task = store.create_task({"title": "x"})
        store.move_task(task["id"], "resolved")
        back = store.move_task(task["id"], "open")
        assert back["resolved_at"] == ""

    def test_leaving_done_clears_stamp(self, tmp_path):
        store = Store(tmp_path / "board.db")
        task = store.create_task({"title": "x"})
        store.move_task(task["id"], "done")
        back = store.move_task(task["id"], "in-progress")
        assert back["done_at"] == ""

    def test_same_column_reorder_keeps_stamps(self, tmp_path):
        store = Store(tmp_path / "board.db")
        task = store.create_task({"title": "x"})
        done = store.move_task(task["id"], "done")
        reordered = store.move_task(task["id"], "done", position=0)
        assert reordered["done_at"] == done["done_at"]

    def test_task_out_exposes_stamps_via_api(self, client, make_task, auth):
        task = make_task()
        r = client.post(f"/api/tasks/{task['id']}/move",
                        json={"col": "resolved"}, headers=auth)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["resolved_at"]
        assert body["done_at"] == ""


# ------------------------------------------------- ME-075: date filters


class TestBoardDateFilters:
    def test_created_bounds_narrow_tasks(self, client, app_module, make_task):
        old = make_task(title="old-arrival")
        _backdate(app_module, old["id"], created_at=_iso_ago(days=30))
        fresh = make_task(title="fresh-arrival")

        r = client.get("/api/board", params={"created_from": _iso_ago(days=7)})
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()["tasks"]]
        assert fresh["id"] in ids
        assert old["id"] not in ids

        r = client.get("/api/board", params={"created_to": _iso_ago(days=7)})
        ids = [t["id"] for t in r.json()["tasks"]]
        assert old["id"] in ids
        assert fresh["id"] not in ids

    def test_completed_bounds_use_first_completion_stamp(
            self, client, app_module, make_task, auth):
        finished = make_task(title="finished")
        client.post(f"/api/tasks/{finished['id']}/move",
                    json={"col": "resolved"}, headers=auth)
        _backdate(app_module, finished["id"], resolved_at=_iso_ago(days=2))
        open_task = make_task(title="never-finished")

        r = client.get("/api/board", params={"completed_from": _iso_ago(days=3)})
        ids = [t["id"] for t in r.json()["tasks"]]
        assert finished["id"] in ids
        assert open_task["id"] not in ids, \
            "a task with no completion stamp never matches a completed bound"

    def test_date_only_bounds_are_inclusive(self, client, app_module,
                                            make_task):
        task = make_task(title="today-arrival")
        today = datetime.now(timezone.utc).date().isoformat()
        r = client.get("/api/board", params={
            "created_from": today, "created_to": today})
        ids = [t["id"] for t in r.json()["tasks"]]
        assert task["id"] in ids

    def test_garbage_date_is_422_not_silently_ignored(self, client):
        r = client.get("/api/board", params={"created_from": "not-a-date"})
        assert r.status_code == 422
        r = client.get("/api/board", params={"completed_to": "01.10.2026"})
        assert r.status_code == 422

    def test_counts_stay_whole_board(self, client, app_module, make_task):
        task = make_task(title="filtered-out")
        whole = client.get("/api/board").json()
        filtered = client.get(
            "/api/board", params={"created_to": _iso_ago(days=1)}).json()
        assert all(t["id"] != task["id"] for t in filtered["tasks"])
        assert filtered["counts"] == whole["counts"], \
            "counts always describe the whole board"


# ---------------------------------------------- ME-073: batch inbox adopt


@pytest.fixture()
def batch_inbox_env(client, auth, fake_mnemos, allow_hosts, app_module):
    """The test_task_inbox inbox_env pattern, local to this module: one
    active memory server backed by this test's FakeMnemos."""
    allow_hosts(f"127.0.0.1:{fake_mnemos.port}")
    saved_states: dict[str, tuple[bool, str]] = {}
    for s in app_module.registry.servers():
        if s["name"] != "qa-batch-inbox":
            saved_states[s["name"]] = (bool(s["enabled"]), s.get("state", "idle"))
            app_module.registry.set_enabled(s["name"], False)
    app_module.store.upsert_server({
        "name": "qa-batch-inbox", "url": fake_mnemos.url,
        "group_name": "default", "description": "", "token_ref": "",
    })
    app_module.registry.set_enabled("qa-batch-inbox", True)
    app_module.registry.set_state("qa-batch-inbox", "idle")
    yield app_module
    app_module.store.delete_server("qa-batch-inbox")
    for name, (enabled, state) in saved_states.items():
        app_module.registry.set_enabled(name, enabled)
        app_module.registry.set_state(name, state)
    for t in app_module.store.board()["tasks"]:
        if "task-queue-import" in (t.get("mnemos_tags") or []):
            app_module.store.delete_task(t["id"])
    with sqlite3.connect(app_module.store._path) as db:  # noqa: SLF001
        db.execute("DELETE FROM task_inbox")


def _seed_mirror(store, memory_id: str, title: str) -> None:
    store.upsert_inbox_records([{
        "memory_id": memory_id, "server": "qa-batch-inbox",
        "title": title, "excerpt": "body", "tags": ["task:queue"],
        "specialist": "", "project": "", "priority": "normal",
        "source_created_at": _iso_ago(hours=1),
    }], _iso_ago(hours=1))


class TestAdoptBatch:
    def test_batch_adopts_every_record(
            self, batch_inbox_env, client, auth):
        store = batch_inbox_env.store
        _seed_mirror(store, "m-b1", "first")
        _seed_mirror(store, "m-b2", "second")

        r = client.post("/api/tasks/inbox/adopt-batch",
                        json={"memory_ids": ["m-b1", "m-b2"]}, headers=auth)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["adopted"] == 2
        assert body["failed"] == 0
        assert [row["memory_id"] for row in body["results"]] == ["m-b1", "m-b2"]
        assert all(row["ok"] and row["task_id"] for row in body["results"])
        # the native tasks exist and the mirror rows are marked adopted
        assert store.task(body["results"][0]["task_id"]) is not None
        assert store.get_inbox_item("m-b1")["adopted_task_id"]

    def test_one_failure_does_not_abort_the_rest(
            self, batch_inbox_env, client, auth):
        store = batch_inbox_env.store
        _seed_mirror(store, "m-good", "good")
        r = client.post("/api/tasks/inbox/adopt-batch",
                        json={"memory_ids": ["m-good", "m-unknown"]},
                        headers=auth)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["adopted"] == 1
        assert body["failed"] == 1
        by_id = {row["memory_id"]: row for row in body["results"]}
        assert by_id["m-good"]["ok"] is True
        assert by_id["m-unknown"]["ok"] is False
        assert "not found" in by_id["m-unknown"]["detail"]

    def test_double_adopt_reports_existing_task_id(
            self, batch_inbox_env, client, auth):
        store = batch_inbox_env.store
        _seed_mirror(store, "m-dup", "dup")
        first = client.post("/api/tasks/inbox/adopt-batch",
                            json={"memory_ids": ["m-dup"]}, headers=auth)
        assert first.status_code == 200
        second = client.post("/api/tasks/inbox/adopt-batch",
                             json={"memory_ids": ["m-dup"]}, headers=auth)
        assert second.status_code == 200
        row = second.json()["results"][0]
        assert row["ok"] is False
        assert row["task_id"] == first.json()["results"][0]["task_id"]
        assert "already adopted" in row["detail"]

    def test_single_adopt_keeps_historical_409_shape(
            self, batch_inbox_env, client, auth):
        """The pre-ME-073 409 body (top-level task_id) is a contract the
        viewer parses (parseTaskIdFromBody) — the refactor must keep it."""
        store = batch_inbox_env.store
        _seed_mirror(store, "m-shape", "shape")
        first = client.post("/api/tasks/inbox/m-shape/adopt", headers=auth)
        assert first.status_code == 201
        second = client.post("/api/tasks/inbox/m-shape/adopt", headers=auth)
        assert second.status_code == 409
        body = second.json()
        assert body["task_id"] == first.json()["id"]
        assert "already adopted" in body["detail"]

    def test_empty_and_oversized_batches_are_422(self, client, auth):
        r = client.post("/api/tasks/inbox/adopt-batch",
                        json={"memory_ids": []}, headers=auth)
        assert r.status_code == 422
        r = client.post("/api/tasks/inbox/adopt-batch",
                        json={"memory_ids": [f"m{i}" for i in range(101)]},
                        headers=auth)
        assert r.status_code == 422

    def test_batch_needs_the_token(self, client):
        r = client.post("/api/tasks/inbox/adopt-batch",
                        json={"memory_ids": ["m1"]})
        assert r.status_code == 401


# ------------------------------------------- ME-076: archive TTL pass


class TestAutoArchiveSettings:
    def test_defaults(self, monkeypatch):
        from server import app as app_module_ref  # local alias for clarity
        monkeypatch.delenv("VESMARO_AUTO_ARCHIVE", raising=False)
        monkeypatch.delenv("VESMARO_ARCHIVE_TTL_DAYS", raising=False)
        assert app_module_ref._auto_archive_settings() == (True, 3.0)

    def test_env_overrides(self, monkeypatch):
        from server import app as app_module_ref
        monkeypatch.setenv("VESMARO_AUTO_ARCHIVE", "0")
        monkeypatch.setenv("VESMARO_ARCHIVE_TTL_DAYS", "7")
        assert app_module_ref._auto_archive_settings() == (False, 7.0)

    def test_bad_ttl_fails_safe_to_default(self, monkeypatch):
        from server import app as app_module_ref
        monkeypatch.setenv("VESMARO_ARCHIVE_TTL_DAYS", "three")
        assert app_module_ref._auto_archive_settings() == (True, 3.0)
        monkeypatch.setenv("VESMARO_ARCHIVE_TTL_DAYS", "-1")
        assert app_module_ref._auto_archive_settings() == (True, 3.0)


class TestAutoArchivePass:
    def _done_task(self, app_module, make_task, days: float | None):
        task = make_task(col="done")
        if days is not None:
            _backdate(app_module, task["id"], done_at=_iso_ago(days=days))
        return task

    def test_stale_done_is_archived_with_event_and_notification(
            self, app_module, make_task, monkeypatch):
        stale = self._done_task(app_module, make_task, days=4)
        fresh = self._done_task(app_module, make_task, days=1)
        captured: list[dict] = []
        monkeypatch.setattr(app_module, "_broadcast", captured.append)

        result = app_module._auto_archive_once()
        assert result["archived"] == 1

        stored = app_module.store.task(stale["id"])
        assert stored["archived"] == 1
        assert stored["archived_from"] == "done"
        # reports/tags are payload data — archiving touches none of them
        assert stored["mnemos_tags"] == stale["mnemos_tags"]
        assert app_module.store.task(fresh["id"])["archived"] == 0
        # the bus event is the existing task.archived kind
        archived_events = [e for e in captured
                           if e.get("kind") == "task.archived"]
        assert archived_events and archived_events[0]["task_id"] == stale["id"]
        assert archived_events[0]["actor"] == "machine:auto-archive"
        notes = [n for n in app_module.store.notifications()
                 if n["task_id"] == stale["id"] and "в архиве (авто)" in n["title"]]
        assert notes
        # a rerun selects nothing — the row left the live done set
        assert app_module._auto_archive_once()["archived"] == 0

    def test_unstamped_done_is_never_archived(self, app_module, make_task):
        """Honest degradation: a pre-ME-074 done row has no ageable stamp —
        no silent archive of a task whose age we do not know."""
        task = self._done_task(app_module, make_task, days=None)
        assert app_module._auto_archive_once()["archived"] == 0
        assert app_module.store.task(task["id"])["archived"] == 0

    def test_ttl_boundary_respected(self, app_module, make_task):
        self._done_task(app_module, make_task, days=2)
        assert app_module._auto_archive_once()["archived"] == 0

    def test_disabled_config_is_a_noop(self, app_module, make_task,
                                       monkeypatch):
        stale = self._done_task(app_module, make_task, days=10)
        monkeypatch.setenv("VESMARO_AUTO_ARCHIVE", "0")
        result = app_module._auto_archive_once()
        assert result == {"archived": 0, "reminded": 0, "disabled": 1}
        assert app_module.store.task(stale["id"])["archived"] == 0

    def test_resolved_is_reminded_never_moved(self, app_module, make_task,
                                              monkeypatch):
        stale = make_task(col="resolved")
        _backdate(app_module, stale["id"], resolved_at=_iso_ago(days=5))
        captured: list[dict] = []
        monkeypatch.setattr(app_module, "_broadcast", captured.append)

        result = app_module._auto_archive_once()
        assert result["archived"] == 0
        assert result["reminded"] == 1

        stored = app_module.store.task(stale["id"])
        assert stored["archived"] == 0
        assert stored["col"] == "resolved", \
            "a resolved task is never archived without the owner's validation"
        notes = [n for n in app_module.store.notifications()
                 if n["task_id"] == stale["id"] and "ждёт проверки" in n["title"]]
        assert notes
        # the reminder is deduped — one per task per TTL episode
        assert app_module._auto_archive_once()["reminded"] == 0
        notes_after = [n for n in app_module.store.notifications()
                       if n["task_id"] == stale["id"] and "ждёт проверки" in n["title"]]
        assert len(notes_after) == 1

    def test_unarchive_returns_to_done(self, app_module, make_task, ui_auth,
                                       client):
        """The manual way back (ME-076): the auto-archived card returns to
        its pre-archive column via the existing unarchive endpoint."""
        stale = self._done_task(app_module, make_task, days=4)
        app_module._auto_archive_once()
        r = client.post(f"/api/tasks/{stale['id']}/unarchive", headers=ui_auth)
        assert r.status_code == 200, r.text
        stored = app_module.store.task(stale["id"])
        assert stored["archived"] == 0
        assert stored["col"] == "done"

    def test_validation_sweep_tick_runs_the_archive_pass(
            self, app_module, make_task, monkeypatch):
        """The wiring contract: one housekeeping tick owns all board
        housekeeping — the WF-1 flag count stays the return value, but a
        stale done row is gone after the same tick."""
        stale = self._done_task(app_module, make_task, days=4)
        monkeypatch.setattr(app_module, "_broadcast", [])
        assert app_module._validation_sweep_once() == 0
        assert app_module.store.task(stale["id"])["archived"] == 1
