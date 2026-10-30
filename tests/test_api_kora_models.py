"""Kora В3a — the per-executor models roster read (KORA-MODELS-1, additive).

The contract (kora-ide §5.3): the tree's MODEL level under each harness
node draws from real data only — the agents' own FC-6 discovery mirror
(the board-mirror wave 1.95.0 snapshots) for zcode/vscode/pi, the hermes
status route's roster for hermes (NOT duplicated here). This suite pins:

1. THE PROJECTION — a pure store projection over the models_mirror
   snapshots: one row per executor WITH a non-empty snapshot, sorted by
   executor_id; each row exactly {executor_id, reported_at,
   installations}; each installation exactly {harness, provider, auth,
   source, models} with the model ids sorted + deduplicated. NARROWER
   than the mirror by construction: base_url and notes never ride this
   route (the discovery GET serves them on its own boundary), and there
   is NO context-limit field — no source reports one today, absent is
   never invented (§4).
2. HONEST ABSENCE — an executor that never reported models is NOT
   listed (the FE reads the miss as «модели не сообщаются»,
   K-TREE-MODEL-UNKNOWN); an explicit-empty re-report (real zero) drops
   the row; a revoked executor never lists (the store's own WHERE).
3. ACCESS CLASSES — the kora LISTING tier (the slice-1 precedent):
   anonymous 401 (the frozen envelope), ui bearer 200, the owner-session
   cookie leg 200, a valid mnd_ DEVICE 200 (open facts — the SAME
   installation rows already ride the OPEN GET
   /api/executors/{id}/discovery), an invalid mnd_ 401, a MACHINE
   bearer 401 (not a listing class).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from conftest import BOARD_TOKEN, UI_TOKEN, DATA_DIR, get_app_module


def _ui_headers() -> dict:
    effective = get_app_module().UI_WRITE_TOKEN or get_app_module().BOARD_WRITE_TOKEN
    return {"Authorization": f"Bearer {effective}"}


def _register(client: TestClient, name: str, harness: str = "zcode") -> tuple[dict, str]:
    r = client.post("/api/executors",
                    json={"name": name, "harness": harness},
                    headers={"Authorization": f"Bearer {BOARD_TOKEN}"})
    assert r.status_code == 201, r.text
    body = r.json()
    return body["executor"], body["executor_secret"]


def _report_models(client: TestClient, executor_id: str, secret: str,
                   installations: list[dict]) -> None:
    r = client.post(f"/api/executors/{executor_id}/discovery",
                    json={"harnesses": [{"name": "zcode", "version": "1"}],
                          "models": {"installations": installations}},
                    headers={"Authorization": f"Bearer {secret}"})
    assert r.status_code == 200, r.text


def _roster(client: TestClient) -> dict:
    resp = client.get("/api/kora/models", headers=_ui_headers())
    assert resp.status_code == 200, resp.text
    return resp.json()


ZCODE_ROW = {"provider": "openrouter",
             "base_url": "https://openrouter.ai/api/v1",
             "auth": "configured",
             "models": ["z-ai/glm-4.6", "anthropic/claude-sonnet-4.5"],
             "harness": "zcode",
             "exec_env": "metal",
             "source": "config",
             "note": "models listed in harness settings"}


@pytest.fixture(autouse=True)
def fresh_models_state(app_module, monkeypatch):
    """Per-test isolation (the test_models_mirror pattern): fresh
    machine-class limiters + a wiped executor registry; the harness
    dictionary keeps its boot seed."""
    from server.security import RateLimiter
    for name in ("_executor_register_limiter",
                 "_executor_heartbeat_limiter"):
        limiter = getattr(app_module, name)
        monkeypatch.setattr(
            app_module, name,
            RateLimiter(limit=limiter.limit, window=limiter.window))
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM executors")
    yield
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM executors")


# ---------------------------------------------------------------- shape
class TestProjection:
    def test_shape_narrower_than_mirror(self, client: TestClient):
        """One row per reporting executor; the row and installation keys
        are EXACTLY the projected facts — no base_url, no notes, no
        invented context-limit field; model ids sorted + deduplicated."""
        executor, secret = _register(client, "kora-models-zcode")
        _report_models(client, executor["id"], secret, [
            ZCODE_ROW,
            {**ZCODE_ROW, "models": ["z-ai/glm-4.6", "z-ai/glm-4.6",
                                     "b-model", "a-model"],
             "harness": "pi", "provider": "ollama"},
        ])
        body = _roster(client)
        assert body["ok"] is True
        assert body["count"] == len(body["executors"]) == 1
        assert set(body["meta"]) == {"generated_at"}
        row = body["executors"][0]
        assert set(row) == {"executor_id", "reported_at", "installations"}
        assert row["executor_id"] == executor["id"]
        assert isinstance(row["reported_at"], str) and row["reported_at"]
        providers = {}
        for installation in row["installations"]:
            assert set(installation) == {"harness", "provider", "auth",
                                         "source", "models"}
            assert "base_url" not in installation
            assert "note" not in installation
            assert "context_limit" not in installation
            assert installation["models"] == sorted(set(installation["models"]))
            providers[installation["provider"]] = installation
        assert set(providers) == {"openrouter", "ollama"}
        assert providers["openrouter"]["harness"] == "zcode"
        assert providers["openrouter"]["models"] == [
            "anthropic/claude-sonnet-4.5", "z-ai/glm-4.6"]
        assert providers["ollama"]["models"] == ["a-model", "b-model",
                                                 "z-ai/glm-4.6"]

    def test_rows_sorted_by_executor_id(self, client: TestClient):
        ids = []
        for name in ("kora-models-b", "kora-models-a"):
            executor, secret = _register(client, name)
            _report_models(client, executor["id"], secret, [ZCODE_ROW])
            ids.append(executor["id"])
        body = _roster(client)
        assert [row["executor_id"] for row in body["executors"]] == sorted(ids)

    def test_multi_installation_rows_all_project(self, client: TestClient):
        """An executor reporting installations for SEVERAL harnesses
        serves them ALL — the FE filters to the node's own harness."""
        executor, secret = _register(client, "kora-models-multi")
        _report_models(client, executor["id"], secret, [
            ZCODE_ROW,
            {"provider": "ollama", "auth": "anonymous",
             "models": ["qwen3:8b"], "harness": "pi",
             "exec_env": "metal", "source": "probe"},
        ])
        body = _roster(client)
        harnesses = {i["harness"] for i in body["executors"][0]["installations"]}
        assert harnesses == {"zcode", "pi"}


# -------------------------------------------------------- honest absence
class TestHonestAbsence:
    def test_no_report_not_listed(self, client: TestClient):
        """A never-reporting executor is NOT listed — the FE degrades to
        K-TREE-MODEL-UNKNOWN, never to a fabricated roster."""
        _register(client, "kora-models-silent")
        body = _roster(client)
        assert body["ok"] is True
        assert body["count"] == 0
        assert body["executors"] == []

    def test_all_rows_dropped_not_listed(self, client: TestClient):
        """A report whose rows were ALL dropped (unknown harness) never
        creates a row — the P3-1 no-wipe keeps the previous snapshot
        (here: none), so the executor stays absent."""
        executor, secret = _register(client, "kora-models-dropped")
        _report_models(client, executor["id"], secret, [
            {**ZCODE_ROW, "harness": "not-a-harness"}])
        body = _roster(client)
        assert body["executors"] == []

    def test_explicit_empty_wipes_the_row(self, client: TestClient):
        """Real zero-and-ran: the explicit-empty re-report wipes the
        snapshot — the executor leaves the roster."""
        executor, secret = _register(client, "kora-models-wipe")
        _report_models(client, executor["id"], secret, [ZCODE_ROW])
        assert _roster(client)["count"] == 1
        _report_models(client, executor["id"], secret, [])
        assert _roster(client)["executors"] == []

    def test_revoked_executor_not_listed(self, client: TestClient,
                                         monkeypatch):
        monkeypatch.setattr(get_app_module(), "UI_WRITE_TOKEN", UI_TOKEN)
        executor, secret = _register(client, "kora-models-revoked")
        _report_models(client, executor["id"], secret, [ZCODE_ROW])
        r = client.patch(f"/api/executors/{executor['id']}",
                         json={"state": "revoked"},
                         headers={"Authorization": f"Bearer {UI_TOKEN}"})
        assert r.status_code == 200, r.text
        assert _roster(client)["executors"] == []

    def test_hermes_roster_not_duplicated_here(self, client: TestClient):
        """The hermes models stay the hermes STATUS route's single source
        (consumed, never duplicated): no mirror, no row — a board with
        zero agent mirror reports answers an empty roster even when the
        hermes roster constant is served on /api/kora/hermes/status."""
        status = client.get("/api/kora/hermes/status", headers=_ui_headers())
        assert status.status_code == 200, status.text
        assert isinstance(status.json().get("models"), list)
        assert _roster(client)["executors"] == []


# --------------------------------------------------------- access classes
class TestAccess:
    _created_devices: list[str] = []

    @classmethod
    def _paired_device(cls, app_module, name="kora-w3a-phone"):
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
        import sqlite3
        with sqlite3.connect(DATA_DIR / "board.db") as db:
            for device_id in self._created_devices:
                db.execute("DELETE FROM device_sessions WHERE id=?",
                           (device_id,))
        self._created_devices.clear()

    def test_anonymous_401(self, client: TestClient):
        resp = client.get("/api/kora/models")
        assert resp.status_code == 401

    def test_machine_bearer_is_not_a_listing_class(self, client: TestClient):
        resp = client.get("/api/kora/models", headers={
            "Authorization": f"Bearer {BOARD_TOKEN}"})
        assert resp.status_code == 401
        assert "machine-class" in resp.json()["detail"]

    def test_valid_device_reads_the_roster(self, client: TestClient,
                                           app_module):
        """THE DEVICE-CLASS DECISION, pinned (the В3 acceptance (г): the
        mnd_ class sees the tree): open facts — the SAME installation
        rows already ride the OPEN discovery mirror GET; no content, no
        outbound calls."""
        device, token = self._paired_device(app_module)
        resp = client.get("/api/kora/models", headers={
            "Authorization": f"Bearer {token}"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["ok"] is True

    def test_invalid_device_token_401(self, client: TestClient):
        resp = client.get("/api/kora/models",
                          headers={"Authorization": "Bearer mnd_bogus"})
        assert resp.status_code == 401

    def test_cookie_leg_reads_the_roster(self, client: TestClient,
                                         app_module):
        app_module  # the ui cookie name comes from the app module
        client.cookies.set(get_app_module()._UI_COOKIE_NAME, UI_TOKEN)
        try:
            resp = client.get("/api/kora/models")
            assert resp.status_code == 200, resp.text
            assert resp.json()["ok"] is True
        finally:
            client.cookies.clear()
