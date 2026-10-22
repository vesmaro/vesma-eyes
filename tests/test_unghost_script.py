"""Loop S-step 2: scripts/unghost_assignments.py — the one-off migration
for the queued pinned ghost class (prod case: assignment id=9, queued
2026-09-23, pinned to laptop-zcode-1, disabled 2026-09-24).

Coverage:
- dry-run (the default) reports the ghost and writes NOTHING;
- --apply --mode unpin (default): specialist slug normalized, pin cleared,
  honest note stamped, journal event, nomination back in the live queue;
- --apply --mode cancel: terminal cancelled with the reason;
- idempotent re-run: a resolved ghost is no longer a ghost;
- the script never fights a live owner: a row whose pin target became
  eligible again is skipped (409-class), not forced.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

from server.store import Store

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / \
    "unghost_assignments.py"


def _load_script():
    spec = importlib.util.spec_from_file_location("unghost_assignments",
                                                  _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    sys.modules.setdefault("unghost_assignments", mod)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def script():
    return _load_script()


@pytest.fixture()
def ghost_store(tmp_path: Path) -> Store:
    """A fresh board with one PRE-S-step ghost: a queued assignment pinned
    to an executor id that is not in the registry (the executor-unknown
    flavor of the id=9 class), carrying the RAW display name exactly as
    the pre-normalization board stored it (mint-time normalization is
    deliberately bypassed — the migration's data-fix leg is the point)."""
    store = Store(tmp_path / "board.db")
    task = store.create_task({"title": "ghosted work", "spec": "AC: x"})
    a = store.create_assignment(task["id"], "@GCW: Tech Lead",
                                "zcode", executor_id="ex-gone")
    with store._lock, store._conn() as db:
        db.execute("UPDATE task_assignments SET specialist=? WHERE id=?",
                   ("@GCW: Tech Lead", a["id"]))
    return store


def test_dry_run_reports_and_writes_nothing(ghost_store, script, capsys):
    rc = script.main(["--db", str(ghost_store._path)])
    out = capsys.readouterr().out
    assert rc == 0
    assert "#1" in out and "executor-unknown" in out
    assert "DRY-RUN" in out
    row = ghost_store.waiting_pinned_assignments()
    assert len(row) == 1                      # still pinned
    assert row[0]["executor_id"] == "ex-gone"


def test_apply_unpin_resolves_the_ghost(ghost_store, script, capsys):
    rc = script.main(["--db", str(ghost_store._path), "--apply"])
    out = capsys.readouterr().out
    assert rc == 0
    assert ghost_store.waiting_pinned_assignments() == []
    with ghost_store._lock, ghost_store._conn() as db:
        row = dict(db.execute(
            "SELECT * FROM task_assignments WHERE id=1").fetchone())
    assert row["state"] == "queued"           # alive, not killed
    assert row["executor_id"] == ""           # pin removed
    assert row["specialist"] == "gcw-tech-lead"   # S-step 1 on data
    assert "разморожено" in row["note"]
    events = ghost_store.events(limit=100)
    unpinned = [e for e in events if e["kind"] == "assignment.ghost_unpinned"]
    assert len(unpinned) == 1
    assert unpinned[0]["payload"]["executor_id_removed"] == "ex-gone"
    assert unpinned[0]["payload"]["specialist_before"] == "@GCW: Tech Lead"
    assert "back in the queue" in out


def test_apply_is_idempotent(ghost_store, script):
    assert script.main(["--db", str(ghost_store._path), "--apply"]) == 0
    # second run: no ghosts left, clean no-op
    assert script.main(["--db", str(ghost_store._path), "--apply"]) == 0


def test_apply_cancel_mode(ghost_store, script):
    rc = script.main(["--db", str(ghost_store._path), "--apply",
                      "--mode", "cancel"])
    assert rc == 0
    with ghost_store._lock, ghost_store._conn() as db:
        row = dict(db.execute(
            "SELECT * FROM task_assignments WHERE id=1").fetchone())
    assert row["state"] == "cancelled"
    assert "разморожено" in row["note"]
    events = ghost_store.events(limit=100)
    assert any(e["kind"] == "assignment.cancelled" and
               e["payload"].get("outcome") == "unghost" for e in events)


def test_script_never_fights_a_live_owner(tmp_path, script):
    """A pin onto an ELIGIBLE executor is not a ghost — the script must
    skip it (the store refuses), not force the pin off."""
    store = Store(tmp_path / "board.db")
    executor, _secret = store.register_executor("live-1", "zcode")
    with store._lock, store._conn() as db:
        db.execute("UPDATE executors SET state='approved', enabled=1 "
                   "WHERE id=?", (executor["id"],))
    task = store.create_task({"title": "live work"})
    store.create_assignment(task["id"], "smoke-probe", "zcode",
                            executor_id=executor["id"])
    rc = script.main(["--db", str(store._path), "--apply"])
    assert rc == 0
    with store._lock, store._conn() as db:
        row = dict(db.execute(
            "SELECT * FROM task_assignments WHERE id=1").fetchone())
    assert row["executor_id"] == executor["id"]   # untouched
    assert row["state"] == "queued"
