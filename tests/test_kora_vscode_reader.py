"""VS Code Copilot Chat reader tests (Kora slice 2, ADR 0019 gate 8).

The reader contract (server/kora/vscode_reader.scan_vscode_stores):
- STRICTLY read-only: plain file reads; the scan leaves every byte
  untouched (anti-write, every reader family);
- lists map the store layout: workspaceStorage/<wsHash>/chatSessions +
  globalStorage/emptyWindowChatSessions, project via workspace.json;
- the kind:0 envelope v3 header carries sessionId + requests; previews
  come from the last request (or the tail window); kind:1 patches are
  NOT applied — the slice-2 known gap, coverage stays lists-only;
- malformed files are skipped with a counter, never crash the scan;
- caps bound the scan (file size, session count).
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from server.kora.vscode_reader import (
    LIVE_WINDOW_SECONDS,
    StoreNotFoundError,
    scan_vscode_stores,
)

NOW = time.time()


def _envelope(session_id: str, requests: list[dict]) -> str:
    return json.dumps({
        "kind": 0,
        "v": {"version": 3, "sessionId": session_id, "requests": requests},
    }) + "\n"


def _request(text: str) -> dict:
    return {"message": {"text": text, "parts": []}}


@pytest.fixture()
def store(tmp_path: Path) -> Path:
    """Synthetic VS Code User dir: two workspaces + empty-window chats."""
    user = tmp_path / "User"
    ws1 = user / "workspaceStorage" / "ws-hash-1"
    (ws1 / "chatSessions").mkdir(parents=True)
    (ws1 / "workspace.json").write_text(json.dumps(
        {"folder": "file:///var/home/abyss/proj/sealbox"}), encoding="utf-8")
    live = ws1 / "chatSessions" / "aaaa1111-0000-0000-0000-000000000001.jsonl"
    live.write_text(_envelope("aaaa1111-0000-0000-0000-000000000001", [
        _request("первый запрос"),
        _request("Refactor settings hub: v2 grid layout"),
    ]) + json.dumps({"kind": 1, "k": ["requests"], "v": {}}) + "\n",
        encoding="utf-8")
    live.touch()  # fresh mtime → live
    idle = ws1 / "chatSessions" / "aaaa1111-0000-0000-0000-000000000002.jsonl"
    idle.write_text(_envelope("aaaa1111-0000-0000-0000-000000000002",
                              [_request("старый чат")]), encoding="utf-8")
    old = NOW - 2 * LIVE_WINDOW_SECONDS - 60
    import os
    os.utime(idle, (old, old))
    # workspace 2: unparsable session file → skipped counter
    ws2 = user / "workspaceStorage" / "ws-hash-2"
    (ws2 / "chatSessions").mkdir(parents=True)
    (ws2 / "workspace.json").write_text(json.dumps(
        {"folder": "file:///proj/second"}), encoding="utf-8")
    (ws2 / "chatSessions" / "bbbb2222-0000-0000-0000-000000000003.jsonl") \
        .write_text("{not json at all\n", encoding="utf-8")
    # empty-window chats: no workspace → project ''
    empty = user / "globalStorage" / "emptyWindowChatSessions"
    empty.mkdir(parents=True)
    (empty / "cccc3333-0000-0000-0000-000000000004.jsonl").write_text(
        _envelope("cccc3333-0000-0000-0000-000000000004",
                  [_request("безворкспейсный чат")]), encoding="utf-8")
    return user


class TestScan:
    def test_listing_maps_the_store(self, store: Path):
        result = scan_vscode_stores(store, now=NOW)
        by_id = {r["native_id"]: r for r in result.sessions}
        assert set(by_id) == {
            "aaaa1111-0000-0000-0000-000000000001",
            "aaaa1111-0000-0000-0000-000000000002",
            "cccc3333-0000-0000-0000-000000000004",
        }
        live = by_id["aaaa1111-0000-0000-0000-000000000001"]
        assert live["harness"] == "vscode"
        assert live["project"] == "sealbox"
        assert live["cwd"] == "/var/home/abyss/proj/sealbox"
        assert live["state"] == "live"
        assert live["origin"] == "local"
        assert live["steerable"] is False
        assert live["preview"] == "Refactor settings hub: v2 grid layout"
        assert live["last_activity_at"].startswith("20")
        idle = by_id["aaaa1111-0000-0000-0000-000000000002"]
        assert idle["state"] == "idle"
        empty = by_id["cccc3333-0000-0000-0000-000000000004"]
        assert empty["project"] == "" and empty["cwd"] == ""
        assert empty["preview"] == "безворкспейсный чат"

    def test_malformed_file_skipped_with_counter(self, store: Path):
        result = scan_vscode_stores(store, now=NOW)
        assert result.skipped_files == 1
        assert len(result.sessions) == 3

    def test_missing_root_typed(self, tmp_path: Path):
        with pytest.raises(StoreNotFoundError):
            scan_vscode_stores(tmp_path / "nope")

    def test_empty_store_is_an_honest_empty_listing(self, tmp_path: Path):
        user = tmp_path / "User"
        (user / "workspaceStorage").mkdir(parents=True)
        result = scan_vscode_stores(user, now=NOW)
        assert result.sessions == []
        assert result.skipped_files == 0

    def test_preview_falls_back_to_tail_window(self, tmp_path: Path):
        """A big session file whose requests array is absent from the
        header still yields a preview from the kind:1 tail lines."""
        user = tmp_path / "User"
        ws = user / "workspaceStorage" / "ws"
        (ws / "chatSessions").mkdir(parents=True)
        (ws / "workspace.json").write_text(
            json.dumps({"folder": "file:///proj/x"}), encoding="utf-8")
        lines = [
            json.dumps({"kind": 0, "v": {"version": 3,
                                         "sessionId": "dddd4444"}}),
            json.dumps({"kind": 1, "k": ["requests", "0"],
                        "v": {"message": {"text": "хвостатый запрос",
                                          "parts": []}}}),
        ]
        (ws / "chatSessions" / "dddd4444.jsonl").write_text(
            "\n".join(lines) + "\n", encoding="utf-8")
        result = scan_vscode_stores(user, now=NOW)
        assert result.sessions[0]["preview"] == "хвостатый запрос"


class TestAntiWrite:
    def test_scan_leaves_every_byte_identical(self, store: Path):
        files = sorted(p for p in store.rglob("*") if p.is_file())
        before = {p: p.read_bytes() for p in files}
        scan_vscode_stores(store, now=NOW)
        for p in files:
            assert p.read_bytes() == before[p], (
                f"the scan must not touch {p}")
        # no temp files appeared anywhere under the store
        assert sorted(p for p in store.rglob("*") if p.is_file()) == files
