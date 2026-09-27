"""pi reader tests (Kora slice 2, ADR 0019 gate 8).

The reader contract (server/kora/pi_reader.scan_pi_stores):
- STRICTLY read-only; the scan leaves every byte untouched (anti-write);
- lists map the store layout: sessions/<mangled-cwd>/<ts>_<uuid7>.jsonl;
  the FIRST record (type=session, version 3) carries id/timestamp/cwd;
  the parentId chain is NEVER touched — the reader lists, it does not
  parse the tree (the chain belongs to the pi process);
- non-session siblings (run-history.jsonl, subagent-artifacts/,
  context-mode/) are skipped;
- previews come from the tail window (append-only log ⇒ freshest at
  EOF), parsed tolerantly (text / content keys);
- malformed files are skipped with a counter, never crash the scan.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import pytest

from server.kora.pi_reader import (
    LIVE_WINDOW_SECONDS,
    StoreNotFoundError,
    scan_pi_stores,
)

NOW = time.time()
HEADER = {"type": "session", "version": "3", "id": "1g9x2abc",
          "timestamp": "2026-09-22T07:30:00Z",
          "cwd": "/var/home/abyss/proj/demo"}


def _write_session(path: Path, header: dict, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps(header)] + [json.dumps(r) for r in records]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


@pytest.fixture()
def store(tmp_path: Path) -> Path:
    root = tmp_path / "sessions"
    # one session under its mangled-cwd dir, live (fresh mtime)
    live = root / "var-home-abyss-proj-demo" / "20260922_1g9x2abc.jsonl"
    _write_session(live, HEADER, [
        {"type": "message", "role": "user", "parentId": HEADER["id"],
         "content": [{"type": "text", "text": "запуск задачи"}]},
        {"type": "message", "role": "assistant", "parentId": "m1",
         "text": "готово, отчёт ниже"},
    ])
    # one idle session (mtime beyond the presence window)
    idle = root / "var-home-abyss-proj-old" / "20260920_2h8y3def.jsonl"
    idle_header = dict(HEADER, id="2h8y3def", cwd="/proj/old",
                       timestamp="2026-09-20T07:30:00Z")
    _write_session(idle, idle_header, [
        {"type": "message", "role": "user", "text": "старый запуск"}])
    old = NOW - 2 * LIVE_WINDOW_SECONDS - 60
    os.utime(idle, (old, old))
    # non-session siblings must not become rows
    (root / "run-history.jsonl").write_text(
        json.dumps({"agent": "coder", "task": "x"}) + "\n",
        encoding="utf-8")
    _write_session(root / "subagent-artifacts" / "x_transcript.jsonl",
                   {"type": "session", "version": "3", "id": "sub"},
                   [])
    (root / "context-mode" / "sessions").mkdir(parents=True, exist_ok=True)
    (root / "context-mode" / "sessions" / "a.db").write_bytes(b"sqlite")
    return root


class TestScan:
    def test_listing_maps_the_store(self, store: Path):
        result = scan_pi_stores(store, now=NOW)
        by_id = {r["native_id"]: r for r in result.sessions}
        assert set(by_id) == {"1g9x2abc", "2h8y3def"}
        live = by_id["1g9x2abc"]
        assert live["harness"] == "pi"
        assert live["project"] == "demo"
        assert live["cwd"] == "/var/home/abyss/proj/demo"
        assert live["state"] == "live"
        assert live["origin"] == "local"
        assert live["steerable"] is False
        assert live["started_at"].startswith("2026-09-22T07:30:00")
        assert live["preview"] == "готово, отчёт ниже"
        idle = by_id["2h8y3def"]
        assert idle["state"] == "idle"
        assert idle["project"] == "old"

    def test_non_session_siblings_skipped(self, store: Path):
        result = scan_pi_stores(store, now=NOW)
        assert result.skipped_files == 0
        assert all(r["native_id"] not in ("sub",)
                   for r in result.sessions)
        assert len(result.sessions) == 2

    def test_malformed_file_skipped_with_counter(self, store: Path):
        (store / "var-home-abyss-proj-demo" / "bad_file.jsonl").write_text(
            "{broken\n", encoding="utf-8")
        result = scan_pi_stores(store, now=NOW)
        assert result.skipped_files == 1
        assert len(result.sessions) == 2

    def test_missing_root_typed(self, tmp_path: Path):
        with pytest.raises(StoreNotFoundError):
            scan_pi_stores(tmp_path / "nope")

    def test_empty_store_is_an_honest_empty_listing(self, tmp_path: Path):
        root = tmp_path / "sessions"
        root.mkdir()
        result = scan_pi_stores(root, now=NOW)
        assert result.sessions == []


class TestAntiWrite:
    def test_scan_leaves_every_byte_identical(self, store: Path):
        files = sorted(p for p in store.rglob("*") if p.is_file())
        before = {p: p.read_bytes() for p in files}
        scan_pi_stores(store, now=NOW)
        for p in files:
            assert p.read_bytes() == before[p], (
                f"the scan must not touch {p}")
        assert sorted(p for p in store.rglob("*") if p.is_file()) == files
