"""ME-078 «Двухканальный рендер задач» — server-slice tests.

Pinned here:
- migration: additive ``tasks.human_view`` / ``task_reports.human_body``
  columns exist on a fresh store (the ALTER path runs on every fresh DB,
  priority/resolved_at precedent — NO SEED_VERSION involvement);
- write paths: create_task / update_task(spec|summary) / add_report
  compute the derived view from the RESULTING raw text; a title-only
  patch never rewrites it;
- raw channel is untouched: ``spec`` keeps the verbatim agent text and
  ``create_assignment`` still snapshots the RAW spec (A2 invariant);
- safety: human_view never INTRODUCES raw HTML — input-borne tags come
  back escaped (XSS invariant for the human channel);
- backfill: one-shot, idempotent (double run — no rewrites), fills rows
  the write paths never saw (seed tasks, history reports), reruns on a
  version bump and does not touch rows already matching the current
  TEXTNORM_VERSION;
- API: the new fields ride additively in TaskOut / ReportOut shapes
  (board, task create, reports, report feed);
- boot: lifespan runs the backfill unconditionally.
"""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

from server.store import Store
from server.textnorm import TEXTNORM_VERSION

DB = "board.db"

SPEC = ("Контекст: владелец одобрил схему (TL + АРХКОМ)\n\n"
        "Acceptance criteria:\n"
        "— [x] raw-канал не тронут\n"
        "— [ ] human_view на карточке")


def _cols(db_path, table: str) -> set[str]:
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    names = {r["name"] for r in db.execute(f"PRAGMA table_info({table})")}
    db.close()
    return names


class TestMigration:
    def test_human_columns_exist_on_fresh_store(self, tmp_path):
        Store(tmp_path / DB)  # fresh DB — exercises the _migrate ALTER path
        assert "human_view" in _cols(tmp_path / DB, "tasks")
        assert "human_body" in _cols(tmp_path / DB, "task_reports")

    def test_second_boot_no_duplicate_columns(self, tmp_path):
        Store(tmp_path / DB)
        Store(tmp_path / DB)  # reopen: migration must no-op cleanly
        db = sqlite3.connect(tmp_path / DB)
        names = [r[0] for r in db.execute(
            "SELECT name FROM pragma_table_info('tasks')")]
        reports = [r[0] for r in db.execute(
            "SELECT name FROM pragma_table_info('task_reports')")]
        db.close()
        assert names.count("human_view") == 1
        assert reports.count("human_body") == 1


class TestWritePaths:
    def test_create_task_computes_human_view(self, tmp_path):
        store = Store(tmp_path / DB)
        task = store.create_task({"title": "t", "spec": SPEC})
        assert task["spec"] == SPEC  # raw channel verbatim
        assert "### Контекст" in task["human_view"]
        assert "- [x] raw-канал не тронут" in task["human_view"]
        assert "архитектурный комитет (АРХКОМ)" in task["human_view"]

    def test_summary_and_spec_both_in_view(self, tmp_path):
        store = Store(tmp_path / DB)
        task = store.create_task({"title": "t",
                                  "summary": "первая строка",
                                  "spec": "Контекст: вторая"})
        assert task["human_view"].startswith("первая строка\n\n### Контекст")

    def test_patch_spec_recomputes_from_resulting_pair(self, tmp_path):
        store = Store(tmp_path / DB)
        task = store.create_task({"title": "t", "summary": "саммари",
                                  "spec": "Контекст: старый"})
        patched = store.update_task(task["id"], {"spec": "Гейты:\n1) pytest"})
        assert "### Гейты" in patched["human_view"]
        assert "саммари" in patched["human_view"]  # summary survives the patch
        assert "старый" not in patched["human_view"]

    def test_patch_summary_only_recomputes(self, tmp_path):
        store = Store(tmp_path / DB)
        task = store.create_task({"title": "t", "summary": "старое",
                                  "spec": "Контекст: суть"})
        patched = store.update_task(task["id"], {"summary": "новое"})
        assert patched["human_view"].startswith("новое")
        assert "### Контекст" in patched["human_view"]

    def test_title_only_patch_keeps_view(self, tmp_path):
        store = Store(tmp_path / DB)
        task = store.create_task({"title": "t", "spec": "Контекст: суть"})
        again = store.update_task(task["id"], {"title": "другое"})
        assert again["human_view"] == task["human_view"]

    def test_audit_trail_records_raw_patch_not_derived_column(self, tmp_path):
        # the derived cache is not owner-authored content — the
        # task.updated event must list only the fields the caller patched
        store = Store(tmp_path / DB)
        task = store.create_task({"title": "t", "summary": "s"})
        store.update_task(task["id"], {"summary": "s2", "spec": "x"})
        events = store.task_events(task["id"])
        updated = next(e for e in events if e["kind"] == "task.updated")
        # updated_at rides the payload by convention (the history digest
        # filters it on display); human_view must NOT ride at all
        assert updated["payload"]["fields"] == ["spec", "summary",
                                                "updated_at"]

    def test_add_report_computes_human_body(self, tmp_path):
        store = Store(tmp_path / DB)
        task = store.create_task({"title": "t"})
        report, _sup = store.add_report(
            task["id"], "TL посмотрел.\n\nГейты:\n— [x] pytest",
            "final", "zcode")
        assert report["body"].startswith("TL посмотрел.")  # raw verbatim
        assert report["human_body"].startswith("техлид (TL) посмотрел.")
        assert "- [x] pytest" in report["human_body"]

    def test_assignment_snapshot_is_raw_a2_invariant(self, tmp_path):
        store = Store(tmp_path / DB)
        task = store.create_task({"title": "t", "spec": SPEC})
        assignment = store.create_assignment(task["id"], "spec", "zcode")
        assert assignment["spec_snapshot"] == SPEC  # NOT the human view

    def test_human_view_never_introduces_html(self, tmp_path):
        store = Store(tmp_path / DB)
        task = store.create_task({
            "title": "xss",
            "summary": "<script>alert(1)</script>",
            "spec": "<img src=x onerror=alert(1)> Контекст: дело",
        })
        assert "<script" not in task["human_view"]
        assert "<img" not in task["human_view"]
        assert "&lt;script&gt;" in task["human_view"]


class TestBackfill:
    def test_fills_seed_rows_and_history_reports(self, tmp_path):
        store = Store(tmp_path / DB)  # seeds 11 tasks with empty human_view
        task = store.create_task({"title": "t", "spec": "Контекст: суть"})
        store.add_report(task["id"], "финал TL", "final", "zcode")
        # simulate a pre-ME-078 row: raw written, view never computed
        db = sqlite3.connect(tmp_path / DB)
        db.execute("UPDATE tasks SET human_view='' WHERE id=?", (task["id"],))
        db.execute(
            "UPDATE task_reports SET human_body='' WHERE task_id=?",
            (task["id"],))
        db.commit()
        db.close()

        updated = store.backfill_human_views()

        assert updated >= 2  # the task + the report (plus seeded tasks)
        fresh = store.task(task["id"])
        assert "### Контекст" in fresh["human_view"]
        assert store.list_reports(task["id"])[0]["human_body"] != ""

    def test_double_run_is_noop(self, tmp_path):
        store = Store(tmp_path / DB)
        assert store.backfill_human_views() > 0  # seed rows need it
        assert store.backfill_human_views() == 0
        assert store.backfill_human_views() == 0
        assert store.get_meta(Store.HUMAN_VIEW_META_KEY) == \
            str(TEXTNORM_VERSION)

    def test_current_rows_not_rewritten_on_rerun(self, tmp_path):
        store = Store(tmp_path / DB)
        task = store.create_task({"title": "t", "spec": "Контекст: суть"})
        store.backfill_human_views()
        store.set_meta(Store.HUMAN_VIEW_META_KEY, "0")  # operator reset
        # the task's view already matches → the rerun must not touch it
        assert store.backfill_human_views() == 0
        assert store.task(task["id"])["human_view"] == \
            task["human_view"]

    def test_stale_flag_rerun_recomputes(self, tmp_path):
        store = Store(tmp_path / DB)
        task = store.create_task({"title": "t", "spec": "Контекст: суть"})
        store.backfill_human_views()
        # a future TEXTNORM_VERSION bump: flag no longer matches, row mutated
        db = sqlite3.connect(tmp_path / DB)
        db.execute("UPDATE tasks SET human_view='мусор прошлой версии'")
        db.commit()
        db.close()
        store.set_meta(Store.HUMAN_VIEW_META_KEY, "0")
        assert store.backfill_human_views() >= 1
        assert store.task(task["id"])["human_view"] != "мусор прошлой версии"
        assert store.get_meta(Store.HUMAN_VIEW_META_KEY) == \
            str(TEXTNORM_VERSION)


class TestApi:
    def test_task_out_carries_human_view(self, client, auth, make_task):
        task = make_task(spec=SPEC)
        got = client.get(f"/api/tasks/{task['id']}", headers=auth).json()
        assert "### Контекст" in got["human_view"]
        board = client.get("/api/board", headers=auth).json()
        row = next(t for t in board["tasks"] if t["id"] == task["id"])
        assert "- [x] raw-канал не тронут" in row["human_view"]

    def test_report_out_carries_human_body(self, client, auth, make_task):
        task = make_task()
        r = client.post(f"/api/tasks/{task['id']}/reports", headers=auth,
                        json={"body": "TL посмотрел.\n\nГейты:\n- [x] t",
                              "kind": "final", "agent": "zcode"})
        assert r.status_code == 201, r.text
        assert r.json()["report"]["human_body"].startswith("техлид (TL)")
        items = client.get(f"/api/tasks/{task['id']}/reports",
                           headers=auth).json()["items"]
        assert items[0]["human_body"]
        feed = client.get("/api/reports", headers=auth).json()
        assert all("human_body" in it for it in feed["items"])

    def test_lifespan_boot_runs_backfill(self, client, auth, app_module,
                                         data_dir, make_task):
        task = make_task(spec="Контекст: бут")
        # simulate stale rows + disarmed flag, then boot with lifespan —
        # the backfill must refill in that boot (direct sqlite write is
        # the established pattern here, see test_backfill_reports.py)
        db = sqlite3.connect(data_dir / "board.db")
        db.execute("UPDATE tasks SET human_view=''")
        db.execute("DELETE FROM board_meta WHERE key=?",
                   (Store.HUMAN_VIEW_META_KEY,))
        db.commit()
        db.close()
        with TestClient(app_module.app):
            pass
        got = client.get(f"/api/tasks/{task['id']}", headers=auth).json()
        assert "### Контекст" in got["human_view"]
        assert app_module.store.get_meta(Store.HUMAN_VIEW_META_KEY) == \
            str(TEXTNORM_VERSION)
