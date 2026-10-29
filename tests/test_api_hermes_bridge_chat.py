"""Hermes bridge slice-3 tests (T004): the transcript + chat ROUTES on
the already-shipped client (server/hermes_client.py, slice 1).

Layers:
1. TRANSCRIPT ROUTE — GET /api/kora/hermes/sessions/{id}/messages: the
   frozen Kora transcript form (seq cursor paging like the zcode route),
   hermes display_kind/reasoning/tool_calls ride through as additive
   fields, redaction choke-point on every content byte, the frozen
   session.transcript_viewed audit on every successful read (failed
   reads write none). Handle forms: bare native id and the listing's
   canonical 'hermes:<native_id>'; a foreign prefix is an honest 404
   with ZERO outbound calls.
2. GUARD — ui-only (the Kora transcript rule): anonymous 401 frozen
   body, machine bearer is not the class (split mode), a VALID device
   gets the explanatory 403 wall (code metadata_only — the route rides
   the device read table for exactly that), invalid mnd_ is 401.
3. CHAT ROUTE — POST /api/kora/hermes/chat: NON-STREAM (the SSE stream
   stays future work; the pin asserts stream:false on the wire), the
   honest source marker «hermes · real-time», the hermes answer rides
   VERBATIM under completion, own 12/60s budget, body caps (≤20 turns ×
   ≤8000 chars, conversation roles only, extra='forbid').
4. FAILURE MAPPING — honest off (503 hermes_off, zero egress), hermes
   401 → 502 with a human reason and no key echo, transport fail → 503,
   unknown session → 404 session_not_found.

The loopback double (FakeHermes) and the live-verified fixtures are
imported from the slice-1 module (test_api_hermes_bridge) — ONE fake,
ONE set of recon shapes; the transcript fixture below extends them with
the reasoning/tool_calls passthrough forms from the same recon.
"""

from __future__ import annotations

import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

from conftest import BOARD_TOKEN, DATA_DIR, UI_TOKEN
from test_api_hermes_bridge import (
    FakeHermes,
    _HERMES_SESSION,
    _HERMES_MESSAGES,
    _ui_headers,
    fake_hermes,            # noqa: F401 — fixture, re-exported on purpose
    fresh_hermes_limiter,   # noqa: F401 — autouse, resets the pull budget
    hermes_env,             # noqa: F401 — autouse, points the bridge at the fake
)

# ------------------------------------- live-verified transcript fixture

# The FULL transcript shape (TL recon field set): roles user/assistant/
# tool, display_kind, reasoning AND the reasoning_content alternate
# spelling, tool_calls — exactly the fields the client docstring records
# as seen live 2026-10-10.
_HERMES_TRANSCRIPT = {
    "object": "list",
    "has_more": False,
    "data": [
        {"id": "t1", "role": "user", "content": "собери статус кластера",
         "display_kind": None, "timestamp": 1755730460.0,
         "token_count": 14, "finish_reason": None},
        {"id": "t2", "role": "assistant", "content": "смотрю поды и ноды",
         "display_kind": "text",
         "reasoning": "пользователь просит статус — нужен kubectl",
         "tool_calls": [
             {"id": "call_1", "type": "function",
              "function": {"name": "kubectl",
                           "arguments": "{\"args\": [\"get\", \"pods\"]}"}},
         ],
         "timestamp": 1755730461.0, "token_count": 40,
         "finish_reason": "tool_calls"},
        {"id": "t3", "role": "tool", "content": "{\"pods\": 27, \"nodes\": 3}",
         "display_kind": "tool_result", "tool_call_id": "call_1",
         "tool_name": "kubectl", "timestamp": 1755730462.0,
         "token_count": 9, "finish_reason": None},
        {"id": "t4", "role": "assistant", "content": "все поды зелёные",
         "display_kind": "text",
         "reasoning_content": "alternate spelling rides too",
         "timestamp": 1755730463.0, "token_count": 21,
         "finish_reason": "stop"},
        {"id": "t5", "role": "user", "content": "а ноды?",
         "display_kind": None, "timestamp": 1755730470.0,
         "token_count": 5, "finish_reason": None},
        {"id": "t6", "role": "assistant", "content": "3 ноды, все ready",
         "display_kind": "text", "timestamp": 1755730471.0,
         "token_count": 12, "finish_reason": "stop"},
    ],
}

_NATIVE_ID = _HERMES_SESSION["id"]          # 20260820_233417_816ce638


@pytest.fixture(autouse=True)
def fresh_hermes_chat_limiter(app_module, monkeypatch):
    from server.security import RateLimiter
    limiter = RateLimiter(
        limit=app_module._KORA_HERMES_CHAT_RATE_LIMIT,
        window=app_module._KORA_HERMES_CHAT_RATE_WINDOW)
    monkeypatch.setattr(app_module, "_kora_hermes_chat_limiter", limiter)
    return limiter


@pytest.fixture()
def transcript_env(fake_hermes):
    """The loopback double serves the FULL transcript fixture."""
    fake_hermes.messages = json.loads(json.dumps(_HERMES_TRANSCRIPT))
    return fake_hermes


def _get_messages(client: TestClient, handle: str, app_module,
                  **params) -> object:
    return client.get(f"/api/kora/hermes/sessions/{handle}/messages",
                      headers=_ui_headers(app_module), params=params)


class _DevicesMixin:
    _created_devices: list[str] = []

    def _paired_device(self, app_module, name="kora-s3-phone"):
        store = app_module.store
        row, _code = store.create_pairing_request(device_name=name)
        store.scan_pairing(row["id"], device_name=name,
                           source_ip="testclient")
        store.confirm_pairing(row["id"], allow=True)
        device, token = store.issue_device_session(row["id"])
        self._created_devices.append(device["id"])
        return device, token

    @pytest.fixture(autouse=True)
    def _delete_guard_devices(self, app_module):
        yield
        with sqlite3.connect(DATA_DIR / "board.db") as db:
            for device_id in self._created_devices:
                db.execute("DELETE FROM device_sessions WHERE id=?",
                           (device_id,))
        self._created_devices.clear()


# ------------------------------------------------- 1. transcript route

class TestMessagesRoute:
    def test_serves_frozen_kora_transcript_form(
            self, app_module, client: TestClient, transcript_env) -> None:
        resp = _get_messages(client, _NATIVE_ID, app_module)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # The frozen envelope: exactly the KoraTranscriptOut field set.
        assert set(body) == {"session_id", "items", "next_after_seq",
                             "has_more"}
        assert body["session_id"] == _NATIVE_ID
        assert body["has_more"] is False
        assert body["next_after_seq"] == len(_HERMES_TRANSCRIPT["data"])
        assert [it["seq"] for it in body["items"]] == [1, 2, 3, 4, 5, 6]
        for item in body["items"]:
            assert set(item) == {"seq", "role", "kind", "ts", "content",
                                 "redaction_applied", "reasoning",
                                 "tool_calls"}
        assert [it["role"] for it in body["items"]] == [
            "user", "assistant", "tool", "assistant", "user", "assistant"]
        # RFC 3339 timestamps (the Kora convention), honest nullable ts.
        assert body["items"][0]["ts"].startswith("2025-")

    def test_hermes_fields_pass_through(
            self, app_module, client: TestClient, transcript_env) -> None:
        body = _get_messages(client, _NATIVE_ID, app_module).json()
        tool = body["items"][2]
        assert tool["kind"] == "tool_result"       # display_kind → kind
        assistant = body["items"][1]
        assert assistant["reasoning"] == \
            "пользователь просит статус — нужен kubectl"
        assert isinstance(assistant["tool_calls"], list)
        assert assistant["tool_calls"][0]["function"]["name"] == "kubectl"
        # The reasoning_content alternate spelling rides the same field.
        assert body["items"][3]["reasoning"] == "alternate spelling rides too"
        # Plain turns carry NO passthrough.
        assert body["items"][0]["reasoning"] is None
        assert body["items"][0]["tool_calls"] is None

    def test_cursor_paging_like_the_kora_route(
            self, app_module, client: TestClient, transcript_env) -> None:
        page1 = _get_messages(client, _NATIVE_ID, app_module,
                              after_seq=0, limit=2).json()
        assert [it["seq"] for it in page1["items"]] == [1, 2]
        assert page1["next_after_seq"] == 2
        assert page1["has_more"] is True
        page2 = _get_messages(client, _NATIVE_ID, app_module,
                              after_seq=page1["next_after_seq"],
                              limit=2).json()
        assert [it["seq"] for it in page2["items"]] == [3, 4]
        assert page2["has_more"] is True
        page3 = _get_messages(client, _NATIVE_ID, app_module,
                              after_seq=4, limit=2).json()
        assert [it["seq"] for it in page3["items"]] == [5, 6]
        assert page3["has_more"] is False
        tail = _get_messages(client, _NATIVE_ID, app_module,
                             after_seq=99).json()
        assert tail["items"] == []
        assert tail["next_after_seq"] == 99
        assert tail["has_more"] is False

    def test_handle_forms_bare_and_prefixed(
            self, app_module, client: TestClient, transcript_env) -> None:
        bare = _get_messages(client, _NATIVE_ID, app_module).json()
        prefixed = _get_messages(
            client, f"hermes:{_NATIVE_ID}", app_module).json()
        assert prefixed["session_id"] == f"hermes:{_NATIVE_ID}"
        assert [it["content"] for it in bare["items"]] == \
               [it["content"] for it in prefixed["items"]]

    def test_foreign_prefix_404_without_outbound(
            self, app_module, client: TestClient, transcript_env) -> None:
        before = len(transcript_env.requests)
        resp = _get_messages(client, "ex-9:no-such", app_module)
        assert resp.status_code == 404
        body = resp.json()
        assert body["ok"] is False
        assert body["code"] == "session_not_found"
        # Resolved LOCALLY — hermes was never asked under a mangled id.
        assert len(transcript_env.requests) == before

    def test_malformed_prefixed_handle_404(
            self, app_module, client: TestClient, transcript_env) -> None:
        resp = _get_messages(client, "hermes:", app_module)
        assert resp.status_code == 404
        assert resp.json()["code"] == "session_not_found"

    def test_choke_point_masks_content_and_reports(
            self, app_module, client: TestClient, fake_hermes) -> None:
        poisoned = json.loads(json.dumps(_HERMES_MESSAGES))
        poisoned["data"] = [
            {"id": "p1", "role": "user",
             "content": "токен ghp_AbCdEf1234567890aBcDeF утёк",
             "display_kind": None, "timestamp": 1755730460.0,
             "token_count": 9, "finish_reason": None},
            {"id": "p2", "role": "assistant", "content": "чистый ответ",
             "display_kind": "text", "timestamp": 1755730461.0,
             "token_count": 3, "finish_reason": "stop"},
        ]
        fake_hermes.messages = poisoned
        body = _get_messages(client, _NATIVE_ID, app_module).json()
        masked = body["items"][0]
        assert masked["redaction_applied"] is True
        assert "ghp_AbCdEf1234567890" not in masked["content"]
        assert "gh*_" in masked["content"]
        assert body["items"][1]["redaction_applied"] is False
        assert body["items"][1]["content"] == "чистый ответ"

    def test_choke_point_masks_reasoning_and_tool_calls(
            self, app_module, client: TestClient, fake_hermes) -> None:
        """Cascade fix (trusted-surface finding, 2026-10-29): the hermes
        passthrough fields ride the SAME choke-point as content —
        reasoning (both spellings) and tool_calls sentinels never leave
        unmasked, redaction_applied stays the honest per-entry signal,
        and redaction is NOT removal (shape + clean text survive)."""
        reasoning_sentinel = "ghp_AbCdEf1234567890aBcDeF"
        args_sentinel = "sk-AbCdEf1234567890aBcDeF"
        poisoned = json.loads(json.dumps(_HERMES_TRANSCRIPT))
        poisoned["data"][1]["reasoning"] = \
            f"ключ {reasoning_sentinel} утёк в размышление"
        poisoned["data"][1]["tool_calls"][0]["function"]["arguments"] = \
            json.dumps({"args": ["get", "pods"], "token": args_sentinel})
        poisoned["data"][3]["reasoning_content"] = \
            f"alternate {reasoning_sentinel} spelling"
        fake_hermes.messages = poisoned
        resp = _get_messages(client, _NATIVE_ID, app_module)
        assert resp.status_code == 200
        body = resp.json()
        assistant = body["items"][1]
        assert assistant["redaction_applied"] is True
        assert reasoning_sentinel not in assistant["reasoning"]
        assert "gh*_" in assistant["reasoning"]
        # tool_calls: masked IN DEPTH, shape intact (redaction ≠ removal)
        calls = assistant["tool_calls"]
        assert calls[0]["function"]["name"] == "kubectl"
        assert "args" in calls[0]["function"]["arguments"]
        assert args_sentinel not in json.dumps(calls)
        assert "sk-<redacted>" in calls[0]["function"]["arguments"]
        # the reasoning_content alternate spelling rides the same mask
        assert body["items"][3]["redaction_applied"] is True
        assert reasoning_sentinel not in body["items"][3]["reasoning"]
        # belt and braces: no raw sentinel anywhere in the response
        assert reasoning_sentinel not in resp.text
        assert args_sentinel not in resp.text
        # clean turns still report False
        assert body["items"][0]["redaction_applied"] is False

    def test_unknown_session_404_frozen_body(
            self, app_module, client: TestClient, transcript_env) -> None:
        resp = _get_messages(client, "no_such_session", app_module)
        assert resp.status_code == 404
        body = resp.json()
        assert body["ok"] is False
        assert body["code"] == "session_not_found"

    def test_honest_off_503_zero_egress(
            self, app_module, client: TestClient, monkeypatch, fake_hermes,
            decoy) -> None:
        monkeypatch.delenv("HERMES_API_KEY", raising=False)
        resp = _get_messages(client, _NATIVE_ID, app_module)
        assert resp.status_code == 503
        body = resp.json()
        assert body["code"] == "hermes_off"
        assert decoy.connections() == 0
        assert fake_hermes.requests == []

    def test_hermes_401_becomes_502_no_key_echo(
            self, app_module, client: TestClient, monkeypatch,
            transcript_env) -> None:
        monkeypatch.setenv("HERMES_API_KEY", "stale-key")
        resp = _get_messages(client, _NATIVE_ID, app_module)
        assert resp.status_code == 502
        body = resp.json()
        assert body["code"] == "hermes_unavailable"
        assert "stale-key" not in body["message"]
        assert "refused" in body["message"] or "401" in body["message"]

    def test_transport_fail_503(
            self, app_module, client: TestClient, fake_hermes) -> None:
        fake_hermes.fail_transport = True
        resp = _get_messages(client, _NATIVE_ID, app_module)
        assert resp.status_code == 503
        assert resp.json()["code"] == "hermes_unavailable"

    def test_shares_the_live_pull_rate_budget(
            self, app_module, client: TestClient, monkeypatch,
            transcript_env) -> None:
        from server.security import RateLimiter
        monkeypatch.setattr(app_module, "_kora_hermes_limiter",
                            RateLimiter(limit=1, window=60.0))
        assert _get_messages(client, _NATIVE_ID, app_module) \
            .status_code == 200
        resp = _get_messages(client, _NATIVE_ID, app_module)
        assert resp.status_code == 429
        assert "hermes bridge rate limit" in resp.json()["detail"]


class TestMessagesGuard(_DevicesMixin):
    def test_anonymous_401_frozen_body(
            self, client: TestClient, transcript_env) -> None:
        resp = client.get(
            f"/api/kora/hermes/sessions/{_NATIVE_ID}/messages")
        assert resp.status_code == 401
        body = resp.json()
        assert body["ok"] is False
        assert body["code"] == "unauthorized"
        assert body["message"]
        assert set(body) == {"ok", "code", "message"}

    def test_machine_bearer_is_not_the_class(
            self, app_module, client: TestClient, split_tokens,
            transcript_env) -> None:
        resp = client.get(
            f"/api/kora/hermes/sessions/{_NATIVE_ID}/messages",
            headers={"Authorization": f"Bearer {BOARD_TOKEN}"})
        assert resp.status_code == 401
        assert resp.json()["code"] == "unauthorized"

    def test_device_wall_is_explanatory_403(
            self, app_module, client: TestClient, transcript_env) -> None:
        _device, token = self._paired_device(app_module)
        resp = client.get(
            f"/api/kora/hermes/sessions/{_NATIVE_ID}/messages",
            headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403
        body = resp.json()
        assert body["ok"] is False
        assert body["code"] == "metadata_only"
        assert "ui-класс" in body["message"] or "owner" in body["message"]
        assert set(body) == {"ok", "code", "message"}
        # The wall fires BEFORE any outbound call.
        assert transcript_env.requests == []

    def test_invalid_device_token_401(
            self, client: TestClient, transcript_env) -> None:
        resp = client.get(
            f"/api/kora/hermes/sessions/{_NATIVE_ID}/messages",
            headers={"Authorization": "Bearer mnd_bogus"})
        assert resp.status_code == 401


class TestMessagesAudit:
    """The Kora precedent: every successful read emits exactly one
    session.transcript_viewed row (WHO/WHEN/WHAT-opened, no content);
    failed reads emit nothing."""

    def _audit_rows_after(self, app_module, after_id: int) -> list[dict]:
        return [e for e in app_module.store.events(after_id, limit=100)
                if e["kind"] == "session.transcript_viewed"]

    def test_every_read_writes_one_row(
            self, app_module, client: TestClient, transcript_env) -> None:
        cursor = app_module.store.last_event_id()
        assert _get_messages(client, _NATIVE_ID, app_module) \
            .status_code == 200
        assert _get_messages(client, _NATIVE_ID, app_module, limit=1) \
            .status_code == 200
        rows = self._audit_rows_after(app_module, cursor)
        assert len(rows) == 2, "one read — one audit row"
        payload = rows[-1]["payload"]
        assert payload["device_class"] == "ui"
        assert payload["network_path"] == "bearer"
        assert payload["session_id"] == _NATIVE_ID
        assert payload["executor_id"] == "hermes"
        assert payload["native_id"] == _NATIVE_ID
        assert "session_host" in payload
        # WHO/WHEN/WHAT-opened — never WHAT-WAS-WRITTEN.
        assert not ({"content", "preview", "text", "items"}
                    & set(payload))

    def test_cookie_leg_audits_cookie_path(
            self, app_module, client: TestClient, transcript_env) -> None:
        cursor = app_module.store.last_event_id()
        client.cookies.set(
            app_module._UI_COOKIE_NAME,
            app_module.UI_WRITE_TOKEN or app_module.BOARD_WRITE_TOKEN)
        resp = client.get(
            f"/api/kora/hermes/sessions/{_NATIVE_ID}/messages")
        assert resp.status_code == 200
        client.cookies.clear()
        rows = self._audit_rows_after(app_module, cursor)
        assert len(rows) == 1
        assert rows[0]["payload"]["network_path"] == "cookie"

    def test_failed_reads_write_no_audit(
            self, app_module, client: TestClient, transcript_env) -> None:
        cursor = app_module.store.last_event_id()
        assert client.get(
            f"/api/kora/hermes/sessions/{_NATIVE_ID}/messages") \
            .status_code == 401
        assert _get_messages(client, "no_such_session", app_module) \
            .status_code == 404
        assert self._audit_rows_after(app_module, cursor) == []


# ------------------------------------------------------- 2. chat route

class TestChatRoute(_DevicesMixin):
    def _post_chat(self, app_module, client: TestClient, body: dict):
        return client.post("/api/kora/hermes/chat",
                           headers=_ui_headers(app_module), json=body)

    def test_success_verbatim_with_honest_source(
            self, app_module, client: TestClient, fake_hermes) -> None:
        resp = self._post_chat(app_module, client, {
            "messages": [{"role": "user", "content": "пинг"}]})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["ok"] is True
        assert body["source"] == "hermes · real-time"
        # The hermes answer rides VERBATIM.
        assert body["completion"] == fake_hermes.chat_body
        assert body["completion"]["choices"][0]["message"]["content"] == "ok"
        # The wire: one POST, bearer rides, default model, NON-STREAM.
        posts = [r for r in fake_hermes.requests if r["method"] == "POST"]
        assert len(posts) == 1
        assert posts[0]["auth_present"] is True
        sent = json.loads(posts[0]["body"])
        assert sent["stream"] is False
        assert sent["model"] == app_module._HERMES_CHAT_DEFAULT_MODEL
        assert sent["messages"] == [{"role": "user", "content": "пинг"}]

    def test_non_stream_is_pinned_on_the_wire(
            self, app_module, client: TestClient, fake_hermes) -> None:
        self._post_chat(app_module, client, {
            "messages": [{"role": "user", "content": "пинг"}]})
        posts = [r for r in fake_hermes.requests if r["method"] == "POST"]
        assert json.loads(posts[0]["body"])["stream"] is False

    def test_explicit_model_rides(
            self, app_module, client: TestClient, fake_hermes) -> None:
        resp = self._post_chat(app_module, client, {
            "model": "hermes-4.5-70b",
            "messages": [{"role": "user", "content": "пинг"}]})
        assert resp.status_code == 200
        assert resp.json()["model"] == "hermes-4.5-70b"
        posts = [r for r in fake_hermes.requests if r["method"] == "POST"]
        assert json.loads(posts[0]["body"])["model"] == "hermes-4.5-70b"

    def test_honest_off_503_zero_egress(
            self, app_module, client: TestClient, monkeypatch,
            fake_hermes, decoy) -> None:
        monkeypatch.delenv("HERMES_API_KEY", raising=False)
        resp = self._post_chat(app_module, client, {
            "messages": [{"role": "user", "content": "пинг"}]})
        assert resp.status_code == 503
        assert resp.json()["code"] == "hermes_off"
        assert decoy.connections() == 0
        assert fake_hermes.requests == []

    def test_hermes_401_becomes_502_no_key_echo(
            self, app_module, client: TestClient, monkeypatch) -> None:
        monkeypatch.setenv("HERMES_API_KEY", "stale-key")
        resp = self._post_chat(app_module, client, {
            "messages": [{"role": "user", "content": "пинг"}]})
        assert resp.status_code == 502
        body = resp.json()
        assert body["code"] == "hermes_unavailable"
        assert "stale-key" not in body["message"]

    def test_transport_fail_503(
            self, app_module, client: TestClient, fake_hermes) -> None:
        fake_hermes.fail_transport = True
        resp = self._post_chat(app_module, client, {
            "messages": [{"role": "user", "content": "пинг"}]})
        assert resp.status_code == 503
        assert resp.json()["code"] == "hermes_unavailable"

    def test_own_rate_budget_429(
            self, app_module, client: TestClient, monkeypatch) -> None:
        from server.security import RateLimiter
        monkeypatch.setattr(app_module, "_kora_hermes_chat_limiter",
                            RateLimiter(limit=1, window=60.0))
        assert self._post_chat(app_module, client, {
            "messages": [{"role": "user", "content": "раз"}]}).status_code \
            == 200
        resp = self._post_chat(app_module, client, {
            "messages": [{"role": "user", "content": "два"}]})
        assert resp.status_code == 429
        assert "hermes chat rate limit" in resp.json()["detail"]

    def test_body_caps_422(
            self, app_module, client: TestClient) -> None:
        # empty conversation
        assert self._post_chat(app_module, client, {
            "messages": []}).status_code == 422
        # > 20 turns
        turns = [{"role": "user", "content": "x"}] * 21
        assert self._post_chat(app_module, client, {
            "messages": turns}).status_code == 422
        # > 8000 chars per turn
        assert self._post_chat(app_module, client, {
            "messages": [{"role": "user", "content": "x" * 8001}]}
        ).status_code == 422
        # conversation roles only — a tool replay is refused locally
        assert self._post_chat(app_module, client, {
            "messages": [{"role": "tool", "content": "{}"}]}
        ).status_code == 422
        # extra='forbid' — unknown keys are an honest 422 (BE-15)
        assert self._post_chat(app_module, client, {
            "messages": [{"role": "user", "content": "x",
                          "tool_call_id": "c1"}]}).status_code == 422
        assert self._post_chat(app_module, client, {
            "messages": [{"role": "user", "content": "x"}],
            "temperature": 0.5}).status_code == 422
        # model length cap
        assert self._post_chat(app_module, client, {
            "model": "m" * 121,
            "messages": [{"role": "user", "content": "x"}]}
        ).status_code == 422

    def test_anonymous_401(self, client: TestClient) -> None:
        resp = client.post("/api/kora/hermes/chat", json={
            "messages": [{"role": "user", "content": "пинг"}]})
        assert resp.status_code == 401

    def test_machine_bearer_is_not_the_class(
            self, app_module, client: TestClient, split_tokens) -> None:
        resp = client.post("/api/kora/hermes/chat",
                           headers={"Authorization":
                                    f"Bearer {BOARD_TOKEN}"},
                           json={"messages": [{"role": "user",
                                               "content": "пинг"}]})
        assert resp.status_code == 401

    def test_valid_device_gets_middleware_403(
            self, app_module, client: TestClient) -> None:
        """A chat POST is in NO device table: a valid device stops at the
        middleware (the grants detail), never reaches the handler, and
        hermes is never called."""
        _device, token = self._paired_device(app_module)
        resp = client.post("/api/kora/hermes/chat",
                           headers={"Authorization": f"Bearer {token}"},
                           json={"messages": [{"role": "user",
                                               "content": "пинг"}]})
        assert resp.status_code == 403
        assert "device grants" in resp.json()["detail"]

    def test_ui_token_never_echoes_into_the_answer(
            self, app_module, client: TestClient, fake_hermes) -> None:
        key = fake_hermes.api_key
        resp = self._post_chat(app_module, client, {
            "messages": [{"role": "user", "content": "пинг"}]})
        assert key not in resp.text
