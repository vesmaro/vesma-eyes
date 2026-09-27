"""zcode transcript reader tests (Kora slice 2, ADR 0019 gate 8 + gate 4).

The reader contract (server/kora/zcode_reader.read_zcode_transcript):
- STRICTLY read-only: mode=ro open; a write through the reader FAILS and
  the scan leaves the store byte-identical (anti-write, every family);
- items are assembled from message(role) + part(text/reasoning/tool),
  ordered by the store order, seq 1..N — never renumbered;
- the frozen cursor semantics: items with seq > after_seq, first
  ``limit``, next_after_seq = last returned seq (unchanged on an empty
  page), has_more honest;
- unknown session → SessionNotFoundError (404 upstream);
- caps are LOAD caps with EXPLICIT truncation markers, never silent.

The fixture builds a SYNTHETIC mini-store (the live-verified schema in a
tiny file; no owner data is copied anywhere).
"""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

import pytest

from server.kora.zcode_reader import (
    TRANSCRIPT_ITEM_MAX_CHARS,
    TRANSCRIPT_MAX_ITEMS,
    SessionNotFoundError,
    read_zcode_transcript,
)

_SCHEMA = """
CREATE TABLE session (
    id            TEXT PRIMARY KEY,
    parent_id     TEXT,
    directory     TEXT NOT NULL,
    title         TEXT NOT NULL,
    time_created  INTEGER NOT NULL,
    time_updated  INTEGER NOT NULL,
    time_archived INTEGER
);
CREATE TABLE message (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL,
    data         TEXT NOT NULL,
    sequence     INTEGER
);
CREATE TABLE part (
    id           TEXT PRIMARY KEY,
    message_id   TEXT NOT NULL,
    session_id   TEXT NOT NULL,
    time_created INTEGER NOT NULL,
    time_updated INTEGER,
    sequence     INTEGER,
    data         TEXT NOT NULL
);
"""

NOW_MS = int(time.time() * 1000)
_MIN = 60 * 1000


def _msg(mid: str, role: str) -> tuple:
    return (mid, "sess_t", NOW_MS, NOW_MS,
            json.dumps({"role": role, "time": {}}), 0)


@pytest.fixture()
def store(tmp_path: Path) -> Path:
    db = tmp_path / "db.sqlite"
    con = sqlite3.connect(db)
    con.executescript(_SCHEMA)
    con.execute("INSERT INTO session VALUES (?,?,?,?,?,?,NULL)",
                ("sess_t", None, "/proj/t", "Транскрипт",
                 NOW_MS - 3 * 3600 * 1000, NOW_MS - _MIN))
    # message rows carry the roles
    con.execute("INSERT INTO message VALUES (?,?,?,?,?,?)",
                _msg("m1", "user"))
    con.execute("INSERT INTO message VALUES (?,?,?,?,?,?)",
                _msg("m2", "assistant"))
    con.execute("INSERT INTO message VALUES (?,?,?,?,?,?)",
                _msg("m3", "assistant"))
    con.execute("INSERT INTO message VALUES (?,?,?,?,?,?)",
                _msg("m4", "user"))
    # parts in chronological order: text, step marker, reasoning, tool
    con.executemany(
        "INSERT INTO part VALUES (?,?,?,?,?,?,?)", [
            ("p1", "m1", "sess_t", NOW_MS - 5 * _MIN, NOW_MS - 5 * _MIN, 1,
             json.dumps({"type": "text", "text": "вопрос владельца"})),
            ("p2", "m2", "sess_t", NOW_MS - 4 * _MIN, NOW_MS - 4 * _MIN, 2,
             json.dumps({"type": "step-start"})),
            ("p3", "m3", "sess_t", NOW_MS - 3 * _MIN, NOW_MS - 3 * _MIN, 3,
             json.dumps({"type": "reasoning",
                         "text": "думаю над ответом"})),
            ("p4", "m3", "sess_t", NOW_MS - 2 * _MIN, NOW_MS - 2 * _MIN, 4,
             json.dumps({"type": "tool", "tool": "read_file",
                         "callID": "c1",
                         "state": {"title": "read_file main.py",
                                   "status": "completed",
                                   "output": "def main(): ..."}})),
            ("p5", "m3", "sess_t", NOW_MS - _MIN, NOW_MS - _MIN, 5,
             json.dumps({"type": "text",
                         "text": "ответ ассистента с "
                                 "ghp_AbCdEf1234567890aBcDeF внутри"})),
            ("p6", "m4", "sess_t", NOW_MS - 30 * 1000, NOW_MS - 30 * 1000, 6,
             json.dumps({"type": "text", "text": "уточнение"})),
        ])
    con.commit()
    con.close()
    return db


class TestAssemble:
    def test_items_roles_kinds_store_order(self, store: Path):
        result = read_zcode_transcript(store, "sess_t", limit=200)
        # step markers carry no content — 5 items out of 6 parts, and
        # P2-2: seq is the part's ABSOLUTE position, so the structural
        # part leaves a GAP (1, gap at 2, then 3..6), never a shift.
        assert [it["seq"] for it in result.items] == [1, 3, 4, 5, 6]
        first, reasoning, tool, answer, last = (
            result.items[0], result.items[1], result.items[2],
            result.items[3], result.items[4])
        assert first["role"] == "user" and first["kind"] is None
        assert first["content"] == "вопрос владельца"
        assert reasoning["role"] == "assistant"
        assert reasoning["kind"] == "reasoning"
        assert tool["role"] == "tool" and tool["kind"] == "read_file"
        assert "read_file main.py" in tool["content"]
        assert "def main(): ..." in tool["content"]
        assert answer["content"].startswith("ответ ассистента")
        assert last["content"] == "уточнение"
        assert last["role"] == "user"
        # timestamps are ISO, monotonically non-decreasing with seq
        assert all(it["ts"].startswith("20") for it in result.items)
        assert result.items == sorted(result.items, key=lambda i: i["ts"])

    def test_tool_output_list_rendered_as_json(self, tmp_path: Path):
        """P3 (slice-2 review): state.output of a LIST shape must render
        through the same json.dumps path as an object — never silently
        dropped."""
        db = tmp_path / "listout.sqlite"
        con = sqlite3.connect(db)
        con.executescript(_SCHEMA)
        con.execute("INSERT INTO session VALUES (?,?,?,?,?,?,NULL)",
                    ("sess_l", None, "/p", "l", NOW_MS, NOW_MS))
        con.execute("INSERT INTO message VALUES (?,?,?,?,?,?)",
                    _msg("m1", "assistant"))
        con.execute("INSERT INTO part VALUES (?,?,?,?,?,?,?)",
                    ("p1", "m1", "sess_l", NOW_MS, NOW_MS, 1,
                     json.dumps({"type": "tool", "tool": "ls",
                                 "state": {"title": "ls",
                                           "output": ["a.txt", "b.txt"]}})))
        con.commit()
        con.close()
        result = read_zcode_transcript(db, "sess_l")
        content = result.items[0]["content"]
        assert "a.txt" in content and "b.txt" in content

    def test_torn_message_row_degrades_to_system(self, store: Path):
        """A part whose message vanished (mid-write read) still serves —
        the role degrades to ``system``, content is never hidden."""
        con = sqlite3.connect(store)
        con.execute("INSERT INTO part VALUES (?,?,?,?,?,?,?)",
                    ("p7", "m_ghost", "sess_t", NOW_MS, NOW_MS, 7,
                     json.dumps({"type": "text", "text": "хвост"})))
        con.commit()
        con.close()
        result = read_zcode_transcript(store, "sess_t", limit=200)
        assert result.items[-1]["role"] == "system"
        assert result.items[-1]["content"] == "хвост"


class TestCursor:
    def test_frozen_cursor_semantics(self, store: Path):
        page1 = read_zcode_transcript(store, "sess_t", after_seq=0, limit=2)
        assert [it["seq"] for it in page1.items] == [1, 3]
        assert page1.next_after_seq == 3
        assert page1.has_more is True
        page2 = read_zcode_transcript(store, "sess_t", after_seq=3, limit=2)
        assert [it["seq"] for it in page2.items] == [4, 5]
        assert page2.has_more is True
        page3 = read_zcode_transcript(store, "sess_t", after_seq=5, limit=2)
        assert [it["seq"] for it in page3.items] == [6]
        assert page3.has_more is False

    def test_empty_page_keeps_the_cursor(self, store: Path):
        result = read_zcode_transcript(store, "sess_t", after_seq=99,
                                       limit=50)
        assert result.items == []
        assert result.next_after_seq == 99
        assert result.has_more is False

    def test_limit_clamped_to_contract_cap(self, store: Path):
        result = read_zcode_transcript(store, "sess_t", limit=10_000)
        assert len(result.items) == 5  # everything, not 10k

    def test_seq_anchor_survives_the_sliding_window(self, store: Path):
        """P2-2 (slice-2 review): the numbering is ANCHORED to the
        absolute store order — the same part keeps its seq whether the
        window covers all 6 parts or only the newest 2, so a client
        cursor never lies when the window slides."""
        whole = read_zcode_transcript(store, "sess_t", limit=200)
        narrow = read_zcode_transcript(store, "sess_t", limit=200,
                                       max_items=2)
        # the narrow window keeps only the newest 2 parts — with their
        # ABSOLUTE seqs (5, 6), identical to the full read
        assert [it["seq"] for it in narrow.items] == [5, 6]
        whole_by_seq = {it["seq"]: it["content"] for it in whole.items}
        for index, it in enumerate(narrow.items):
            expected = whole_by_seq[it["seq"]]
            if index == 0 and not it["content"].startswith(expected):
                # the narrow window DROPS a head — its first item SPEAKS
                # the cut (P2-1), then the same text follows
                assert it["content"].startswith(
                    "…[начало транскрипта обрезано ридером Коры: "
                    "4 записей]…")
                assert it["content"].endswith(expected)
            else:
                assert it["content"] == expected


class TestHeadCut:
    """P2-1 (slice-2 review): the head cut must SPEAK — the first item
    of every page carries the explicit marker naming the dropped count."""

    def test_marker_on_first_page(self, tmp_path: Path):
        db = tmp_path / "head.sqlite"
        con = sqlite3.connect(db)
        con.executescript(_SCHEMA)
        con.execute("INSERT INTO session VALUES (?,?,?,?,?,?,NULL)",
                    ("sess_h", None, "/p", "h", NOW_MS, NOW_MS))
        con.execute("INSERT INTO message VALUES (?,?,?,?,?,?)",
                    _msg("m1", "user"))
        total = 12
        rows = []
        for i in range(total):
            rows.append((f"p{i}", "m1", "sess_h", NOW_MS + i, NOW_MS + i,
                         i, json.dumps({"type": "text",
                                        "text": f"r{i}"})))
        con.executemany("INSERT INTO part VALUES (?,?,?,?,?,?,?)", rows)
        con.commit()
        con.close()
        result = read_zcode_transcript(db, "sess_h", limit=200,
                                       max_items=5)
        assert result.head_dropped is True
        first = result.items[0]
        assert first["content"].startswith(
            "…[начало транскрипта обрезано ридером Коры: 7 записей]…")
        assert first["content"].endswith("r7")  # the real text follows
        # later items are untouched by the marker
        assert result.items[1]["content"] == "r8"

    def test_marker_only_when_head_dropped(self, store: Path):
        result = read_zcode_transcript(store, "sess_t", limit=200)
        assert result.head_dropped is False
        assert not result.items[0]["content"].startswith("…[")

    def test_marker_names_the_exact_dropped_count(self, tmp_path: Path):
        db = tmp_path / "head2.sqlite"
        con = sqlite3.connect(db)
        con.executescript(_SCHEMA)
        con.execute("INSERT INTO session VALUES (?,?,?,?,?,?,NULL)",
                    ("sess_h2", None, "/p", "h", NOW_MS, NOW_MS))
        con.execute("INSERT INTO message VALUES (?,?,?,?,?,?)",
                    _msg("m1", "user"))
        rows = []
        for i in range(TRANSCRIPT_MAX_ITEMS + 3):
            rows.append((f"p{i}", "m1", "sess_h2", NOW_MS + i, NOW_MS + i,
                         i, json.dumps({"type": "text",
                                        "text": f"row{i}"})))
        con.executemany("INSERT INTO part VALUES (?,?,?,?,?,?,?)", rows)
        con.commit()
        con.close()
        result = read_zcode_transcript(db, "sess_h2", limit=10)
        assert result.items[0]["content"].startswith(
            f"…[начало транскрипта обрезано ридером Коры: 3 записей]…")


class TestCaps:
    def test_item_content_cap_is_explicit(self, tmp_path: Path):
        db = tmp_path / "big.sqlite"
        con = sqlite3.connect(db)
        con.executescript(_SCHEMA)
        con.execute("INSERT INTO session VALUES (?,?,?,?,?,?,NULL)",
                    ("sess_big", None, "/p", "b", NOW_MS, NOW_MS))
        con.execute("INSERT INTO message VALUES (?,?,?,?,?,?)",
                    _msg("m1", "assistant"))
        huge = "x" * (TRANSCRIPT_ITEM_MAX_CHARS + 5000)
        con.execute("INSERT INTO part VALUES (?,?,?,?,?,?,?)",
                    ("p1", "m1", "sess_big", NOW_MS, NOW_MS, 1,
                     json.dumps({"type": "tool", "tool": "dump",
                                 "state": {"title": "dump",
                                           "output": huge}})))
        con.commit()
        con.close()
        result = read_zcode_transcript(db, "sess_big")
        content = result.items[0]["content"]
        assert len(content) < TRANSCRIPT_ITEM_MAX_CHARS + 200
        assert "обрезано ридером Коры" in content, (
            "the truncation marker must be explicit, never silent")

    def test_head_truncation_flag(self, tmp_path: Path):
        db = tmp_path / "many.sqlite"
        con = sqlite3.connect(db)
        con.executescript(_SCHEMA)
        con.execute("INSERT INTO session VALUES (?,?,?,?,?,?,NULL)",
                    ("sess_m", None, "/p", "m", NOW_MS, NOW_MS))
        con.execute("INSERT INTO message VALUES (?,?,?,?,?,?)",
                    _msg("m1", "user"))
        rows = []
        for i in range(TRANSCRIPT_MAX_ITEMS + 10):
            rows.append((f"p{i}", "m1", "sess_m", NOW_MS + i, NOW_MS + i, i,
                         json.dumps({"type": "text", "text": f"r{i}"})))
        con.executemany("INSERT INTO part VALUES (?,?,?,?,?,?,?)", rows)
        con.commit()
        con.close()
        result = read_zcode_transcript(db, "sess_m", limit=200)
        assert result.head_dropped is True
        # the NEWEST max_items survive; the oldest 10 rows are gone —
        # and the first item SPEAKS the cut (P2-1) with the anchored seq
        # (absolute position of p10 = 11)
        assert result.items[0]["seq"] == 11
        assert result.items[0]["content"].startswith(
            "…[начало транскрипта обрезано ридером Коры: 10 записей]…")
        assert result.items[0]["content"].endswith("r10")


class TestErrorsAndAntiWrite:
    def test_unknown_session_typed(self, store: Path):
        with pytest.raises(SessionNotFoundError):
            read_zcode_transcript(store, "sess_nope")
        with pytest.raises(SessionNotFoundError):
            read_zcode_transcript(store, "")

    def test_missing_store_typed(self, tmp_path: Path):
        from server.kora.zcode_reader import StoreNotFoundError
        with pytest.raises(StoreNotFoundError):
            read_zcode_transcript(tmp_path / "nope.sqlite", "sess_t")

    def test_reader_connection_is_read_only(self, store: Path):
        from server.kora.zcode_reader import _connect_ro, close_ro
        con, tmpdir = _connect_ro(store)
        try:
            with pytest.raises(sqlite3.OperationalError):
                con.execute("DELETE FROM part")
            with pytest.raises(sqlite3.OperationalError):
                con.execute("UPDATE session SET title='x'")
        finally:
            close_ro(con, tmpdir)

    def test_read_leaves_store_byte_identical(self, store: Path):
        before = store.read_bytes()
        read_zcode_transcript(store, "sess_t")
        assert store.read_bytes() == before
