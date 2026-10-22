#!/usr/bin/env python3
"""unghost_assignments — one-off migration for queued pinned ghosts.

Loop S-step 2 (verdict card loop-verification-board-agents, 2026-10-22):
a queued assignment explicitly pinned to an executor that is disabled /
revoked / pending / gone can never be claimed (the ARCH-9 pin gate) and
holds the task's ≤1-active slot forever. The live case is id=9: queued
since 2026-09-23, pinned to laptop-zcode-1, disabled 2026-09-24.

The CODE rule (already in server): such an assignment carries the honest
computed "waiting" status with human words from the downtime dictionary
(Store.EXECUTOR_WAIT_REASONS) on every read. THIS script resolves the
EXISTING rows:

- ``unpin`` (default, reversible): normalize the specialist slug
  (S-step 1 applied to data), clear the stale pin, stamp an honest note —
  the nomination returns to the live queue where any eligible poller can
  claim it. The removed pin survives in the journal event
  (assignment.ghost_unpinned).
- ``cancel``: terminal cancelled with the reason in the note (the owner's
  "не нужно", recorded where it happened).

DRY-RUN IS THE DEFAULT: without --apply nothing is written — the script
prints what it found and what it would do. Never points at a live DB
without the operator saying so:

    # inspect (read-only scan + plan):
    VESMARO_DATA=/data python3 scripts/unghost_assignments.py

    # resolve in place:
    VESMARO_DATA=/data python3 scripts/unghost_assignments.py --apply
    VESMARO_DATA=/data python3 scripts/unghost_assignments.py --apply --mode cancel

Safe to re-run: the ghost scan is the same predicate the store enforces,
and unghost_assignment refuses any row that is not queued or whose pin
target became eligible again (it never fights a live owner).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# allow running from any cwd: python3 scripts/unghost_assignments.py
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from server.store import AssignmentError, Store  # noqa: E402


def _plan_line(a: dict) -> str:
    w = a["waiting"]
    return (f"  assignment #{a['id']} task={a['task_id']} "
            f"specialist={a['specialist']!r} harness={a['harness']} "
            f"pin={a['executor_id']} [{w['code']}]\n"
            f"    причина: {w['reason']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Resolve queued assignments pinned to ineligible "
                    "executors (dry-run by default).")
    parser.add_argument("--db", default="",
                        help="path to board.db (default: $VESMARO_DATA/board.db)")
    parser.add_argument("--apply", action="store_true",
                        help="write the resolution (default: dry-run)")
    parser.add_argument("--mode", choices=("unpin", "cancel"),
                        default="unpin",
                        help="unpin = back to the live queue (default); "
                             "cancel = terminal cancelled")
    args = parser.parse_args(argv)

    db_path = (Path(args.db) if args.db
               else Path(os.environ.get("VESMARO_DATA", "/data"))
               / "board.db")
    if not db_path.exists():
        print(f"error: board DB not found at {db_path} "
              "(use --db or set VESMARO_DATA)", file=sys.stderr)
        return 1

    store = Store(db_path)
    ghosts = store.waiting_pinned_assignments()
    if not ghosts:
        print("unghost: no queued pinned ghosts found — nothing to do")
        return 0

    print(f"unghost: {len(ghosts)} ghost assignment(s) "
          f"in {db_path} (mode={args.mode}, "
          f"{'APPLY' if args.apply else 'DRY-RUN'})")
    for a in ghosts:
        print(_plan_line(a))

    if not args.apply:
        print("unghost: dry-run — nothing written "
              "(pass --apply to resolve)")
        return 0

    done = skipped = 0
    for a in ghosts:
        try:
            after = store.unghost_assignment(a["id"], mode=args.mode,
                                             actor="unghost-migration")
        except AssignmentError as exc:
            print(f"  skipped #{a['id']}: {exc}")
            skipped += 1
            continue
        done += 1
        if args.mode == "cancel":
            print(f"  cancelled #{after['id']} task={after['task_id']} "
                  f"(note: {after['note'][:120]})")
        else:
            print(f"  unpinned #{after['id']} task={after['task_id']} "
                  f"specialist={after['specialist']!r} — back in the queue")
    print(f"unghost: done={done} skipped={skipped}")
    return 0 if skipped == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
