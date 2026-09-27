"""Kora slice-2 API tests (ADR 0019 — the transcript serving path +
listing pagination).

Layers:
1. CONTRACT vs docs/kora/openapi.yaml — served JSON must satisfy the
   frozen KoraTranscriptOut/KoraTranscriptItemOut shapes and the cursor
   parameter bounds; errors speak the frozen KoraErrorOut vocabulary.
2. ACCESS GUARD — transcripts are ui-ONLY (TL decision in the slice-2
   handover; ADR gate 5): anonymous 401, valid mnd_ → the EXPLANATORY
   403 wall (code metadata_only, never a bare 403), machine bearer is
   not a transcript class.
3. CHOKE-POINT + AUDIT — a secret planted in store content never leaves
   unmasked (redaction_applied honest); every successful read writes
   exactly one session.transcript_viewed audit row (device_class /
   network_path / session_host), failed reads write none.
4. LISTING PAGINATION (P4-7) — additive limit/offset query surface, the
   frozen response shape untouched.
5. PIPELINE — real reader → real ingest → real serving for all three
   harnesses (zcode transcript; vscode/pi ingest into the registry).

Transcript stores are SYNTHETIC tmp sqlite files (the live-verified
schema; the owner's 2 GB zcode store is never touched) wired in via the
VESMARO_KORA_ZCODE_DB test seam.
"""

from __future__ import annotations

import json
import sqlite3
import tempfile
import time
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient
from conftest import BOARD_TOKEN, UI_TOKEN

SPEC_PATH = Path(__file__).resolve().parent.parent / "docs" / "kora" / "openapi.yaml"

_NOW_MS = int(time.time() * 1000)
_MIN = 60 * 1000

# The schema the transcript reader depends on (live-store-verified
# subset, 2026-09-27).
_TRANSCRIPT_SCHEMA = """
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


def _msg(mid: str, sid: str, role: str) -> tuple:
    return (mid, sid, _NOW_MS, _NOW_MS,
            json.dumps({"role": role}), 0)


def build_transcript_store(path: Path, native_id: str = "sess_kora2",
                           *, with_secret: bool = True) -> Path:
    """A synthetic zcode store with one transcripted session."""
    con = sqlite3.connect(path)
    con.executescript(_TRANSCRIPT_SCHEMA)
    con.execute("INSERT INTO session VALUES (?,?,?,?,?,?,NULL)",
                (native_id, None, "/proj/kora2", "Срез 2",
                 _NOW_MS - 3600 * 1000, _NOW_MS - _MIN))
    con.execute("INSERT INTO message VALUES (?,?,?,?,?,?)",
                _msg("m1", native_id, "user"))
    con.execute("INSERT INTO message VALUES (?,?,?,?,?,?)",
                _msg("m2", native_id, "assistant"))
    con.execute("INSERT INTO part VALUES (?,?,?,?,?,?,?)",
                ("p1", "m1", native_id, _NOW_MS - 2 * _MIN,
                 _NOW_MS - 2 * _MIN, 1,
                 json.dumps({"type": "text",
                             "text": "запусти тесты slice 2"})))
    secret = ("готово: тесты зелёные, токен "
              + ("ghp_AbCdEf1234567890aBcDeF" if with_secret else "не палим")
              + " — не забудь отчёт")
    con.execute("INSERT INTO part VALUES (?,?,?,?,?,?,?)",
                ("p2", "m2", native_id, _NOW_MS - _MIN, _NOW_MS - _MIN, 2,
                 json.dumps({"type": "text", "text": secret})))
    con.commit()
    con.close()
    return path


@pytest.fixture(scope="module")
def kora_spec() -> dict:
    loaded = yaml.safe_load(SPEC_PATH.read_text(encoding="utf-8"))
    assert isinstance(loaded, dict)
    return loaded


_EXECUTOR_CACHE: dict[str, tuple[str, dict]] = {}


def _register_executor(client: TestClient, auth: dict, name: str) -> tuple[str, str]:
    """Register + approve an executor; returns (id, secret-headers).
    Module-level cache: the shared board DB persists across tests in the
    session-scoped client, so a name is registered exactly ONCE (the
    slice-1 one_executor pattern); the registration limiter makes
    re-registering per test impossible anyway."""
    if name in _EXECUTOR_CACHE:
        return _EXECUTOR_CACHE[name]
    resp = client.post(
        "/api/executors", headers=auth,
        json={"name": name, "harness": "zcode", "host": "laptop-1"})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    executor_id = body["executor"]["id"]
    resp = client.patch(
        f"/api/executors/{executor_id}", headers=auth,
        json={"state": "approved"})
    assert resp.status_code == 200, resp.text
    headers = {"Authorization": f"Bearer {body['executor_secret']}"}
    _EXECUTOR_CACHE[name] = (executor_id, headers)
    return executor_id, headers


def _scan(client: TestClient, h: dict, executor_id: str,
          rows: list[dict], drop_missing: bool = False) -> dict:
    resp = client.post(
        f"/api/executors/{executor_id}/kora-scan", headers=h,
        json={"sessions": rows, "drop_missing": drop_missing})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _ingest_session(client: TestClient, auth: dict, name: str,
                    native_id: str, harness: str = "zcode") -> str:
    """Register+approve an executor and ingest one session row; returns
    the opaque board handle."""
    executor_id, h = _register_executor(client, auth, name)
    _scan(client, h, executor_id,
          [{"native_id": native_id, "harness": harness,
            "project": "p", "cwd": "/p", "state": "live"}])
    return f"{executor_id}:{native_id}"


def _get_transcript(client: TestClient, session_id: str,
                    headers: dict | None = None, **params) -> object:
    """GET the transcript as the OWNER (ui class, bearer leg) unless
    explicit headers are given."""
    if headers is None:
        from conftest import get_app_module
        effective = (get_app_module().UI_WRITE_TOKEN
                     or get_app_module().BOARD_WRITE_TOKEN)
        headers = {"Authorization": f"Bearer {effective}"}
    return client.get(
        f"/api/kora/sessions/{session_id}/transcript",
        headers=headers, params=params or None)


@pytest.fixture()
def transcript_env(client: TestClient, auth: dict, app_module,
                   monkeypatch, tmp_path) -> tuple[str, Path]:
    """Executor + ingested zcode session + VESMARO_KORA_ZCODE_DB pointed
    at a synthetic store carrying the SAME native id."""
    executor_id, h = _register_executor(client, auth, "kora-s2-tr")
    _scan(client, h, executor_id,
          [{"native_id": "sess_kora2", "harness": "zcode",
            "project": "kora2", "cwd": "/proj/kora2", "state": "live"}])
    db = build_transcript_store(tmp_path / "db.sqlite")
    monkeypatch.setenv("VESMARO_KORA_ZCODE_DB", str(db))
    return f"{executor_id}:sess_kora2", db


@pytest.fixture(autouse=True)
def fresh_kora_limiters(app_module, monkeypatch):
    """Per-test limiter resets (the slice-1 suite pattern: module-global
    budgets must not leak between tests; the registration budget is
    per-IP and shared by the whole QA run)."""
    from server.security import RateLimiter
    scan = RateLimiter(limit=app_module._KORA_SCAN_RATE_LIMIT,
                       window=app_module._KORA_SCAN_RATE_WINDOW)
    monkeypatch.setattr(app_module, "_kora_scan_limiter", scan)
    register = RateLimiter(limit=app_module._EXECUTOR_REGISTER_RATE_LIMIT,
                           window=app_module._EXECUTOR_REGISTER_RATE_WINDOW)
    monkeypatch.setattr(app_module, "_executor_register_limiter", register)
    return scan


class TestTranscriptContract:
    """Served JSON vs the frozen artifact (slice-2 surface)."""

    def test_page_matches_frozen_shape(self, client: TestClient,
                                       transcript_env, kora_spec: dict):
        session_id, _db = transcript_env
        resp = _get_transcript(client, session_id)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        out_schema = kora_spec["components"]["schemas"]["KoraTranscriptOut"]
        item_schema = (kora_spec["components"]["schemas"]
                       ["KoraTranscriptItemOut"])
        assert set(body) == set(out_schema["required"])
        for item in body["items"]:
            assert set(item) >= set(item_schema["required"])
            assert item["role"] in item_schema["properties"]["role"]["enum"]
            assert isinstance(item["content"], str)
            assert isinstance(item["redaction_applied"], bool)
            assert item["seq"] >= 1
        assert body["session_id"] == session_id
        assert body["next_after_seq"] >= 0
        assert isinstance(body["has_more"], bool)

    def test_cursor_semantics_via_api(self, client: TestClient,
                                      transcript_env):
        session_id, _db = transcript_env
        page1 = _get_transcript(client, session_id, limit=1).json()
        assert [i["seq"] for i in page1["items"]] == [1]
        assert page1["next_after_seq"] == 1
        assert page1["has_more"] is True
        page2 = _get_transcript(client, session_id, after_seq=1,
                                limit=10).json()
        assert [i["seq"] for i in page2["items"]] == [2]
        assert page2["has_more"] is False
        # empty page keeps the request cursor (frozen wording)
        empty = _get_transcript(client, session_id, after_seq=99).json()
        assert empty["items"] == []
        assert empty["next_after_seq"] == 99

    def test_limit_clamped_by_route_validation(self, client: TestClient,
                                               transcript_env):
        session_id, _db = transcript_env
        assert _get_transcript(client, session_id, limit=0).status_code == 422
        assert _get_transcript(client, session_id, limit=201).status_code == 422
        assert _get_transcript(client, session_id, after_seq=-1) \
            .status_code == 422
        ok = _get_transcript(client, session_id, limit=200)
        assert ok.status_code == 200

    def test_choke_point_masks_content_and_reports(self, client,
                                                   transcript_env):
        """THE choke-point call on the transcript path: a secret planted
        in the store content never reaches the response unmasked; the
        honest redaction_applied marks exactly the touched entries."""
        session_id, _db = transcript_env
        body = _get_transcript(client, session_id).json()
        masked = next(i for i in body["items"]
                      if "ghp_" in i["content"] or "gh*_" in i["content"])
        assert "ghp_AbCdEf" not in masked["content"]
        assert "gh*_<redacted>" in masked["content"]
        assert masked["redaction_applied"] is True
        clean = next(i for i in body["items"]
                     if i["content"] == "запусти тесты slice 2")
        assert clean["redaction_applied"] is False


class TestTranscriptAccessGuard:
    """Transcripts are ui-ONLY (TL decision, ADR gate 5). The mnd_ wall
    EXPLAINS (frozen contract: never a bare 403)."""

    _created_devices: list[str] = []

    @classmethod
    def _paired_device(cls, app_module, name="kora-s2-phone"):
        store = app_module.store
        row, _code = store.create_pairing_request(device_name=name)
        store.scan_pairing(row["id"], device_name=name,
                           source_ip="testclient")
        store.confirm_pairing(row["id"], allow=True)
        device, token = store.issue_device_session(row["id"])
        cls._created_devices.append(device["id"])
        return device, token

    @pytest.fixture(autouse=True)
    def _delete_guard_devices(self, app_module):
        yield
        import sqlite3 as _sq
        from conftest import DATA_DIR
        with _sq.connect(DATA_DIR / "board.db") as db:
            for device_id in self._created_devices:
                db.execute("DELETE FROM device_sessions WHERE id=?",
                           (device_id,))
        self._created_devices.clear()

    def test_anonymous_401_frozen_body(self, client: TestClient,
                                       transcript_env):
        session_id, _db = transcript_env
        resp = client.get(f"/api/kora/sessions/{session_id}/transcript")
        assert resp.status_code == 401
        body = resp.json()
        assert body["ok"] is False
        assert body["code"] == "unauthorized"
        assert body["message"]

    def test_ui_bearer_reads(self, client: TestClient, ui_auth: dict,
                             transcript_env):
        session_id, _db = transcript_env
        resp = _get_transcript(client, session_id, headers=ui_auth)
        assert resp.status_code == 200, resp.text

    def test_ui_cookie_leg_reads(self, client: TestClient, app_module,
                                 transcript_env):
        session_id, _db = transcript_env
        client.cookies.set(
            app_module._UI_COOKIE_NAME,
            app_module.UI_WRITE_TOKEN or app_module.BOARD_WRITE_TOKEN)
        resp = client.get(
            f"/api/kora/sessions/{session_id}/transcript")
        assert resp.status_code == 200, resp.text
        client.cookies.clear()

    def test_device_wall_is_explanatory_403(self, client: TestClient,
                                            app_module, transcript_env):
        session_id, _db = transcript_env
        device, token = self._paired_device(app_module)
        resp = client.get(
            f"/api/kora/sessions/{session_id}/transcript",
            headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403
        body = resp.json()
        assert body["ok"] is False
        assert body["code"] == "metadata_only"
        # the wall explains WHY and WHAT TO DO — not a bare status
        assert "ui-класс" in body["message"] or "owner" in body["message"]
        # ... and the wall LEAKS NOTHING: no content keys ride along
        assert set(body) == {"ok", "code", "message"}

    def test_machine_bearer_is_not_a_transcript_class(
            self, client: TestClient, machine_auth: dict, split_tokens,
            transcript_env):
        """With the token classes SPLIT, the board (machine) token must
        NOT read transcripts — ui-only means ui."""
        session_id, _db = transcript_env
        resp = _get_transcript(client, session_id, headers=machine_auth)
        assert resp.status_code == 401
        assert resp.json()["code"] == "unauthorized"

    def test_invalid_device_token_401(self, client: TestClient,
                                      transcript_env):
        session_id, _db = transcript_env
        resp = client.get(
            f"/api/kora/sessions/{session_id}/transcript",
            headers={"Authorization": "Bearer mnd_bogus"})
        assert resp.status_code == 401


class TestTranscriptValidation:
    def test_unknown_session_404_frozen_body(self, client: TestClient,
                                             kora_spec: dict):
        resp = _get_transcript(client, "exec-none:sess_ghost")
        assert resp.status_code == 404
        body = resp.json()
        assert body["code"] == "session_not_found"
        assert body["ok"] is False

    def test_malformed_handle_is_404_not_500(self, client: TestClient):
        for handle in ("no-colon", ":", "exec-only:"):
            resp = _get_transcript(client, handle)
            assert resp.status_code == 404, handle
            assert resp.json()["code"] == "session_not_found"

    def test_vscode_session_transcript_is_honest_422(
            self, client: TestClient, auth: dict):
        """The known kind:1 gap must speak: 422 validation with the
        explanation, never a fake empty page."""
        handle = _ingest_session(client, auth, "kora-s2-vs", "vs-1",
                                 harness="vscode")
        resp = _get_transcript(client, handle)
        assert resp.status_code == 422
        body = resp.json()
        assert body["code"] == "validation"
        assert "kind:1" in body["message"]

    def test_pi_session_transcript_is_honest_422(
            self, client: TestClient, auth: dict):
        handle = _ingest_session(client, auth, "kora-s2-pi", "pi-1",
                                 harness="pi")
        resp = _get_transcript(client, handle)
        assert resp.status_code == 422
        assert resp.json()["code"] == "validation"

    def test_registry_row_without_store_row_404(self, client: TestClient,
                                                auth: dict, monkeypatch,
                                                tmp_path):
        """A remote-host session (registry yes, local store no) resolves
        as absent with the W4 explanation — not a 500."""
        db = tmp_path / "empty.sqlite"
        con = sqlite3.connect(db)
        con.executescript(_TRANSCRIPT_SCHEMA)
        con.commit()
        con.close()
        monkeypatch.setenv("VESMARO_KORA_ZCODE_DB", str(db))
        handle = _ingest_session(client, auth, "kora-s2-remote",
                                 "sess_remote")
        resp = _get_transcript(client, handle)
        assert resp.status_code == 404
        body = resp.json()
        assert body["code"] == "session_not_found"
        assert "W4" in body["message"]


class TestTranscriptAudit:
    """The frozen audit rule: every successful transcript read emits
    session.transcript_viewed (device_class / network_path /
    session_host) into the EXISTING board audit trail; failed reads
    emit nothing."""

    def _audit_rows_after(self, app_module, after_id: int) -> list[dict]:
        """Audit rows written AFTER the cursor — the shared board DB
        accumulates thousands of events across the full QA run, so a
        fixed 500-row window would be fragile; the id cursor is exact."""
        return [e for e in app_module.store.events(after_id, limit=100)
                if e["kind"] == "session.transcript_viewed"]

    def test_every_read_writes_one_audit_row(self, client: TestClient,
                                             transcript_env, app_module):
        session_id, _db = transcript_env
        cursor = app_module.store.last_event_id()
        assert _get_transcript(client, session_id).status_code == 200
        assert _get_transcript(client, session_id, limit=1).status_code == 200
        rows = self._audit_rows_after(app_module, cursor)
        assert len(rows) == 2, "one read — one audit row"
        payload = rows[-1]["payload"]
        assert payload["device_class"] == "ui"
        assert payload["network_path"] == "bearer"
        assert payload["session_id"] == session_id
        assert "session_host" in payload
        assert payload["session_host"], "executor host must ride the audit"
        # WHO/WHEN/WHAT-opened, never WHAT-WAS-WRITTEN: no content keys
        assert not ({"content", "preview", "text", "items"}
                    & set(payload))

    def test_cookie_leg_audits_cookie_path(self, client: TestClient,
                                           app_module, transcript_env):
        session_id, _db = transcript_env
        cursor = app_module.store.last_event_id()
        client.cookies.set(
            app_module._UI_COOKIE_NAME,
            app_module.UI_WRITE_TOKEN or app_module.BOARD_WRITE_TOKEN)
        resp = client.get(
            f"/api/kora/sessions/{session_id}/transcript")
        assert resp.status_code == 200
        client.cookies.clear()
        rows = self._audit_rows_after(app_module, cursor)
        assert len(rows) == 1
        assert rows[0]["payload"]["network_path"] == "cookie"

    def test_failed_reads_write_no_audit(self, client: TestClient,
                                         app_module, transcript_env):
        session_id, _db = transcript_env
        cursor = app_module.store.last_event_id()
        assert client.get(
            f"/api/kora/sessions/{session_id}/transcript") \
            .status_code == 401
        assert _get_transcript(client, "exec-none:sess_ghost") \
            .status_code == 404
        assert self._audit_rows_after(app_module, cursor) == []


class TestListingPaginationStore:
    """P4-7 deterministic core: the Store window (limit/offset) on a
    FRESH store — the board DB is shared across the whole QA run, so
    absolute-index API assertions would be fragile; the API layer only
    re-checks the additive surface (bounds + envelope stability)."""

    @pytest.fixture()
    def store(self, tmp_path: Path):
        from server.store import Store
        st = Store(tmp_path / "board.db")
        rows = [{"native_id": f"s{i}", "harness": "zcode",
                 "state": "idle",
                 "last_activity_at": f"2026-09-2{i}T00:00:00+00:00"}
                for i in range(5)]
        st.upsert_kora_sessions("ex-page", rows, drop_missing=True)
        return st

    def test_window_slices_registry_order(self, store):
        assert len(store.kora_sessions()) == 5
        page1 = store.kora_sessions(limit=2, offset=0)
        page2 = store.kora_sessions(limit=2, offset=2)
        page3 = store.kora_sessions(limit=2, offset=4)
        ids = [r["native_id"] for r in page1 + page2 + page3]
        assert len(ids) == 5 and len(set(ids)) == 5
        # last_activity_at DESC — the registry order is stable
        assert [r["native_id"] for r in page1] == ["s4", "s3"]
        assert [r["native_id"] for r in page2] == ["s2", "s1"]
        assert [r["native_id"] for r in page3] == ["s0"]

    def test_limit_composes_with_filters(self, store):
        rows = store.kora_sessions(state="idle", limit=3, offset=1)
        assert len(rows) == 3
        assert all(r["state"] == "idle" for r in rows)

    def test_offset_beyond_end_is_empty(self, store):
        assert store.kora_sessions(limit=2, offset=99) == []


class TestListingPaginationApi:
    """P4-7 additive API surface: bounds validated (422 grammar), the
    frozen envelope untouched, pages over the SAME params disjoint."""

    @pytest.fixture()
    def five_sessions(self, client: TestClient, auth: dict) -> str:
        executor_id, h = _register_executor(client, auth, "kora-s2-page")
        rows = [{"native_id": f"sess_p{i}", "harness": "zcode",
                 "project": f"p{i}", "state": "idle"} for i in range(5)]
        _scan(client, h, executor_id, rows, drop_missing=True)
        return executor_id

    def test_validation_bounds(self, client: TestClient, five_sessions):
        assert _list_raw(client, limit=0).status_code == 422
        assert _list_raw(client, limit=2001).status_code == 422
        assert _list_raw(client, offset=-1).status_code == 422
        assert _list_raw(client, limit=2000).status_code == 200

    def test_no_params_keeps_the_full_listing_envelope(
            self, client: TestClient, five_sessions):
        body = _list(client)
        # the frozen envelope is untouched: no pagination fields appeared
        assert set(body) == {"ok", "count", "items", "coverage", "meta"}
        assert body["count"] == len(body["items"])
        assert body["count"] >= 5  # this suite's own five rows are in

    def test_offset_pages_are_disjoint(self, client: TestClient,
                                       five_sessions):
        ids1 = {i["id"] for i in _list(client, limit=2)["items"]}
        ids2 = {i["id"] for i in _list(client, limit=2, offset=2)["items"]}
        assert len(ids1) == 2
        assert not (ids1 & ids2), "offset windows must never overlap"

    def test_short_tail_page_marks_the_end(self, client: TestClient,
                                           five_sessions):
        total = _list(client)["count"]
        tail = _list(client, limit=2, offset=total - 1)
        assert tail["count"] == 1
        # caller-side has_more derivation: count(1) != limit(2) ⇒ end
        assert tail["count"] != 2


def _list(client: TestClient, **params) -> dict:
    resp = _list_raw(client, **params)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _list_raw(client: TestClient, **params):
    from conftest import get_app_module
    effective = (get_app_module().UI_WRITE_TOKEN
                 or get_app_module().BOARD_WRITE_TOKEN)
    return client.get("/api/kora/sessions", params=params or None,
                      headers={"Authorization": f"Bearer {effective}"})


class TestSlice2Pipeline:
    """Real readers → real ingest → real listing for the new harnesses."""

    def test_vscode_reader_to_registry_to_api(self, client: TestClient,
                                              auth: dict):
        import os
        import tempfile
        from server.kora.vscode_reader import scan_vscode_stores
        tmp = tempfile.mkdtemp(prefix="kora-vs-")
        user = Path(tmp) / "User"
        ws = user / "workspaceStorage" / "ws1"
        (ws / "chatSessions").mkdir(parents=True)
        (ws / "workspace.json").write_text(json.dumps(
            {"folder": "file:///proj/pipeline"}), encoding="utf-8")
        (ws / "chatSessions" / "sess-vs-1.jsonl").write_text(
            json.dumps({"kind": 0, "v": {"version": 3,
                                         "sessionId": "sess-vs-1",
                                         "requests": [
                                             {"message": {"text": "fix ui"}}]}})
            + "\n", encoding="utf-8")
        scan = scan_vscode_stores(user, now=time.time())
        assert len(scan.sessions) == 1
        executor_id, h = _register_executor(client, auth, "kora-s2-pipe")
        _scan(client, h, executor_id, scan.sessions, drop_missing=True)
        from conftest import get_app_module
        effective = (get_app_module().UI_WRITE_TOKEN
                     or get_app_module().BOARD_WRITE_TOKEN)
        body = client.get("/api/kora/sessions?harness=vscode",
                          headers={"Authorization":
                                   f"Bearer {effective}"}).json()
        item = next(s for s in body["items"] if s["native_id"] == "sess-vs-1")
        assert item["state"] == "live"
        assert item["project"] == "pipeline"
        assert item["last_line_preview"] == "fix ui"

    def test_pi_reader_to_registry_to_api(self, client: TestClient,
                                          auth: dict):
        from server.kora.pi_reader import scan_pi_stores
        tmp = Path(tempfile.mkdtemp(prefix="kora-pi-"))
        root = tmp / "sessions"
        (root / "proj-pipe").mkdir(parents=True)
        (root / "proj-pipe" / "20260927_1abc123.jsonl").write_text(
            "\n".join([
                json.dumps({"type": "session", "version": "3",
                            "id": "1abc123",
                            "timestamp": "2026-09-27T10:00:00Z",
                            "cwd": "/proj/pipe"}),
                json.dumps({"type": "message", "role": "assistant",
                            "text": "пайплайн pi живой"}),
            ]) + "\n", encoding="utf-8")
        scan = scan_pi_stores(root, now=time.time())
        assert len(scan.sessions) == 1
        executor_id, h = _register_executor(client, auth,
                                            "kora-s2-pipe-pi")
        _scan(client, h, executor_id, scan.sessions, drop_missing=True)
        from conftest import get_app_module
        effective = (get_app_module().UI_WRITE_TOKEN
                     or get_app_module().BOARD_WRITE_TOKEN)
        body = client.get("/api/kora/sessions?harness=pi",
                          headers={"Authorization":
                                   f"Bearer {effective}"}).json()
        item = next(s for s in body["items"] if s["native_id"] == "1abc123")
        assert item["project"] == "pipe"
        assert "пайплайн pi живой" in (item["last_line_preview"] or "")
